/**
 * Code Atlas Runs storage queries
 *
 * CRUD operations for CodeAtlasRun provenance records.
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { CodeAtlasRunRow } from "./db.js";
import type { CodeAtlasRun } from "../../atlas/schemas/code-atlas-run.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";

const logger = getNDJSONLogger("memory/store/code-atlas-runs");

/**
 * Convert CodeAtlasRun object to database row
 */
function codeAtlasRunToRow(run: CodeAtlasRun): CodeAtlasRunRow {
  return {
    run_id: run.runId,
    repo_id: run.repoId,
    files_requested: JSON.stringify(run.filesRequested),
    files_scanned: JSON.stringify(run.filesScanned),
    units_emitted: run.unitsEmitted,
    max_files: run.limits.maxFiles ?? null,
    max_bytes: run.limits.maxBytes ?? null,
    truncated: run.truncated ? 1 : 0,
    strategy: run.strategy ?? null,
    created_at: run.createdAt,
    schema_version: run.schemaVersion,
  };
}

/**
 * Convert database row to CodeAtlasRun object
 */
function rowToCodeAtlasRun(row: CodeAtlasRunRow): CodeAtlasRun {
  return {
    runId: row.run_id,
    repoId: row.repo_id,
    filesRequested: JSON.parse(row.files_requested) as string[],
    filesScanned: JSON.parse(row.files_scanned) as string[],
    unitsEmitted: row.units_emitted,
    limits: {
      ...(row.max_files !== null && { maxFiles: row.max_files }),
      ...(row.max_bytes !== null && { maxBytes: row.max_bytes }),
    },
    truncated: row.truncated === 1,
    ...(row.strategy !== null && {
      strategy: row.strategy as "static" | "llm-assisted" | "mixed",
    }),
    createdAt: row.created_at,
    schemaVersion: row.schema_version as "code-atlas-run-v0",
  };
}

/**
 * Save a CodeAtlasRun to the database (insert or update)
 */
export function saveCodeAtlasRun(db: Database.Database, run: CodeAtlasRun): void {
  const startTime = Date.now();
  const row = codeAtlasRunToRow(run);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO code_atlas_runs (
      run_id, repo_id, files_requested, files_scanned, units_emitted,
      max_files, max_bytes, truncated, strategy, created_at, schema_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    row.run_id,
    row.repo_id,
    row.files_requested,
    row.files_scanned,
    row.units_emitted,
    row.max_files,
    row.max_bytes,
    row.truncated,
    row.strategy,
    row.created_at,
    row.schema_version
  );

  const duration = Date.now() - startTime;
  logger.info("CodeAtlasRun saved", {
    operation: "saveCodeAtlasRun",
    duration_ms: duration,
    metadata: { runId: run.runId, repoId: run.repoId },
  });
}

/**
 * Get a CodeAtlasRun by ID
 */
export function getCodeAtlasRunById(db: Database.Database, runId: string): CodeAtlasRun | null {
  const startTime = Date.now();
  const stmt = db.prepare("SELECT * FROM code_atlas_runs WHERE run_id = ?");
  const row = stmt.get(runId) as CodeAtlasRunRow | undefined;

  if (!row) {
    logger.debug("CodeAtlasRun not found", {
      operation: "getCodeAtlasRunById",
      duration_ms: Date.now() - startTime,
      metadata: { runId },
    });
    return null;
  }

  logger.debug("CodeAtlasRun retrieved", {
    operation: "getCodeAtlasRunById",
    duration_ms: Date.now() - startTime,
    metadata: { runId },
  });
  return rowToCodeAtlasRun(row);
}

/**
 * Get all CodeAtlasRuns for a specific repository
 */
export function getCodeAtlasRunsByRepo(db: Database.Database, repoId: string): CodeAtlasRun[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_atlas_runs
    WHERE repo_id = ?
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(repoId) as CodeAtlasRunRow[];
  const duration = Date.now() - startTime;
  logger.debug("CodeAtlasRuns retrieved by repo", {
    operation: "getCodeAtlasRunsByRepo",
    duration_ms: duration,
    metadata: { repoId, count: rows.length },
  });
  return rows.map(rowToCodeAtlasRun);
}

/**
 * Get all CodeAtlasRuns (with optional limit)
 */
export function getAllCodeAtlasRuns(db: Database.Database, limit?: number): CodeAtlasRun[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM code_atlas_runs
    ORDER BY created_at DESC
    ${limit ? "LIMIT ?" : ""}
  `);

  const rows = limit
    ? (stmt.all(limit) as CodeAtlasRunRow[])
    : (stmt.all() as CodeAtlasRunRow[]);

  const duration = Date.now() - startTime;
  logger.debug("All CodeAtlasRuns retrieved", {
    operation: "getAllCodeAtlasRuns",
    duration_ms: duration,
    metadata: { count: rows.length, limit },
  });
  return rows.map(rowToCodeAtlasRun);
}

/**
 * Delete a CodeAtlasRun by ID
 */
export function deleteCodeAtlasRun(db: Database.Database, runId: string): boolean {
  const startTime = Date.now();
  const stmt = db.prepare("DELETE FROM code_atlas_runs WHERE run_id = ?");
  const result = stmt.run(runId);

  const duration = Date.now() - startTime;
  logger.info("CodeAtlasRun deleted", {
    operation: "deleteCodeAtlasRun",
    duration_ms: duration,
    metadata: { runId, deleted: result.changes > 0 },
  });
  return result.changes > 0;
}

/**
 * Get count of all CodeAtlasRuns
 */
export function getCodeAtlasRunCount(db: Database.Database): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM code_atlas_runs");
  const result = stmt.get() as { count: number };
  return result.count;
}
