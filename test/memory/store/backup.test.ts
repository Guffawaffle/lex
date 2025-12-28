/**
 * Tests for database backup and maintenance
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  backupDatabase,
  vacuumDatabase,
  rotateBackups,
  generateBackupFilename,
  getBackupDir,
  getBackupRetention,
} from "@app/memory/store/backup.js";
import { createDatabase } from "@app/memory/store/db.js";

describe("Database Backup and Maintenance", () => {
  const originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
  const testWorkspaceRoot = join(tmpdir(), `lex-backup-test-${Date.now()}`);
  const testDbPath = join(testWorkspaceRoot, "test.db");

  before(() => {
    // Set up test workspace
    process.env.LEX_WORKSPACE_ROOT = testWorkspaceRoot;
    mkdirSync(testWorkspaceRoot, { recursive: true });

    // Create a test database
    const db = createDatabase(testDbPath);
    db.close();
  });

  after(() => {
    // Restore original env
    if (originalWorkspaceRoot) {
      process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
    } else {
      delete process.env.LEX_WORKSPACE_ROOT;
    }

    // Clean up test files
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
      const backupDir = getBackupDir(testWorkspaceRoot);
      if (existsSync(backupDir)) {
        const files = readdirSync(backupDir);
        files.forEach((file) => unlinkSync(join(backupDir, file)));
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should generate timestamped backup filename", () => {
    const date = new Date("2025-11-23T12:00:00.000Z");
    const filename = generateBackupFilename(date);
    assert.strictEqual(filename, "memory-20251123.sqlite");
  });

  test("should get backup directory", () => {
    const backupDir = getBackupDir(testWorkspaceRoot);
    assert.ok(existsSync(backupDir), "Backup directory should exist");
    assert.ok(
      backupDir.includes(".smartergpt/lex/backups"),
      "Backup directory should be in .smartergpt/lex/backups"
    );
  });

  test("should create database backup", () => {
    const backupPath = backupDatabase(testDbPath, 0, testWorkspaceRoot);
    assert.ok(existsSync(backupPath), "Backup file should exist");
    assert.ok(backupPath.includes("memory-"), "Backup filename should start with memory-");
    assert.ok(backupPath.endsWith(".sqlite"), "Backup filename should end with .sqlite");
  });

  test("should rotate backups keeping N most recent", () => {
    const backupDir = getBackupDir(testWorkspaceRoot);

    // Create 5 test backup files
    for (let i = 0; i < 5; i++) {
      const filename = `memory-2025112${i}.sqlite`;
      writeFileSync(join(backupDir, filename), "test data");
    }

    // Rotate, keeping only 3
    rotateBackups(backupDir, 3);

    const backups = readdirSync(backupDir).filter((f) => f.startsWith("memory-"));
    assert.strictEqual(backups.length, 3, "Should keep only 3 backups");
  });

  test("should backup with rotation", () => {
    const backupDir = getBackupDir(testWorkspaceRoot);

    // Create multiple backups
    for (let i = 0; i < 3; i++) {
      backupDatabase(testDbPath, 2, testWorkspaceRoot);
    }

    const backups = readdirSync(backupDir).filter((f) => f.startsWith("memory-"));
    assert.ok(backups.length <= 2, "Should keep at most 2 backups");
  });

  test("should get backup retention from environment", () => {
    const originalRetention = process.env.LEX_BACKUP_RETENTION;

    // Test default
    delete process.env.LEX_BACKUP_RETENTION;
    assert.strictEqual(getBackupRetention(), 7, "Default should be 7");

    // Test custom value
    process.env.LEX_BACKUP_RETENTION = "14";
    assert.strictEqual(getBackupRetention(), 14, "Should use env value");

    // Test invalid value falls back to default
    process.env.LEX_BACKUP_RETENTION = "invalid";
    assert.strictEqual(getBackupRetention(), 7, "Should fall back to 7 for invalid value");

    // Restore original
    if (originalRetention) {
      process.env.LEX_BACKUP_RETENTION = originalRetention;
    } else {
      delete process.env.LEX_BACKUP_RETENTION;
    }
  });

  test("should vacuum database", () => {
    const db = createDatabase(testDbPath);

    // Vacuum should not throw
    assert.doesNotThrow(() => {
      vacuumDatabase(db);
    });

    db.close();
  });
});
