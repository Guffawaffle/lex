/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { FrameRow } from "./db.js";
import type { Frame } from "../../shared/types/frame-schema.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";
import { normalizeFTS5Query } from "./fts5-utils.js";
import { frameToRow, rowToFrame } from "./frame-row-codec.js";

const logger = getNDJSONLogger("memory/store");

const FRAME_UPSERT_SQL = `
  INSERT INTO frames (
    id, timestamp, branch, jira, module_scope, summary_caption,
    reference_point, status_snapshot, keywords, atlas_frame_id,
    feature_flags, permissions, image_ids, run_id, plan_hash, spend,
    user_id, executor_role, tool_calls, guardrail_profile, turn_cost,
    capability_tier, task_complexity, superseded_by, merged_from,
    contradiction_resolution, lmv
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    timestamp = excluded.timestamp,
    branch = excluded.branch,
    jira = excluded.jira,
    module_scope = excluded.module_scope,
    summary_caption = excluded.summary_caption,
    reference_point = excluded.reference_point,
    status_snapshot = excluded.status_snapshot,
    keywords = excluded.keywords,
    atlas_frame_id = excluded.atlas_frame_id,
    feature_flags = excluded.feature_flags,
    permissions = excluded.permissions,
    image_ids = excluded.image_ids,
    run_id = excluded.run_id,
    plan_hash = excluded.plan_hash,
    spend = excluded.spend,
    user_id = excluded.user_id,
    executor_role = excluded.executor_role,
    tool_calls = excluded.tool_calls,
    guardrail_profile = excluded.guardrail_profile,
    turn_cost = excluded.turn_cost,
    capability_tier = excluded.capability_tier,
    task_complexity = excluded.task_complexity,
    superseded_by = excluded.superseded_by,
    merged_from = excluded.merged_from,
    contradiction_resolution = excluded.contradiction_resolution,
    lmv = excluded.lmv
`;

/**
 * Save a Frame to the database (insert or update)
 */
export function saveFrame(db: Database.Database, frame: Frame): void {
  const startTime = Date.now();
  const row = frameToRow(frame);
  const stmt = db.prepare(FRAME_UPSERT_SQL);

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
    row.image_ids,
    row.run_id,
    row.plan_hash,
    row.spend,
    row.user_id,
    row.executor_role,
    row.tool_calls,
    row.guardrail_profile,
    row.turn_cost,
    row.capability_tier,
    row.task_complexity,
    row.superseded_by,
    row.merged_from,
    row.contradiction_resolution,
    row.lmv
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
  mode?: "all" | "any"; // Search mode: 'all' (AND, default) or 'any' (OR)
}

/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 * @param options Search options (exact: disable fuzzy matching, mode: 'all' for AND / 'any' for OR)
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
  // Use mode='any' for OR logic, mode='all' (default) for AND logic
  const normalizedQuery = normalizeFTS5Query(query, options.exact, options.mode);

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
 * Get Turn Cost metrics for a time period
 * Returns frame count and aggregated spend metrics
 */
export function getTurnCostMetrics(
  db: Database.Database,
  since?: string
): {
  frameCount: number;
  estimatedTokens: number;
  prompts: number;
} {
  const whereClauses: string[] = [];
  const params: string[] = [];

  if (since) {
    whereClauses.push("timestamp >= ?");
    params.push(since);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as frameCount,
      SUM(CASE WHEN spend IS NOT NULL THEN json_extract(spend, '$.tokens_estimated') ELSE 0 END) as estimatedTokens,
      SUM(CASE WHEN spend IS NOT NULL THEN json_extract(spend, '$.prompts') ELSE 0 END) as prompts
    FROM frames
    ${whereClause}
  `);

  const result = stmt.get(...params) as {
    frameCount: number;
    estimatedTokens: number | null;
    prompts: number | null;
  };

  return {
    frameCount: result.frameCount || 0,
    estimatedTokens: result.estimatedTokens || 0,
    prompts: result.prompts || 0,
  };
}

/**
 * Database statistics for MCP db_stats tool
 */
export interface DbStatsResult {
  totalFrames: number;
  thisWeek: number;
  thisMonth: number;
  oldestDate: string | null;
  newestDate: string | null;
  moduleDistribution?: Record<string, number>;
}

/**
 * Get database statistics for frame counts and date ranges
 * Used by MCP db_stats tool
 */
export function getDbStats(db: Database.Database, detailed: boolean = false): DbStatsResult {
  // Get total frame count
  const totalCountResult = db.prepare("SELECT COUNT(*) as count FROM frames").get() as {
    count: number;
  };
  const totalFrames = totalCountResult.count;

  // Calculate date for one week ago
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneWeekAgoISO = oneWeekAgo.toISOString();

  // Get frames from this week
  const weekCountResult = db
    .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
    .get(oneWeekAgoISO) as { count: number };
  const thisWeek = weekCountResult.count;

  // Calculate date for one month ago
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoISO = oneMonthAgo.toISOString();

  // Get frames from this month
  const monthCountResult = db
    .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
    .get(oneMonthAgoISO) as { count: number };
  const thisMonth = monthCountResult.count;

  // Get date range (oldest and newest)
  let oldestDate: string | null = null;
  let newestDate: string | null = null;

  if (totalFrames > 0) {
    const oldestResult = db.prepare("SELECT MIN(timestamp) as oldest FROM frames").get() as {
      oldest: string | null;
    };
    oldestDate = oldestResult.oldest;

    const newestResult = db.prepare("SELECT MAX(timestamp) as newest FROM frames").get() as {
      newest: string | null;
    };
    newestDate = newestResult.newest;
  }

  const result: DbStatsResult = {
    totalFrames,
    thisWeek,
    thisMonth,
    oldestDate,
    newestDate,
  };

  // Get module distribution if detailed
  if (detailed && totalFrames > 0) {
    const moduleDistribution: Record<string, number> = {};
    const frameIterator = db
      .prepare("SELECT module_scope FROM frames")
      .iterate() as IterableIterator<{ module_scope: string }>;

    for (const frame of frameIterator) {
      try {
        const modules = JSON.parse(frame.module_scope) as string[];
        for (const module of modules) {
          moduleDistribution[module] = (moduleDistribution[module] || 0) + 1;
        }
      } catch {
        // Skip frames with invalid JSON
      }
    }

    // Sort by count descending and take top 20
    const sortedModules = Object.entries(moduleDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    result.moduleDistribution = Object.fromEntries(sortedModules);
  }

  return result;
}
