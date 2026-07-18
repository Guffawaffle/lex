import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import type Database from "better-sqlite3-multiple-ciphers";

import type {
  PrincipalId,
  ScopeVersion,
  TenantId,
  WorkspaceId,
} from "../../../shared/runtime-scope/index.js";
import { FRAME_STORE_SCOPE_CONTRACT_VERSION } from "../scoped-frame-store.js";
import {
  inspectDatabaseSchemaReadOnly,
  openDatabaseForMaintenance,
  openDatabaseSnapshotReadOnly,
  readStableDatabaseSnapshot,
} from "../db.js";
import { inspectSqliteSchema, type SqliteSchemaInspection } from "./schema-integrity.js";
import {
  installScopedSqliteAuxiliarySchema,
  inspectScopedSqliteSchema,
  isCanonicalPersistedScopeId,
  LEGACY_SQLITE_SCHEMA_VERSION,
  SCOPED_SQLITE_BINDING_TABLE,
  SCOPED_SQLITE_ERROR_CODES,
  SCOPED_SQLITE_SCHEMA_VERSION,
  scopedFramesTableSql,
  ScopedSqliteError,
  type ScopedSqliteSchemaInspection,
  type SqliteStoreScopeBindingV1,
} from "./scoped-schema.js";

export const SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION = 1 as const;
export const SQLITE_SCOPE_MIGRATION_RECEIPT_VERSION = 1 as const;

const LEGACY_FRAME_COLUMNS = Object.freeze([
  "id",
  "timestamp",
  "branch",
  "jira",
  "module_scope",
  "summary_caption",
  "reference_point",
  "status_snapshot",
  "keywords",
  "atlas_frame_id",
  "feature_flags",
  "permissions",
  "run_id",
  "plan_hash",
  "spend",
  "user_id",
  "superseded_by",
  "merged_from",
  "module_attribution",
]);

const LEGACY_FRAME_INDEXES = Object.freeze([
  "idx_frames_timestamp",
  "idx_frames_branch",
  "idx_frames_jira",
  "idx_frames_atlas_frame_id",
  "idx_frames_user_id",
  "idx_frames_superseded_by",
]);

const LEGACY_FRAME_TRIGGERS = Object.freeze(["frames_ai", "frames_ad", "frames_au"]);

const LEGACY_FTS_COLUMNS = Object.freeze([
  "reference_point",
  "summary_caption",
  "keywords",
  "next_action",
  "module_scope",
  "jira",
  "branch",
]);

export interface SqliteScopeTargetV1 {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly creatorPrincipalId: PrincipalId;
  readonly scopeVersion: ScopeVersion;
}

export interface SqliteScopeInventoryV1 {
  readonly state: "legacy-unowned" | "scoped" | "malformed" | "unsupported";
  readonly databaseRef: string;
  readonly sourceSha256: string;
  readonly sqliteSchemaVersion: number | null;
  readonly frameCount: number | null;
  readonly issues: readonly string[];
  readonly binding: SqliteStoreScopeBindingV1 | null;
}

export interface SqliteScopeMigrationManifestV1 {
  readonly schemaVersion: typeof SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION;
  readonly migrationId: string;
  readonly source: {
    readonly databaseRef: string;
    readonly sha256: string;
    readonly sqliteSchemaVersion: typeof LEGACY_SQLITE_SCHEMA_VERSION;
    readonly frameCount: number;
    readonly ownershipState: "legacy-unowned";
  };
  readonly target: SqliteScopeTargetV1;
}

export interface SqliteScopeMigrationReceiptV1 {
  readonly schemaVersion: typeof SQLITE_SCOPE_MIGRATION_RECEIPT_VERSION;
  readonly operation: "sqlite-scope-migration";
  readonly mode: "dry-run" | "write";
  readonly outcome: "ready" | "migrated" | "already-migrated";
  readonly migrationId: string;
  readonly source: SqliteScopeMigrationManifestV1["source"];
  readonly target: SqliteScopeTargetV1;
  readonly targetSqliteSchemaVersion: typeof SCOPED_SQLITE_SCHEMA_VERSION;
  readonly backup: null | { readonly backupRef: string; readonly sha256: string };
  readonly actions: readonly string[];
  readonly verified: boolean;
}

