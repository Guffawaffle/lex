/**
 * ⚠️  WARNING: THIS FILE IS EXCLUDED FROM `npm test` ⚠️
 *
 * This file executes git commands and is NOT acceptable in the main test path.
 * Reason: This environment uses mandatory interactive GPG signing for commits,
 * which causes these tests to hang indefinitely.
 *
 * To run these tests explicitly: npm run test:git
 *
 * Tests for lex frames export command
 *
 * Test Mode Configuration:
 * - LEX_CLI_EXPORT_TEST_MODE=fast  : Reduced workload (~10 frames, completes in seconds)
 * - LEX_CLI_EXPORT_TEST_MODE=full  : Full workload (150 frames, takes ~30s)
 * - Default: full
 */

import { test } from "node:test";
import assert from "node:assert";
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-export-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const exportDir = join(testDir, "export");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

/**
 * Get test workload configuration based on LEX_CLI_EXPORT_TEST_MODE
 * - fast: 10 frames (completes in ~2s, shows 1 progress update)
 * - full: 150 frames (completes in ~30s, shows multiple progress updates)
 * - Default: full
 */
function getTestWorkload(): { frameCount: number; mode: string } {
  const testMode = process.env.LEX_CLI_EXPORT_TEST_MODE || "full";

  if (testMode === "fast") {
    return { frameCount: 10, mode: "fast" };
  }

  // Default to full workload
  return { frameCount: 150, mode: "full" };
}

