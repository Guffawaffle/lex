import Database from "better-sqlite3";
export interface FrameRow {
  id: string;
  timestamp: string;
  branch: string;
  jira: string | null;
  module_scope: string;
  summary_caption: string;
  reference_point: string;
  status_snapshot: string;
  keywords: string | null;
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
export declare class FrameStore {
  private db;
  constructor(dbPath: string);
  /**
   * Insert or update a Frame
   * @deprecated Use saveFrame from the modular API
   */
  insertFrame(frame: any): boolean;
  /**
   * Retrieve Frame by ID
   * @deprecated Use getFrameById from the modular API
   */
  getFrameById(id: string): any | null;
  /**
   * Search Frames with FTS and optional filters
   * @deprecated Use searchFrames, getFramesByBranch, or getFramesByJira from the modular API
   */
  searchFrames(query: {
    reference_point?: string;
    jira?: string;
    branch?: string;
    limit?: number;
  }): any[];
  /**
   * Delete Frame by ID
   * @deprecated Use deleteFrame from the modular API
   */
  deleteFrame(id: string): boolean;
  /**
   * Close database connection
   */
  close(): void;
  /**
   * Get the underlying database instance (for testing/internal use)
   * @internal
   */
  getDatabase(): Database.Database;
}
