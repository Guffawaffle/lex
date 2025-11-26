/**
 * Tests for database encryption backup and atomic file creation (SEC-003)
 *
 * Tests that:
 * 1. Backup is created by default before encryption
 * 2. Backup can be disabled with --no-backup
 * 3. Atomic file creation via temp+rename pattern
 * 4. Cleanup of temp file on error
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "node:child_process";
import { createDatabase } from "@app/memory/store/db.js";
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