export interface SqliteScopeMigrationResult {
  /** Deterministic, path-redacted receipt suitable for durable audit logs. */
  readonly receipt: SqliteScopeMigrationReceiptV1;
  /** Local recovery handle for the administrator; never embedded in the receipt. */
  readonly recoveryPath: string | null;
}

export interface SqliteScopeRecoveryReceiptV1 {
  readonly schemaVersion: 1;
  readonly operation: "sqlite-scope-migration-recovery";
  readonly mode: "dry-run" | "write";
  readonly outcome: "ready" | "restored";
  readonly migrationId: string;
  readonly databaseRef: string;
  readonly restoredSha256: string;
  readonly restoredSqliteSchemaVersion: typeof LEGACY_SQLITE_SCHEMA_VERSION;
  readonly verified: boolean;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function canonicalTarget(target: SqliteScopeTargetV1): SqliteScopeTargetV1 {
  if (
    !isCanonicalPersistedScopeId(target?.tenantId) ||
    !isCanonicalPersistedScopeId(target.workspaceId) ||
    !isCanonicalPersistedScopeId(target.creatorPrincipalId) ||
    !isNonEmpty(target.scopeVersion)
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
      "SQLite scope migration requires explicit non-empty tenant, workspace, creator principal, and scope-version values."
    );
  }
  return Object.freeze({
    tenantId: target.tenantId,
    workspaceId: target.workspaceId,
    creatorPrincipalId: target.creatorPrincipalId,
    scopeVersion: target.scopeVersion,
  });
}

function canonicalManifestPayload(
  source: SqliteScopeMigrationManifestV1["source"],
  target: SqliteScopeTargetV1
): string {
  return JSON.stringify({
    schemaVersion: SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION,
    source: {
      databaseRef: source.databaseRef,
      sha256: source.sha256,
      sqliteSchemaVersion: source.sqliteSchemaVersion,
      frameCount: source.frameCount,
      ownershipState: source.ownershipState,
    },
    target: {
      tenantId: target.tenantId,
      workspaceId: target.workspaceId,
      creatorPrincipalId: target.creatorPrincipalId,
      scopeVersion: target.scopeVersion,
    },
  });
}

function migrationId(
  source: SqliteScopeMigrationManifestV1["source"],
  target: SqliteScopeTargetV1
): string {
  return sha256(canonicalManifestPayload(source, target));
}

function databaseRef(sourceSha256: string): string {
  return sha256(`lex-sqlite-store:${sourceSha256}`);
}

function bindingMatchesTarget(
  binding: SqliteStoreScopeBindingV1,
  target: SqliteScopeTargetV1
): boolean {
  return (
    binding.tenantId === target.tenantId &&
    binding.workspaceId === target.workspaceId &&
    binding.creatorPrincipalId === target.creatorPrincipalId &&
    binding.scopeVersion === target.scopeVersion
  );
}

