"use strict";
/**
 * Database initialization and schema management for Frame storage
 *
 * Creates SQLite database with FTS5 virtual table for full-text search
 * on reference_point, keywords, and summary_caption.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultDbPath = getDefaultDbPath;
exports.initializeDatabase = initializeDatabase;
exports.createDatabase = createDatabase;
var better_sqlite3_1 = require("better-sqlite3");
var os_1 = require("os");
var path_1 = require("path");
var fs_1 = require("fs");
/**
 * Get default database path: ~/.lex/frames.db
 * Can be overridden with LEX_DB_PATH environment variable
 */
function getDefaultDbPath() {
    // Check for environment variable override
    if (process.env.LEX_DB_PATH) {
        return process.env.LEX_DB_PATH;
    }
    var lexDir = (0, path_1.join)((0, os_1.homedir)(), ".lex");
    if (!(0, fs_1.existsSync)(lexDir)) {
        (0, fs_1.mkdirSync)(lexDir, { recursive: true });
    }
    return (0, path_1.join)(lexDir, "frames.db");
}
/**
 * Initialize database with schema and indexes
 */
function initializeDatabase(db) {
    // Set SQLite pragmas for performance and reliability
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = 10000");
    db.pragma("foreign_keys = ON");
    // Create schema version table for migration support
    db.exec("\n    CREATE TABLE IF NOT EXISTS schema_version (\n      version INTEGER PRIMARY KEY,\n      applied_at TEXT NOT NULL DEFAULT (datetime('now'))\n    );\n  ");
    // Check current schema version
    var versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get();
    var currentVersion = (versionRow === null || versionRow === void 0 ? void 0 : versionRow.version) || 0;
    // Apply migrations
    if (currentVersion < 1) {
        applyMigrationV1(db);
        db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
    }
    if (currentVersion < 2) {
        applyMigrationV2(db);
        db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(2);
    }
}
/**
 * Migration V1: Initial schema
 */
function applyMigrationV1(db) {
    // Create frames table with all fields from FRAME.md
    db.exec("\n    CREATE TABLE IF NOT EXISTS frames (\n      id TEXT PRIMARY KEY,\n      timestamp TEXT NOT NULL,\n      branch TEXT NOT NULL,\n      jira TEXT,\n      module_scope TEXT NOT NULL,\n      summary_caption TEXT NOT NULL,\n      reference_point TEXT NOT NULL,\n      status_snapshot TEXT NOT NULL,\n      keywords TEXT,\n      atlas_frame_id TEXT,\n      feature_flags TEXT,\n      permissions TEXT\n    );\n  ");
    // Create FTS5 virtual table for fuzzy search on reference_point, keywords, summary_caption
    db.exec("\n    CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(\n      reference_point,\n      summary_caption,\n      keywords,\n      content='frames',\n      content_rowid='rowid'\n    );\n  ");
    // Create triggers to keep FTS index in sync with frames table
    db.exec("\n    CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN\n      INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords)\n      VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords);\n    END;\n  ");
    db.exec("\n    CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN\n      DELETE FROM frames_fts WHERE rowid = old.rowid;\n    END;\n  ");
    db.exec("\n    CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN\n      UPDATE frames_fts\n      SET reference_point = new.reference_point,\n          summary_caption = new.summary_caption,\n          keywords = new.keywords\n      WHERE rowid = new.rowid;\n    END;\n  ");
    // Create indexes for common query patterns
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp DESC);\n  ");
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames(branch);\n  ");
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames(jira);\n  ");
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_frames_atlas_frame_id ON frames(atlas_frame_id);\n  ");
}
/**
 * Migration V2: Add images table
 */
function applyMigrationV2(db) {
    // Create images table for Frame attachments
    db.exec("\n    CREATE TABLE IF NOT EXISTS images (\n      image_id TEXT PRIMARY KEY,\n      frame_id TEXT NOT NULL,\n      data BLOB NOT NULL,\n      mime_type TEXT NOT NULL,\n      created_at INTEGER NOT NULL,\n      FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE\n    );\n  ");
    // Create index for frame_id lookups
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_images_frame_id ON images(frame_id);\n  ");
}
/**
 * Create and initialize a database connection
 */
function createDatabase(dbPath) {
    var path = dbPath || getDefaultDbPath();
    var db = new better_sqlite3_1.default(path);
    initializeDatabase(db);
    return db;
}
