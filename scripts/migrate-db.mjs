#!/usr/bin/env node
/**
 * Database Migration Script
 *
 * Fixes schema issues in existing Lex databases, particularly:
 * - Missing `feature_flags` column (added in schema v1 but some DBs were created without it)
 * - Missing `permissions` column
 * - Other schema drift from older installations
 *
 * Usage:
 *   node scripts/migrate-db.mjs [db-path]
 *
 * If no path provided, uses default: ./lex-memory.db
 *
 * Safe to run multiple times - idempotent operations only.
 */

import Database from "better-sqlite3-multiple-ciphers";
import { existsSync } from "fs";
import { resolve } from "path";

const DEFAULT_DB_PATH = "./lex-memory.db";

function log(msg) {
  console.log(`[migrate-db] ${msg}`);
}

function error(msg) {
  console.error(`[migrate-db] ❌ ${msg}`);
}

function success(msg) {
  console.log(`[migrate-db] ✅ ${msg}`);
}

function getTableColumns(db, tableName) {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(result.map((col) => col.name));
}

function addColumnIfMissing(db, table, column, type, defaultValue = null) {
  const columns = getTableColumns(db, table);
  if (!columns.has(column)) {
    const defaultClause = defaultValue !== null ? ` DEFAULT ${defaultValue}` : "";
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultClause}`);
    success(`Added missing column: ${table}.${column}`);
    return true;
  }
  log(`Column ${table}.${column} already exists`);
  return false;
}

function migrate(dbPath) {
  log(`Opening database: ${dbPath}`);

  if (!existsSync(dbPath)) {
    error(`Database not found: ${dbPath}`);
    log(
      "If this is a new installation, the database will be created automatically when you first use Lex."
    );
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    // Check if frames table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = new Set(tables.map((t) => t.name));

    if (!tableNames.has("frames")) {
      error("No frames table found. This may not be a Lex database.");
      process.exit(1);
    }

    log("Checking schema...");

    let changesApplied = 0;

    // Migration: feature_flags column (was in v1 schema but some DBs missing it)
    if (addColumnIfMissing(db, "frames", "feature_flags", "TEXT")) {
      changesApplied++;
    }

    // Migration: permissions column (was in v1 schema but some DBs missing it)
    if (addColumnIfMissing(db, "frames", "permissions", "TEXT")) {
      changesApplied++;
    }

    // Migration: run_id, plan_hash, spend (v3 execution provenance)
    if (addColumnIfMissing(db, "frames", "run_id", "TEXT")) {
      changesApplied++;
    }
    if (addColumnIfMissing(db, "frames", "plan_hash", "TEXT")) {
      changesApplied++;
    }
    if (addColumnIfMissing(db, "frames", "spend", "TEXT")) {
      changesApplied++;
    }

    // Migration: user_id (v4 OAuth2/JWT)
    if (addColumnIfMissing(db, "frames", "user_id", "TEXT")) {
      changesApplied++;
    }

    // Migration: superseded_by, merged_from (frame consolidation)
    if (addColumnIfMissing(db, "frames", "superseded_by", "TEXT")) {
      changesApplied++;
    }
    if (addColumnIfMissing(db, "frames", "merged_from", "TEXT")) {
      changesApplied++;
    }

    // Check schema_version table
    if (!tableNames.has("schema_version")) {
      log("Creating schema_version table...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      changesApplied++;
    }

    // Get current schema version
    const versionRow = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
    const currentVersion = versionRow?.v || 0;
    log(`Current schema version: ${currentVersion}`);

    // Ensure we're at version 11 (current)
    if (currentVersion < 11) {
      for (let v = currentVersion + 1; v <= 11; v++) {
        db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(v);
      }
      success(`Updated schema version to 11`);
      changesApplied++;
    }

    // Final verification
    log("Verifying schema...");
    const finalColumns = getTableColumns(db, "frames");
    const requiredColumns = [
      "id",
      "timestamp",
      "branch",
      "jira",
      "module_scope",
      "summary_caption",
      "reference_point",
      "status_snapshot",
      "keywords",
      "atlas_frame_id",
      "feature_flags",
      "permissions",
      "run_id",
      "plan_hash",
      "spend",
      "user_id",
    ];

    const missing = requiredColumns.filter((col) => !finalColumns.has(col));
    if (missing.length > 0) {
      error(`Still missing columns after migration: ${missing.join(", ")}`);
      process.exit(1);
    }

    if (changesApplied > 0) {
      success(`Migration complete! ${changesApplied} changes applied.`);
    } else {
      success("Database schema is already up to date.");
    }

    // Show summary
    log("");
    log("Database summary:");
    const frameCount = db.prepare("SELECT COUNT(*) as c FROM frames").get();
    log(`  Frames: ${frameCount.c}`);
    log(`  Schema version: 11`);
    log(`  Columns: ${[...finalColumns].sort().join(", ")}`);
  } finally {
    db.close();
  }
}

// Main
const dbPath = resolve(process.argv[2] || DEFAULT_DB_PATH);
migrate(dbPath);