function legacyMigrationIssues(db: Database.Database): readonly string[] {
  const issues: string[] = [];
  const frameColumns = (
    db.prepare("PRAGMA table_info(frames)").all() as Array<{ name: string }>
  ).map(({ name }) => name);
  for (const column of frameColumns) {
    if (!LEGACY_FRAME_COLUMNS.includes(column)) issues.push(`legacy-frame-column:${column}`);
  }
  const frameObjects = db
    .prepare(
      "SELECT type, name FROM sqlite_master WHERE tbl_name = 'frames' AND type IN ('index', 'trigger') ORDER BY type, name"
    )
    .all() as Array<{ type: "index" | "trigger"; name: string }>;
  for (const object of frameObjects) {
    if (object.name.startsWith("sqlite_autoindex_")) continue;
    const recognized =
      object.type === "index"
        ? LEGACY_FRAME_INDEXES.includes(object.name)
        : LEGACY_FRAME_TRIGGERS.includes(object.name);
    if (!recognized) issues.push(`legacy-frame-${object.type}:${object.name}`);
  }
  const ftsColumns = (
    db.prepare("PRAGMA table_info(frames_fts)").all() as Array<{ name: string }>
  ).map(({ name }) => name);
  if (
    ftsColumns.length !== LEGACY_FTS_COLUMNS.length ||
    ftsColumns.some((column, index) => column !== LEGACY_FTS_COLUMNS[index])
  ) {
    issues.push("legacy-fts-shape:unexpected");
  }
  const invalidJson = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM frames
          WHERE NOT json_valid(module_scope)
             OR NOT json_valid(status_snapshot)
             OR (keywords IS NOT NULL AND NOT json_valid(keywords))
             OR (feature_flags IS NOT NULL AND NOT json_valid(feature_flags))
             OR (permissions IS NOT NULL AND NOT json_valid(permissions))
             OR (module_attribution IS NOT NULL AND NOT json_valid(module_attribution))
             OR (spend IS NOT NULL AND NOT json_valid(spend))
             OR (merged_from IS NOT NULL AND NOT json_valid(merged_from))`
      )
      .get() as { count: number }
  ).count;
  if (invalidJson > 0) issues.push(`legacy-frame-json:${invalidJson}`);
  return Object.freeze(issues);
}

function inspectSnapshot(dbPath: string): {
  readonly inspection: ScopedSqliteSchemaInspection;
  readonly legacyInspection: SqliteSchemaInspection;
  readonly migrationIssues: readonly string[];
  readonly sourceSha256: string;
} {
  const snapshot = readStableDatabaseSnapshot(dbPath);
  const sourceSha256 = sha256(snapshot);
  const db = openDatabaseSnapshotReadOnly(snapshot);
  try {
    const inspection = inspectScopedSqliteSchema(db, { integrityCheck: true });
    const legacyInspection = inspectSqliteSchema(db, {
      integrityCheck: true,
      frameCount: true,
    });
    return {
      inspection,
      legacyInspection,
      migrationIssues:
        inspection.state === "legacy-unowned" && legacyInspection.healthy
          ? legacyMigrationIssues(db)
          : Object.freeze([]),
      sourceSha256,
    };
  } finally {
    db.close();
  }
}

/** Non-mutating inventory. No path or credential is included in the result. */
export function inventorySqliteScope(dbPath: string): SqliteScopeInventoryV1 {
  const { inspection, legacyInspection, migrationIssues, sourceSha256 } = inspectSnapshot(dbPath);
  let issues = inspection.issues;
  if (inspection.state === "legacy-unowned") {
    if (
      !legacyInspection.healthy ||
      legacyInspection.schema_version !== LEGACY_SQLITE_SCHEMA_VERSION
    ) {
      issues = Object.freeze(
        legacyInspection.issues.map((issue) => `${issue.code}:${issue.object_name}`)
      );
    }
    issues = Object.freeze([...issues, ...migrationIssues]);
  }
  const state =
    issues.length > 0 && inspection.state === "legacy-unowned" ? "malformed" : inspection.state;
  return Object.freeze({
    state,
    databaseRef: databaseRef(sourceSha256),
    sourceSha256,
    sqliteSchemaVersion: inspection.schemaVersion,
    frameCount: inspection.frameCount,
    issues: Object.freeze([...issues]),
    binding: inspection.binding,
  });
}

/** Produce the explicit source-to-scope mapping that must be reviewed before write mode. */
export function createSqliteScopeMigrationManifest(
  dbPath: string,
  requestedTarget: SqliteScopeTargetV1
): SqliteScopeMigrationManifestV1 {
  const inventory = inventorySqliteScope(dbPath);
  if (inventory.state !== "legacy-unowned") {
    const code =
      inventory.state === "scoped"
        ? SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT
        : SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED;
    throw new ScopedSqliteError(
      code,
      `A migration manifest can only be created for a healthy unowned v${LEGACY_SQLITE_SCHEMA_VERSION} store; current state is ${inventory.state}.`,
      Object.freeze({
        state: inventory.state,
        schemaVersion: inventory.sqliteSchemaVersion,
        issues: inventory.issues,
      })
    );
  }
  if (
    inventory.sqliteSchemaVersion !== LEGACY_SQLITE_SCHEMA_VERSION ||
    inventory.frameCount === null
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED,
      "The legacy SQLite source does not have a validated frame count and schema version."
    );
  }
  const target = canonicalTarget(requestedTarget);
  const source = Object.freeze({
    databaseRef: inventory.databaseRef,
    sha256: inventory.sourceSha256,
    sqliteSchemaVersion: LEGACY_SQLITE_SCHEMA_VERSION,
    frameCount: inventory.frameCount,
    ownershipState: "legacy-unowned" as const,
  });
  return Object.freeze({
    schemaVersion: SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION,
    migrationId: migrationId(source, target),
    source,
    target,
  });
}

/** Validate both canonical content and current source state; stale manifests fail closed. */
export function validateSqliteScopeMigrationManifest(
  dbPath: string,
  manifest: SqliteScopeMigrationManifestV1
): SqliteScopeInventoryV1 {
  const source = manifest?.source;
  if (
    manifest?.schemaVersion !== SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION ||
    !source ||
    !/^sha256:[0-9a-f]{64}$/.test(source.databaseRef) ||
    !/^sha256:[0-9a-f]{64}$/.test(source.sha256) ||
    source.sqliteSchemaVersion !== LEGACY_SQLITE_SCHEMA_VERSION ||
    !Number.isSafeInteger(source.frameCount) ||
    source.frameCount < 0 ||
    source.ownershipState !== "legacy-unowned" ||
    !/^sha256:[0-9a-f]{64}$/.test(manifest.migrationId) ||
    manifest.migrationId !== migrationId(source, canonicalTarget(manifest.target))
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
      "The SQLite scope migration manifest is malformed or its deterministic ID does not match its content."
    );
  }
  const inventory = inventorySqliteScope(dbPath);
  if (inventory.state === "scoped" && inventory.binding) {
    if (
      inventory.binding.migrationId === manifest.migrationId &&
      bindingMatchesTarget(inventory.binding, manifest.target)
    ) {
      return inventory;
    }
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
      "The SQLite store is already bound to a different migration or scope. Rebinding requires a separate administrative lifecycle.",
      Object.freeze({ existingMigrationId: inventory.binding.migrationId })
    );
  }
  if (inventory.state !== "legacy-unowned") {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED,
      `The SQLite migration source is ${inventory.state}; ownership was not changed.`,
      Object.freeze({ issues: inventory.issues })
    );
  }
  if (
    inventory.sourceSha256 !== manifest.source.sha256 ||
    inventory.databaseRef !== manifest.source.databaseRef ||
    inventory.sqliteSchemaVersion !== manifest.source.sqliteSchemaVersion ||
    inventory.frameCount !== manifest.source.frameCount
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SOURCE_CHANGED,
      "The SQLite store changed after the scope manifest was created. Create and review a new manifest.",
      Object.freeze({
        expectedSha256: manifest.source.sha256,
        actualSha256: inventory.sourceSha256,
      })
    );
  }
  return inventory;
}

function migrationBackupPath(dbPath: string, migration: string): string {
  return `${dbPath}.scope-v${SCOPED_SQLITE_SCHEMA_VERSION}-${migration.replace("sha256:", "").slice(0, 16)}.bak`;
}

function createOrVerifyBackup(
  dbPath: string,
  manifest: SqliteScopeMigrationManifestV1
): { readonly path: string; readonly sha256: string; readonly backupRef: string } {
  const snapshot = readStableDatabaseSnapshot(dbPath);
  const snapshotSha256 = sha256(snapshot);
  if (snapshotSha256 !== manifest.source.sha256) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SOURCE_CHANGED,
      "The SQLite source changed before its mandatory migration backup could be captured."
    );
  }
  const path = migrationBackupPath(dbPath, manifest.migrationId);
  if (existsSync(path)) {
    const existingSha256 = sha256(readFileSync(path));
    if (existingSha256 !== snapshotSha256) {
      throw new ScopedSqliteError(
        SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
        "The deterministic migration backup path already contains different data; no mutation was performed."
      );
    }
  } else {
    writeFileSync(path, snapshot, { flag: "wx", mode: 0o600 });
  }
  return Object.freeze({
    path,
    sha256: snapshotSha256,
    backupRef: sha256(`backup:${manifest.migrationId}:${snapshotSha256}`),
  });
}

const MIGRATION_ACTIONS = Object.freeze([
  "verify legacy v14 structural integrity",
  "capture mandatory recovery snapshot",
  "rebuild frames with immutable ownership columns",
  "bind SQLite file to one tenant and workspace",
  "rebuild scoped FTS and indexes",
  "record SQLite schema version 15",
  "verify frame count, ownership, integrity, and foreign keys",
]);

function receipt(
  manifest: SqliteScopeMigrationManifestV1,
  mode: "dry-run" | "write",
  outcome: SqliteScopeMigrationReceiptV1["outcome"],
  backup: SqliteScopeMigrationReceiptV1["backup"],
  verified: boolean
): SqliteScopeMigrationReceiptV1 {
  return Object.freeze({
    schemaVersion: SQLITE_SCOPE_MIGRATION_RECEIPT_VERSION,
    operation: "sqlite-scope-migration",
    mode,
    outcome,
    migrationId: manifest.migrationId,
    source: manifest.source,
    target: manifest.target,
    targetSqliteSchemaVersion: SCOPED_SQLITE_SCHEMA_VERSION,
    backup,
    actions: MIGRATION_ACTIONS,
    verified,
  });
}

function applyScopeMigration(
  db: Database.Database,
  dbPath: string,
  manifest: SqliteScopeMigrationManifestV1,
  committedReceipt: SqliteScopeMigrationReceiptV1
): void {
  if (sha256(readStableDatabaseSnapshot(dbPath)) !== manifest.source.sha256) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SOURCE_CHANGED,
      "The SQLite source changed before the migration acquired its write lock."
    );
  }
  const before = inspectSqliteSchema(db, { integrityCheck: true, frameCount: true });
  if (
    !before.healthy ||
    before.schema_version !== LEGACY_SQLITE_SCHEMA_VERSION ||
    before.frame_count !== manifest.source.frameCount
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SOURCE_CHANGED,
      "The SQLite source no longer matches the reviewed migration manifest."
    );
  }
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(SCOPED_SQLITE_BINDING_TABLE);
  if (tableExists) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
      "A partial or conflicting SQLite scope binding already exists."
    );
  }

  db.exec(
    "DROP TRIGGER IF EXISTS frames_au; DROP TRIGGER IF EXISTS frames_ad; DROP TRIGGER IF EXISTS frames_ai; DROP TABLE IF EXISTS frames_fts;"
  );
  db.exec(scopedFramesTableSql());
  const columns = LEGACY_FRAME_COLUMNS.join(", ");
  db.prepare(
    `INSERT INTO frames_scoped_v15 (
       rowid, ${columns}, ownership_schema_version, tenant_id, workspace_id,
       creator_principal_id, scope_version
     )
     SELECT rowid, ${columns}, ?, ?, ?, ?, ? FROM frames`
  ).run(
    FRAME_STORE_SCOPE_CONTRACT_VERSION,
    manifest.target.tenantId,
    manifest.target.workspaceId,
    manifest.target.creatorPrincipalId,
    manifest.target.scopeVersion
  );

  db.exec("DROP TABLE frames; ALTER TABLE frames_scoped_v15 RENAME TO frames;");
  db.exec(`
    CREATE TABLE frame_store_scope (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      contract_version INTEGER NOT NULL CHECK (contract_version = ${FRAME_STORE_SCOPE_CONTRACT_VERSION}),
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      creator_principal_id TEXT NOT NULL,
      scope_version TEXT NOT NULL,
      migration_id TEXT NOT NULL UNIQUE,
      source_sha256 TEXT NOT NULL,
      migration_manifest_json TEXT NOT NULL,
      migration_receipt_json TEXT NOT NULL,
      UNIQUE (tenant_id, workspace_id)
    );
  `);
  db.prepare(
    `INSERT INTO frame_store_scope (
       singleton, contract_version, tenant_id, workspace_id, creator_principal_id,
       scope_version, migration_id, source_sha256, migration_manifest_json,
       migration_receipt_json
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    FRAME_STORE_SCOPE_CONTRACT_VERSION,
    manifest.target.tenantId,
    manifest.target.workspaceId,
    manifest.target.creatorPrincipalId,
    manifest.target.scopeVersion,
    manifest.migrationId,
    manifest.source.sha256,
    JSON.stringify(manifest),
    JSON.stringify(committedReceipt)
  );
  installScopedSqliteAuxiliarySchema(db);
  db.exec(`
    INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
    SELECT rowid, reference_point, summary_caption, keywords,
           json_extract(status_snapshot, '$.next_action'), module_scope, jira, branch
      FROM frames;
  `);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCOPED_SQLITE_SCHEMA_VERSION);
}

