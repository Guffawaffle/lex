/**
 * Frames Export Tests
 *
 * Tests for the frames export command
 */

import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-frames-export-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

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
      },
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));

  // Set environment variables
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

// Helper to create test frames
function createTestFrame(jira?: string, branch?: string) {
  const cmd =
    `node ${lexBin} remember ` +
    `--reference-point "test frame ${Date.now()}" ` +
    `--summary "Test summary" ` +
    `--next "Test next action" ` +
    `--modules "ui/admin-panel" ` +
    (jira ? `--jira "${jira}" ` : "") +
    (branch ? `` : "");

  execSync(cmd, {
    encoding: "utf-8",
    env: { ...process.env, LEX_DB_PATH: testDbPath, GIT_BRANCH: branch || "test-branch" },
    cwd: testDir,
  });
}

test("Frames Export: export all frames to JSON format", () => {
  setupTest();
  try {
    // Create some test frames
    createTestFrame("TEST-1");
    createTestFrame("TEST-2");
    createTestFrame("TEST-3");

    const exportDir = join(testDir, "export-test");
    const output = execSync(`node ${lexBin} frames export --out ${exportDir}`, {
      encoding: "utf-8",
      env: { ...process.env, LEX_DB_PATH: testDbPath },
      cwd: testDir,
    });

    // Check output message
    assert.match(output, /Exported \d+ frame/, "Should show success message");

    // Check that export directory was created
    assert.ok(existsSync(exportDir), "Export directory should exist");

    // Get the date subdirectory
    const dateSubdirs = readdirSync(exportDir);
    assert.ok(dateSubdirs.length > 0, "Should have at least one date subdirectory");

    const dateDir = join(exportDir, dateSubdirs[0]);
    const files = readdirSync(dateDir);

    // Check that JSON files were created
    assert.ok(files.length >= 3, "Should have at least 3 exported frame files");
    assert.ok(
      files.every((f) => f.startsWith("frame-") && f.endsWith(".json")),
      "All files should be frame JSON files"
    );

    // Validate one of the exported frames
    const frameFile = files[0];
    const frameContent = readFileSync(join(dateDir, frameFile), "utf-8");
    const frame = JSON.parse(frameContent);

    // Validate frame structure
    assert.ok(frame.id, "Frame should have an id");
    assert.ok(frame.timestamp, "Frame should have a timestamp");
    assert.ok(frame.reference_point, "Frame should have a reference_point");
    assert.ok(frame.summary_caption, "Frame should have a summary_caption");
    assert.ok(frame.module_scope, "Frame should have module_scope");
    assert.ok(frame.status_snapshot, "Frame should have status_snapshot");
  } finally {
    cleanup();
  }
});

test("Frames Export: export frames in NDJSON format", () => {
  setupTest();
  try {
    // Create some test frames
    createTestFrame("TEST-1");
    createTestFrame("TEST-2");

    const exportDir = join(testDir, "export-ndjson-test");
    const output = execSync(
      `node ${lexBin} frames export --out ${exportDir} --format ndjson`,
      {
        encoding: "utf-8",
        env: { ...process.env, LEX_DB_PATH: testDbPath },
        cwd: testDir,
      }
    );

    // Check output message
    assert.match(output, /Exported \d+ frame/, "Should show success message");

    // Get the date subdirectory
    const dateSubdirs = readdirSync(exportDir);
    const dateDir = join(exportDir, dateSubdirs[0]);
    const files = readdirSync(dateDir);

    // Check that NDJSON file was created
    assert.ok(
      files.includes("frames.ndjson"),
      "Should have frames.ndjson file"
    );

    // Validate NDJSON content
    const ndjsonContent = readFileSync(join(dateDir, "frames.ndjson"), "utf-8");
    const lines = ndjsonContent.trim().split("\n");

    assert.ok(lines.length >= 2, "Should have at least 2 frames");

    // Each line should be valid JSON
    lines.forEach((line) => {
      const frame = JSON.parse(line);
      assert.ok(frame.id, "Each frame should have an id");
      assert.ok(frame.timestamp, "Each frame should have a timestamp");
    });
  } finally {
    cleanup();
  }
});

