/**
 * Database initialization and schema management for Frame storage
 *
 * Creates SQLite database with FTS5 virtual table for full-text search
 * on reference_point, keywords, and summary_caption.
 */
import Database from "better-sqlite3-multiple-ciphers";
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
  feature_flags: string | null;
  permissions: string | null;
}
/**
 * Get default database path: ~/.lex/frames.db
 * Can be overridden with LEX_DB_PATH environment variable
 */
export declare function getDefaultDbPath(): string;
/**
 * Initialize database with schema and indexes
 */
export declare function initializeDatabase(db: Database.Database): void;
/**
 * Create and initialize a database connection
 */
export declare function createDatabase(dbPath?: string): Database.Database;
