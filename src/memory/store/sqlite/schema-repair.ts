import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

import {
  inspectDatabaseSchemaReadOnly,
  openDatabaseForMaintenance,
  readStableDatabaseSnapshot,
} from "../db.js";
import {
  applyRecognizedSqliteSchemaRepair,
  inspectSqliteSchema,
  SqliteSchemaIntegrityError,
  type SqliteSchemaInspection,
} from "./schema-integrity.js";

export interface SqliteSchemaRepairReceipt {
  ok: true;
  operation: "sqlite-schema-repair";
  mode: "diagnose" | "write";
  database: string;
  changed: boolean;
  backup: string | null;
  actions: string[];
  inspection: SqliteSchemaInspection;
  before?: SqliteSchemaInspection;
}

export interface RepairSqliteDatabaseOptions {
  write?: boolean;
  now?: Date;
}

function snapshotHash(snapshot: Buffer): string {
  return createHash("sha256").update(snapshot).digest("hex");
}

function repairBackupPath(dbPath: string, now: Date, collision: number): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").replace("Z", "");
  const suffix = collision === 0 ? "" : `-${collision}`;
  return `${dbPath}.repair-${stamp}${suffix}.bak`;
}

/** Create an adjacent, exclusive recovery copy from a verified idle snapshot. */
export function createSqliteRepairBackup(
  dbPath: string,
  now: Date = new Date()
): { path: string; sha256: string } {
  const snapshot = readStableDatabaseSnapshot(dbPath);
  let collision = 0;
  while (true) {
    const path = repairBackupPath(dbPath, now, collision);
    try {
      writeFileSync(path, snapshot, { flag: "wx", mode: 0o600 });
      return { path, sha256: snapshotHash(snapshot) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      collision += 1;
    }
  }
}

function sameInspection(left: SqliteSchemaInspection, right: SqliteSchemaInspection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Diagnose by default; mutate only when write is explicitly true. */
export function repairSqliteDatabase(
  dbPath: string,
  options: RepairSqliteDatabaseOptions = {}
): SqliteSchemaRepairReceipt {
  const before = inspectDatabaseSchemaReadOnly(dbPath);
  if (!options.write || before.healthy) {
    return {
      ok: true,
      operation: "sqlite-schema-repair",
      mode: options.write ? "write" : "diagnose",
      database: dbPath,
      changed: false,
      backup: null,
      actions: [],
      inspection: before,
    };
  }

  if (!before.repairable) {
    throw new SqliteSchemaIntegrityError(
      "The SQLite store has no recognized safe repair. No backup or mutation was performed.",
      before
    );
  }

  const backup = createSqliteRepairBackup(dbPath, options.now);
  const backupInspection = inspectDatabaseSchemaReadOnly(backup.path);
  if (!sameInspection(before, backupInspection)) {
    throw new SqliteSchemaIntegrityError(
      "The mandatory repair backup did not preserve the diagnosed store state. No mutation was performed.",
      backupInspection
    );
  }

  const sourceAfterBackup = readStableDatabaseSnapshot(dbPath);
  if (snapshotHash(sourceAfterBackup) !== backup.sha256) {
    throw new SqliteSchemaIntegrityError(
      "The SQLite store changed after its repair backup was captured. No mutation was performed; retry when writers are idle.",
      inspectDatabaseSchemaReadOnly(dbPath)
    );
  }

  const db = openDatabaseForMaintenance(dbPath);
  let result;
  try {
    const maintenanceInspection = inspectSqliteSchema(db, {
      integrityCheck: true,
      frameCount: true,
    });
    if (!sameInspection(before, maintenanceInspection)) {
      throw new SqliteSchemaIntegrityError(
        "The SQLite store changed before the repair transaction. No mutation was performed; retry when writers are idle.",
        maintenanceInspection
      );
    }
    result = applyRecognizedSqliteSchemaRepair(db);
  } finally {
    db.close();
  }

  const after = inspectDatabaseSchemaReadOnly(dbPath);
  if (!after.healthy || after.frame_count !== before.frame_count) {
    throw new SqliteSchemaIntegrityError(
      `The repaired SQLite store did not pass detached post-repair validation. Restore from ${backup.path}.`,
      after
    );
  }

  return {
    ok: true,
    operation: "sqlite-schema-repair",
    mode: "write",
    database: dbPath,
    changed: result.actions.length > 0,
    backup: backup.path,
    actions: result.actions,
    inspection: after,
    before,
  };
}
