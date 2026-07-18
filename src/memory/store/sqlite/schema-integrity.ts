import type Database from "better-sqlite3-multiple-ciphers";

export const SQLITE_SCHEMA_VERSION = 14;
export const LEGACY_DIVERGENT_SCHEMA_VERSION = 13;

export type SqliteSchemaIssueCode =
  | "SCHEMA_VERSION_MISSING"
  | "SCHEMA_VERSION_BEHIND"
  | "LEGACY_DIVERGENT_SCHEMA_VERSION"
  | "SCHEMA_VERSION_NEWER"
  | "MISSING_TABLE"
  | "MISSING_COLUMN"
  | "MISSING_INDEX"
  | "MISSING_TRIGGER"
  | "INTEGRITY_CHECK_FAILED";

export interface SqliteSchemaIssue {
  code: SqliteSchemaIssueCode;
  object_type: "database" | "table" | "column" | "index" | "trigger";
  object_name: string;
  repairable: boolean;
  message: string;
}

export interface SqliteSchemaInspection {
  schema_version: number | null;
  required_schema_version: number;
  frame_count: number | null;
  integrity_check: string;
  healthy: boolean;
  repairable: boolean;
  issues: SqliteSchemaIssue[];
}

export interface InspectSqliteSchemaOptions {
  integrityCheck?: boolean;
  frameCount?: boolean;
}

interface RequiredSqliteSchema {
  tables: Record<string, readonly string[]>;
  indexes: readonly string[];
  triggers: readonly string[];
}

/**
 * Structures required by the SQLite FrameStore's current read/write contract.
 * Extra application tables and columns are allowed; missing required objects
 * are diagnosed deterministically.
 */
export const REQUIRED_SQLITE_FRAME_SCHEMA: RequiredSqliteSchema = {
  tables: {
    schema_version: ["version", "applied_at"],
    frames: [
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
    ],
    frames_fts: [
      "reference_point",
      "summary_caption",
      "keywords",
      "next_action",
      "module_scope",
      "jira",
      "branch",
    ],
    images: ["image_id", "frame_id", "data", "mime_type", "created_at"],
  },
  indexes: [
    "idx_frames_timestamp",
    "idx_frames_branch",
    "idx_frames_jira",
    "idx_frames_atlas_frame_id",
    "idx_frames_user_id",
    "idx_frames_superseded_by",
    "idx_images_frame_id",
  ],
  triggers: ["frames_ai", "frames_ad", "frames_au"],
};

export class SqliteSchemaIntegrityError extends Error {
  readonly code = "SQLITE_SCHEMA_INTEGRITY_ERROR";

  constructor(
    message: string,
    public readonly inspection: SqliteSchemaInspection
  ) {
    super(message);
    this.name = "SqliteSchemaIntegrityError";
  }
}

function objectNames(db: Database.Database, type: "table" | "index" | "trigger"): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'")
    .all(type) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function missingObjectIssue(
  objectType: "table" | "index" | "trigger",
  objectName: string
): SqliteSchemaIssue {
  const code =
    objectType === "table"
      ? "MISSING_TABLE"
      : objectType === "index"
        ? "MISSING_INDEX"
        : "MISSING_TRIGGER";
  return {
    code,
    object_type: objectType,
    object_name: objectName,
    repairable: false,
    message: `Required SQLite ${objectType} is missing: ${objectName}.`,
  };
}

