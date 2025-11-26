/**
 * Code Unit storage queries
 *
 * CRUD operations and search functions for CodeUnits.
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
 * List options for paginated queries
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
}

/**
 * Query options for filtering code units
 */
export interface CodeUnitQueryOptions extends ListOptions {
  repoId?: string;
  kind?: CodeUnitKind;
  filePath?: string;
  symbol?: string;
  tags?: string[];
}

/**
 * Paginated result with total count
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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
 * Save a CodeUnit to the database (insert or update)
 */
export function saveCodeUnit(db: Database.Database, unit: CodeUnit): void {
  const startTime = Date.now();
  const row = codeUnitToRow(unit);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_units (
      id, repo_id, file_path, language, kind, symbol_path, name,
      start_line, end_line, tags, doc_comment, discovered_at,
      schema_version, created_at, updated_at
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
  logger.debug("CodeUnit saved", {
    operation: "saveCodeUnit",
    duration_ms: duration,
    metadata: { id: unit.id, repoId: unit.repoId, kind: unit.kind },
  });
}

/**
 * Insert multiple CodeUnits in a batch (transactional)
 */
export function insertCodeUnitBatch(
  db: Database.Database,
  units: CodeUnit[]
): { inserted: number } {
  const startTime = Date.now();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_units (
      id, repo_id, file_path, language, kind, symbol_path, name,
      start_line, end_line, tags, doc_comment, discovered_at,
      schema_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const insertMany = db.transaction((items: CodeUnit[]) => {
    let count = 0;
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
      count++;
    }
    return count;
  });

  const inserted = insertMany(units);
  const duration = Date.now() - startTime;
  logger.info("CodeUnit batch inserted", {
    operation: "insertCodeUnitBatch",
    duration_ms: duration,
    metadata: { inserted, total: units.length },
  });

  return { inserted };
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
 * Query CodeUnits with filtering and pagination
 */
export function queryCodeUnits(
  db: Database.Database,
  options: CodeUnitQueryOptions = {}
): PaginatedResult<CodeUnit> {
  const startTime = Date.now();
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  // Build WHERE clauses based on options
  if (options.repoId) {
    whereClauses.push("repo_id = ?");
    params.push(options.repoId);
  }

  if (options.kind) {
    whereClauses.push("kind = ?");
    params.push(options.kind);
  }

  if (options.filePath) {
    // Use prefix match for file path
    whereClauses.push("file_path LIKE ?");
    params.push(`${options.filePath}%`);
  }

  if (options.symbol) {
    // Use pattern match for symbol search
    whereClauses.push("symbol_path LIKE ?");
    params.push(`%${options.symbol}%`);
  }

  if (options.tags && options.tags.length > 0) {
    // AND logic: all tags must be present
    for (const tag of options.tags) {
      whereClauses.push("tags LIKE ?");
      params.push(`%"${tag}"%`);
    }
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Get total count first
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM code_units ${whereClause}`);
  const countResult = countStmt.get(...params) as { count: number };
  const total = countResult.count;

  // Apply pagination
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const dataStmt = db.prepare(`
    SELECT * FROM code_units
    ${whereClause}
    ORDER BY discovered_at DESC, id ASC
    LIMIT ? OFFSET ?
  `);

  const rows = dataStmt.all(...params, limit, offset) as CodeUnitRow[];
  const items = rows.map(rowToCodeUnit);

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits queried", {
    operation: "queryCodeUnits",
    duration_ms: duration,
    metadata: { total, returned: items.length, limit, offset, options },
  });

  return { items, total, limit, offset };
}

/**
 * List CodeUnits by repository with pagination
 */
export function listCodeUnitsByRepo(
  db: Database.Database,
  repoId: string,
  options: ListOptions = {}
): PaginatedResult<CodeUnit> {
  return queryCodeUnits(db, { ...options, repoId });
}

/**
 * List CodeUnits by file path within a repository
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
    ORDER BY start_line ASC
  `);

  const rows = stmt.all(repoId, filePath) as CodeUnitRow[];
  const items = rows.map(rowToCodeUnit);

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits listed by file", {
    operation: "listCodeUnitsByFile",
    duration_ms: duration,
    metadata: { repoId, filePath, count: items.length },
  });

  return items;
}

/**
 * List CodeUnits by kind within a repository
 */
export function listCodeUnitsByKind(
  db: Database.Database,
  repoId: string,
  kind: CodeUnitKind
): CodeUnit[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_units
    WHERE repo_id = ? AND kind = ?
    ORDER BY file_path ASC, start_line ASC
  `);

  const rows = stmt.all(repoId, kind) as CodeUnitRow[];
  const items = rows.map(rowToCodeUnit);

  const duration = Date.now() - startTime;
  logger.debug("CodeUnits listed by kind", {
    operation: "listCodeUnitsByKind",
    duration_ms: duration,
    metadata: { repoId, kind, count: items.length },
  });

  return items;
}

/**
 * Search CodeUnits by symbol path pattern
 */
export function searchCodeUnitsBySymbol(
  db: Database.Database,
  pattern: string,
  options: ListOptions = {}
): PaginatedResult<CodeUnit> {
  return queryCodeUnits(db, { ...options, symbol: pattern });
}

/**
 * Delete a CodeUnit by ID
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
 * Delete all CodeUnits for a repository
 */
export function deleteCodeUnitsByRepo(db: Database.Database, repoId: string): { deleted: number } {
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
 * Get total count of CodeUnits
 */
export function getCodeUnitCount(db: Database.Database, repoId?: string): number {
  if (repoId) {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM code_units WHERE repo_id = ?");
    const result = stmt.get(repoId) as { count: number };
    return result.count;
  }

  const stmt = db.prepare("SELECT COUNT(*) as count FROM code_units");
  const result = stmt.get() as { count: number };
  return result.count;
}
