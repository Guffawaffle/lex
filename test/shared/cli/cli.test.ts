/**
 * CLI Tests
 *
 * Tests for lex remember, lex recall, and lex check commands
 */

import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-cli-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

// Create safe test environment (isolated from process.env to prevent shell injection)
function getTestEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LEX_LOG_LEVEL: "silent",
    LEX_POLICY_PATH: join(testDir, "lexmap.policy.json"),
    LEX_DB_PATH: testDbPath,
    PATH: process.env.PATH, // Only inherit PATH for node resolution
  };
}

// Setup test environment
function setupTest() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });

  // Create a minimal policy file for testing
  const policyPath = join(testDir, "lexmap.policy.json");
  const policy = {
    modules: {
      "ui/admin-panel": {
        owns_paths: ["web-ui/admin/**"],
      },
      "services/auth-core": {
        owns_paths: ["backend/auth/**"],
        forbidden_callers: ["ui/**"],
      },
      "services/user-api": {
        owns_paths: ["backend/users/**"],
      },
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));

  // Set environment variable for policy path
  process.env.LEX_POLICY_PATH = policyPath;
  process.env.LEX_DB_PATH = testDbPath;
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  delete process.env.LEX_POLICY_PATH;
  delete process.env.LEX_DB_PATH;
}

test("CLI: lex --version shows version", () => {
  setupTest();
  try {
    const output = execSync(`node ${lexBin} --version`, { encoding: "utf-8" });
    assert.match(output, /\d+\.\d+\.\d+/, "Version should be in semver format");
  } finally {
    cleanup();
  }
});

test("CLI: lex --help shows help text", () => {
  setupTest();
  try {
    const output = execSync(`node ${lexBin} --help`, { encoding: "utf-8" });
    assert.match(output, /remember/, "Help should mention remember command");
    assert.match(output, /recall/, "Help should mention recall command");
    assert.match(output, /check/, "Help should mention check command");
  } finally {
    cleanup();
  }
});

test("CLI: lex remember with valid module_scope succeeds", () => {
  setupTest();
  try {
    const output = execSync(
      `node ${lexBin} remember ` +
        `--reference-point "test frame" ` +
        `--summary "Test summary" ` +
        `--next "Test next action" ` +
        `--modules "ui/admin-panel,services/user-api"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Frame created successfully/, "Should show success message");
    assert.match(output, /Frame ID:/, "Should show Frame ID");
  } finally {
    cleanup();
  }
});

test("CLI: lex remember with invalid module_scope fails", () => {
  setupTest();
  try {
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "test frame" ` +
        `--summary "Test summary" ` +
        `--next "Test next action" ` +
        `--modules "invalid-module"`,
      { encoding: "utf-8", env: getTestEnv() }
    );
    assert.fail("Should have thrown an error");
  } catch (error: any) {
    assert.match(
      error.stderr || error.stdout,
      /Module validation failed/,
      "Should show validation error"
    );
  } finally {
    cleanup();
  }
});

