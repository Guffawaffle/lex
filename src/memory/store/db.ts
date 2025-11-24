/**
 * Database initialization and schema management for Frame storage
 *
 * Creates SQLite database with FTS5 virtual table for full-text search
 * on reference_point, keywords, and summary_caption.
 */

import Database from "better-sqlite3";
import { homedir } from "os";
import { join, dirname } from "path";
import { mkdirSync, existsSync, readFileSync } from "fs";

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
  // Merge-weave metadata (v2)
  run_id: string | null;
  plan_hash: string | null;
  spend: string | null; // JSON stringified object
  // OAuth2/JWT user isolation (v3)
  user_id: string | null;
}

/**
 * Get default database path: .smartergpt/lex/memory.db (relative to workspace root)
 * Falls back to ~/.smartergpt/lex/memory.db if not in a lex repository
 * Can be overridden with LEX_DB_PATH or LEX_WORKSPACE_ROOT environment variables
 */
export function getDefaultDbPath(): string {
  // Check for environment variable override
  if (process.env.LEX_DB_PATH) {
    return process.env.LEX_DB_PATH;
  }

  // Try to find workspace root (with LEX_WORKSPACE_ROOT override support)
  try {
    const repoRoot = process.env.LEX_WORKSPACE_ROOT
      ? process.env.LEX_WORKSPACE_ROOT
      : findRepoRoot(process.cwd());
    const localPath = join(repoRoot, ".smartergpt", "lex", "memory.db");

    // Ensure directory exists
    const localDir = join(repoRoot, ".smartergpt", "lex");
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    return localPath;
  } catch {
    // Fallback to home directory if not in repo
    const lexDir = join(homedir(), ".smartergpt", "lex");
    if (!existsSync(lexDir)) {
      mkdirSync(lexDir, { recursive: true });
    }
    return join(lexDir, "memory.db");
  }
}

/**
 * Find repository root by looking for package.json with name "lex" or "@smartergpt/lex"
 */
function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    const packageJsonPath = join(currentPath, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: string };
        if (packageJson.name === "lex" || packageJson.name === "@smartergpt/lex") {
          return currentPath;
        }
      } catch {
        // Invalid package.json, continue searching
      }
    }
    currentPath = dirname(currentPath);
  }

  throw new Error("Repository root not found");
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
  const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as {
    version: number | null;
  };
  const currentVersion = versionRow?.version || 0;

  // Apply migrations
  if (currentVersion < 1) {
    applyMigrationV1(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
  }
  if (currentVersion < 2) {
    applyMigrationV2(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(2);
  }
  if (currentVersion < 3) {
    applyMigrationV3(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(3);
  }
  if (currentVersion < 4) {
    applyMigrationV4(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(4);
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
 * Migration V2: Add images table
 */
function applyMigrationV2(db: Database.Database): void {
  // Create images table for Frame attachments
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      image_id TEXT PRIMARY KEY,
      frame_id TEXT NOT NULL,
      data BLOB NOT NULL,
      mime_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE
    );
  `);

  // Create index for frame_id lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_images_frame_id ON images(frame_id);
  `);
}

/**
 * Migration V3: Add merge-weave metadata fields (Frame schema v2)
 */
function applyMigrationV3(db: Database.Database): void {
  // Add new optional columns for merge-weave provenance
  // Safe to add with NULL default, backward compatible
  db.exec(`
    ALTER TABLE frames ADD COLUMN run_id TEXT;
  `);

  db.exec(`
    ALTER TABLE frames ADD COLUMN plan_hash TEXT;
  `);

  db.exec(`
    ALTER TABLE frames ADD COLUMN spend TEXT;
  `);
}

/**
 * Migration V4: Add OAuth2/JWT authentication support
 */
function applyMigrationV4(db: Database.Database): void {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT,
      UNIQUE(provider, provider_user_id)
    );
  `);

  // Create refresh tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  // Create index for token lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
  `);

  // Add user_id column to frames table
  db.exec(`
    ALTER TABLE frames ADD COLUMN user_id TEXT;
  `);

  // Create index for user_id lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_frames_user_id ON frames(user_id);
  `);

  // Create a default system user and assign existing frames to it
  const defaultUserId = "system-default";
  db.exec(`
    INSERT OR IGNORE INTO users (user_id, email, name, provider, provider_user_id)
    VALUES ('${defaultUserId}', 'system@localhost', 'System Default User', 'system', 'default');
  `);

  // Assign all existing frames (with NULL user_id) to the default user
  db.exec(`
    UPDATE frames SET user_id = '${defaultUserId}' WHERE user_id IS NULL;
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
