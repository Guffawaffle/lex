/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { FrameRow } from "./db.js";
import type { Frame, FrameStatusSnapshot, FrameSpendMetadata, TurnCost, CapabilityTier, TaskComplexity } from "../frames/types.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";
import { normalizeFTS5Query } from "./fts5-utils.js";

const logger = getNDJSONLogger("memory/store");

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
    // OAuth2/JWT user isolation (v3)
    user_id: frame.userId || null,
    // Turn Cost and Tier metadata (v4 - Wave 2)
    turn_cost: frame.turnCost ? JSON.stringify(frame.turnCost) : null,
    capability_tier: frame.capabilityTier || null,
    task_complexity: frame.taskComplexity ? JSON.stringify(frame.taskComplexity) : null,
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
    // OAuth2/JWT user isolation (v3) - backward compatible, defaults to undefined
    userId: row.user_id || undefined,
    // Turn Cost and Tier metadata (v4 - Wave 2) - backward compatible, defaults to undefined
    turnCost: row.turn_cost ? JSON.parse(row.turn_cost) : undefined,
    capabilityTier: (row.capability_tier as CapabilityTier) || undefined,
    taskComplexity: row.task_complexity ? JSON.parse(row.task_complexity) : undefined,
  };
}

/**
 * Save a Frame to the database (insert or update)
 */
export function saveFrame(db: Database.Database, frame: Frame): void {
  const startTime = Date.now();
  const row = frameToRow(frame);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO frames (
      id, timestamp, branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id,
      feature_flags, permissions, run_id, plan_hash, spend, user_id,
      turn_cost, capability_tier, task_complexity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    row.spend,
    row.user_id,
    row.turn_cost,
    row.capability_tier,
    row.task_complexity
  );

  const duration = Date.now() - startTime;
  logger.info("Frame saved", {
    operation: "saveFrame",
    duration_ms: duration,
    metadata: { frameId: frame.id, jira: frame.jira, branch: frame.branch },
  });
}

/**
 * Get a Frame by ID
 */
export function getFrameById(db: Database.Database, id: string): Frame | null {
  const startTime = Date.now();
  const stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
  const row = stmt.get(id) as FrameRow | undefined;

  if (!row) {
    logger.debug("Frame not found", {
      operation: "getFrameById",
      duration_ms: Date.now() - startTime,
      metadata: { frameId: id },
    });
    return null;
  }

  logger.debug("Frame retrieved", {
    operation: "getFrameById",
    duration_ms: Date.now() - startTime,
    metadata: { frameId: id },
  });
  return rowToFrame(row);
}

export interface SearchResult {
  frames: Frame[];
  hint?: string;
}

export interface SearchOptions {
  exact?: boolean; // If true, disable automatic prefix wildcards for exact matching
}

/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 * @param options Search options (exact: disable fuzzy matching)
 * @returns SearchResult with frames array and optional hint for FTS5 syntax errors
 */