// Create safe test environment
function getTestEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LEX_LOG_LEVEL: "silent",
    LEX_POLICY_PATH: join(testDir, "lexmap.policy.json"),
    LEX_DB_PATH: testDbPath,
    LEX_WORKSPACE_ROOT: testDir,
    PATH: process.env.PATH,
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
      },
      "services/user-api": {
        owns_paths: ["backend/users/**"],
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

// Helper to create test frames
function createTestFrame(options: {
  reference: string;
  summary: string;
  jira?: string;
  branch?: string;
  modules?: string;
}) {
  const args = [
    lexBin,
    "remember",
    "--reference-point",
    options.reference,
    "--summary",
    options.summary,
    "--next",
    "Test action",
    "--modules",
    options.modules || "ui/admin-panel",
  ];

  if (options.jira) {
    args.push("--jira", options.jira);
  }

  execFileSync(process.execPath, args, { encoding: "utf-8", env: getTestEnv() });
}

test("CLI: lex frames export exports all frames as JSON by default", () => {
  setupTest();
  try {
    // Create test frames
    createTestFrame({
      reference: "frame 1",
      summary: "First frame",
      jira: "TICKET-100",
    });
    createTestFrame({
      reference: "frame 2",
      summary: "Second frame",
      jira: "TICKET-100",
    });

    // Export frames
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported 2 frames/, "Should export 2 frames");
    assert.match(output, /Format: json/, "Should use JSON format");

    // Check files were created
    const todayDir = join(exportDir, new Date().toISOString().split("T")[0]);
    assert.ok(existsSync(todayDir), "Date directory should exist");

    const files = readdirSync(todayDir);
    assert.strictEqual(files.length, 2, "Should have 2 JSON files");

    // Verify JSON content
    const frame1Path = join(todayDir, files[0]);
    const frame1 = JSON.parse(readFileSync(frame1Path, "utf-8"));
    assert.ok(frame1.id, "Frame should have id");
    assert.ok(frame1.timestamp, "Frame should have timestamp");
    assert.ok(frame1.reference_point, "Frame should have reference_point");
    assert.ok(frame1.summary_caption, "Frame should have summary_caption");
    assert.ok(frame1.status_snapshot, "Frame should have status_snapshot");
    assert.ok(frame1.module_scope, "Frame should have module_scope");
    assert.ok(frame1.branch, "Frame should have branch");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export with --format=ndjson exports as NDJSON", () => {
  setupTest();
  try {
    // Create test frames
    createTestFrame({
      reference: "ndjson frame 1",
      summary: "First NDJSON frame",
    });
    createTestFrame({
      reference: "ndjson frame 2",
      summary: "Second NDJSON frame",
    });

    // Export frames as NDJSON
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir, "--format", "ndjson"],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported 2 frames/, "Should export 2 frames");
    assert.match(output, /Format: ndjson/, "Should use NDJSON format");

    // Check NDJSON file was created
    const todayDir = join(exportDir, new Date().toISOString().split("T")[0]);
    assert.ok(existsSync(todayDir), "Date directory should exist");

    const ndjsonPath = join(todayDir, "frames.ndjson");
    assert.ok(existsSync(ndjsonPath), "NDJSON file should exist");

    // Verify NDJSON content
    const content = readFileSync(ndjsonPath, "utf-8");
    const lines = content.trim().split("\n");
    assert.strictEqual(lines.length, 2, "Should have 2 lines");

    const frame1 = JSON.parse(lines[0]);
    const frame2 = JSON.parse(lines[1]);
    assert.ok(frame1.id, "First frame should have id");
    assert.ok(frame2.id, "Second frame should have id");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export --since filters by date", () => {
  setupTest();
  try {
    // Create test frames
    createTestFrame({
      reference: "old frame",
      summary: "Old frame",
    });

    // Wait a moment to ensure timestamp difference
    const cutoffDate = new Date();
    cutoffDate.setSeconds(cutoffDate.getSeconds() + 1);

    // Sleep to ensure timestamp difference
    const startTime = Date.now();
    while (Date.now() - startTime < 1500) {
      // busy wait
    }

    createTestFrame({
      reference: "new frame",
      summary: "New frame",
    });

    // Export only frames since cutoff date
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir, "--since", cutoffDate.toISOString()],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported 1 frame/, "Should export 1 frame");

    // Check only 1 file was created
    const todayDir = join(exportDir, new Date().toISOString().split("T")[0]);
    const files = readdirSync(todayDir);
    assert.strictEqual(files.length, 1, "Should have 1 JSON file");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export --since supports duration format", () => {
  setupTest();
  try {
    // Create test frames
    createTestFrame({
      reference: "duration test",
      summary: "Duration test",
    });

    // Export frames from last 7 days
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir, "--since", "7d"],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported 1 frame/, "Should export 1 frame");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export --jira filters by Jira ticket", () => {
  setupTest();
  try {
    // Create test frames with different Jira tickets
    createTestFrame({
      reference: "frame for TICKET-200",
      summary: "Frame 1",
      jira: "TICKET-200",
    });
    createTestFrame({
      reference: "frame for TICKET-201",
      summary: "Frame 2",
      jira: "TICKET-201",
    });

    // Export only frames for TICKET-200
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir, "--jira", "TICKET-200"],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported 1 frame/, "Should export 1 frame");

    // Verify the correct frame was exported
    const todayDir = join(exportDir, new Date().toISOString().split("T")[0]);
    const files = readdirSync(todayDir);
    assert.strictEqual(files.length, 1, "Should have 1 JSON file");

    const framePath = join(todayDir, files[0]);
    const frame = JSON.parse(readFileSync(framePath, "utf-8"));
    assert.strictEqual(frame.jira, "TICKET-200", "Frame should have correct Jira ticket");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export --branch filters by branch", () => {
  setupTest();
  try {
    // Get current branch
    let currentBranch = "main";
    try {
      currentBranch = execSync("git branch --show-current", {
        cwd: testDir,
        encoding: "utf-8",
      }).trim();
    } catch {
      // If not in a git repo, frames will use "unknown" as default branch
      currentBranch = "unknown";
    }

    // Create test frames (they'll automatically use current branch)
    createTestFrame({
      reference: "branch test frame",
      summary: "Branch test",
    });

    // Export frames for current branch
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir, "--branch", currentBranch],
      { encoding: "utf-8", env: getTestEnv() }
    );

    assert.match(output, /Exported \d+ frame/, "Should export at least 1 frame");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export with --json outputs JSON", () => {
  setupTest();
  try {
    // Create test frame
    createTestFrame({
      reference: "json output test",
      summary: "JSON output",
    });

    // Export with JSON output
    const output = execFileSync(
      process.execPath,
      [lexBin, "--json", "frames", "export", "--out", exportDir],
      { encoding: "utf-8", env: getTestEnv() }
    );

    const json = JSON.parse(output.trim());
    assert.strictEqual(json.success, true, "JSON should indicate success");
    assert.strictEqual(json.count, 1, "JSON should show count of 1");
    assert.ok(json.outputDir, "JSON should contain outputDir");
    assert.strictEqual(json.format, "json", "JSON should show format");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export creates date-based subdirectories", () => {
  setupTest();
  try {
    // Create test frame
    createTestFrame({
      reference: "date dir test",
      summary: "Date directory test",
    });

    // Export frames
    execFileSync(process.execPath, [lexBin, "frames", "export", "--out", exportDir], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    // Verify date-based directory was created
    const todayDir = join(exportDir, new Date().toISOString().split("T")[0]);
    assert.ok(existsSync(todayDir), "Date directory should exist");
    assert.match(todayDir, /\d{4}-\d{2}-\d{2}/, "Directory should be named with ISO date");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export with no frames exports 0", () => {
  setupTest();
  try {
    // Export with no frames in database
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Exported 0 frames/, "Should export 0 frames");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export shows progress for large exports", () => {
  setupTest();
  try {
    const workload = getTestWorkload();
    // Create test frames based on configured workload
    // fast mode: 10 frames - still enough to test progress logic
    // full mode: 150 frames - comprehensive test of progress indicators
    for (let i = 0; i < workload.frameCount; i++) {
      createTestFrame({
        reference: `bulk frame ${i}`,
        summary: `Bulk frame ${i}`,
      });
    }

    // Export frames
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "export", "--out", exportDir],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    // Verify output based on workload
    if (workload.mode === "fast") {
      // In fast mode, we won't hit 100 frames but should still complete successfully
      assert.match(output, /Exported 10 frames/, "Should show final count of 10 frames");
    } else {
      // In full mode, verify progress indicators at 100 frames
      assert.match(output, /Exported 100 frames\.\.\./, "Should show progress at 100 frames");
      assert.match(output, /Exported 150 frames/, "Should show final count of 150 frames");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export test mode configuration - fast mode", () => {
  setupTest();
  try {
    // Temporarily set test mode to fast
    const originalMode = process.env.LEX_CLI_EXPORT_TEST_MODE;
    process.env.LEX_CLI_EXPORT_TEST_MODE = "fast";

    const workload = getTestWorkload();
    assert.strictEqual(workload.mode, "fast", "Should be in fast mode");
    assert.strictEqual(workload.frameCount, 10, "Should use reduced workload");

    // Restore original mode
    if (originalMode) {
      process.env.LEX_CLI_EXPORT_TEST_MODE = originalMode;
    } else {
      delete process.env.LEX_CLI_EXPORT_TEST_MODE;
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export test mode configuration - full mode", () => {
  setupTest();
  try {
    // Temporarily set test mode to full
    const originalMode = process.env.LEX_CLI_EXPORT_TEST_MODE;
    process.env.LEX_CLI_EXPORT_TEST_MODE = "full";

    const workload = getTestWorkload();
    assert.strictEqual(workload.mode, "full", "Should be in full mode");
    assert.strictEqual(workload.frameCount, 150, "Should use full workload");

    // Restore original mode
    if (originalMode) {
      process.env.LEX_CLI_EXPORT_TEST_MODE = originalMode;
    } else {
      delete process.env.LEX_CLI_EXPORT_TEST_MODE;
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames export test mode configuration - default to full", () => {
  setupTest();
  try {
    // Save and clear test mode
    const originalMode = process.env.LEX_CLI_EXPORT_TEST_MODE;
    delete process.env.LEX_CLI_EXPORT_TEST_MODE;

    const workload = getTestWorkload();
    assert.strictEqual(workload.mode, "full", "Should default to full mode");
    assert.strictEqual(workload.frameCount, 150, "Should use full workload by default");

    // Restore original mode
    if (originalMode) {
      process.env.LEX_CLI_EXPORT_TEST_MODE = originalMode;
    }
  } finally {
    cleanup();
  }
});
