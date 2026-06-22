import { afterEach, describe, test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3-multiple-ciphers";
import { createDatabase } from "@app/memory/store/db.js";

const migrateScriptPath = resolve(process.cwd(), "scripts/migrate-db.mjs");

function createLegacyFramesDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE frames (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        branch TEXT NOT NULL,
        jira TEXT,
        module_scope TEXT NOT NULL,
        summary_caption TEXT NOT NULL,
        reference_point TEXT NOT NULL,
        status_snapshot TEXT NOT NULL,
        keywords TEXT,
        atlas_frame_id TEXT
      );
    `);
  } finally {
    db.close();
  }
}

function getTableNames(db: Database.Database): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name).sort();
}

function getColumnNames(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name).sort();
}

describe("migrate-db script", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  test("patches frame columns without falsely stamping schema version 13", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lex-migrate-script-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "legacy.db");
    createLegacyFramesDatabase(dbPath);

    execFileSync(process.execPath, [migrateScriptPath, dbPath], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    const db = new Database(dbPath);
    try {
      const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as {
        version: number | null;
      };
      const columns = getColumnNames(db, "frames");

      assert.strictEqual(
        versionRow.version,
        null,
        "Repair script should not claim the database is fully migrated"
      );
      assert.ok(
        columns.includes("feature_flags"),
        "feature_flags should be added by repair script"
      );
      assert.ok(columns.includes("permissions"), "permissions should be added by repair script");
      assert.ok(columns.includes("lmv"), "lmv should be added by repair script");
      assert.ok(columns.includes("image_ids"), "image_ids should be added by repair script");
    } finally {
      db.close();
    }
  });

  test("allows runtime initialization to complete authoritative migrations after repair", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lex-migrate-runtime-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "legacy.db");
    createLegacyFramesDatabase(dbPath);

    execFileSync(process.execPath, [migrateScriptPath, dbPath], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    const db = createDatabase(dbPath);
    try {
      const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as {
        version: number | null;
      };
      const tables = getTableNames(db);

      assert.strictEqual(versionRow.version, 13, "Runtime initialization should advance to v13");
      assert.ok(tables.includes("frames_fts"), "Runtime should create frames_fts");
      assert.ok(tables.includes("images"), "Runtime should create images table");
      assert.ok(tables.includes("users"), "Runtime should create users table");
      assert.ok(tables.includes("receipts"), "Runtime should create receipts table");
      assert.ok(tables.includes("code_units"), "Runtime should create code_units table");
      assert.ok(tables.includes("code_atlas_runs"), "Runtime should create code_atlas_runs table");
    } finally {
      db.close();
    }
  });
});
