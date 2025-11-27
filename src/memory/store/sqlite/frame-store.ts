/**
 * SqliteFrameStore — SQLite implementation of FrameStore interface.
 *
 * Production-ready implementation that uses SQLite as the backing store.
 * Supports FTS5 for full-text search and proper connection management.
 */

import type Database from "better-sqlite3-multiple-ciphers";
import type { FrameStore, FrameSearchCriteria, FrameListOptions, SaveResult } from "../frame-store.js";
import type { Frame, FrameStatusSnapshot, FrameSpendMetadata } from "../../frames/types.js";
import type { FrameRow } from "../db.js";
import { Frame as FrameSchema } from "../../frames/types.js";
import { createDatabase } from "../db.js";

/**
 * Convert Frame object to database row
 *
 * Note: Frame v3 fields (executorRole, toolCalls, guardrailProfile) are not persisted
 * as the database schema does not yet have columns for them. This matches the behavior
 * of queries.ts. A future database migration will add support for these fields.
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
  };
}

/**
 * Convert database row to Frame object
 *
 * Note: Frame v3 fields (executorRole, toolCalls, guardrailProfile) are not retrieved
 * as the database schema does not yet have columns for them. This matches the behavior
 * of queries.ts. A future database migration will add support for these fields.
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
  };
}

/**
 * SqliteFrameStore — SQLite-backed implementation of FrameStore.
 *
 * Provides Frame persistence using SQLite with FTS5 for full-text search.
 * Handles connection lifecycle management with proper cleanup.
 */
export class SqliteFrameStore implements FrameStore {
  private db: Database.Database;
  private ownsConnection: boolean;
  private isClosed: boolean = false;

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
      this.db = createDatabase(dbOrPath);
      this.ownsConnection = true;
    } else {
      // Use existing connection (caller owns it)
      this.db = dbOrPath;
      this.ownsConnection = false;
    }
  }

  /**
   * Persist a Frame to storage.
   * Uses INSERT OR REPLACE for upsert behavior.
   */
  async saveFrame(frame: Frame): Promise<void> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    const row = frameToRow(frame);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO frames (
        id, timestamp, branch, jira, module_scope, summary_caption,
        reference_point, status_snapshot, keywords, atlas_frame_id,
        feature_flags, permissions, run_id, plan_hash, spend, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      row.user_id
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
    for (const frame of frames) {
      const parseResult = FrameSchema.safeParse(frame);
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
    }

    // All validations passed - insert within a transaction
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO frames (
        id, timestamp, branch, jira, module_scope, summary_caption,
        reference_point, status_snapshot, keywords, atlas_frame_id,
        feature_flags, permissions, run_id, plan_hash, spend, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = this.db.transaction((framesToInsert: Frame[]) => {
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
          row.run_id,
          row.plan_hash,
          row.spend,
          row.user_id
        );
      }
    });

    try {
      insertAll(frames);
      // All frames inserted successfully
      for (const frame of frames) {
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

    const stmt = this.db.prepare("SELECT * FROM frames WHERE id = ?");
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

    // Handle FTS5 query
    if (criteria.query) {
      try {
        baseQuery = `
          SELECT f.*
          FROM frames f
          JOIN frames_fts fts ON f.rowid = fts.rowid
          WHERE frames_fts MATCH ?
        `;
        params.push(criteria.query);
        usesFTS = true;
      } catch {
        // FTS5 syntax error, return empty results
        return [];
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
      const stmt = this.db.prepare(query);
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
   * Frames are returned in descending timestamp order (newest first).
   */
  async listFrames(options?: FrameListOptions): Promise<Frame[]> {
    if (this.isClosed) {
      throw new Error("SqliteFrameStore is closed");
    }

    let query = "SELECT * FROM frames ORDER BY timestamp DESC";
    const params: number[] = [];

    if (options?.limit !== undefined) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options?.offset !== undefined) {
      if (options?.limit === undefined) {
        // SQLite requires LIMIT when using OFFSET
        query += " LIMIT -1";
      }
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as FrameRow[];

    return rows.map(rowToFrame);
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
      this.db.close();
    }
  }
}
