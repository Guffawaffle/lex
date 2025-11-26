/**
 * Code Unit storage queries
 *
 * CRUD operations and search functions for CodeUnit records.
 * Part of Code Atlas Epic (CA-005) - Layer 1: Storage
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { CodeUnit, CodeUnitKind } from "../../atlas/schemas/code-unit.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";

const logger = getNDJSONLogger("memory/store/code-unit-queries");

/**
 * Database row type for code_units table
 */
export interface CodeUnitRow {
  id: string;
  repo_id: string;
  file_path: string;
  language: string;
  kind: string;
  symbol_path: string;
  name: string;
  start_line: number;
  end_line: number;
  tags: string | null; // JSON stringified array
  doc_comment: string | null;
  discovered_at: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
}

/**
 * Options for list operations
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
}

/**
 * Result of batch insert operation
 */
export interface BatchInsertResult {
  inserted: number;
}

/**
 * Result of batch delete operation
 */
export interface BatchDeleteResult {
  deleted: number;
}

/**
 * Convert CodeUnit object to database row
 */
function codeUnitToRow(unit: CodeUnit): Omit<CodeUnitRow, "created_at" | "updated_at"> {
  return {
    id: unit.id,
    repo_id: unit.repoId,
    file_path: unit.filePath,
    language: unit.language,
    kind: unit.kind,
    symbol_path: unit.symbolPath,
    name: unit.name,
    start_line: unit.span.startLine,
    end_line: unit.span.endLine,
    tags: unit.tags ? JSON.stringify(unit.tags) : null,
    doc_comment: unit.docComment ?? null,
    discovered_at: unit.discoveredAt,
    schema_version: unit.schemaVersion,
  };
}

/**
 * Convert database row to CodeUnit object
 */
function rowToCodeUnit(row: CodeUnitRow): CodeUnit {
  return {
    id: row.id,
    repoId: row.repo_id,
    filePath: row.file_path,
    language: row.language,
    kind: row.kind as CodeUnitKind,
    symbolPath: row.symbol_path,
    name: row.name,
    span: {
      startLine: row.start_line,
      endLine: row.end_line,
    },
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    docComment: row.doc_comment ?? undefined,
    discoveredAt: row.discovered_at,
    schemaVersion: row.schema_version as "code-unit-v0",
  };
}

/**
 * Insert a CodeUnit into the database (insert or update)
 */
