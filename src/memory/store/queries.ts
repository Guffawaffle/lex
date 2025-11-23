/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */

import Database from "better-sqlite3";
import type { FrameRow } from "./db.js";
import type { Frame, FrameStatusSnapshot, FrameSpendMetadata } from "../frames/types.js";

/**
 * Convert Frame object to database row
 */
function frameToRow(frame: Frame): FrameRow {
  return {
    id: frame.id,
    timestamp: frame.timestamp,
    branch: frame.branch,
    jira: frame.jira || null,
    module_scope: JSON.stringify(frame.module_scope),
    summary_caption: frame.summary_caption,
    reference_point: frame.reference_point,
    status_snapshot: JSON.stringify(frame.status_snapshot),
    keywords: frame.keywords ? JSON.stringify(frame.keywords) : null,
    atlas_frame_id: frame.atlas_frame_id || null,
    feature_flags: frame.feature_flags ? JSON.stringify(frame.feature_flags) : null,
    permissions: frame.permissions ? JSON.stringify(frame.permissions) : null,
    // Merge-weave metadata (v2)
    run_id: frame.runId || null,
    plan_hash: frame.planHash || null,
    spend: frame.spend ? JSON.stringify(frame.spend) : null,
  };
}

/**
 * Convert database row to Frame object
 */
function rowToFrame(row: FrameRow): Frame {
  return {
    id: row.id,
    timestamp: row.timestamp,
    branch: row.branch,
    jira: row.jira || undefined,
    module_scope: JSON.parse(row.module_scope) as string[],
    summary_caption: row.summary_caption,
    reference_point: row.reference_point,
    status_snapshot: JSON.parse(row.status_snapshot) as FrameStatusSnapshot,
    keywords: row.keywords ? (JSON.parse(row.keywords) as string[]) : undefined,
    atlas_frame_id: row.atlas_frame_id || undefined,
    feature_flags: row.feature_flags ? (JSON.parse(row.feature_flags) as string[]) : undefined,
    permissions: row.permissions ? (JSON.parse(row.permissions) as string[]) : undefined,
    // Merge-weave metadata (v2) - backward compatible, defaults to undefined
    runId: row.run_id || undefined,
    planHash: row.plan_hash || undefined,
    spend: row.spend ? (JSON.parse(row.spend) as FrameSpendMetadata) : undefined,
  };
}

/**
 * Save a Frame to the database (insert or update)
 */
export function saveFrame(db: Database.Database, frame: Frame): void {
  const row = frameToRow(frame);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO frames (
      id, timestamp, branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id,
      feature_flags, permissions, run_id, plan_hash, spend
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    row.id,
    row.timestamp,
    row.branch,
    row.jira,
    row.module_scope,
    row.summary_caption,
    row.reference_point,
    row.status_snapshot,
    row.keywords,
    row.atlas_frame_id,
    row.feature_flags,
    row.permissions,
    row.run_id,
    row.plan_hash,
    row.spend
  );
}

/**
 * Get a Frame by ID
 */
export function getFrameById(db: Database.Database, id: string): Frame | null {
  const stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
  const row = stmt.get(id) as FrameRow | undefined;

  if (!row) return null;

  return rowToFrame(row);
}

export interface SearchResult {
  frames: Frame[];
  hint?: string;
}

/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 * @returns SearchResult with frames array and optional hint for FTS5 syntax errors
 */
