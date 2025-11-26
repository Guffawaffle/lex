/**
 * Code Units storage queries
 *
 * CRUD operations for CodeUnit records in the Code Atlas.
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { CodeUnit } from "../../atlas/schemas/code-unit.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";

const logger = getNDJSONLogger("memory/store/code-units");

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
  tags: string | null;
  doc_comment: string | null;
  discovered_at: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
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
    kind: row.kind as CodeUnit["kind"],
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
      start_line, end_line, tags, doc_comment, discovered_at, schema_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE((SELECT created_at FROM code_units WHERE id = ?), datetime('now')),
      datetime('now')
    )
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
    row.schema_version,
    row.id // for the COALESCE subquery
  );

  const duration = Date.now() - startTime;
  logger.debug("CodeUnit saved", {
    operation: "saveCodeUnit",
    duration_ms: duration,
    metadata: { unitId: unit.id, repoId: unit.repoId },
  });
}

/**
 * Save multiple CodeUnits in a transaction
 * @returns number of units successfully saved
 */
export function saveCodeUnitsBatch(db: Database.Database, units: CodeUnit[]): number {
  const startTime = Date.now();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_units (
      id, repo_id, file_path, language, kind, symbol_path, name,
      start_line, end_line, tags, doc_comment, discovered_at, schema_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE((SELECT created_at FROM code_units WHERE id = ?), datetime('now')),
      datetime('now')
    )
  `);

  let savedCount = 0;

  const insertMany = db.transaction((unitsToInsert: CodeUnit[]) => {
    for (const unit of unitsToInsert) {
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
        row.schema_version,
        row.id // for the COALESCE subquery
      );
      savedCount++;
    }
  });

  insertMany(units);

  const duration = Date.now() - startTime;
  logger.info("CodeUnits batch saved", {
    operation: "saveCodeUnitsBatch",
    duration_ms: duration,
    metadata: { count: savedCount },
  });

  return savedCount;
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
      metadata: { unitId: id },
    });
    return null;
  }

  logger.debug("CodeUnit retrieved", {
    operation: "getCodeUnitById",
    duration_ms: Date.now() - startTime,
    metadata: { unitId: id },
  });
  return rowToCodeUnit(row);
}

/**
 * Get all CodeUnits for a specific repository
 */
export function getCodeUnitsByRepo(db: Database.Database, repoId: string): CodeUnit[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_units
    WHERE repo_id = ?
    ORDER BY file_path, start_line
  `);

  const rows = stmt.all(repoId) as CodeUnitRow[];
  const duration = Date.now() - startTime;
  logger.debug("CodeUnits retrieved by repo", {
    operation: "getCodeUnitsByRepo",
    duration_ms: duration,
    metadata: { repoId, count: rows.length },
  });
  return rows.map(rowToCodeUnit);
}

/**
 * Get CodeUnits by file path within a repository
 */
export function getCodeUnitsByFile(
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
  logger.debug("CodeUnits retrieved by file", {
    operation: "getCodeUnitsByFile",
    duration_ms: duration,
    metadata: { repoId, filePath, count: rows.length },
  });
  return rows.map(rowToCodeUnit);
}

/**
 * Get CodeUnits by kind within a repository
 */
export function getCodeUnitsByKind(
  db: Database.Database,
  repoId: string,
  kind: CodeUnit["kind"]
): CodeUnit[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_units
    WHERE repo_id = ? AND kind = ?
    ORDER BY file_path, start_line
  `);

  const rows = stmt.all(repoId, kind) as CodeUnitRow[];
  const duration = Date.now() - startTime;
  logger.debug("CodeUnits retrieved by kind", {
    operation: "getCodeUnitsByKind",
    duration_ms: duration,
    metadata: { repoId, kind, count: rows.length },
  });
  return rows.map(rowToCodeUnit);
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
    metadata: { unitId: id, deleted: result.changes > 0 },
  });
  return result.changes > 0;
}

/**
 * Delete all CodeUnits for a repository
 */
export function deleteCodeUnitsByRepo(db: Database.Database, repoId: string): number {
  const startTime = Date.now();
  const stmt = db.prepare("DELETE FROM code_units WHERE repo_id = ?");
  const result = stmt.run(repoId);

  const duration = Date.now() - startTime;
  logger.info("CodeUnits deleted by repo", {
    operation: "deleteCodeUnitsByRepo",
    duration_ms: duration,
    metadata: { repoId, deletedCount: result.changes },
  });
  return result.changes;
}

/**
 * Get count of CodeUnits in the database
 */
export function getCodeUnitCount(db: Database.Database, repoId?: string): number {
  const stmt = repoId
    ? db.prepare("SELECT COUNT(*) as count FROM code_units WHERE repo_id = ?")
    : db.prepare("SELECT COUNT(*) as count FROM code_units");

  const result = repoId
    ? (stmt.get(repoId) as { count: number })
    : (stmt.get() as { count: number });

  return result.count;
}
