import type Database from "better-sqlite3-multiple-ciphers";

import type {
  PrincipalId,
  ScopeVersion,
  TenantId,
  WorkspaceId,
} from "../../../shared/runtime-scope/index.js";
import { FRAME_STORE_SCOPE_CONTRACT_VERSION } from "../scoped-frame-store.js";

/** Explicit scoped SQLite schema. Legacy schema v14 is never adopted implicitly. */
export const SCOPED_SQLITE_SCHEMA_VERSION = 15 as const;
export const LEGACY_SQLITE_SCHEMA_VERSION = 14 as const;
export const SCOPED_SQLITE_BINDING_TABLE = "frame_store_scope" as const;

export interface SqliteStoreScopeBindingV1 {
  readonly contractVersion: typeof FRAME_STORE_SCOPE_CONTRACT_VERSION;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly creatorPrincipalId: PrincipalId;
  readonly scopeVersion: ScopeVersion;
  readonly migrationId: string;
  readonly sourceSha256: string;
  readonly migrationManifestJson: string;
  readonly migrationReceiptJson: string;
}

export type ScopedSqliteSchemaState = "legacy-unowned" | "scoped" | "malformed" | "unsupported";

export interface ScopedSqliteSchemaInspection {
  readonly state: ScopedSqliteSchemaState;
  readonly schemaVersion: number | null;
  readonly frameCount: number | null;
  readonly binding: SqliteStoreScopeBindingV1 | null;
  readonly issues: readonly string[];
  readonly healthy: boolean;
}

export const SCOPED_SQLITE_ERROR_CODES = Object.freeze({
  MIGRATION_REQUIRED: "LEX_SQLITE_SCOPE_MIGRATION_REQUIRED",
  SCHEMA_MALFORMED: "LEX_SQLITE_SCOPE_SCHEMA_MALFORMED",
  SCOPE_MISMATCH: "LEX_SQLITE_SCOPE_MISMATCH",
  SOURCE_CHANGED: "LEX_SQLITE_SCOPE_SOURCE_CHANGED",
  MAPPING_CONFLICT: "LEX_SQLITE_SCOPE_MAPPING_CONFLICT",
  READ_ONLY: "LEX_SQLITE_SCOPE_READ_ONLY",
  RECOVERY_REQUIRED: "LEX_SQLITE_SCOPE_RECOVERY_REQUIRED",
});

export type ScopedSqliteErrorCode =
  (typeof SCOPED_SQLITE_ERROR_CODES)[keyof typeof SCOPED_SQLITE_ERROR_CODES];

export class ScopedSqliteError extends Error {
  constructor(
    public readonly code: ScopedSqliteErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = Object.freeze({})
  ) {
    super(message);
    this.name = "ScopedSqliteError";
  }
}

/** Canonical lower-case UUID text; the generation/version nibble remains opaque. */
export function isCanonicalPersistedScopeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}

function tableNames(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function objectNames(db: Database.Database, type: "index" | "trigger"): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = ?").all(type) as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function columns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function schemaVersion(db: Database.Database, tables: Set<string>): number | null {
  if (!tables.has("schema_version")) return null;
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get() as
    { version: number | null } | undefined;
  return row?.version ?? null;
}

function readBinding(db: Database.Database): SqliteStoreScopeBindingV1 | null {
  const row = db
    .prepare(
      `SELECT contract_version, tenant_id, workspace_id, creator_principal_id,
              scope_version, migration_id, source_sha256, migration_manifest_json,
              migration_receipt_json
         FROM frame_store_scope WHERE singleton = 1`
    )
    .get() as
    | {
        contract_version: number;
        tenant_id: string;
        workspace_id: string;
        creator_principal_id: string;
        scope_version: string;
        migration_id: string;
        source_sha256: string;
        migration_manifest_json: string;
        migration_receipt_json: string;
      }
    | undefined;
  if (!row) return null;
  return Object.freeze({
    contractVersion: row.contract_version as typeof FRAME_STORE_SCOPE_CONTRACT_VERSION,
    tenantId: row.tenant_id as TenantId,
    workspaceId: row.workspace_id as WorkspaceId,
    creatorPrincipalId: row.creator_principal_id as PrincipalId,
    scopeVersion: row.scope_version as ScopeVersion,
    migrationId: row.migration_id,
    sourceSha256: row.source_sha256,
    migrationManifestJson: row.migration_manifest_json,
    migrationReceiptJson: row.migration_receipt_json,
  });
}

