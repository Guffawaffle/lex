import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import Database from "better-sqlite3-multiple-ciphers";

import {
  createDatabase,
  DATABASE_SCHEMA_VERSION,
  inspectDatabaseSchemaReadOnly,
  openDatabaseReadOnly,
  ReadOnlyDatabaseError,
} from "@app/memory/store/db.js";
import {
  createSqliteRepairBackup,
  repairSqliteDatabase,
} from "@app/memory/store/sqlite/schema-repair.js";
import {
  LEGACY_DIVERGENT_SCHEMA_VERSION,
  SqliteSchemaIntegrityError,
} from "@app/memory/store/sqlite/schema-integrity.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function seedFrame(db: Database.Database): void {
  db.prepare(
    `INSERT INTO frames (
      id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "repair-frame",
    "2026-07-17T00:00:00.000Z",
    "main",
    '["memory/store"]',
    "Preserve this frame during repair",
    "SQLite repair fixture",
    '{"next_action":"Verify repair"}'
  );
}

function makeDivergentVersion13(dbPath: string): void {
  const db = createDatabase(dbPath);
  seedFrame(db);
  db.exec("ALTER TABLE frames DROP COLUMN module_attribution");
  db.prepare("DELETE FROM schema_version WHERE version = ?").run(DATABASE_SCHEMA_VERSION);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
    LEGACY_DIVERGENT_SCHEMA_VERSION
  );
  db.close();
}

test("diagnoses the recognized version 13 divergence without modifying files", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-diagnose-"));
  const dbPath = join(root, "memory.db");

  try {
    makeDivergentVersion13(dbPath);
    const entriesBefore = readdirSync(root);
    const hashBefore = sha256(dbPath);

    const receipt = repairSqliteDatabase(dbPath);

    assert.strictEqual(receipt.mode, "diagnose");
    assert.strictEqual(receipt.changed, false);
    assert.strictEqual(receipt.backup, null);
    assert.strictEqual(receipt.inspection.schema_version, LEGACY_DIVERGENT_SCHEMA_VERSION);
    assert.strictEqual(receipt.inspection.repairable, true);
    assert.deepStrictEqual(
      receipt.inspection.issues.map((issue) => issue.code),
      ["LEGACY_DIVERGENT_SCHEMA_VERSION", "MISSING_COLUMN"]
    );
    assert.deepStrictEqual(readdirSync(root), entriesBefore);
    assert.strictEqual(sha256(dbPath), hashBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only access reports structural incompatibility and never repairs it", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-read-only-"));
  const dbPath = join(root, "memory.db");

  try {
    makeDivergentVersion13(dbPath);
    const entriesBefore = readdirSync(root);
    const hashBefore = sha256(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_INCOMPATIBLE");
        assert.match(error.message, /frames\.module_attribution/);
        return true;
      }
    );

    assert.deepStrictEqual(readdirSync(root), entriesBefore);
    assert.strictEqual(sha256(dbPath), hashBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary initialization refuses version 13 instead of repairing it", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-initialize-"));
  const dbPath = join(root, "memory.db");

  try {
    makeDivergentVersion13(dbPath);
    assert.throws(() => createDatabase(dbPath), SqliteSchemaIntegrityError);

    const inspection = inspectDatabaseSchemaReadOnly(dbPath);
    assert.strictEqual(inspection.schema_version, LEGACY_DIVERGENT_SCHEMA_VERSION);
    assert.ok(inspection.issues.some((issue) => issue.object_name === "frames.module_attribution"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit repair creates a backup, converges monotonically, and preserves frames", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-write-"));
  const dbPath = join(root, "memory.db");
  const now = new Date("2026-07-17T12:34:56.789Z");

  try {
    makeDivergentVersion13(dbPath);

    const receipt = repairSqliteDatabase(dbPath, { write: true, now });

    assert.strictEqual(receipt.mode, "write");
    assert.strictEqual(receipt.changed, true);
    assert.ok(receipt.backup);
    assert.strictEqual(existsSync(receipt.backup), true);
    assert.deepStrictEqual(receipt.actions, [
      "add frames.module_attribution",
      `record schema version ${DATABASE_SCHEMA_VERSION}`,
    ]);
    assert.strictEqual(receipt.inspection.healthy, true);
    assert.strictEqual(receipt.inspection.schema_version, DATABASE_SCHEMA_VERSION);
    assert.strictEqual(receipt.inspection.frame_count, 1);

    const backupInspection = inspectDatabaseSchemaReadOnly(receipt.backup);
    assert.strictEqual(backupInspection.schema_version, LEGACY_DIVERGENT_SCHEMA_VERSION);
    assert.ok(
      backupInspection.issues.some((issue) => issue.object_name === "frames.module_attribution")
    );

    const repaired = openDatabaseReadOnly(dbPath);
    const frame = repaired.prepare("SELECT id FROM frames WHERE id = ?").get("repair-frame") as {
      id: string;
    };
    assert.strictEqual(frame.id, "repair-frame");
    repaired.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repair is idempotent and does not create another backup for a healthy store", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-idempotent-"));
  const dbPath = join(root, "memory.db");

  try {
    makeDivergentVersion13(dbPath);
    repairSqliteDatabase(dbPath, { write: true });
    const entriesBefore = readdirSync(root);

    const receipt = repairSqliteDatabase(dbPath, { write: true });

    assert.strictEqual(receipt.changed, false);
    assert.strictEqual(receipt.backup, null);
    assert.deepStrictEqual(receipt.actions, []);
    assert.deepStrictEqual(readdirSync(root), entriesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mandatory repair backups never overwrite same-tick recovery copies", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-backup-collision-"));
  const dbPath = join(root, "memory.db");
  const now = new Date("2026-07-17T12:34:56.789Z");

  try {
    createDatabase(dbPath).close();
    const first = createSqliteRepairBackup(dbPath, now);
    const second = createSqliteRepairBackup(dbPath, now);

    assert.notStrictEqual(first.path, second.path);
    assert.strictEqual(first.sha256, second.sha256);
    assert.strictEqual(existsSync(first.path), true);
    assert.strictEqual(existsSync(second.path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown structural divergence remains blocked without creating a backup", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-unknown-"));
  const dbPath = join(root, "memory.db");

  try {
    const db = createDatabase(dbPath);
    db.exec("DROP INDEX idx_frames_branch");
    db.close();
    const entriesBefore = readdirSync(root);

    const inspection = inspectDatabaseSchemaReadOnly(dbPath);
    assert.strictEqual(inspection.repairable, false);
    assert.ok(inspection.issues.some((issue) => issue.object_name === "idx_frames_branch"));
    assert.throws(() => repairSqliteDatabase(dbPath, { write: true }), SqliteSchemaIntegrityError);
    assert.deepStrictEqual(readdirSync(root), entriesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a newer unknown schema version remains blocked without creating a backup", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-schema-newer-"));
  const dbPath = join(root, "memory.db");

  try {
    const db = createDatabase(dbPath);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(DATABASE_SCHEMA_VERSION + 1);
    db.close();
    const entriesBefore = readdirSync(root);

    const inspection = inspectDatabaseSchemaReadOnly(dbPath);
    assert.strictEqual(inspection.repairable, false);
    assert.ok(inspection.issues.some((issue) => issue.code === "SCHEMA_VERSION_NEWER"));
    assert.throws(() => repairSqliteDatabase(dbPath, { write: true }), SqliteSchemaIntegrityError);
    assert.deepStrictEqual(readdirSync(root), entriesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