export function searchFrames(
  db: Database.Database,
  query: string,
  options: SearchOptions = {}
): SearchResult {
  const startTime = Date.now();

  // Normalize query for FTS5 compatibility
  // By default, adds prefix wildcards for fuzzy matching unless exact=true
  const normalizedQuery = normalizeFTS5Query(query, options.exact);

  // If normalization resulted in empty query, return empty results
  if (!normalizedQuery) {
    logger.warn("Search query normalized to empty string", {
      operation: "searchFrames",
      metadata: { originalQuery: query },
    });
    return { frames: [], hint: "Search query contained only special characters" };
  }

  try {
    const stmt = db.prepare(`
      SELECT f.*
      FROM frames f
      JOIN frames_fts fts ON f.rowid = fts.rowid
      WHERE frames_fts MATCH ?
      ORDER BY f.timestamp DESC
    `);

    const rows = stmt.all(normalizedQuery) as FrameRow[];
    const duration = Date.now() - startTime;
    logger.info("Search completed", {
      operation: "searchFrames",
      duration_ms: duration,
      metadata: {
        query,
        normalizedQuery: normalizedQuery !== query ? normalizedQuery : undefined,
        resultCount: rows.length,
      },
    });
    return { frames: rows.map(rowToFrame) };
  } catch (error: unknown) {
    // Check if this is an FTS5-related error (unlikely after normalization, but kept for safety)
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "SQLITE_ERROR" &&
      (err?.message?.includes("fts5: syntax error") ||
        err?.message?.includes("no such column") ||
        err?.message?.includes("unknown special query"))
    ) {
      logger.warn("FTS5 search error after normalization", {
        operation: "searchFrames",
        duration_ms: Date.now() - startTime,
        metadata: { query, normalizedQuery, error: err.message },
      });

      return {
        frames: [],
        hint: `Search failed. Try simpler terms.`,
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
  const params: (string | number)[] = [];

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

/**
 * Query interface for tier-based Frame searches (Wave 2)
 */
export interface TierFrameQuery {
  tier?: CapabilityTier;
  minTurnCost?: number;
  maxTurnCost?: number;
  escalated?: boolean;
  limit?: number;
}

/**
 * Get Frames by capability tier
 * 
 * Wave 2 integration: enables queries like "Show all senior-tier frames with high Turn Cost"
 * 
 * @param db - Database connection
 * @param query - Tier query parameters
 * @returns Array of matching frames
 * 
 * @example
 * ```typescript
 * // Get all senior-tier frames with high Turn Cost
 * const frames = getFramesByTier(db, {
 *   tier: 'senior',
 *   minTurnCost: 1000
 * });
 * 
 * // Get escalated frames
 * const escalated = getFramesByTier(db, {
 *   escalated: true
 * });
 * ```
 */
export function getFramesByTier(db: Database.Database, query: TierFrameQuery): Frame[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.tier) {
    conditions.push("capability_tier = ?");
    params.push(query.tier);
  }

  if (query.escalated !== undefined) {
    conditions.push("json_extract(task_complexity, '$.escalated') = ?");
    params.push(query.escalated ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = query.limit ? `LIMIT ${query.limit}` : "";

  const stmt = db.prepare(`
    SELECT * FROM frames
    ${whereClause}
    ORDER BY timestamp DESC
    ${limitClause}
  `);

  const rows = stmt.all(...params) as FrameRow[];
  let frames = rows.map(rowToFrame);

  // Apply Turn Cost filters in JavaScript (since it's stored as JSON)
  if (query.minTurnCost !== undefined) {
    frames = frames.filter(
      (f) => f.turnCost && (f.turnCost.weightedScore ?? 0) >= query.minTurnCost!
    );
  }

  if (query.maxTurnCost !== undefined) {
    frames = frames.filter(
      (f) => f.turnCost && (f.turnCost.weightedScore ?? 0) <= query.maxTurnCost!
    );
  }

  return frames;
}

/**
 * Get tier escalation patterns
 * 
 * Returns frames where actual tier differed from assigned tier (tier mismatch)
 * 
 * @param db - Database connection
 * @param limit - Maximum results to return
 * @returns Array of frames with tier mismatches
 */
export function getTierEscalationPatterns(db: Database.Database, limit: number = 100): Frame[] {
  const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE json_extract(task_complexity, '$.tierMismatch') = 1
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as FrameRow[];
  return rows.map(rowToFrame);
}

/**
 * Get Turn Cost statistics by tier
 * 
 * @param db - Database connection
 * @returns Statistics showing average Turn Cost per tier
 */
export function getTurnCostStatsByTier(db: Database.Database): {
  tier: CapabilityTier;
  count: number;
  avgTurnCost: number | null;
}[] {
  const tiers: CapabilityTier[] = ["senior", "mid", "junior"];
  const results: { tier: CapabilityTier; count: number; avgTurnCost: number | null }[] = [];

  for (const tier of tiers) {
    const frames = getFramesByTier(db, { tier });
    const framesWithTurnCost = frames.filter((f) => f.turnCost?.weightedScore !== undefined);

    const avgTurnCost =
      framesWithTurnCost.length > 0
        ? framesWithTurnCost.reduce((sum, f) => sum + (f.turnCost!.weightedScore ?? 0), 0) /
          framesWithTurnCost.length
        : null;

    results.push({
      tier,
      count: frames.length,
      avgTurnCost,
    });
  }

  return results;
}