export function insertCodeUnit(db: Database.Database, unit: CodeUnit): void {
  const startTime = Date.now();
  const row = codeUnitToRow(unit);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_units (
      id, repo_id, file_path, language, kind, symbol_path, name,
      start_line, end_line, tags, doc_comment, discovered_at, schema_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  stmt.run(
    row.id,
    row.repo_id,
    row.file_path,
    row.language,
    row.kind,
    row.symbol_path,
    row.name,
    row.start_line,
    row.end_line,
    row.tags,
    row.doc_comment,
    row.discovered_at,
    row.schema_version
  );

  const duration = Date.now() - startTime;
  logger.info("CodeUnit inserted", {
    operation: "insertCodeUnit",
    duration_ms: duration,
    metadata: { id: unit.id, repoId: unit.repoId, kind: unit.kind },
  });
}

/**
 * Get a CodeUnit by ID
 */
export function getCodeUnitById(db: Database.Database, id: string): CodeUnit | null {
  const startTime = Date.now();
  const stmt = db.prepare("SELECT * FROM code_units WHERE id = ?");
  const row = stmt.get(id) as CodeUnitRow | undefined;

  if (!row) {
    logger.debug("CodeUnit not found", {
      operation: "getCodeUnitById",
      duration_ms: Date.now() - startTime,
      metadata: { id },
    });
    return null;
  }

  logger.debug("CodeUnit retrieved", {
    operation: "getCodeUnitById",
    duration_ms: Date.now() - startTime,
    metadata: { id },
  });
  return rowToCodeUnit(row);
}

/**
 * Update a CodeUnit by ID
 *
 * Only updates specified fields. The `id` field cannot be updated.
 * Returns true if a row was updated, false if not found.
 */
export function updateCodeUnit(
  db: Database.Database,
  id: string,
  updates: Partial<Omit<CodeUnit, "id" | "schemaVersion">>
): boolean {
  const startTime = Date.now();

  // Build update clauses dynamically based on provided fields
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.repoId !== undefined) {
    setClauses.push("repo_id = ?");
    params.push(updates.repoId);
  }
  if (updates.filePath !== undefined) {
    setClauses.push("file_path = ?");
    params.push(updates.filePath);
  }
  if (updates.language !== undefined) {
    setClauses.push("language = ?");
    params.push(updates.language);
  }
  if (updates.kind !== undefined) {
    setClauses.push("kind = ?");
    params.push(updates.kind);
  }
  if (updates.symbolPath !== undefined) {
    setClauses.push("symbol_path = ?");
    params.push(updates.symbolPath);
  }
  if (updates.name !== undefined) {
    setClauses.push("name = ?");
    params.push(updates.name);
  }
  if (updates.span !== undefined) {
    setClauses.push("start_line = ?");
    params.push(updates.span.startLine);
    setClauses.push("end_line = ?");
    params.push(updates.span.endLine);
  }
  if (updates.tags !== undefined) {
    setClauses.push("tags = ?");
    params.push(updates.tags ? JSON.stringify(updates.tags) : null);
  }
  if (updates.docComment !== undefined) {
    setClauses.push("doc_comment = ?");
    params.push(updates.docComment ?? null);
  }
  if (updates.discoveredAt !== undefined) {
    setClauses.push("discovered_at = ?");
    params.push(updates.discoveredAt);
  }

  if (setClauses.length === 0) {
    logger.debug("No fields to update", {
      operation: "updateCodeUnit",
      duration_ms: Date.now() - startTime,
      metadata: { id },
    });
    return false;
  }

  // Always update updated_at
  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  const stmt = db.prepare(`UPDATE code_units SET ${setClauses.join(", ")} WHERE id = ?`);
  const result = stmt.run(...params);

  const duration = Date.now() - startTime;
  logger.info("CodeUnit updated", {
    operation: "updateCodeUnit",
    duration_ms: duration,
    metadata: { id, updated: result.changes > 0, fieldsUpdated: setClauses.length - 1 },
  });

  return result.changes > 0;
}

/**
 * Delete a CodeUnit by ID
 *
 * Returns true if a row was deleted, false if not found.
 */
export function deleteCodeUnit(db: Database.Database, id: string): boolean {
  const startTime = Date.now();
  const stmt = db.prepare("DELETE FROM code_units WHERE id = ?");
  const result = stmt.run(id);

  const duration = Date.now() - startTime;
  logger.info("CodeUnit deleted", {
    operation: "deleteCodeUnit",
    duration_ms: duration,
    metadata: { id, deleted: result.changes > 0 },
  });

  return result.changes > 0;
}

/**
 * Insert multiple CodeUnits in a single transaction
 *
 * Uses a transaction for atomicity - all inserts succeed or none do.
 */
