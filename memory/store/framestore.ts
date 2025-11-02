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
 * import { getDb, saveFrame } from '@lex/store';
 * const db = getDb('/path/to/db');
 * await saveFrame(db, frame);
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
  async insertFrame(frame: any): Promise<boolean> {
    try {
      await save(this.db, frame as Frame);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Retrieve Frame by ID
   * @deprecated Use getFrameById from the modular API
   */
  async getFrameById(id: string): Promise<any | null> {
    return await getById(this.db, id);
  }

  /**
   * Search Frames with FTS and optional filters
   * @deprecated Use searchFrames, getFramesByBranch, or getFramesByJira from the modular API
   */
  async searchFrames(query: {
    reference_point?: string;
    jira?: string;
    branch?: string;
    limit?: number;
  }): Promise<any[]> {
    if (query.reference_point) {
      return await search(this.db, query.reference_point);
    }
    
    // For other query types, use the new modular API
    const { getFramesByBranch, getFramesByJira, getAllFrames } = await import("./queries.js");
    
    if (query.jira) {
      return await getFramesByJira(this.db, query.jira);
    }
    
    if (query.branch) {
      return await getFramesByBranch(this.db, query.branch);
    }
    
    return await getAllFrames(this.db, query.limit);
  }

  /**
   * Delete Frame by ID
   * @deprecated Use deleteFrame from the modular API
   */
  async deleteFrame(id: string): Promise<boolean> {
    return await remove(this.db, id);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