function inspectVersion(
  db: Database.Database,
  tables: Set<string>,
  columnsByTable: Map<string, Set<string>>
): { version: number | null; issues: SqliteSchemaIssue[] } {
  if (!tables.has("schema_version") || !columnsByTable.get("schema_version")?.has("version")) {
    return {
      version: null,
      issues: [
        {
          code: "SCHEMA_VERSION_MISSING",
          object_type: "database",
          object_name: "schema_version",
          repairable: false,
          message: "SQLite schema version metadata is missing or malformed.",
        },
      ],
    };
  }

  const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get() as {
    version: number | null;
  };
  const version = row?.version ?? null;
  if (version === null) {
    return {
      version,
      issues: [
        {
          code: "SCHEMA_VERSION_MISSING",
          object_type: "database",
          object_name: "schema_version",
          repairable: false,
          message: "SQLite schema version metadata contains no applied version.",
        },
      ],
    };
  }

  if (version === LEGACY_DIVERGENT_SCHEMA_VERSION) {
    return {
      version,
      issues: [
        {
          code: "LEGACY_DIVERGENT_SCHEMA_VERSION",
          object_type: "database",
          object_name: "schema_version",
          repairable: true,
          message: `SQLite schema version ${version} is a recognized divergent legacy state and requires explicit convergence to version ${SQLITE_SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  if (version < SQLITE_SCHEMA_VERSION) {
    return {
      version,
      issues: [
        {
          code: "SCHEMA_VERSION_BEHIND",
          object_type: "database",
          object_name: "schema_version",
          repairable: version === 12,
          message: `SQLite schema version ${version} is older than required version ${SQLITE_SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  if (version > SQLITE_SCHEMA_VERSION) {
    return {
      version,
      issues: [
        {
          code: "SCHEMA_VERSION_NEWER",
          object_type: "database",
          object_name: "schema_version",
          repairable: false,
          message: `SQLite schema version ${version} is newer than supported version ${SQLITE_SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  return { version, issues: [] };
}

export function inspectSqliteSchema(
  db: Database.Database,
  options: InspectSqliteSchemaOptions = {}
): SqliteSchemaInspection {
  const tables = objectNames(db, "table");
  const indexes = objectNames(db, "index");
  const triggers = objectNames(db, "trigger");
  const columnsByTable = new Map<string, Set<string>>();
  const issues: SqliteSchemaIssue[] = [];

  for (const [table, requiredColumns] of Object.entries(REQUIRED_SQLITE_FRAME_SCHEMA.tables)) {
    if (!tables.has(table)) {
      issues.push(missingObjectIssue("table", table));
      continue;
    }
    const columns = tableColumns(db, table);
    columnsByTable.set(table, columns);
    for (const column of requiredColumns) {
      if (!columns.has(column)) {
        const repairable = table === "frames" && column === "module_attribution";
        issues.push({
          code: "MISSING_COLUMN",
          object_type: "column",
          object_name: `${table}.${column}`,
          repairable,
          message: `Required SQLite column is missing: ${table}.${column}.`,
        });
      }
    }
  }

  for (const index of REQUIRED_SQLITE_FRAME_SCHEMA.indexes) {
    if (!indexes.has(index)) issues.push(missingObjectIssue("index", index));
  }
  for (const trigger of REQUIRED_SQLITE_FRAME_SCHEMA.triggers) {
    if (!triggers.has(trigger)) issues.push(missingObjectIssue("trigger", trigger));
  }

  const versionInspection = inspectVersion(db, tables, columnsByTable);
  issues.unshift(...versionInspection.issues);

  let integrityCheck = "not_run";
  if (options.integrityCheck) {
    try {
      const rows = db.pragma("quick_check") as Array<{ quick_check: string }>;
      integrityCheck = rows.map((row) => row.quick_check).join("; ") || "unavailable";
      if (integrityCheck !== "ok") {
        issues.push({
          code: "INTEGRITY_CHECK_FAILED",
          object_type: "database",
          object_name: "quick_check",
          repairable: false,
          message: `SQLite quick_check failed: ${integrityCheck}.`,
        });
      }
    } catch (error) {
      integrityCheck = error instanceof Error ? error.message : String(error);
      issues.push({
        code: "INTEGRITY_CHECK_FAILED",
        object_type: "database",
        object_name: "quick_check",
        repairable: false,
        message: `SQLite quick_check could not run: ${integrityCheck}.`,
      });
    }
  }

  let frameCount: number | null = null;
  if (options.frameCount && tables.has("frames")) {
    const row = db.prepare("SELECT COUNT(*) AS count FROM frames").get() as { count: number };
    frameCount = row.count;
  }

  return {
    schema_version: versionInspection.version,
    required_schema_version: SQLITE_SCHEMA_VERSION,
    frame_count: frameCount,
    integrity_check: integrityCheck,
    healthy: issues.length === 0,
    repairable: issues.length > 0 && issues.every((issue) => issue.repairable),
    issues,
  };
}

export interface SqliteSchemaRepairResult {
  actions: string[];
  before: SqliteSchemaInspection;
  after: SqliteSchemaInspection;
}

export function applyRecognizedSqliteSchemaRepair(db: Database.Database): SqliteSchemaRepairResult {
  const inspectionOptions = { integrityCheck: true, frameCount: true };
  const before = inspectSqliteSchema(db, inspectionOptions);
  if (before.healthy) return { actions: [], before, after: before };
  if (!before.repairable) {
    throw new SqliteSchemaIntegrityError(
      "The SQLite store has structural issues that this Lex build cannot repair safely.",
      before
    );
  }

  const actions: string[] = [];
  const repair = db.transaction(() => {
    if (before.issues.some((issue) => issue.object_name === "frames.module_attribution")) {
      db.exec("ALTER TABLE frames ADD COLUMN module_attribution TEXT");
      actions.push("add frames.module_attribution");
    }

    if (before.schema_version === 12 || before.schema_version === LEGACY_DIVERGENT_SCHEMA_VERSION) {
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SQLITE_SCHEMA_VERSION);
      actions.push(`record schema version ${SQLITE_SCHEMA_VERSION}`);
    }

    const after = inspectSqliteSchema(db, inspectionOptions);
    if (!after.healthy || after.frame_count !== before.frame_count) {
      throw new SqliteSchemaIntegrityError(
        "SQLite schema repair did not pass post-repair validation.",
        after
      );
    }
    return after;
  });

  return { actions, before, after: repair() };
}