/** Diagnose by default. Only `write: true` can assign ownership. */
export function migrateSqliteStoreToScopedV15(
  dbPath: string,
  manifest: SqliteScopeMigrationManifestV1,
  options: { readonly write?: boolean } = {}
): SqliteScopeMigrationResult {
  const inventory = validateSqliteScopeMigrationManifest(dbPath, manifest);
  if (inventory.state === "scoped" && inventory.binding) {
    const stored = JSON.parse(
      inventory.binding.migrationReceiptJson
    ) as SqliteScopeMigrationReceiptV1;
    return Object.freeze({
      receipt: Object.freeze({ ...stored, outcome: "already-migrated" as const }),
      recoveryPath: migrationBackupPath(dbPath, manifest.migrationId),
    });
  }
  if (!options.write) {
    return Object.freeze({
      receipt: receipt(manifest, "dry-run", "ready", null, true),
      recoveryPath: null,
    });
  }

  const backup = createOrVerifyBackup(dbPath, manifest);
  validateSqliteScopeMigrationManifest(dbPath, manifest);
  const backupReceipt = Object.freeze({ backupRef: backup.backupRef, sha256: backup.sha256 });
  const committedReceipt = receipt(manifest, "write", "migrated", backupReceipt, true);
  const db = openDatabaseForMaintenance(dbPath);
  try {
    db.pragma("foreign_keys = OFF");
    const migrate = db.transaction(() => {
      applyScopeMigration(db, dbPath, manifest, committedReceipt);
      const after = inspectScopedSqliteSchema(db, { integrityCheck: true });
      if (
        !after.healthy ||
        after.frameCount !== manifest.source.frameCount ||
        !after.binding ||
        !bindingMatchesTarget(after.binding, manifest.target)
      ) {
        throw new ScopedSqliteError(
          SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
          "The scoped SQLite migration did not pass in-transaction verification.",
          Object.freeze({ issues: after.issues, backupRef: backup.backupRef })
        );
      }
    });
    migrate.immediate();
    db.pragma("foreign_keys = ON");
    const verified = inspectScopedSqliteSchema(db, { integrityCheck: true });
    if (!verified.healthy || verified.frameCount !== manifest.source.frameCount) {
      throw new ScopedSqliteError(
        SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
        "The committed scoped SQLite migration requires recovery from its mandatory backup.",
        Object.freeze({ issues: verified.issues, backupRef: backup.backupRef })
      );
    }
  } catch (error) {
    if (error instanceof ScopedSqliteError) throw error;
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
      `The scoped SQLite migration failed; the source remains recoverable from the mandatory backup: ${
        error instanceof Error ? error.message : String(error)
      }`,
      Object.freeze({ backupRef: backup.backupRef })
    );
  } finally {
    db.close();
  }
  return Object.freeze({ receipt: committedReceipt, recoveryPath: backup.path });
}

