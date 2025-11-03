/**
 * Database initialization and schema management for Frame storage
 * 
 * Creates SQLite database with FTS5 virtual table for full-text search
 * on reference_point, keywords, and summary_caption.
 */

import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

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
  feature_flags: string | null; // JSON stringified array
  permissions: string | null; // JSON stringified array
}

/**
 * Get default database path: ~/.lex/frames.db
 * Can be overridden with LEX_DB_PATH environment variable
 */
export function getDefaultDbPath(): string {
  // Check for environment variable override
  if (process.env.LEX_DB_PATH) {
    return process.env.LEX_DB_PATH;
  }
  
  const lexDir = join(homedir(), ".lex");
  if (!existsSync(lexDir)) {
    mkdirSync(lexDir, { recursive: true });
  }
  return join(lexDir, "frames.db");
}

/**
 * Initialize database with schema and indexes
 */
export function initializeDatabase(db: Database.Database): void {
  // Set SQLite pragmas for performance and reliability
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = 10000");
  db.pragma("foreign_keys = ON");

  // Create schema version table for migration support
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Check current schema version
  const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as { version: number | null };
  const currentVersion = versionRow?.version || 0;

  // Apply migrations
  if (currentVersion < 1) {
    applyMigrationV1(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
  }
}

/**
 * Migration V1: Initial schema
 */
function applyMigrationV1(db: Database.Database): void {
  // Create frames table with all fields from FRAME.md
  db.exec(`
    CREATE TABLE IF NOT EXISTS frames (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      branch TEXT NOT NULL,
      jira TEXT,
      module_scope TEXT NOT NULL,
      summary_caption TEXT NOT NULL,
      reference_point TEXT NOT NULL,
      status_snapshot TEXT NOT NULL,
      keywords TEXT,
      atlas_frame_id TEXT,
      feature_flags TEXT,
      permissions TEXT
    );
  `);

  // Create FTS5 virtual table for fuzzy search on reference_point, keywords, summary_caption
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
      reference_point,
      summary_caption,
      keywords,
      content='frames',
      content_rowid='rowid'
    );
  `);

  // Create triggers to keep FTS index in sync with frames table
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
      INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords)
      VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
      DELETE FROM frames_fts WHERE rowid = old.rowid;
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN
      UPDATE frames_fts
      SET reference_point = new.reference_point,
          summary_caption = new.summary_caption,
          keywords = new.keywords
      WHERE rowid = new.rowid;
    END;
  `);

  // Create indexes for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp DESC);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames(branch);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames(jira);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frames_atlas_frame_id ON frames(atlas_frame_id);
  `);
}

/**
 * Create and initialize a database connection
 */
export function createDatabase(dbPath?: string): Database.Database {
  const path = dbPath || getDefaultDbPath();
  const db = new Database(path);
  initializeDatabase(db);
  return db;
}
