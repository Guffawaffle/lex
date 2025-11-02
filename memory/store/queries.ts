/**
 * Frame storage queries
 * 
 * CRUD operations and search functions for Frames.
 */

import Database from "better-sqlite3";
import type { FrameRow } from "./db.js";
import type { Frame, FrameStatusSnapshot } from "../frames/types.js";

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
    module_scope: JSON.parse(row.module_scope),
    summary_caption: row.summary_caption,
    reference_point: row.reference_point,
    status_snapshot: JSON.parse(row.status_snapshot) as FrameStatusSnapshot,
    keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
    atlas_frame_id: row.atlas_frame_id || undefined,
    feature_flags: row.feature_flags ? JSON.parse(row.feature_flags) : undefined,
    permissions: row.permissions ? JSON.parse(row.permissions) : undefined,
  };
}

/**
 * Save a Frame to the database (insert or update)
 */
export async function saveFrame(db: Database.Database, frame: Frame): Promise<void> {
  const row = frameToRow(frame);
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO frames (
      id, timestamp, branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id,
      feature_flags, permissions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    row.permissions
  );
}

/**
 * Get a Frame by ID
 */
export async function getFrameById(db: Database.Database, id: string): Promise<Frame | null> {
  const stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
  const row = stmt.get(id) as FrameRow | undefined;

  if (!row) return null;

  return rowToFrame(row);
}

/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 */
export async function searchFrames(db: Database.Database, query: string): Promise<Frame[]> {
  const stmt = db.prepare(`
    SELECT f.*
    FROM frames f
    JOIN frames_fts fts ON f.rowid = fts.rowid
    WHERE frames_fts MATCH ?
    ORDER BY f.timestamp DESC
  `);

  const rows = stmt.all(query) as FrameRow[];
  return rows.map(rowToFrame);
}

/**
 * Get all Frames for a specific branch
 */
export async function getFramesByBranch(db: Database.Database, branch: string): Promise<Frame[]> {
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
export async function getFramesByJira(db: Database.Database, jiraId: string): Promise<Frame[]> {
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
export async function getFramesByModuleScope(db: Database.Database, moduleId: string): Promise<Frame[]> {
  // SQLite doesn't have native JSON array contains, so we use LIKE with JSON array format
  // This searches for the module ID within the JSON array string
  const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE module_scope LIKE ?
    ORDER BY timestamp DESC
  `);

  // Search pattern: the module ID should appear as a quoted string in the JSON array
  const searchPattern = `%"${moduleId}"%`;
  const rows = stmt.all(searchPattern) as FrameRow[];
  
  // Filter to ensure exact match (LIKE might have false positives)
  return rows
    .map(rowToFrame)
    .filter(frame => frame.module_scope.includes(moduleId));
}

/**
 * Get all Frames (with optional limit)
 */
export async function getAllFrames(db: Database.Database, limit?: number): Promise<Frame[]> {
  const stmt = db.prepare(`
    SELECT * FROM frames
    ORDER BY timestamp DESC
    ${limit ? 'LIMIT ?' : ''}
  `);

  const rows = limit ? stmt.all(limit) as FrameRow[] : stmt.all() as FrameRow[];
  return rows.map(rowToFrame);
}

/**
 * Delete a Frame by ID
 */
export async function deleteFrame(db: Database.Database, id: string): Promise<boolean> {
  const stmt = db.prepare("DELETE FROM frames WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get count of all Frames
 */
export async function getFrameCount(db: Database.Database): Promise<number> {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM frames");
  const result = stmt.get() as { count: number };
  return result.count;
}