test("Frames Export: filter by Jira ticket", () => {
  setupTest();
  try {
    // Create frames with different Jira tickets
    createTestFrame("TEST-100");
    createTestFrame("TEST-200");
    createTestFrame("TEST-100"); // Same ticket as first

    const exportDir = join(testDir, "export-jira-test");
    execSync(`node ${lexBin} frames export --out ${exportDir} --jira TEST-100`, {
      encoding: "utf-8",
      env: { ...process.env, LEX_DB_PATH: testDbPath },
      cwd: testDir,
    });

    // Get the date subdirectory
    const dateSubdirs = readdirSync(exportDir);
    const dateDir = join(exportDir, dateSubdirs[0]);
    const files = readdirSync(dateDir).filter((f) => f.endsWith(".json"));

    // Should only have frames for TEST-100
    assert.strictEqual(files.length, 2, "Should export only frames with TEST-100");

    // Validate that all exported frames have correct jira
    files.forEach((file) => {
      const frame = JSON.parse(readFileSync(join(dateDir, file), "utf-8"));
      assert.strictEqual(frame.jira, "TEST-100", "Exported frame should have correct Jira ticket");
    });
  } finally {
    cleanup();
  }
});

test("Frames Export: filter by since duration (7d)", () => {
  setupTest();
  try {
    // Create a test frame
    createTestFrame("TEST-1");

    const exportDir = join(testDir, "export-since-test");
    const output = execSync(`node ${lexBin} frames export --out ${exportDir} --since 7d`, {
      encoding: "utf-8",
      env: { ...process.env, LEX_DB_PATH: testDbPath },
      cwd: testDir,
    });

    // Should export frames created in the last 7 days
    assert.match(output, /Exported \d+ frame/, "Should show success message");

    const dateSubdirs = readdirSync(exportDir);
    const dateDir = join(exportDir, dateSubdirs[0]);
    const files = readdirSync(dateDir).filter((f) => f.endsWith(".json"));

    assert.ok(files.length >= 1, "Should export at least 1 frame created in last 7 days");
  } finally {
    cleanup();
  }
});

test("Frames Export: JSON output format", () => {
  setupTest();
  try {
    // Create a test frame
    createTestFrame("TEST-1");

    const exportDir = join(testDir, "export-json-output-test");
    const output = execSync(`node ${lexBin} frames export --out ${exportDir} --json`, {
      encoding: "utf-8",
      env: { ...process.env, LEX_DB_PATH: testDbPath, LEX_LOG_LEVEL: "silent" },
      cwd: testDir,
    });

    // Parse JSON output
    const result = JSON.parse(output);

    assert.strictEqual(result.success, true, "Should indicate success");
    assert.ok(result.stats, "Should include stats");
    assert.ok(result.stats.totalFrames >= 1, "Should export at least 1 frame");
    assert.ok(result.stats.outputDir, "Should include output directory");
    assert.strictEqual(result.stats.format, "json", "Should indicate JSON format");
  } finally {
    cleanup();
  }
});

test("Frames Export: invalid since value should fail", () => {
  setupTest();
  try {
    const exportDir = join(testDir, "export-invalid-test");

    // Should throw an error with invalid since value
    assert.throws(
      () => {
        execSync(`node ${lexBin} frames export --out ${exportDir} --since invalid-date`, {
          encoding: "utf-8",
          env: { ...process.env, LEX_DB_PATH: testDbPath },
          cwd: testDir,
          stdio: "pipe",
        });
      },
      {
        message: /Invalid --since value/,
      },
      "Should fail with invalid --since value"
    );
  } finally {
    cleanup();
  }
});
