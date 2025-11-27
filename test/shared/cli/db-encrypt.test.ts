/**
 * Tests for database encryption CLI command
 *
 * Covers:
 * - SEC-002: Transaction-based migration with atomic table operations
 * - SEC-003: Backup creation and atomic file output
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3-multiple-ciphers";
import { createDatabase, deriveEncryptionKey, initializeDatabase } from "@app/memory/store/db.js";
import { saveFrame } from "@app/memory/store/index.js";
import type { Frame } from "@app/memory/frames/types.js";

describe("Database Encryption Security (SEC-003)", () => {
  const testDir = join(tmpdir(), `lex-db-encrypt-test-${Date.now()}`);
  const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");
  
  function getTestEnv(dbPath: string, passphrase: string = "test-passphrase"): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "test",
      LEX_LOG_LEVEL: "silent",
      LEX_DB_PATH: dbPath,
      LEX_DB_KEY: passphrase,
      PATH: process.env.PATH,
    };
  }

  function createTestDatabase(dbPath: string): void {
    // Ensure no encryption key is set when creating unencrypted test DB
    const originalKey = process.env.LEX_DB_KEY;
    delete process.env.LEX_DB_KEY;
    
    try {
      const db = createDatabase(dbPath);
      const testFrame: Frame = {
        id: `test-frame-${Date.now()}`,
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["test"],
        summary_caption: "Test frame for encryption",
        reference_point: "encryption test",
        status_snapshot: {
          next_action: "Verify encryption",
        },
      };
      saveFrame(db, testFrame);
      db.close();
    } finally {
      if (originalKey !== undefined) {
        process.env.LEX_DB_KEY = originalKey;
      }
    }
  }

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Backup Creation", () => {
    test("should create backup by default before encryption", () => {
      const subDir = join(testDir, "backup-default");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      // Check that output mentions backup was created
      assert.match(result, /Backup created:/, "Should mention backup was created");
      
      // Check that backup file exists
      const files = readdirSync(subDir);
      const backupFiles = files.filter(f => f.includes(".pre-encrypt."));
      assert.strictEqual(backupFiles.length, 1, "Should create exactly one backup file");
      
      // Verify backup file name format
      const backupFile = backupFiles[0];
      assert.match(backupFile, /test\.pre-encrypt\.\d{8}-\d{6}\.db/, "Backup should have correct format");
      
      // Verify encrypted output was created
      assert.ok(existsSync(outputPath), "Encrypted output should exist");
    });

    test("should skip backup when --no-backup is specified", () => {
      const subDir = join(testDir, "backup-skip");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--no-backup"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      // Check that output does NOT mention backup
      assert.doesNotMatch(result, /Backup created:/, "Should not mention backup creation");
      
      // Check that no backup file exists
      const files = readdirSync(subDir);
      const backupFiles = files.filter(f => f.includes(".pre-encrypt."));
      assert.strictEqual(backupFiles.length, 0, "Should not create any backup file");
      
      // Verify encrypted output was still created
      assert.ok(existsSync(outputPath), "Encrypted output should exist");
    });

    test("should include backup_path in JSON output when backup is created", () => {
      const subDir = join(testDir, "backup-json");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "--json", "db", "encrypt", "--input", inputPath, "--output", outputPath],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      const json = JSON.parse(result.trim());
      assert.ok(json.success, "Operation should succeed");
      assert.ok(json.backup_path, "JSON should include backup_path");
      assert.match(json.backup_path, /\.pre-encrypt\.\d{8}-\d{6}\.db$/, "backup_path should have correct format");
    });
  });

  describe("Atomic File Creation", () => {
    test("should not leave partial output file on error", () => {
      const subDir = join(testDir, "atomic-error");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      // Try to encrypt with wrong key (empty key should fail)
      const env = getTestEnv(inputPath);
      delete env.LEX_DB_KEY; // No passphrase - should fail
      
      try {
        execFileSync(
          process.execPath,
          [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath],
          { encoding: "utf-8", env }
        );
        assert.fail("Should have thrown an error");
      } catch {
        // Expected to fail
      }
      
      // Check no output file was created
      assert.ok(!existsSync(outputPath), "No output file should exist after error");
      
      // Check no temp files were left behind
      const files = readdirSync(subDir);
      const tempFiles = files.filter(f => f.includes(".tmp"));
      assert.strictEqual(tempFiles.length, 0, "No temp files should remain after error");
    });

    test("should create output atomically via rename", () => {
      const subDir = join(testDir, "atomic-success");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--no-backup"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      // Verify output exists and is readable
      assert.ok(existsSync(outputPath), "Output file should exist");
      
      // Check no temp files were left behind
      const files = readdirSync(subDir);
      const tempFiles = files.filter(f => f.includes(".tmp"));
      assert.strictEqual(tempFiles.length, 0, "No temp files should remain after success");
    });
  });

  describe("Backward Compatibility", () => {
    test("should still fail if output file already exists", () => {
      const subDir = join(testDir, "existing-output");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      // Create existing output file
      writeFileSync(outputPath, "existing file");
      
      try {
        execFileSync(
          process.execPath,
          [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--no-backup"],
          { encoding: "utf-8", env: getTestEnv(inputPath) }
        );
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        const output = error.stdout || error.stderr;
        assert.match(output, /Output database already exists/, "Should show existing file error");
      }
    });

    test("should still work with --verify option", () => {
      const subDir = join(testDir, "verify-compat");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabase(inputPath);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--no-backup", "--verify"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      assert.match(result, /Verified:/, "Should show verification result");
      assert.match(result, /frames migrated successfully/, "Should show successful migration");
    });
  });
});

/**
 * SEC-002: Transaction-based Migration Tests
 *
 * Tests transaction wrapping for atomic table operations,
 * rollback behavior, and data integrity verification.
 */