/** Explicit recovery. The backup must be the exact legacy source recorded by v15. */
export function recoverSqliteScopeMigration(
  dbPath: string,
  backupPath: string,
  options: { readonly write?: boolean } = {}
): { readonly receipt: SqliteScopeRecoveryReceiptV1 } {
  const current = inventorySqliteScope(dbPath);
  if (current.state !== "scoped" || !current.binding) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED,
      "Scope migration recovery requires a healthy currently scoped v15 store."
    );
  }
  if (!existsSync(backupPath)) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
      "The supplied scope migration recovery snapshot does not exist."
    );
  }
  const backupSha256 = sha256(readFileSync(backupPath));
  if (backupSha256 !== current.binding.sourceSha256) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MAPPING_CONFLICT,
      "The recovery snapshot does not match the source recorded by this scoped store."
    );
  }
  const backupInspection = inspectDatabaseSchemaReadOnly(backupPath);
  if (
    !backupInspection.healthy ||
    backupInspection.schema_version !== LEGACY_SQLITE_SCHEMA_VERSION
  ) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED,
      "The recovery snapshot is not a healthy legacy v14 Frame store."
    );
  }
  const mode = options.write ? "write" : "dry-run";
  const resultReceipt = Object.freeze({
    schemaVersion: 1 as const,
    operation: "sqlite-scope-migration-recovery" as const,
    mode,
    outcome: options.write ? ("restored" as const) : ("ready" as const),
    migrationId: current.binding.migrationId,
    databaseRef: current.databaseRef,
    restoredSha256: backupSha256,
    restoredSqliteSchemaVersion: LEGACY_SQLITE_SCHEMA_VERSION,
    verified: true,
  });
  if (!options.write) return Object.freeze({ receipt: resultReceipt });

  readStableDatabaseSnapshot(dbPath);
  const temporaryPath = `${dbPath}.scope-recovery-${current.binding.migrationId
    .replace("sha256:", "")
    .slice(0, 16)}.tmp`;
  if (existsSync(temporaryPath)) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
      "A prior SQLite recovery staging file is still present; inspect it before retrying."
    );
  }
  writeFileSync(temporaryPath, readFileSync(backupPath), { flag: "wx", mode: 0o600 });
  const displacedPath = `${dbPath}.scope-recovery-current-${current.binding.migrationId
    .replace("sha256:", "")
    .slice(0, 16)}.tmp`;
  if (existsSync(displacedPath)) {
    unlinkSync(temporaryPath);
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
      "A prior displaced SQLite recovery source is still present; inspect it before retrying."
    );
  }
  renameSync(dbPath, displacedPath);
  try {
    renameSync(temporaryPath, dbPath);
    const restored = inspectDatabaseSchemaReadOnly(dbPath);
    if (!restored.healthy || restored.schema_version !== LEGACY_SQLITE_SCHEMA_VERSION) {
      throw new ScopedSqliteError(
        SCOPED_SQLITE_ERROR_CODES.RECOVERY_REQUIRED,
        "The restored SQLite store did not pass detached verification."
      );
    }
    unlinkSync(displacedPath);
  } catch (error) {
    if (existsSync(dbPath)) renameSync(dbPath, temporaryPath);
    renameSync(displacedPath, dbPath);
    throw error;
  }
  return Object.freeze({ receipt: resultReceipt });
}