export function searchFrames(db: Database.Database, query: string): SearchResult {
  try {
    const stmt = db.prepare(`
      SELECT f.*
      FROM frames f
      JOIN frames_fts fts ON f.rowid = fts.rowid
      WHERE frames_fts MATCH ?
      ORDER BY f.timestamp DESC
    `);

    const rows = stmt.all(query) as FrameRow[];
    return { frames: rows.map(rowToFrame) };
  } catch (error: unknown) {
    // Check if this is an FTS5-related error (caused by special characters)
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "SQLITE_ERROR" &&
      (err?.message?.includes("fts5: syntax error") ||
        err?.message?.includes("no such column") ||
        err?.message?.includes("unknown special query"))
    ) {
      // Extract a simpler search term by removing special characters
      const simplifiedQuery = query.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
      const hint = simplifiedQuery
        ? `Search contained special characters. Try simpler terms (e.g., '${simplifiedQuery}')`
        : "Search contained special characters. Try simpler terms";

      return {
        frames: [],
        hint,
      };
    }
    // Re-throw non-FTS5 errors
    throw error;
  }
}

/**
 * Get all Frames for a specific branch
 */
export function getFramesByBranch(db: Database.Database, branch: string): Frame[] {
  const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE branch = ?
    ORDER BY timestamp DESC
  `);

  const rows = stmt.all(branch) as FrameRow[];
  return rows.map(rowToFrame);
}

/**
 * Get all Frames for a specific Jira/ticket ID
 */
export function getFramesByJira(db: Database.Database, jiraId: string): Frame[] {
  const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE jira = ?
    ORDER BY timestamp DESC
  `);

  const rows = stmt.all(jiraId) as FrameRow[];
  return rows.map(rowToFrame);
}

/**
 * Get all Frames that touch a specific module
 * @param moduleId Module ID to search for in module_scope arrays
 */
export function getFramesByModuleScope(db: Database.Database, moduleId: string): Frame[] {
  // Get all frames and filter in JavaScript to avoid SQL injection
  // This is safe because module_scope is stored as JSON array
  const stmt = db.prepare(`
    SELECT * FROM frames
    ORDER BY timestamp DESC
  `);

  const rows = stmt.all() as FrameRow[];

  // Filter frames that contain the moduleId in their module_scope array
  return rows.map(rowToFrame).filter((frame) => frame.module_scope.includes(moduleId));
}

/**
 * Get all Frames (with optional limit)
 */
export function getAllFrames(db: Database.Database, limit?: number): Frame[] {
  const stmt = db.prepare(`
    SELECT * FROM frames
    ORDER BY timestamp DESC
    ${limit ? "LIMIT ?" : ""}
  `);

  const rows = limit ? (stmt.all(limit) as FrameRow[]) : (stmt.all() as FrameRow[]);
  return rows.map(rowToFrame);
}

/**
 * Query options for exporting frames
 */
export interface ExportFramesOptions {
  since?: string; // ISO 8601 timestamp
  jira?: string;
  branch?: string;
}

/**
 * Get frames iterator for export with optional filters
 * Uses iterator for memory-efficient streaming of large result sets
 */
export function getFramesForExport(
  db: Database.Database,
  options: ExportFramesOptions = {}
): IterableIterator<Frame> {
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (options.since) {
    whereClauses.push("timestamp >= ?");
    params.push(options.since);
  }

  if (options.jira) {
    whereClauses.push("jira = ?");
    params.push(options.jira);
  }

  if (options.branch) {
    whereClauses.push("branch = ?");
    params.push(options.branch);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT * FROM frames
    ${whereClause}
    ORDER BY timestamp ASC
  `);

  const rows = stmt.iterate(...params) as IterableIterator<FrameRow>;

  // Transform iterator to return Frame objects instead of FrameRow
  return {
    [Symbol.iterator](): IterableIterator<Frame> {
      return this;
    },
    next(): IteratorResult<Frame> {
      const result = rows.next();
      if (result.done) {
        return { done: true, value: undefined };
      }
      return { done: false, value: rowToFrame(result.value) };
    },
  };
}

/**
 * Delete a Frame by ID
 */
export function deleteFrame(db: Database.Database, id: string): boolean {
  const stmt = db.prepare("DELETE FROM frames WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get count of all Frames
 */
export function getFrameCount(db: Database.Database): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM frames");
  const result = stmt.get() as { count: number };
  return result.count;
}