export function insertCodeUnitBatch(db: Database.Database, units: CodeUnit[]): BatchInsertResult {
  const startTime = Date.now();

  if (units.length === 0) {
    return { inserted: 0 };
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_units (
      id, repo_id, file_path, language, kind, symbol_path, name,
      start_line, end_line, tags, doc_comment, discovered_at, schema_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const insertMany = db.transaction((items: CodeUnit[]) => {
    let inserted = 0;
    for (const unit of items) {
      const row = codeUnitToRow(unit);
      stmt.run(
        row.id,
        row.repo_id,
        row.file_path,
        row.language,
        row.kind,
        row.symbol_path,
        row.name,
        row.start_line,
        row.end_line,
        row.tags,
        row.doc_comment,
        row.discovered_at,
        row.schema_version
      );
      inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(units);
  const duration = Date.now() - startTime;

  logger.info("CodeUnit batch inserted", {
    operation: "insertCodeUnitBatch",
    duration_ms: duration,
    metadata: { count: inserted },
  });

  return { inserted };
}

/**
 * Delete all CodeUnits for a specific repository
 *
 * Returns the number of deleted rows.
 */
export function deleteCodeUnitsByRepo(db: Database.Database, repoId: string): BatchDeleteResult {
  const startTime = Date.now();
  const stmt = db.prepare("DELETE FROM code_units WHERE repo_id = ?");
  const result = stmt.run(repoId);

  const duration = Date.now() - startTime;
  logger.info("CodeUnits deleted by repo", {
    operation: "deleteCodeUnitsByRepo",
    duration_ms: duration,
    metadata: { repoId, deleted: result.changes },
  });

  return { deleted: result.changes };
}

/**
 * List all CodeUnits for a specific repository
 *
 * Supports pagination via limit and offset options.
 */
export function listCodeUnitsByRepo(
  db: Database.Database,
  repoId: string,
  opts?: ListOptions
): CodeUnit[] {
  const startTime = Date.now();
  const limit = opts?.limit;
  const offset = opts?.offset ?? 0;

  let query = "SELECT * FROM code_units WHERE repo_id = ? ORDER BY file_path, start_line";

  if (limit !== undefined) {
    query += " LIMIT ? OFFSET ?";
  }

  const stmt = db.prepare(query);
  const rows =
    limit !== undefined
      ? (stmt.all(repoId, limit, offset) as CodeUnitRow[])
      : (stmt.all(repoId) as CodeUnitRow[]);

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits listed by repo", {
    operation: "listCodeUnitsByRepo",
    duration_ms: duration,
    metadata: { repoId, count: rows.length, limit, offset },
  });

  return rows.map(rowToCodeUnit);
}

/**
 * List all CodeUnits for a specific file within a repository
 */
export function listCodeUnitsByFile(
  db: Database.Database,
  repoId: string,
  filePath: string
): CodeUnit[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_units
    WHERE repo_id = ? AND file_path = ?
    ORDER BY start_line
  `);

  const rows = stmt.all(repoId, filePath) as CodeUnitRow[];

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits listed by file", {
    operation: "listCodeUnitsByFile",
    duration_ms: duration,
    metadata: { repoId, filePath, count: rows.length },
  });

  return rows.map(rowToCodeUnit);
}

/**
 * List all CodeUnits of a specific kind within a repository
 *
 * Supports pagination via limit and offset options.
 */
export function listCodeUnitsByKind(
  db: Database.Database,
  repoId: string,
  kind: CodeUnitKind,
  opts?: ListOptions
): CodeUnit[] {
  const startTime = Date.now();
  const limit = opts?.limit;
  const offset = opts?.offset ?? 0;

  let query =
    "SELECT * FROM code_units WHERE repo_id = ? AND kind = ? ORDER BY file_path, start_line";

  if (limit !== undefined) {
    query += " LIMIT ? OFFSET ?";
  }

  const stmt = db.prepare(query);
  const rows =
    limit !== undefined
      ? (stmt.all(repoId, kind, limit, offset) as CodeUnitRow[])
      : (stmt.all(repoId, kind) as CodeUnitRow[]);

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits listed by kind", {
    operation: "listCodeUnitsByKind",
    duration_ms: duration,
    metadata: { repoId, kind, count: rows.length, limit, offset },
  });

  return rows.map(rowToCodeUnit);
}

/**
 * Search CodeUnits by symbol path pattern
 *
 * Uses LIKE pattern matching. The pattern can contain:
 * - % for any sequence of characters
 * - _ for any single character
 *
 * If no wildcards are provided, adds % to both ends for substring matching.
 */
export function searchCodeUnitsBySymbol(db: Database.Database, pattern: string): CodeUnit[] {
  const startTime = Date.now();

  // If no wildcards, make it a substring search
  const searchPattern =
    pattern.includes("%") || pattern.includes("_") ? pattern : `%${pattern}%`;

  const stmt = db.prepare(`
    SELECT * FROM code_units
    WHERE symbol_path LIKE ?
    ORDER BY symbol_path
  `);

  const rows = stmt.all(searchPattern) as CodeUnitRow[];

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits searched by symbol", {
    operation: "searchCodeUnitsBySymbol",
    duration_ms: duration,
    metadata: { pattern, searchPattern, count: rows.length },
  });

  return rows.map(rowToCodeUnit);
}

/**
 * Get count of all CodeUnits
 */
export function getCodeUnitCount(db: Database.Database): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM code_units");
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Get count of CodeUnits for a specific repository
 */
export function getCodeUnitCountByRepo(db: Database.Database, repoId: string): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM code_units WHERE repo_id = ?");
  const result = stmt.get(repoId) as { count: number };
  return result.count;
}