test("CLI: lex remember with --json outputs JSON", () => {
  setupTest();
  try {
    const output = execSync(
      `node ${lexBin} --json remember ` +
        `--reference-point "json test" ` +
        `--summary "JSON test" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    const json = JSON.parse(output.trim());
    assert.ok(json.id, "JSON should contain Frame ID");
    assert.ok(json.timestamp, "JSON should contain timestamp");
  } finally {
    cleanup();
  }
});

test("CLI: lex recall retrieves created frame", () => {
  setupTest();
  try {
    // Create a frame first
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "recall test frame" ` +
        `--summary "Test recall" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Recall it
    const output = execSync(`node ${lexBin} recall "recall test frame"`, {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.match(output, /recall test frame/, "Should show reference point");
    assert.match(output, /Test recall/, "Should show summary");
  } finally {
    cleanup();
  }
});

test("CLI: lex recall with --json outputs JSON", () => {
  setupTest();
  try {
    // Create a frame first
    execSync(
      `node ${lexBin} remember ` +
        `--reference-point "json recall test" ` +
        `--summary "JSON recall" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Recall it
    const output = execSync(`node ${lexBin} --json recall "json recall test"`, {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    const json = JSON.parse(output.trim());
    assert.ok(Array.isArray(json), "JSON should be an array");
    assert.ok(json.length > 0, "JSON should contain results");
    assert.ok(json[0].frame, "JSON should contain frame data");
  } finally {
    cleanup();
  }
});

test("CLI: lex check with no violations exits with 0", () => {
  setupTest();
  try {
    const mergedPath = join(testDir, "merged.json");
    const policyPath = join(testDir, "lexmap.policy.json");

    // Create a merged scanner output with no violations
    const merged = {
      sources: ["test"],
      files: [
        {
          path: "web-ui/admin/test.ts",
          module_scope: "ui/admin-panel",
          declarations: [],
          imports: [{ from: "services/user-api", type: "default" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };
    writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

    const output = execSync(`node ${lexBin} check ${mergedPath} ${policyPath}`, {
      encoding: "utf-8",
    });

    assert.match(output, /No policy violations/, "Should show no violations");
  } finally {
    cleanup();
  }
});

test("CLI: lex check with violations exits with 1", () => {
  setupTest();
  try {
    const mergedPath = join(testDir, "merged.json");
    const policyPath = join(testDir, "lexmap.policy.json");

    // Create a merged scanner output with violations
    const merged = {
      sources: ["test"],
      files: [
        {
          path: "web-ui/admin/test.ts",
          module_scope: "ui/admin-panel",
          declarations: [],
          imports: [{ from: "services/auth-core", type: "default" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };
    writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

    try {
      execSync(`node ${lexBin} check ${mergedPath} ${policyPath}`, { encoding: "utf-8" });
      assert.fail("Should have exited with code 1");
    } catch (error: any) {
      assert.strictEqual(error.status, 1, "Should exit with code 1");
      const output = error.stdout || error.stderr;
      assert.match(output, /violation/i, "Should mention violations");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex check with --json outputs JSON", () => {
  setupTest();
  try {
    const mergedPath = join(testDir, "merged.json");
    const policyPath = join(testDir, "lexmap.policy.json");

    // Create a merged scanner output with no violations
    const merged = {
      sources: ["test"],
      files: [],
    };
    writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

    const output = execSync(`node ${lexBin} --json check ${mergedPath} ${policyPath}`, {
      encoding: "utf-8",
    });

    const json = JSON.parse(output.trim());
    assert.ok(Array.isArray(json.violations), "JSON should contain violations array");
    assert.strictEqual(json.count, 0, "JSON should show count of 0");
  } finally {
    cleanup();
  }
});

test("CLI: lex timeline shows frames for a ticket", () => {
  setupTest();
  try {
    // Create multiple frames for the same ticket
    execSync(
      `node ${lexBin} remember ` +
        `--jira TICKET-123 ` +
        `--reference-point "frame 1" ` +
        `--summary "First frame" ` +
        `--next "Test action 1" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    execSync(
      `node ${lexBin} remember ` +
        `--jira TICKET-123 ` +
        `--reference-point "frame 2" ` +
        `--summary "Second frame" ` +
        `--next "Test action 2" ` +
        `--modules "ui/admin-panel,services/user-api"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Get timeline
    const output = execSync(`node ${lexBin} timeline TICKET-123`, {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.match(output, /TICKET-123/, "Should show ticket ID");
    assert.match(output, /First frame/, "Should show first frame");
    assert.match(output, /Second frame/, "Should show second frame");
    assert.match(output, /Module Scope Evolution/, "Should show module scope evolution");
  } finally {
    cleanup();
  }
});

test("CLI: lex timeline with --format=json outputs JSON", () => {
  setupTest();
  try {
    // Create a frame
    execSync(
      `node ${lexBin} remember ` +
        `--jira TICKET-456 ` +
        `--reference-point "json timeline test" ` +
        `--summary "JSON test" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Get timeline as JSON
    const output = execSync(`node ${lexBin} timeline TICKET-456 --format=json`, {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    const json = JSON.parse(output.trim());
    assert.ok(Array.isArray(json), "JSON should be an array");
    assert.ok(json.length > 0, "JSON should contain timeline entries");
    assert.ok(json[0].frame, "Entry should contain frame");
  } finally {
    cleanup();
  }
});

test("CLI: lex timeline shows blocker evolution", () => {
  setupTest();
  try {
    // Create frames with blockers
    execSync(
      `node ${lexBin} remember ` +
        `--jira TICKET-789 ` +
        `--reference-point "blocker test 1" ` +
        `--summary "Frame with blocker" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel" ` +
        `--blockers "CORS issue"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    execSync(
      `node ${lexBin} remember ` +
        `--jira TICKET-789 ` +
        `--reference-point "blocker test 2" ` +
        `--summary "Frame without blocker" ` +
        `--next "Test action" ` +
        `--modules "ui/admin-panel"`,
      { encoding: "utf-8", env: getTestEnv() }
    );

    // Get timeline
    const output = execSync(`node ${lexBin} timeline TICKET-789`, {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    assert.match(output, /CORS issue/, "Should show blocker");
    assert.match(output, /Blocker Tracking/, "Should show blocker tracking section");
  } finally {
    cleanup();
  }
});
