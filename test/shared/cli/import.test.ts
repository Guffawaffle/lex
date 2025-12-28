/**
 * Tests for lex frames import command
 */

import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-import-test-" + Date.now());
const testDbPath = join(testDir, "frames.db");
const importDir = join(testDir, "import");
const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

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
  mkdirSync(importDir, { recursive: true });

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
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// Helper to create a valid test frame
function createValidFrame(id: string, summary: string, modules: string[] = ["ui/admin-panel"]) {
  return {
    id: `frame-${id}`,
    timestamp: new Date().toISOString(),
    branch: "main",
    module_scope: modules,
    summary_caption: summary,
    reference_point: `ref-${id}`,
    status_snapshot: {
      next_action: "Test next action",
    },
  };
}

test("CLI: lex frames import requires either --from-dir or --from-file", () => {
  setupTest();
  try {
    // Try to import without specifying source
    try {
      execFileSync(process.execPath, [lexBin, "frames", "import"], {
        encoding: "utf-8",
        env: getTestEnv(),
      });
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: Buffer | string };
      assert.strictEqual(execError.status, 1, "Should exit with code 1");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import rejects both --from-dir and --from-file", () => {
  setupTest();
  try {
    const testFile = join(importDir, "test.json");
    writeFileSync(testFile, JSON.stringify(createValidFrame("1", "Test frame")));

    // Try to import with both options
    try {
      execFileSync(
        process.execPath,
        [lexBin, "frames", "import", "--from-dir", importDir, "--from-file", testFile],
        {
          encoding: "utf-8",
          env: getTestEnv(),
        }
      );
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number };
      assert.strictEqual(execError.status, 1, "Should exit with code 1");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --from-file imports single JSON file with single frame", () => {
  setupTest();
  try {
    const testFile = join(importDir, "single-frame.json");
    const frame = createValidFrame("1", "Single frame test");
    writeFileSync(testFile, JSON.stringify(frame, null, 2));

    // Import the frame
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Import complete/, "Should show import complete");
    assert.match(output, /Imported: 1/, "Should import 1 frame");

    // Verify the frame was imported
    const listOutput = execFileSync(process.execPath, [lexBin, "recall", "--list", "10"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });
    assert.match(listOutput, /Single frame test/, "Frame should be in database");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --from-file imports single JSON file with array of frames", () => {
  setupTest();
  try {
    const testFile = join(importDir, "array-frames.json");
    const frames = [
      createValidFrame("1", "First frame"),
      createValidFrame("2", "Second frame"),
      createValidFrame("3", "Third frame"),
    ];
    writeFileSync(testFile, JSON.stringify(frames, null, 2));

    // Import the frames
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Import complete/, "Should show import complete");
    assert.match(output, /Imported: 3/, "Should import 3 frames");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --from-dir imports all JSON files from directory", () => {
  setupTest();
  try {
    // Create multiple JSON files
    writeFileSync(join(importDir, "frame1.json"), JSON.stringify(createValidFrame("1", "Frame 1")));
    writeFileSync(join(importDir, "frame2.json"), JSON.stringify(createValidFrame("2", "Frame 2")));
    writeFileSync(
      join(importDir, "frames.json"),
      JSON.stringify([createValidFrame("3", "Frame 3"), createValidFrame("4", "Frame 4")])
    );

    // Import all frames
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-dir", importDir],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Import complete/, "Should show import complete");
    assert.match(output, /Imported: 4/, "Should import 4 frames");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --dry-run validates without writing", () => {
  setupTest();
  try {
    const testFile = join(importDir, "dry-run-test.json");
    const frames = [createValidFrame("1", "Frame 1"), createValidFrame("2", "Frame 2")];
    writeFileSync(testFile, JSON.stringify(frames, null, 2));

    // Run dry-run
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile, "--dry-run"],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Dry run/, "Should indicate dry run mode");
    assert.match(output, /2 frames valid/, "Should validate 2 frames");

    // Verify frames were NOT imported
    const listOutput = execFileSync(process.execPath, [lexBin, "recall", "--list", "10"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });
    assert.doesNotMatch(listOutput, /Frame 1/, "Frames should not be in database");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --skip-duplicates skips existing frames", () => {
  setupTest();
  try {
    const testFile = join(importDir, "skip-duplicates-test.json");
    const frame = createValidFrame("1", "Test frame");
    writeFileSync(testFile, JSON.stringify(frame, null, 2));

    // Import frame first time
    execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    // Import again with --skip-duplicates
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile, "--skip-duplicates"],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Skipped: 1/, "Should skip 1 frame");
    assert.match(output, /Imported: 0/, "Should import 0 frames");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import without --skip-duplicates or --merge errors on duplicates", () => {
  setupTest();
  try {
    const testFile = join(importDir, "duplicate-error-test.json");
    const frame = createValidFrame("1", "Test frame");
    writeFileSync(testFile, JSON.stringify(frame, null, 2));

    // Import frame first time
    execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    // Try to import again without flags
    try {
      execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
        encoding: "utf-8",
        env: getTestEnv(),
      });
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number };
      assert.strictEqual(execError.status, 1, "Should exit with code 1");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --merge updates existing frames", () => {
  setupTest();
  try {
    const testFile = join(importDir, "merge-test.json");
    const frame = createValidFrame("1", "Original summary");
    writeFileSync(testFile, JSON.stringify(frame, null, 2));

    // Import frame first time
    execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
      encoding: "utf-8",
      env: getTestEnv(),
    });

    // Update the frame
    frame.summary_caption = "Updated summary";
    writeFileSync(testFile, JSON.stringify(frame, null, 2));

    // Import again with --merge
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile, "--merge"],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Imported: 1/, "Should import 1 frame");

    // Verify the frame was updated
    const recallOutput = execFileSync(process.execPath, [lexBin, "recall", "frame-1"], {
      encoding: "utf-8",
      env: getTestEnv(),
    });
    assert.match(recallOutput, /Updated summary/, "Frame should have updated summary");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import validates frame schema", () => {
  setupTest();
  try {
    const testFile = join(importDir, "invalid-frame.json");
    // Create invalid frame (missing required fields)
    const invalidFrame = {
      id: "invalid-1",
      // Missing timestamp, branch, module_scope, etc.
    };
    writeFileSync(testFile, JSON.stringify(invalidFrame, null, 2));

    // Try to import invalid frame
    try {
      execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
        encoding: "utf-8",
        env: getTestEnv(),
      });
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number };
      assert.strictEqual(execError.status, 1, "Should exit with code 1");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import with --json outputs JSON", () => {
  setupTest();
  try {
    const testFile = join(importDir, "json-output-test.json");
    const frames = [createValidFrame("1", "Frame 1"), createValidFrame("2", "Frame 2")];
    writeFileSync(testFile, JSON.stringify(frames, null, 2));

    // Import with JSON output
    const output = execFileSync(
      process.execPath,
      [lexBin, "--json", "frames", "import", "--from-file", testFile],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    const json = JSON.parse(output.trim());
    assert.strictEqual(json.success, true, "JSON should indicate success");
    assert.strictEqual(json.imported, 2, "JSON should show 2 imported");
    assert.strictEqual(json.errors, 0, "JSON should show 0 errors");
    assert.ok("durationSeconds" in json, "JSON should include durationSeconds property");
    assert.strictEqual(typeof json.durationSeconds, "number", "durationSeconds should be a number");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import reports errors for invalid files", () => {
  setupTest();
  try {
    const testFile = join(importDir, "invalid.json");
    writeFileSync(testFile, "not valid json{");

    // Try to import invalid JSON
    try {
      execFileSync(process.execPath, [lexBin, "frames", "import", "--from-file", testFile], {
        encoding: "utf-8",
        env: getTestEnv(),
      });
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number };
      assert.strictEqual(execError.status, 1, "Should exit with code 1");
    }
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import handles empty directory", () => {
  setupTest();
  try {
    // Import from empty directory
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-dir", importDir],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /No valid frames found/, "Should indicate no frames found");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import shows progress for large imports", () => {
  setupTest();
  try {
    // Create a file with many frames
    const frames = [];
    for (let i = 0; i < 150; i++) {
      frames.push(createValidFrame(`${i}`, `Frame ${i}`));
    }

    const testFile = join(importDir, "large-import.json");
    writeFileSync(testFile, JSON.stringify(frames, null, 2));

    // Import frames
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-file", testFile],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Imported 100 frames\.\.\./, "Should show progress at 100 frames");
    assert.match(output, /Imported: 150/, "Should show final count of 150 frames");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import handles directory with non-JSON files", () => {
  setupTest();
  try {
    // Create mix of JSON and non-JSON files
    writeFileSync(join(importDir, "frame1.json"), JSON.stringify(createValidFrame("1", "Frame 1")));
    writeFileSync(join(importDir, "readme.txt"), "This is not JSON");
    writeFileSync(join(importDir, "frame2.json"), JSON.stringify(createValidFrame("2", "Frame 2")));

    // Import from directory
    const output = execFileSync(
      process.execPath,
      [lexBin, "frames", "import", "--from-dir", importDir],
      {
        encoding: "utf-8",
        env: getTestEnv(),
      }
    );

    assert.match(output, /Imported: 2/, "Should import only JSON files");
  } finally {
    cleanup();
  }
});

test("CLI: lex frames import --from-dir handles partial failures", () => {
  setupTest();
  try {
    // Create mix of valid and invalid frames
    writeFileSync(join(importDir, "valid1.json"), JSON.stringify(createValidFrame("1", "Valid 1")));
    writeFileSync(join(importDir, "invalid.json"), JSON.stringify({ id: "bad" }));
    writeFileSync(join(importDir, "valid2.json"), JSON.stringify(createValidFrame("2", "Valid 2")));

    // Import from directory
    try {
      execFileSync(process.execPath, [lexBin, "frames", "import", "--from-dir", importDir], {
        encoding: "utf-8",
        env: getTestEnv(),
      });
      assert.fail("Should have exited with error");
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: Buffer | string };
      assert.strictEqual(execError.status, 1, "Should exit with code 1 due to errors");
    }
  } finally {
    cleanup();
  }
});
