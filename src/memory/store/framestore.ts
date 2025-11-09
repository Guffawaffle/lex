// Legacy class-based API for Frame storage
// Wraps the new modular implementation (db.ts, queries.ts, index.ts)
// This provides backward compatibility while using the new modular code internally

import Database from "better-sqlite3";
import { createDatabase } from "./db.js";
import {
  saveFrame as save,
  getFrameById as getById,
  searchFrames as search,
  deleteFrame as remove,
  getFramesByBranch,
  getFramesByJira,
  getAllFrames,
} from "./queries.js";
import type { Frame } from "../frames/types.js";

export interface FrameRow {
  id: string;
  timestamp: string;
  branch: string;
  jira: string | null;
  module_scope: string; // JSON stringified array
  summary_caption: string;
  reference_point: string;
  status_snapshot: string; // JSON stringified object
  keywords: string | null; // JSON stringified array
  atlas_frame_id: string | null;
}

/**
 * Frame storage manager using SQLite
 *
 * @deprecated Use the modular API from index.ts instead
 * @example
 * ```typescript
 * // Old API (still works)
 * const store = new FrameStore('/path/to/db');
 * store.insertFrame(frame);
 *
 * // New API (recommended)
 * import { getDb, saveFrame } from 'lex/store';
 * const db = getDb('/path/to/db');
 * saveFrame(db, frame);
 * ```
 *
 * Frames are stored locally with full-text search on reference_point for fuzzy recall.
 * No telemetry. No cloud sync.
 */
export class FrameStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = createDatabase(dbPath);
  }

  /**
   * Insert or update a Frame
   * @deprecated Use saveFrame from the modular API
   */
  insertFrame(frame: any): boolean {
    try {
      save(this.db, frame as Frame);
      return true;
    } catch (error) {
      console.error("Failed to insert frame:", error);
      return false;
    }
  }

  /**
   * Retrieve Frame by ID
   * @deprecated Use getFrameById from the modular API
   */
  getFrameById(id: string): any | null {
    return getById(this.db, id);
  }

  /**
   * Search Frames with FTS and optional filters
   * @deprecated Use searchFrames, getFramesByBranch, or getFramesByJira from the modular API
   */
  searchFrames(query: {
    reference_point?: string;
    jira?: string;
    branch?: string;
    limit?: number;
  }): any[] {
    if (query.reference_point) {
      // Return just the frames array from SearchResult for backward compatibility
      return search(this.db, query.reference_point).frames;
    }

    if (query.jira) {
      return getFramesByJira(this.db, query.jira);
    }

    if (query.branch) {
      return getFramesByBranch(this.db, query.branch);
    }

    return getAllFrames(this.db, query.limit);
  }

  /**
   * Delete Frame by ID
   * @deprecated Use deleteFrame from the modular API
   */
  deleteFrame(id: string): boolean {
    return remove(this.db, id);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }

  /**
   * Get the underlying database instance (for testing/internal use)
   * @internal
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}
