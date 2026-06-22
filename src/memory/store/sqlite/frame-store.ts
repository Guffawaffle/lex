/**
 * SqliteFrameStore — SQLite implementation of FrameStore interface.
 *
 * Production-ready implementation that uses SQLite as the backing store.
 * Supports FTS5 for full-text search and proper connection management.
 */

import type Database from "better-sqlite3-multiple-ciphers";
import type {
  FrameStore,
  FrameSearchCriteria,
  FrameListOptions,
  FrameListResult,
  SaveResult,
  StoreStats,
  TurnCostMetrics,
} from "../frame-store.js";
import type { Frame } from "../../../shared/types/frame-schema.js";
import type { FrameRow } from "../db.js";
import { parseFrame, safeParseFrame } from "../../../shared/types/frame-schema.js";
import { createDatabase } from "../db.js";
import { normalizeFTS5Query } from "../fts5-utils.js";
import { frameToRow, rowToFrame } from "../frame-row-codec.js";

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
 * Cursor for stable pagination.
 * Encodes the last seen (timestamp, frame_id) tuple.
 */
interface PaginationCursor {
  timestamp: string;
  frame_id: string;
}

/**
 * Encode a pagination cursor to an opaque base64 string.
 */
function encodeCursor(timestamp: string, frameId: string): string {
  const cursor: PaginationCursor = { timestamp, frame_id: frameId };
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

/**
 * Decode a pagination cursor from a base64 string.
 * Returns null if the cursor is invalid.
 */
function decodeCursor(cursor: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as PaginationCursor;
    if (typeof parsed.timestamp === "string" && typeof parsed.frame_id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * SqliteFrameStore — SQLite-backed implementation of FrameStore.
 *
 * Provides Frame persistence using SQLite with FTS5 for full-text search.
 * Handles connection lifecycle management with proper cleanup.
 */
export class SqliteFrameStore implements FrameStore {
  private _db: Database.Database;
  private ownsConnection: boolean;
  private isClosed: boolean = false;

  /**
   * Access the underlying database connection.
   * Useful for operations not covered by the FrameStore interface (e.g., ImageManager).
   *
   * @throws Error if the store has been closed.
   */
  get db(): Database.Database {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }
    return this._db;
  }

  /**
   * Create a new SqliteFrameStore.
   *
   * @param dbOrPath - Either an existing Database connection or a path to create/open a database.
   *                   If a path is provided (or undefined for default), the store owns the connection
   *                   and will close it on close(). If a Database is provided, the caller is
   *                   responsible for closing it.
   */
  constructor(dbOrPath?: Database.Database | string) {
    if (typeof dbOrPath === "string" || dbOrPath === undefined) {
      // Create a new database connection (we own it)
      this._db = createDatabase(dbOrPath);
      this.ownsConnection = true;
    } else {
      // Use existing connection (caller owns it)
      this._db = dbOrPath;
      this.ownsConnection = false;
    }
  }

  /**
   * Persist a Frame to storage.
   * Uses SQLite UPSERT semantics while preserving dependent rows.
   */
  async saveFrame(frame: Frame): Promise<void> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const row = frameToRow(frame);
    const stmt = this._db.prepare(FRAME_UPSERT_SQL);

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
  }

  /**
   * Persist multiple Frames to storage with transactional semantics.
   * All-or-nothing: if any validation fails, no Frames are saved.
   * Uses a prepared statement within a transaction for optimal performance.
   */
  async saveFrames(frames: Frame[]): Promise<SaveResult[]> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    // Validate all frames first (all-or-nothing on validation failure)
    const results: SaveResult[] = [];
    const parsedFrames: Frame[] = [];
    for (const frame of frames) {
      const parseResult = safeParseFrame(frame);
      if (!parseResult.success) {
        // Validation failed - return error results for all frames
        return frames.map((f, i) => ({
          id: f.id ?? `frame-${i}`,
          success: false,
          error:
            f === frame
              ? `Validation failed: ${parseResult.error.message}`
              : "Transaction aborted due to validation failure in another frame",
        }));
      }
      parsedFrames.push(parseResult.data);
    }

    // All validations passed - insert within a transaction
    const stmt = this._db.prepare(FRAME_UPSERT_SQL);

    const insertAll = this._db.transaction((framesToInsert: Frame[]) => {
      for (const frame of framesToInsert) {
        const row = frameToRow(frame);
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
      }
    });

    try {
      insertAll(parsedFrames);
      // All frames inserted successfully
      for (const frame of parsedFrames) {
        results.push({ id: frame.id, success: true });
      }
    } catch (error) {
      // Transaction failed - return error results for all frames
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return frames.map((f) => ({
        id: f.id,
        success: false,
        error: `Transaction failed: ${errorMessage}`,
      }));
    }

    return results;
  }

  /**
   * Retrieve a Frame by its unique identifier.
   */
  async getFrameById(id: string): Promise<Frame | null> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("SELECT * FROM frames WHERE id = ?");
    const row = stmt.get(id) as FrameRow | undefined;

    if (!row) {
      return null;
    }

    return rowToFrame(row);
  }

  /**
   * Search for Frames matching the given criteria.
   *
   * Uses FTS5 for text search when query is provided.
   * Supports filtering by moduleScope, since, and until dates.
   * Fuzzy matching is enabled by default (can be disabled with exact=true).
   */
  async searchFrames(criteria: FrameSearchCriteria): Promise<Frame[]> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    // Build the query dynamically based on criteria
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];
    let usesFTS = false;
    let baseQuery = "SELECT f.* FROM frames f";

    // Handle FTS5 query - normalize for compatibility with hyphenated terms
    // By default, adds prefix wildcards for fuzzy matching unless exact=true
    // Use mode='any' for OR logic, mode='all' (default) for AND logic
    if (criteria.query) {
      const normalizedQuery = normalizeFTS5Query(criteria.query, criteria.exact, criteria.mode);
      if (normalizedQuery) {
        try {
          baseQuery = `
            SELECT f.*
            FROM frames f
            JOIN frames_fts fts ON f.rowid = fts.rowid
            WHERE frames_fts MATCH ?
          `;
          params.push(normalizedQuery);
          usesFTS = true;
        } catch {
          // FTS5 syntax error, return empty results
          return [];
        }
      }
    }

    // Handle time range filters
    if (criteria.since) {
      whereClauses.push("f.timestamp >= ?");
      params.push(criteria.since.toISOString());
    }

    if (criteria.until) {
      whereClauses.push("f.timestamp <= ?");
      params.push(criteria.until.toISOString());
    }

    // Handle userId filter
    if (criteria.userId) {
      whereClauses.push("f.user_id = ?");
      params.push(criteria.userId);
    }

    // Build final query
    let query = baseQuery;
    if (whereClauses.length > 0) {
      query += usesFTS ? " AND " : " WHERE ";
      query += whereClauses.join(" AND ");
    }
    query += " ORDER BY f.timestamp DESC";

    if (criteria.limit !== undefined) {
      query += " LIMIT ?";
      params.push(criteria.limit);
    }

    try {
      const stmt = this._db.prepare(query);
      let rows = stmt.all(...params) as FrameRow[];

      // Handle moduleScope filter in JavaScript (module_scope is JSON array)
      if (criteria.moduleScope && criteria.moduleScope.length > 0) {
        rows = rows.filter((row) => {
          const moduleScope = JSON.parse(row.module_scope) as string[];
          return criteria.moduleScope!.some((m) => moduleScope.includes(m));
        });
      }

      return rows.map(rowToFrame);
    } catch (error: unknown) {
      // Check if this is an FTS5-related error (caused by special characters)
      const err = error as { code?: string; message?: string };
      if (
        err?.code === "SQLITE_ERROR" &&
        (err?.message?.includes("fts5: syntax error") ||
          err?.message?.includes("no such column") ||
          err?.message?.includes("unknown special query"))
      ) {
        // Return empty results for FTS5 syntax errors
        return [];
      }
      // Re-throw non-FTS5 errors
      throw error;
    }
  }

  /**
   * List Frames with optional pagination.
   *
   * Supports both cursor-based and offset-based pagination for backward compatibility.
   * Cursor-based pagination provides stable ordering by (timestamp DESC, id DESC).
   * When a cursor is provided, it takes precedence over offset.
   *
   * @param options - Pagination options (limit, cursor, or offset).
   * @returns FrameListResult with frames and pagination metadata.
   */
  async listFrames(options?: FrameListOptions): Promise<FrameListResult> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const limit = options?.limit ?? 10;
    const params: (string | number)[] = [];

    // Build query with stable ordering: timestamp DESC, id DESC
    let query = "SELECT * FROM frames";
    const whereClauses: string[] = [];

    // Handle cursor-based pagination (takes precedence over offset)
    if (options?.cursor) {
      const cursorData = decodeCursor(options.cursor);
      if (cursorData) {
        // Use row value comparison for stable pagination
        // (timestamp, id) < (cursor.timestamp, cursor.frame_id)
        whereClauses.push("(timestamp, id) < (?, ?)");
        params.push(cursorData.timestamp, cursorData.frame_id);
      }
      // If cursor is invalid, treat as if no cursor was provided
    }

    // Handle userId filter
    if (options?.userId) {
      whereClauses.push("user_id = ?");
      params.push(options.userId);
    }

    // Apply WHERE clauses
    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    // Add stable ordering
    query += " ORDER BY timestamp DESC, id DESC";

    // Fetch limit + 1 to determine if there are more results
    query += " LIMIT ?";
    params.push(limit + 1);

    // Handle offset-based pagination (only if no cursor)
    if (!options?.cursor && options?.offset !== undefined) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = this._db.prepare(query);
    const rows = stmt.all(...params) as FrameRow[];

    // Determine if there are more results
    const hasMore = rows.length > limit;
    const frames = rows.slice(0, limit).map(rowToFrame);

    // Generate next cursor from the last frame
    let nextCursor: string | null = null;
    if (hasMore && frames.length > 0) {
      const lastFrame = frames[frames.length - 1];
      nextCursor = encodeCursor(lastFrame.timestamp, lastFrame.id);
    }

    return {
      frames,
      page: {
        limit,
        nextCursor,
        hasMore,
      },
      order: {
        by: "timestamp",
        direction: "desc",
      },
    };
  }

  /**
   * Delete a Frame by its unique identifier.
   * Also removes associated FTS5 index entry.
   * @param id - The Frame ID to delete.
   * @returns true if a Frame was deleted, false if the ID was not found.
   */
  async deleteFrame(id: string): Promise<boolean> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("DELETE FROM frames WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all Frames with timestamps before the given date.
   * FTS5 entries are removed automatically by SQLite triggers.
   * @param date - Delete Frames with timestamp < date (UTC).
   * @returns The number of Frames deleted.
   */
  async deleteFramesBefore(date: Date): Promise<number> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("DELETE FROM frames WHERE timestamp < ?");
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * Delete all Frames matching a branch name.
   * FTS5 entries are removed automatically by SQLite triggers.
   * @param branch - The branch to match.
   * @returns The number of Frames deleted.
   */
  async deleteFramesByBranch(branch: string): Promise<number> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("DELETE FROM frames WHERE branch = ?");
    const result = stmt.run(branch);
    return result.changes;
  }

  /**
   * Delete all Frames that include the given module in their module_scope.
   * Uses json_each() to match within the JSON array column.
   * FTS5 entries are removed automatically by SQLite triggers.
   * @param moduleId - The module ID to match.
   * @returns The number of Frames deleted.
   */
  async deleteFramesByModule(moduleId: string): Promise<number> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare(
      "DELETE FROM frames WHERE EXISTS (SELECT 1 FROM json_each(module_scope) WHERE value = ?)"
    );
    const result = stmt.run(moduleId);
    return result.changes;
  }

  /**
   * Get the total number of Frames in the store.
   * @returns The total Frame count.
   */
  async getFrameCount(): Promise<number> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("SELECT COUNT(*) as count FROM frames");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get database statistics for diagnostics.
   * Queries frame counts, date ranges, and optional module distribution.
   */
  async getStats(detailed: boolean = false): Promise<StoreStats> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const totalFrames = (
      this._db.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
    ).count;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const thisWeek = (
      this._db
        .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
        .get(oneWeekAgo.toISOString()) as { count: number }
    ).count;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const thisMonth = (
      this._db
        .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
        .get(oneMonthAgo.toISOString()) as { count: number }
    ).count;

    let oldestDate: string | null = null;
    let newestDate: string | null = null;

    if (totalFrames > 0) {
      oldestDate = (
        this._db.prepare("SELECT MIN(timestamp) as oldest FROM frames").get() as {
          oldest: string | null;
        }
      ).oldest;
      newestDate = (
        this._db.prepare("SELECT MAX(timestamp) as newest FROM frames").get() as {
          newest: string | null;
        }
      ).newest;
    }

    const result: StoreStats = { totalFrames, thisWeek, thisMonth, oldestDate, newestDate };

    if (detailed && totalFrames > 0) {
      const moduleDistribution: Record<string, number> = {};
      const rows = this._db
        .prepare("SELECT module_scope FROM frames")
        .iterate() as IterableIterator<{ module_scope: string }>;
      for (const row of rows) {
        try {
          const modules = JSON.parse(row.module_scope) as string[];
          for (const mod of modules) {
            moduleDistribution[mod] = (moduleDistribution[mod] || 0) + 1;
          }
        } catch {
          // Skip frames with invalid JSON
        }
      }
      const sorted = Object.entries(moduleDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      result.moduleDistribution = Object.fromEntries(sorted);
    }

    return result;
  }

  /**
   * Get turn cost metrics for a time period.
   * Aggregates token usage and prompt counts from Frame spend metadata.
   */
  async getTurnCostMetrics(since?: string): Promise<TurnCostMetrics> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const whereClauses: string[] = [];
    const params: string[] = [];

    if (since) {
      whereClauses.push("timestamp >= ?");
      params.push(since);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const stmt = this._db.prepare(`
      SELECT
        COUNT(*) as frameCount,
        SUM(CASE WHEN spend IS NOT NULL THEN json_extract(spend, '$.tokens_estimated') ELSE 0 END) as estimatedTokens,
        SUM(CASE WHEN spend IS NOT NULL THEN json_extract(spend, '$.prompts') ELSE 0 END) as prompts
      FROM frames
      ${whereClause}
    `);

    const row = stmt.get(...params) as {
      frameCount: number;
      estimatedTokens: number | null;
      prompts: number | null;
    };

    return {
      frameCount: row.frameCount || 0,
      estimatedTokens: row.estimatedTokens || 0,
      prompts: row.prompts || 0,
    };
  }

  /**
   * Update specific fields of an existing Frame.
   * Only the provided fields are updated; all other fields remain unchanged.
   * Uses a targeted SQL UPDATE instead of a full-row saveFrame() upsert.
   *
   * @param id - The ID of the Frame to update.
   * @param updates - Partial Frame fields to update. 'id' and 'timestamp' cannot be changed.
   * @returns true if a Frame was found and updated, false if the ID was not found.
   */
  async updateFrame(
    id: string,
    updates: Partial<Omit<Frame, "id" | "timestamp">>
  ): Promise<boolean> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const existing = await this.getFrameById(id);
    if (!existing) {
      return false;
    }

    const updatedFrame = parseFrame({
      ...existing,
      ...updates,
      id: existing.id,
      timestamp: existing.timestamp,
    });
    const updatedRow = frameToRow(updatedFrame);

    const columnMap: Record<string, { column: string; value: unknown }> = {
      branch: { column: "branch", value: updatedRow.branch },
      jira: { column: "jira", value: updatedRow.jira },
      module_scope: { column: "module_scope", value: updatedRow.module_scope },
      summary_caption: { column: "summary_caption", value: updatedRow.summary_caption },
      reference_point: { column: "reference_point", value: updatedRow.reference_point },
      status_snapshot: { column: "status_snapshot", value: updatedRow.status_snapshot },
      keywords: { column: "keywords", value: updatedRow.keywords },
      atlas_frame_id: { column: "atlas_frame_id", value: updatedRow.atlas_frame_id },
      feature_flags: { column: "feature_flags", value: updatedRow.feature_flags },
      permissions: { column: "permissions", value: updatedRow.permissions },
      image_ids: { column: "image_ids", value: updatedRow.image_ids },
      runId: { column: "run_id", value: updatedRow.run_id },
      planHash: { column: "plan_hash", value: updatedRow.plan_hash },
      spend: { column: "spend", value: updatedRow.spend },
      userId: { column: "user_id", value: updatedRow.user_id },
      executorRole: { column: "executor_role", value: updatedRow.executor_role },
      toolCalls: { column: "tool_calls", value: updatedRow.tool_calls },
      guardrailProfile: { column: "guardrail_profile", value: updatedRow.guardrail_profile },
      turnCost: { column: "turn_cost", value: updatedRow.turn_cost },
      capabilityTier: { column: "capability_tier", value: updatedRow.capability_tier },
      taskComplexity: { column: "task_complexity", value: updatedRow.task_complexity },
      superseded_by: { column: "superseded_by", value: updatedRow.superseded_by },
      merged_from: { column: "merged_from", value: updatedRow.merged_from },
      contradiction_resolution: {
        column: "contradiction_resolution",
        value: updatedRow.contradiction_resolution,
      },
      lmv: { column: "lmv", value: updatedRow.lmv },
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [key] of Object.entries(updates)) {
      const mapping = columnMap[key];
      if (mapping) {
        setClauses.push(`${mapping.column} = ?`);
        params.push(mapping.value);
      }
    }

    if (setClauses.length === 0) {
      return true;
    }

    params.push(id);
    const sql = `UPDATE frames SET ${setClauses.join(", ")} WHERE id = ?`;
    const stmt = this._db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  /**
   * Delete all Frames that have been marked as superseded.
   * Removes frames where superseded_by IS NOT NULL.
   * FTS5 entries are removed automatically by SQLite triggers.
   *
   * @returns The number of Frames deleted.
   */
  async purgeSuperseded(): Promise<number> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const stmt = this._db.prepare("DELETE FROM frames WHERE superseded_by IS NOT NULL");
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Close the store and release any resources.
   * Idempotent - safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return; // Already closed, idempotent
    }

    this.isClosed = true;

    if (this.ownsConnection) {
      this._db.close();
    }
  }
}
