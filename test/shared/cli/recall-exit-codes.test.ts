/**
 * Test for CLI-004: recall exit code behavior
 *
 * Tests that:
 * - recall with no matches exits with code 0 (not 1)
 * - recall with --strict exits with code 1 on no matches
 * - JSON mode returns explicit empty results
 */

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-recall-exit-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

function getTestEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LEX_LOG_LEVEL: "silent",
    LEX_POLICY_PATH: join(testDir, "lexmap.policy.json"),
    LEX_DB_PATH: testDbPath,
    LEX_DEFAULT_BRANCH: "test-branch",
    PATH: process.env.PATH,
  };
}

function setupTest() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });

  const policyPath = join(testDir, "lexmap.policy.json");
  const policy = {
    modules: {
      "ui/admin-panel": {
        owns_paths: ["web-ui/admin/**"],
      },
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

test("CLI-004: recall with no matches exits with code 0", () => {
  setupTest();
  try {
    const result = spawnSync(process.execPath, [lexBin, "recall", "nonexistent topic"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 0, "Should exit with code 0 when no matches found");
    const output = result.stdout + result.stderr;
    assert.match(output, /No frames found matching/, "Should indicate no frames found");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall with --strict and no matches exits with code 1", () => {
  setupTest();
  try {
    const result = spawnSync(
      process.execPath,
      [lexBin, "recall", "--strict", "nonexistent topic"],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.strictEqual(result.status, 1, "Should exit with code 1 with --strict flag");
    const output = result.stdout + result.stderr;
    assert.match(output, /No frames found matching/, "Should indicate no frames found");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall --json with no matches returns empty array and exits 0", () => {
  setupTest();
  try {
    const result = spawnSync(process.execPath, [lexBin, "--json", "recall", "nonexistent topic"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 0, "Should exit with code 0 in JSON mode");
    const json = JSON.parse(result.stdout.trim());
    assert.ok(Array.isArray(json.frames), "Should have frames array");
    assert.strictEqual(json.frames.length, 0, "Frames array should be empty");
    assert.strictEqual(json.matchCount, 0, "Should have matchCount of 0");
    assert.strictEqual(json.query, "nonexistent topic", "Should include query");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall --list with empty DB exits with code 0", () => {
  setupTest();
  try {
    const result = spawnSync(process.execPath, [lexBin, "recall", "--list"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 0, "Should exit with code 0 when DB is empty");
    const output = result.stdout + result.stderr;
    assert.match(output, /No frames found/, "Should indicate no frames found");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall --list --strict with empty DB exits with code 1", () => {
  setupTest();
  try {
    const result = spawnSync(process.execPath, [lexBin, "recall", "--list", "--strict"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 1, "Should exit with code 1 with --strict flag");
    const output = result.stdout + result.stderr;
    assert.match(output, /No frames found/, "Should indicate no frames found");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall with matches exits with code 0", () => {
  setupTest();
  try {
    // Create a frame first
    spawnSync(
      process.execPath,
      [
        lexBin,
        "remember",
        "--reference-point",
        "test frame for recall",
        "--summary",
        "Test summary",
        "--next",
        "Test next action",
        "--modules",
        "ui/admin-panel",
      ],
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Now recall it
    const result = spawnSync(process.execPath, [lexBin, "recall", "test frame for recall"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 0, "Should exit with code 0 when frames found");
    const output = result.stdout + result.stderr;
    assert.match(output, /test frame for recall/, "Should show the frame");
  } finally {
    cleanup();
  }
});

test("CLI-004: recall --json --list with empty DB returns empty array", () => {
  setupTest();
  try {
    const result = spawnSync(process.execPath, [lexBin, "--json", "recall", "--list"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.strictEqual(result.status, 0, "Should exit with code 0");
    const json = JSON.parse(result.stdout.trim());
    assert.ok(Array.isArray(json.frames), "Should have frames array");
    assert.strictEqual(json.frames.length, 0, "Frames array should be empty");
    assert.strictEqual(json.matchCount, 0, "Should have matchCount of 0");
    assert.strictEqual(json.query, null, "Query should be null for list mode");
  } finally {
    cleanup();
  }
});
