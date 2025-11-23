/**
 * Tests for git commit detection utilities
 *
 * Tests cover:
 * - Normal git repository commit detection
 * - Non-git directory
 * - Caching behavior
 * - Error handling
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { getCurrentCommit, clearCommitCache } from "../../../src/shared/git/commit.js";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Git Commit Detection", () => {
  let originalDir: string;

  // Setup: save current directory
  beforeEach(() => {
    originalDir = process.cwd();
    clearCommitCache();
  });

  // Teardown helper
  function teardown(testDir?: string) {
    process.chdir(originalDir);
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    clearCommitCache();
  }

  test("detects current commit in normal git repository", () => {
    try {
      // We're in the lex repo, so this should return the actual commit
      const commit = getCurrentCommit();

      // Should not be the fallback value
      assert.notStrictEqual(commit, "unknown", "Should detect commit in git repo");
      assert.notStrictEqual(commit, "", "Commit should not be empty");

      // Should be 7 characters (short hash)
      assert.strictEqual(commit.length, 7, "Commit hash should be 7 characters");

      // Should match what git actually says
      const actualCommit = execSync("git rev-parse --short HEAD", {
        encoding: "utf-8",
      }).trim();
      assert.strictEqual(commit, actualCommit, "Should match actual git commit");
    } finally {
      teardown();
    }
  });

  test("handles non-git directory", () => {
    // Create a temporary non-git directory
    const testDir = mkdtempSync(join(tmpdir(), "lex-nongit-test-"));

    try {
      process.chdir(testDir);
      clearCommitCache();

      const commit = getCurrentCommit();

      assert.strictEqual(commit, "unknown", "Should return 'unknown' for non-git directory");
    } finally {
      teardown(testDir);
    }
  });

  test("caches commit result for performance", () => {
    try {
      clearCommitCache();

      // First call
      const commit1 = getCurrentCommit();

      // Second call should return cached value (same result)
      const commit2 = getCurrentCommit();

      assert.strictEqual(commit1, commit2, "Cached result should match first call");
    } finally {
      teardown();
    }
  });

  test("clearCommitCache allows re-detection", () => {
    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-commit-cache-test-"));

    try {
      process.chdir(testDir);

      // Initialize git repo with a commit
      execSync("git init", { stdio: "pipe" });
      execSync('git config user.email "test@example.com"', { stdio: "pipe" });
      execSync('git config user.name "Test User"', { stdio: "pipe" });
      execSync("git config commit.gpgsign false", { stdio: "pipe" });
      execSync("touch test.txt", { stdio: "pipe" });
      execSync("git add test.txt", { stdio: "pipe" });
      execSync('git commit -m "Initial commit"', { stdio: "pipe" });

      // Get initial commit
      clearCommitCache();
      const commit1 = getCurrentCommit();

      // Create another commit
      execSync("echo 'new content' > test.txt", { stdio: "pipe" });
      execSync("git add test.txt", { stdio: "pipe" });
      execSync('git commit -m "Second commit"', { stdio: "pipe" });

      // Without clearing cache, should return old value
      const commit2 = getCurrentCommit();
      assert.strictEqual(commit2, commit1, "Should return cached value");

      // After clearing cache, should detect new commit
      clearCommitCache();
      const commit3 = getCurrentCommit();
      assert.notStrictEqual(commit3, commit1, "Should detect new commit after cache clear");

      // Verify it matches the actual commit
      const actualCommit = execSync("git rev-parse --short HEAD", {
        encoding: "utf-8",
      }).trim();
      assert.strictEqual(commit3, actualCommit, "Should match actual commit");
    } finally {
      teardown(testDir);
    }
  });

  test("handles git command errors gracefully", () => {
    // Create a temporary directory
    const testDir = mkdtempSync(join(tmpdir(), "lex-commit-error-test-"));

    try {
      process.chdir(testDir);
      clearCommitCache();

      // No git repo, so command should fail
      const commit = getCurrentCommit();

      assert.strictEqual(commit, "unknown", "Should handle git errors gracefully");
    } finally {
      teardown(testDir);
    }
  });
});
