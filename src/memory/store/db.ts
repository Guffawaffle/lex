/**
 * Database initialization and schema management for Frame storage
 *
 * Creates SQLite database with FTS5 virtual table for full-text search
 * on reference_point, keywords, and summary_caption.
 * 
 * Supports encryption via SQLCipher when LEX_DB_KEY environment variable is set.
 */

import Database from "better-sqlite3-multiple-ciphers";
import { homedir } from "os";
import { join, dirname } from "path";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { pbkdf2Sync, randomBytes } from "crypto";

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
 * Derive encryption key from passphrase using PBKDF2
 * Uses 64K iterations as recommended by SQLCipher for security
 * 
 * NOTE: This implementation uses a fixed application salt to ensure deterministic
 * key derivation. This is necessary because:
 * 1. SQLCipher doesn't support storing salt metadata separately
 * 2. Users must derive the same key from their passphrase each session
 * 3. The passphrase itself must be high-entropy to compensate
 * 
 * Security considerations:
 * - Users MUST use strong, unique passphrases (32+ characters recommended)
 * - The fixed salt prevents per-database key uniqueness
 * - This is acceptable for single-user/small-team use cases
 * - Enterprise deployments should consider HSM integration (future work)
 * 
 * @param passphrase - User-provided passphrase from LEX_DB_KEY
 * @param salt - Optional salt (defaults to application-wide constant)
 * @returns Hex-encoded key suitable for SQLCipher
 */
export function deriveEncryptionKey(passphrase: string, salt?: Buffer): string {
  // Use application-wide constant salt for deterministic key derivation
  // This is necessary for password-based encryption without external metadata storage
  const APPLICATION_SALT = Buffer.from("lex-sqlcipher-v1-2025", "utf-8");
  const keySalt = salt || APPLICATION_SALT;
  
  // Derive 256-bit key with 64K iterations (SQLCipher recommendation)
  const key = pbkdf2Sync(passphrase, keySalt, 64000, 32, "sha256");
  
  return key.toString("hex");
}

/**
 * Get encryption key from environment variable
 * Required in production (NODE_ENV=production)
 * Optional in development/test environments
 * 
 * @returns Derived encryption key or undefined if not set
 * @throws Error if NODE_ENV=production and LEX_DB_KEY is not set
 */
export function getEncryptionKey(): string | undefined {
  const passphrase = process.env.LEX_DB_KEY;
  
  // In production, encryption key is mandatory
  if (process.env.NODE_ENV === "production" && !passphrase) {
    throw new Error(
      "LEX_DB_KEY environment variable is required in production mode. " +
      "Set LEX_DB_KEY to a strong passphrase (32+ characters) to enable database encryption."
    );
  }
  
  // Return derived key if passphrase is provided
  return passphrase ? deriveEncryptionKey(passphrase) : undefined;
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
 * Create and initialize a database connection
 * 
 * Automatically applies encryption if LEX_DB_KEY is set.
 * In production mode (NODE_ENV=production), encryption is mandatory.
 * 
 * @param dbPath - Optional database file path (defaults to getDefaultDbPath())
 * @returns Initialized database connection
 */
export function createDatabase(dbPath?: string): Database.Database {
  const path = dbPath || getDefaultDbPath();
  const db = new Database(path);
  
  // Apply encryption if key is available
  const encryptionKey = getEncryptionKey();
  if (encryptionKey) {
    // Set cipher configuration for SQLCipher
    // Using sqlcipher defaults (PRAGMA cipher_page_size = 4096, etc.)
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`key="x'${encryptionKey}'"`);
    
    // Verify encryption is working by testing database access
    try {
      db.prepare("SELECT 1").get();
    } catch (error) {
      throw new Error(
        `Failed to open encrypted database. The encryption key may be incorrect. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  initializeDatabase(db);
  return db;
}
