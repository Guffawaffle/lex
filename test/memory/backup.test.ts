/**
 * Tests for database backup and maintenance functionality
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase } from "@app/memory/store/db.js";
import { vacuumDatabase, backupDatabase, rotateBackups } from "@app/memory/store/backup.js";

const testDir = join(tmpdir(), "lex-backup-test-" + Date.now());
const testDbPath = join(testDir, "test.db");
const testBackupDir = join(testDir, "backups");

describe("Database backup and maintenance", () => {
  beforeEach(() => {
    // Clean up and create fresh test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testBackupDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should vacuum database successfully", () => {
    const db = createDatabase(testDbPath);
    
    // Vacuum should complete without error
    assert.doesNotThrow(() => {
      vacuumDatabase(db);
    });
    
    db.close();
  });

  it("should create timestamped backup file", () => {
    // Create a database
    const db = createDatabase(testDbPath);
    db.close();

    // Create backup
    const backupPath = backupDatabase(testDbPath, testBackupDir);
    
    // Verify backup was created
    assert.ok(existsSync(backupPath), "Backup file should exist");
    
    // Verify backup filename format (memory-YYYYMMDD.sqlite)
    const filename = backupPath.split("/").pop() || "";
    assert.match(filename, /^memory-\d{8}\.sqlite$/, "Backup filename should match format");
    
    // Verify backup is a valid database file (has non-zero size)
    const stats = statSync(backupPath);
    assert.ok(stats.size > 0, "Backup file should not be empty");
  });

  it("should rotate backups and keep only newest N files", async () => {
    // Create a database
    const db = createDatabase(testDbPath);
    db.close();

    // Create multiple backups with different timestamps
    const backups = [
      join(testBackupDir, "memory-20251101.sqlite"),
      join(testBackupDir, "memory-20251102.sqlite"),
      join(testBackupDir, "memory-20251103.sqlite"),
      join(testBackupDir, "memory-20251104.sqlite"),
      join(testBackupDir, "memory-20251105.sqlite"),
    ];

    // Create dummy backup files with delays to ensure different mtimes
    for (let i = 0; i < backups.length; i++) {
      writeFileSync(backups[i], `backup ${i}`);
      // Small delay to ensure different mtimes
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Rotate to keep only 3 newest
    rotateBackups(testBackupDir, 3);

    // Check remaining files
    const remaining = readdirSync(testBackupDir)
      .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"))
      .sort();
    
    assert.strictEqual(remaining.length, 3, "Should keep only 3 backups");
    
    // Verify the newest backups were kept (by mtime)
    // Since we created files in order with delays, the last 3 should be kept
    assert.ok(remaining.includes("memory-20251103.sqlite"), "Third backup should be kept");
    assert.ok(remaining.includes("memory-20251104.sqlite"), "Fourth backup should be kept");
    assert.ok(remaining.includes("memory-20251105.sqlite"), "Newest backup should be kept");
  });

  it("should create backup and rotate in one call", () => {
    // Create a database
    const db = createDatabase(testDbPath);
    db.close();

    // Create some old backups
    writeFileSync(join(testBackupDir, "memory-20251001.sqlite"), "old backup 1");
    writeFileSync(join(testBackupDir, "memory-20251002.sqlite"), "old backup 2");
    writeFileSync(join(testBackupDir, "memory-20251003.sqlite"), "old backup 3");

    // Create new backup with rotation (keep 2)
    backupDatabase(testDbPath, testBackupDir, 2);

    // Check remaining files
    const remaining = readdirSync(testBackupDir)
      .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"));
    
    assert.strictEqual(remaining.length, 2, "Should keep only 2 backups after rotation");
  });

  it("should ignore non-backup files during rotation", () => {
    // Create a database
    const db = createDatabase(testDbPath);
    db.close();

    // Create backups and other files
    writeFileSync(join(testBackupDir, "memory-20251101.sqlite"), "backup 1");
    writeFileSync(join(testBackupDir, "memory-20251102.sqlite"), "backup 2");
    writeFileSync(join(testBackupDir, "other-file.txt"), "not a backup");
    writeFileSync(join(testBackupDir, "memory-backup.db"), "wrong extension");

    // Rotate to keep 1
    rotateBackups(testBackupDir, 1);

    // Check that only backup files were affected
    assert.ok(existsSync(join(testBackupDir, "other-file.txt")), "Other file should remain");
    assert.ok(existsSync(join(testBackupDir, "memory-backup.db")), "Wrong extension file should remain");
    
    // Only 1 backup file should remain
    const backups = readdirSync(testBackupDir)
      .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"));
    assert.strictEqual(backups.length, 1, "Should keep only 1 backup");
  });
});