describe("Database Encryption Migration Tests (SEC-002)", () => {
  describe("Transaction-based Migration", () => {
    const TEST_DIR = join(tmpdir(), `lex-encrypt-test-${Date.now()}`);
    const SOURCE_DB_PATH = join(TEST_DIR, "source.db");
    const DEST_DB_PATH = join(TEST_DIR, "dest-encrypted.db");
    const TEST_PASSPHRASE = "test-passphrase-secure-123";

    before(() => {
      if (!existsSync(TEST_DIR)) {
        mkdirSync(TEST_DIR, { recursive: true });
      }
    });

    after(() => {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
      }
    });

    test("should migrate database using transactions for atomicity", () => {
      const sourceDb = new Database(SOURCE_DB_PATH);
      initializeDatabase(sourceDb);

      const testFrames: Frame[] = Array.from({ length: 100 }, (_, i) => ({
        id: `frame-${String(i).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["core"],
        summary_caption: `Test frame ${i}`,
        reference_point: `test reference ${i}`,
        status_snapshot: { next_action: `action ${i}` },
        keywords: [`keyword-${i}`],
      }));

      for (const frame of testFrames) {
        saveFrame(sourceDb, frame);
      }

      const sourceCount = (
        sourceDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(sourceCount, 100, "Source should have 100 frames");
      sourceDb.close();

      // Perform migration with transaction-wrapped inserts
      const sourceDbRead = new Database(SOURCE_DB_PATH, { readonly: true });
      const destDb = new Database(DEST_DB_PATH);
      const encryptionKey = deriveEncryptionKey(TEST_PASSPHRASE);

      destDb.pragma(`cipher='sqlcipher'`);
      destDb.pragma(`key="x'${encryptionKey}'"`);
      initializeDatabase(destDb);

      const tableNames = sourceDbRead
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'"
        )
        .all() as Array<{ name: string }>;

      const validTableNamePattern = /^[a-zA-Z0-9_]+$/;

      for (const { name } of tableNames) {
        if (!validTableNamePattern.test(name)) {
          throw new Error(`Invalid table name detected: ${name}`);
        }
        const rows = sourceDbRead.prepare(`SELECT * FROM ${name}`).all();
        if (rows.length > 0) {
          const columns = Object.keys(rows[0] as Record<string, unknown>);
          const placeholders = columns.map(() => "?").join(", ");
          const stmt = destDb.prepare(
            `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`
          );

          const insertAllRows = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
            for (const row of rowsToInsert) {
              const values = columns.map((col) => row[col]);
              stmt.run(...values);
            }
          });

          insertAllRows(rows as Record<string, unknown>[]);
        }
      }

      sourceDbRead.close();
      destDb.close();

      // Verify encrypted database has all data
      const verifyDb = new Database(DEST_DB_PATH);
      verifyDb.pragma(`cipher='sqlcipher'`);
      verifyDb.pragma(`key="x'${encryptionKey}'"`);

      const destCount = (
        verifyDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(destCount, 100, "Destination should have 100 frames");

      verifyDb.close();

      if (existsSync(SOURCE_DB_PATH)) unlinkSync(SOURCE_DB_PATH);
      if (existsSync(DEST_DB_PATH)) unlinkSync(DEST_DB_PATH);
    });

    test("should rollback table on insert failure (transaction atomicity)", () => {
      const sourceDbPath = join(TEST_DIR, "source-rollback.db");
      const destDbPath = join(TEST_DIR, "dest-rollback.db");

      const sourceDb = new Database(sourceDbPath);
      initializeDatabase(sourceDb);

      for (let i = 0; i < 10; i++) {
        saveFrame(sourceDb, {
          id: `frame-${i}`,
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["core"],
          summary_caption: `Test frame ${i}`,
          reference_point: `test reference ${i}`,
          status_snapshot: { next_action: `action ${i}` },
        });
      }
      sourceDb.close();

      const sourceDbRead = new Database(sourceDbPath, { readonly: true });
      const destDb = new Database(destDbPath);
      const encryptionKey = deriveEncryptionKey(TEST_PASSPHRASE);

      destDb.pragma(`cipher='sqlcipher'`);
      destDb.pragma(`key="x'${encryptionKey}'"`);
      initializeDatabase(destDb);

      const rows = sourceDbRead.prepare("SELECT * FROM frames").all() as Array<Record<string, unknown>>;
      const columns = Object.keys(rows[0]);

      const placeholders = columns.map(() => "?").join(", ");
      const stmt = destDb.prepare(
        `INSERT OR REPLACE INTO frames (${columns.join(", ")}) VALUES (${placeholders})`
      );

      let insertCount = 0;
      const failingTransaction = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
        for (const row of rowsToInsert) {
          insertCount++;
          if (insertCount > 5) {
            throw new Error("Simulated insert failure");
          }
          const values = columns.map((col) => row[col]);
          stmt.run(...values);
        }
      });

      assert.throws(
        () => failingTransaction(rows),
        /Simulated insert failure/,
        "Should throw simulated error"
      );

      sourceDbRead.close();

      const count = (
        destDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(count, 0, "Rollback should leave 0 frames (no partial data)");

      destDb.close();

      if (existsSync(sourceDbPath)) unlinkSync(sourceDbPath);
      if (existsSync(destDbPath)) unlinkSync(destDbPath);
    });
  });
});

/**
 * SEC-004: Session Management Tests
 *
 * Tests for progress reporting, batch processing, and dry-run mode
 * during database migrations.
 */
describe("Database Encryption Session Management (SEC-004)", () => {
  const testDir = join(tmpdir(), `lex-db-session-test-${Date.now()}`);
  const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

  function getTestEnv(dbPath: string, passphrase: string = "test-passphrase"): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "test",
      LEX_LOG_LEVEL: "silent",
      LEX_DB_PATH: dbPath,
      LEX_DB_KEY: passphrase,
      PATH: process.env.PATH,
    };
  }

  function createTestDatabaseWithFrames(dbPath: string, frameCount: number): void {
    const originalKey = process.env.LEX_DB_KEY;
    delete process.env.LEX_DB_KEY;
    
    try {
      const db = createDatabase(dbPath);
      for (let i = 0; i < frameCount; i++) {
        const testFrame: Frame = {
          id: `test-frame-${randomUUID()}`,
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["test"],
          summary_caption: `Test frame ${i}`,
          reference_point: `reference ${i}`,
          status_snapshot: {
            next_action: `Action ${i}`,
          },
        };
        saveFrame(db, testFrame);
      }
      db.close();
    } finally {
      if (originalKey !== undefined) {
        process.env.LEX_DB_KEY = originalKey;
      }
    }
  }

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Dry-run Mode", () => {
    test("should analyze database without writing in dry-run mode", () => {
      const subDir = join(testDir, "dry-run-no-write");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 5);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--dry-run"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      // Verify dry-run output
      assert.match(result, /\[DRY RUN\]/, "Should indicate dry-run mode");
      assert.match(result, /5 frames to migrate/, "Should show frame count");
      assert.match(result, /Estimated migration time/, "Should show estimated time");
      
      // Verify no output file was created
      assert.ok(!existsSync(outputPath), "Output file should not exist in dry-run mode");
    });

    test("should return JSON output in dry-run mode with --json", () => {
      const subDir = join(testDir, "dry-run-json");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 10);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "--json", "db", "encrypt", "--input", inputPath, "--output", outputPath, "--dry-run"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      const json = JSON.parse(result.trim());
      assert.ok(json.success, "Operation should succeed");
      assert.strictEqual(json.dry_run, true, "Should indicate dry_run in JSON");
      assert.strictEqual(json.frames_count, 10, "Should report correct frame count");
      assert.ok(Array.isArray(json.tables), "Should include tables array");
      assert.ok(json.estimated_duration_ms !== undefined, "Should include estimated_duration_ms");
    });

    test("should not require passphrase for dry-run mode", () => {
      const subDir = join(testDir, "dry-run-no-passphrase");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 3);
      
      // Run without LEX_DB_KEY
      const env = {
        NODE_ENV: "test",
        LEX_LOG_LEVEL: "silent",
        LEX_DB_PATH: inputPath,
        PATH: process.env.PATH,
      };
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--dry-run"],
        { encoding: "utf-8", env }
      );
      
      assert.match(result, /\[DRY RUN\]/, "Should work without passphrase in dry-run mode");
    });
  });

  describe("Batch Size", () => {
    test("should encrypt with batch size option", () => {
      const subDir = join(testDir, "batch-size");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 25);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--batch-size", "5", "--no-backup"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      assert.match(result, /Batch size: 5 rows/, "Should show batch size");
      assert.match(result, /25 frames/, "Should show frame count");
      assert.ok(existsSync(outputPath), "Encrypted output should exist");
      
      // Verify encrypted database has all data
      const encryptionKey = deriveEncryptionKey("test-passphrase");
      const verifyDb = new Database(outputPath);
      verifyDb.pragma(`cipher='sqlcipher'`);
      verifyDb.pragma(`key="x'${encryptionKey}'"`);
      
      const count = (verifyDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }).count;
      assert.strictEqual(count, 25, "All frames should be migrated");
      
      verifyDb.close();
    });

    test("should include batch_size in JSON output", () => {
      const subDir = join(testDir, "batch-size-json");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 10);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "--json", "db", "encrypt", "--input", inputPath, "--output", outputPath, "--batch-size", "3", "--no-backup"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      const json = JSON.parse(result.trim());
      assert.ok(json.success, "Operation should succeed");
      assert.strictEqual(json.batch_size, 3, "Should include batch_size in JSON output");
      assert.strictEqual(json.rows_migrated, 10, "Should report correct frame count");
    });
  });

  describe("Progress Indicator", () => {
    test("should show progress when --progress option is used", () => {
      const subDir = join(testDir, "progress-indicator");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 15);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--progress", "--no-backup"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      // Progress lines contain "Migrating" text
      assert.match(result, /Migrating/, "Should show progress updates");
      assert.match(result, /frames/, "Should reference frames table");
      assert.ok(existsSync(outputPath), "Encrypted output should exist");
    });

    test("should work with progress and batch-size combined", () => {
      const subDir = join(testDir, "progress-batch");
      mkdirSync(subDir, { recursive: true });
      const inputPath = join(subDir, "test.db");
      const outputPath = join(subDir, "test-encrypted.db");
      
      createTestDatabaseWithFrames(inputPath, 20);
      
      const result = execFileSync(
        process.execPath,
        [lexBin, "db", "encrypt", "--input", inputPath, "--output", outputPath, "--progress", "--batch-size", "5", "--no-backup", "--verify"],
        { encoding: "utf-8", env: getTestEnv(inputPath) }
      );
      
      assert.match(result, /Batch size: 5 rows/, "Should show batch size");
      assert.match(result, /Migrating/, "Should show progress updates");
      assert.match(result, /Verified:/, "Should verify data");
      assert.ok(existsSync(outputPath), "Encrypted output should exist");
    });
  });
});