const REQUIRED_OWNERSHIP_COLUMNS = Object.freeze([
  "ownership_schema_version",
  "tenant_id",
  "workspace_id",
  "creator_principal_id",
  "scope_version",
]);

const REQUIRED_SCOPED_INDEXES = Object.freeze([
  "idx_frames_scope_timestamp",
  "idx_frames_scope_branch",
  "idx_frames_scope_superseded",
]);

const REQUIRED_SCOPED_TRIGGERS = Object.freeze([
  "frames_ai",
  "frames_ad",
  "frames_au",
  "frame_store_scope_immutable_update",
  "frame_store_scope_immutable_delete",
]);

/** Inspect without mutating. Unknown or partially applied ownership always fails closed. */
export function inspectScopedSqliteSchema(
  db: Database.Database,
  options: { readonly integrityCheck?: boolean } = {}
): ScopedSqliteSchemaInspection {
  const tables = tableNames(db);
  const version = schemaVersion(db, tables);
  const issues: string[] = [];
  let binding: SqliteStoreScopeBindingV1 | null = null;
  let frameCount: number | null = null;

  if (tables.has("frames")) {
    frameCount = (db.prepare("SELECT COUNT(*) AS count FROM frames").get() as { count: number })
      .count;
  }

  if (version === LEGACY_SQLITE_SCHEMA_VERSION && !tables.has(SCOPED_SQLITE_BINDING_TABLE)) {
    return Object.freeze({
      state: "legacy-unowned",
      schemaVersion: version,
      frameCount,
      binding: null,
      issues: Object.freeze([]),
      healthy: false,
    });
  }

  if (version !== SCOPED_SQLITE_SCHEMA_VERSION) {
    issues.push(`schema-version:${version ?? "missing"}`);
  }
  if (!tables.has("frames")) issues.push("missing-table:frames");
  if (!tables.has("frames_fts")) issues.push("missing-table:frames_fts");
  if (!tables.has(SCOPED_SQLITE_BINDING_TABLE)) {
    issues.push(`missing-table:${SCOPED_SQLITE_BINDING_TABLE}`);
  } else {
    const bindingCount = (
      db.prepare("SELECT COUNT(*) AS count FROM frame_store_scope").get() as { count: number }
    ).count;
    if (bindingCount !== 1) issues.push(`binding-count:${bindingCount}`);
    if (bindingCount === 1) {
      try {
        binding = readBinding(db);
      } catch {
        issues.push("binding-schema:malformed");
      }
    }
  }

  if (tables.has("frames")) {
    const frameColumns = columns(db, "frames");
    for (const column of REQUIRED_OWNERSHIP_COLUMNS) {
      if (!frameColumns.has(column)) issues.push(`missing-column:frames.${column}`);
    }
  }

  const indexes = objectNames(db, "index");
  for (const index of REQUIRED_SCOPED_INDEXES) {
    if (!indexes.has(index)) issues.push(`missing-index:${index}`);
  }
  const triggers = objectNames(db, "trigger");
  for (const trigger of REQUIRED_SCOPED_TRIGGERS) {
    if (!triggers.has(trigger)) issues.push(`missing-trigger:${trigger}`);
  }

  if (binding) {
    if (binding.contractVersion !== FRAME_STORE_SCOPE_CONTRACT_VERSION) {
      issues.push(`scope-contract-version:${Number(binding.contractVersion)}`);
    }
    if (
      !isCanonicalPersistedScopeId(binding.tenantId) ||
      !isCanonicalPersistedScopeId(binding.workspaceId) ||
      !isCanonicalPersistedScopeId(binding.creatorPrincipalId) ||
      !binding.scopeVersion ||
      !binding.migrationId ||
      !binding.sourceSha256 ||
      !/^sha256:[0-9a-f]{64}$/.test(binding.migrationId) ||
      !/^sha256:[0-9a-f]{64}$/.test(binding.sourceSha256)
    ) {
      issues.push("binding-fields:missing");
    }
    try {
      const manifest = JSON.parse(binding.migrationManifestJson) as {
        migrationId?: unknown;
        source?: { sha256?: unknown };
      };
      const receipt = JSON.parse(binding.migrationReceiptJson) as {
        migrationId?: unknown;
      };
      if (
        manifest.migrationId !== binding.migrationId ||
        manifest.source?.sha256 !== binding.sourceSha256 ||
        receipt.migrationId !== binding.migrationId
      ) {
        issues.push("binding-evidence:mismatch");
      }
    } catch {
      issues.push("binding-evidence:malformed");
    }
    if (
      tables.has("frames") &&
      REQUIRED_OWNERSHIP_COLUMNS.every((name) => columns(db, "frames").has(name))
    ) {
      const mismatched = (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM frames
              WHERE ownership_schema_version <> ?
                 OR tenant_id <> ? OR workspace_id <> ?`
          )
          .get(FRAME_STORE_SCOPE_CONTRACT_VERSION, binding.tenantId, binding.workspaceId) as {
          count: number;
        }
      ).count;
      if (mismatched !== 0) issues.push(`ownership-mismatch:${mismatched}`);
      const ownershipRows = db
        .prepare(
          "SELECT DISTINCT creator_principal_id, scope_version FROM frames ORDER BY creator_principal_id, scope_version"
        )
        .all() as Array<{ creator_principal_id: string; scope_version: string }>;
      if (
        ownershipRows.some(
          (row) => !isCanonicalPersistedScopeId(row.creator_principal_id) || !row.scope_version
        )
      ) {
        issues.push("frame-ownership-fields:invalid");
      }
    }
  }

  if (options.integrityCheck) {
    try {
      const quickCheck = db.pragma("quick_check", { simple: true }) as string;
      if (quickCheck !== "ok") issues.push(`quick-check:${quickCheck}`);
    } catch {
      issues.push("quick-check:failed");
    }
    try {
      const foreignKeyIssues = db.pragma("foreign_key_check") as unknown[];
      if (foreignKeyIssues.length > 0) issues.push(`foreign-key-check:${foreignKeyIssues.length}`);
    } catch {
      issues.push("foreign-key-check:failed");
    }
  }

  const state: ScopedSqliteSchemaState =
    issues.length === 0
      ? "scoped"
      : version === SCOPED_SQLITE_SCHEMA_VERSION
        ? "malformed"
        : "unsupported";
  return Object.freeze({
    state,
    schemaVersion: version,
    frameCount,
    binding,
    issues: Object.freeze(issues),
    healthy: issues.length === 0,
  });
}

export function requireHealthyScopedSqliteSchema(db: Database.Database): SqliteStoreScopeBindingV1 {
  const inspection = inspectScopedSqliteSchema(db, { integrityCheck: true });
  if (inspection.state === "legacy-unowned") {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.MIGRATION_REQUIRED,
      "This SQLite Frame store has no explicit tenant/workspace ownership. Run the scoped migration staging flow before normal service.",
      Object.freeze({ schemaVersion: inspection.schemaVersion, frameCount: inspection.frameCount })
    );
  }
  if (!inspection.healthy || !inspection.binding) {
    throw new ScopedSqliteError(
      SCOPED_SQLITE_ERROR_CODES.SCHEMA_MALFORMED,
      `The scoped SQLite Frame store is malformed or unsupported: ${inspection.issues.join(", ")}.`,
      Object.freeze({ schemaVersion: inspection.schemaVersion, issues: inspection.issues })
    );
  }
  return inspection.binding;
}

export function scopedFramesTableSql(tableName = "frames_scoped_v15"): string {
  return `CREATE TABLE ${tableName} (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    branch TEXT NOT NULL,
    jira TEXT,
    module_scope TEXT NOT NULL,
    summary_caption TEXT NOT NULL,
    reference_point TEXT NOT NULL,
    status_snapshot TEXT NOT NULL,
    keywords TEXT,
    atlas_frame_id TEXT,
    feature_flags TEXT,
    permissions TEXT,
    run_id TEXT,
    plan_hash TEXT,
    spend TEXT,
    user_id TEXT,
    superseded_by TEXT,
    merged_from TEXT,
    module_attribution TEXT,
    ownership_schema_version INTEGER NOT NULL CHECK (ownership_schema_version = ${FRAME_STORE_SCOPE_CONTRACT_VERSION}),
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    creator_principal_id TEXT NOT NULL,
    scope_version TEXT NOT NULL,
    UNIQUE (tenant_id, workspace_id, id)
  )`;
}

/** Install indexes, FTS, and enforcement triggers after the v15 table rebuild. */
export function installScopedSqliteAuxiliarySchema(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE frames_fts USING fts5(
      reference_point, summary_caption, keywords, next_action,
      module_scope, jira, branch, content=''
    );
    CREATE TRIGGER frames_ai AFTER INSERT ON frames BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM frame_store_scope s
         WHERE s.singleton = 1
           AND new.ownership_schema_version = s.contract_version
           AND new.tenant_id = s.tenant_id
           AND new.workspace_id = s.workspace_id
      ) THEN RAISE(ABORT, 'frame ownership does not match SQLite store binding') END;
      INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
      VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords,
        json_extract(new.status_snapshot, '$.next_action'), new.module_scope, new.jira, new.branch);
    END;
    CREATE TRIGGER frames_ad AFTER DELETE ON frames BEGIN
      INSERT INTO frames_fts(frames_fts, rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
      VALUES ('delete', old.rowid, old.reference_point, old.summary_caption, old.keywords,
        json_extract(old.status_snapshot, '$.next_action'), old.module_scope, old.jira, old.branch);
    END;
    CREATE TRIGGER frames_au AFTER UPDATE ON frames BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM frame_store_scope s
         WHERE s.singleton = 1
           AND new.ownership_schema_version = s.contract_version
           AND new.ownership_schema_version = old.ownership_schema_version
           AND new.tenant_id = s.tenant_id
           AND new.tenant_id = old.tenant_id
           AND new.workspace_id = s.workspace_id
           AND new.workspace_id = old.workspace_id
           AND new.creator_principal_id = old.creator_principal_id
           AND new.scope_version = old.scope_version
      ) THEN RAISE(ABORT, 'frame ownership is immutable and must match SQLite store binding') END;
      INSERT INTO frames_fts(frames_fts, rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
      VALUES ('delete', old.rowid, old.reference_point, old.summary_caption, old.keywords,
        json_extract(old.status_snapshot, '$.next_action'), old.module_scope, old.jira, old.branch);
      INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
      VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords,
        json_extract(new.status_snapshot, '$.next_action'), new.module_scope, new.jira, new.branch);
    END;
    CREATE TRIGGER frame_store_scope_immutable_update
      BEFORE UPDATE ON frame_store_scope BEGIN
        SELECT RAISE(ABORT, 'SQLite store scope binding is immutable');
      END;
    CREATE TRIGGER frame_store_scope_immutable_delete
      BEFORE DELETE ON frame_store_scope BEGIN
        SELECT RAISE(ABORT, 'SQLite store scope binding is immutable');
      END;
    CREATE INDEX idx_frames_timestamp ON frames(timestamp DESC);
    CREATE INDEX idx_frames_branch ON frames(branch);
    CREATE INDEX idx_frames_jira ON frames(jira);
    CREATE INDEX idx_frames_atlas_frame_id ON frames(atlas_frame_id);
    CREATE INDEX idx_frames_user_id ON frames(user_id);
    CREATE INDEX idx_frames_superseded_by ON frames(superseded_by);
    CREATE INDEX idx_frames_scope_timestamp ON frames(tenant_id, workspace_id, timestamp DESC, id DESC);
    CREATE INDEX idx_frames_scope_branch ON frames(tenant_id, workspace_id, branch);
    CREATE INDEX idx_frames_scope_superseded ON frames(tenant_id, workspace_id, superseded_by);
  `);
}
