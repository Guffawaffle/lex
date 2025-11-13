/**
 * Tests for CLI database commands (db vacuum, db backup)
 */

import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-cli-db-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const testBackupDir = join(testDir, "backups");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

// Setup test environment
function setupTest() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });
  mkdirSync(testBackupDir, { recursive: true });

  // Create a minimal policy file for testing
  const policyPath = join(testDir, "lexmap.policy.json");
  const policy = {
    modules: {
      "ui/admin-panel": {
        owns_paths: ["web-ui/admin/**"],
      },
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));

  // Set environment variables
  process.env.LEX_POLICY_PATH = policyPath;
  process.env.LEX_DB_PATH = testDbPath;
  process.env.LEX_LOG_LEVEL = "silent";
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  delete process.env.LEX_POLICY_PATH;
  delete process.env.LEX_DB_PATH;
  delete process.env.LEX_LOG_LEVEL;
}

test("CLI: lex db vacuum succeeds", () => {
  setupTest();
  try {
    // Create a frame first to have data in the database
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "vacuum test" ` +
        `--summary "Test" ` +
        `--next "Next action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run vacuum
    const output = execSync(`node ${lexBin} db vacuum`, {
      encoding: "utf-8",
      env: process.env,
    });

    assert.match(output, /vacuum completed/i, "Should show vacuum completed message");
    assert.match(output, new RegExp(testDbPath), "Should show database path");
  } finally {
    cleanup();
  }
});

test("CLI: lex db vacuum --json outputs JSON", () => {
  setupTest();
  try {
    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "vacuum json test" ` +
        `--summary "Test" ` +
        `--next "Next" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run vacuum with JSON output
    const output = execSync(`node ${lexBin} --json db vacuum`, {
      encoding: "utf-8",
      env: process.env,
    });

    const json = JSON.parse(output.trim());
    assert.strictEqual(json.success, true, "JSON should show success");
    assert.ok(json.dbPath, "JSON should contain database path");
  } finally {
    cleanup();
  }
});

test("CLI: lex db backup creates backup file", () => {
  setupTest();
  try {
    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "backup test" ` +
        `--summary "Test" ` +
        `--next "Next" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run backup
    const output = execSync(`node ${lexBin} db backup`, {
      encoding: "utf-8",
      env: process.env,
    });

    assert.match(output, /backup created/i, "Should show backup created message");
    assert.match(output, /Retention: 7 backups/, "Should show default retention");

    // Verify backup file was created
    const backupFiles = readdirSync(join(process.cwd(), ".smartergpt.local", "lex", "backups"))
      .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"));
    
    assert.ok(backupFiles.length > 0, "Backup file should be created");
    assert.match(backupFiles[0], /^memory-\d{8}\.sqlite$/, "Backup should have correct format");
  } finally {
    cleanup();
  }
});

test("CLI: lex db backup --rotate N sets retention", () => {
  setupTest();
  try {
    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "rotate test" ` +
        `--summary "Test" ` +
        `--next "Next" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run backup with custom rotation
    const output = execSync(`node ${lexBin} db backup --rotate 3`, {
      encoding: "utf-8",
      env: process.env,
    });

    assert.match(output, /Retention: 3 backups/, "Should show custom retention");
  } finally {
    cleanup();
  }
});

test("CLI: lex db backup --json outputs JSON", () => {
  setupTest();
  try {
    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "backup json test" ` +
        `--summary "Test" ` +
        `--next "Next" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run backup with JSON output
    const output = execSync(`node ${lexBin} --json db backup --rotate 5`, {
      encoding: "utf-8",
      env: process.env,
    });

    const json = JSON.parse(output.trim());
    assert.strictEqual(json.success, true, "JSON should show success");
    assert.ok(json.backupPath, "JSON should contain backup path");
    assert.ok(json.dbPath, "JSON should contain database path");
    assert.strictEqual(json.rotation, 5, "JSON should show rotation count");
  } finally {
    cleanup();
  }
});

test("CLI: lex db backup respects LEX_BACKUP_RETENTION", () => {
  setupTest();
  try {
    process.env.LEX_BACKUP_RETENTION = "10";

    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "env retention test" ` +
        `--summary "Test" ` +
        `--next "Next" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: process.env }
    );

    // Run backup without --rotate flag
    const output = execSync(`node ${lexBin} db backup`, {
      encoding: "utf-8",
      env: process.env,
    });

    assert.match(output, /Retention: 10 backups/, "Should use LEX_BACKUP_RETENTION env var");

    delete process.env.LEX_BACKUP_RETENTION;
  } finally {
    cleanup();
  }
});

test("CLI: lex db --help shows commands", () => {
  setupTest();
  try {
    const output = execSync(`node ${lexBin} db --help`, {
      encoding: "utf-8",
      env: process.env,
    });

    assert.match(output, /vacuum/, "Help should mention vacuum command");
    assert.match(output, /backup/, "Help should mention backup command");
  } finally {
    cleanup();
  }
});
