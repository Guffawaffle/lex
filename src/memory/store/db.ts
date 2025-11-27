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
import { pbkdf2Sync } from "crypto";

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
 * Database row type for code_atlas_runs table
 */
export interface CodeAtlasRunRow {
  run_id: string;
  repo_id: string;
  files_requested: string; // JSON stringified array
  files_scanned: string; // JSON stringified array
  units_emitted: number;
  max_files: number | null;
  max_bytes: number | null;
  truncated: number; // SQLite boolean (0 or 1)
  strategy: string | null;
  created_at: string;
  schema_version: string;
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
  // Validate passphrase strength
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error("Passphrase cannot be empty or whitespace-only");
  }
  if (passphrase.length < 12) {
    throw new Error(
      "Passphrase is too weak. Use at least 12 characters (32+ recommended for production). " +
        "Consider using a password manager to generate and store a strong passphrase."
    );
  }

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

  // In production, encryption key is mandatory and must not be empty or whitespace-only
  if (process.env.NODE_ENV === "production" && (!passphrase || !passphrase.trim())) {
    throw new Error(
      "LEX_DB_KEY environment variable is required in production mode and must not be empty or whitespace-only. " +
        "Set LEX_DB_KEY to a strong passphrase (32+ characters) to enable database encryption."
    );
  }

  // Return derived key if passphrase is provided and not empty/whitespace-only
  return passphrase && passphrase.trim() ? deriveEncryptionKey(passphrase) : undefined;
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
  if (currentVersion < 5) {
    applyMigrationV5(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(5);
  }
  if (currentVersion < 6) {
    applyMigrationV6(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(6);
  }
  if (currentVersion < 7) {
    applyMigrationV7(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(7);
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
 * Migration V3: Add execution provenance fields (Frame schema v2)
 */
function applyMigrationV3(db: Database.Database): void {
  // Add new optional columns for execution provenance
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
 * Migration V5: Add code_units table for Code Atlas
 *
 * Stores CodeUnit records for code discovery and indexing.
 * Schema aligned with src/atlas/schemas/code-unit.ts (CA-001).
 *
 * Note: Database uses snake_case column names, which will be mapped to
 * camelCase TypeScript properties in the queries module (matching Frame pattern).
 * The span.startLine/endLine from CodeUnit schema is flattened to start_line/end_line.
 */
function applyMigrationV5(db: Database.Database): void {
  // Create code_units table with schema aligned to CodeUnit type
  // Kind values must match CodeUnitKindSchema enum in src/atlas/schemas/code-unit.ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_units (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,

      kind TEXT NOT NULL CHECK (kind IN ('module', 'class', 'function', 'method')),
      symbol_path TEXT NOT NULL,
      name TEXT NOT NULL,

      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,

      tags TEXT,
      doc_comment TEXT,

      discovered_at TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT 'code-unit-v0',

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Index for repo_id lookups (common query pattern)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_units_repo ON code_units(repo_id);
  `);

  // Composite index for file path queries within a repo
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_units_file ON code_units(repo_id, file_path);
  `);

  // Composite index for kind queries within a repo
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_units_kind ON code_units(repo_id, kind);
  `);

  // Index for symbol path lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_units_symbol ON code_units(symbol_path);
  `);
}

/**
 * Migration V6: Add code_atlas_runs table for Code Atlas provenance records
 *
 * Schema aligned with CodeAtlasRun type from src/atlas/schemas/code-atlas-run.ts
 */
function applyMigrationV6(db: Database.Database): void {
  // Create code_atlas_runs table for Code Atlas extraction provenance
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_atlas_runs (
      run_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      files_requested TEXT NOT NULL,
      files_scanned TEXT NOT NULL,
      units_emitted INTEGER NOT NULL,
      max_files INTEGER,
      max_bytes INTEGER,
      truncated INTEGER NOT NULL DEFAULT 0,
      strategy TEXT CHECK (strategy IN ('static', 'llm-assisted', 'mixed')),
      created_at TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT 'code-atlas-run-v0'
    );
  `);

  // Create index for repo_id lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_atlas_runs_repo ON code_atlas_runs(repo_id);
  `);

  // Create index for created_at queries (temporal ordering)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_atlas_runs_created ON code_atlas_runs(created_at);
  `);
}

/**
 * Migration V7: Add lexsona_behavior_rules table for LexSona behavioral memory
 *
 * Schema aligned with LexSona Mathematical Framework v0.1
 * and CptPlnt lexsona_behavior_rule.schema.json
 *
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 * @see docs/research/LexSona/CptPlnt/lexsona_behavior_rule.schema.json
 */
function applyMigrationV7(db: Database.Database): void {
  // Create lexsona_behavior_rules table for behavioral rule storage
  db.exec(`
    CREATE TABLE IF NOT EXISTS lexsona_behavior_rules (
      rule_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      text TEXT NOT NULL,

      -- Scope (all nullable for partial matching)
      -- Stored as JSON for flexibility
      scope TEXT NOT NULL,

      -- Bayesian Beta confidence model
      -- Prior: Beta(alpha_0=2, beta_0=5) — skeptical, requires evidence
      alpha INTEGER NOT NULL DEFAULT 2,
      beta INTEGER NOT NULL DEFAULT 5,

      -- Observation count (reinforcements + counterexamples)
      observation_count INTEGER NOT NULL DEFAULT 0,

      -- Severity level
      severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'style')) DEFAULT 'should',

      -- Decay time constant in days (default: 180 days)
      decay_tau INTEGER NOT NULL DEFAULT 180,

      -- Timestamps
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_observed TEXT NOT NULL DEFAULT (datetime('now')),

      -- Optional: Link to Lex Frame for auditability
      frame_id TEXT
    );
  `);

  // Index for scope-based filtering (using JSON_EXTRACT for module_id)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexsona_rules_module
    ON lexsona_behavior_rules(json_extract(scope, '$.module_id'));
  `);

  // Index for category-based grouping
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexsona_rules_category
    ON lexsona_behavior_rules(category);
  `);

  // Index for confidence + recency filtering (for active rule queries)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexsona_rules_observation_last
    ON lexsona_behavior_rules(observation_count, last_observed DESC);
  `);

  // Index for severity filtering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexsona_rules_severity
    ON lexsona_behavior_rules(severity);
  `);

  // Index for frame linkage
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexsona_rules_frame_id
    ON lexsona_behavior_rules(frame_id)
    WHERE frame_id IS NOT NULL;
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
