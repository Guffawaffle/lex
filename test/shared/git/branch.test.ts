/**
 * Tests for git branch detection utilities
 *
 * Tests cover:
 * - Normal git repository branch detection
 * - Detached HEAD state
 * - Non-git directory
 * - Environment variable override
 * - Caching behavior
 * - Error handling
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { getCurrentBranch, clearBranchCache } from "@app/shared/git/branch.js";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Helper to detect if we're in a working git repository
const hasGitRepo = () => {
  try {
    execSync("git rev-parse --git-dir", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

describe("Git Branch Detection", () => {
  let originalDir: string;
  let originalEnv: string | undefined;

  // Setup: save current directory and environment
  beforeEach(() => {
    originalDir = process.cwd();
    originalEnv = process.env.LEX_DEFAULT_BRANCH;
    delete process.env.LEX_DEFAULT_BRANCH;
    clearBranchCache();
  });

  // Teardown helper
  function teardown(testDir?: string) {
    process.chdir(originalDir);
    if (originalEnv !== undefined) {
      process.env.LEX_DEFAULT_BRANCH = originalEnv;
    } else {
      delete process.env.LEX_DEFAULT_BRANCH;
    }
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    clearBranchCache();
  }

  test("detects current branch in normal git repository", () => {
    if (!hasGitRepo()) {
      // Skip this test in environments without .git (e.g., Docker CI)
      return;
    }
    try {
      // We're in the lex repo, so this should return the actual branch
      const branch = getCurrentBranch();

      // Should not be the fallback values
      assert.notStrictEqual(branch, "unknown", "Should detect branch in git repo");
      assert.notStrictEqual(branch, "", "Branch should not be empty");

      // Should match what git actually says (unless detached)
      if (branch !== "detached") {
        const actualBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
        }).trim();
        assert.strictEqual(branch, actualBranch, "Should match actual git branch");
      }
    } finally {
      teardown();
    }
  });

  test("handles detached HEAD state", () => {
    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-git-test-"));

    try {
      process.chdir(testDir);

      // Initialize git repo
      execSync("git init", { stdio: "pipe" });
      execSync('git config user.email "test@example.com"', { stdio: "pipe" });
      execSync('git config user.name "Test User"', { stdio: "pipe" });
      execSync("git config commit.gpgsign false", { stdio: "pipe" });

      // Create a commit
      execSync("touch test.txt", { stdio: "pipe" });
      execSync("git add test.txt", { stdio: "pipe" });
      execSync('git commit -m "Initial commit"', { stdio: "pipe" });

      // Get the commit hash
      const commitHash = execSync("git rev-parse HEAD", {
        encoding: "utf-8",
      }).trim();

      // Checkout the commit to create detached HEAD
      execSync(`git checkout ${commitHash}`, { stdio: "pipe" });

      // Clear cache and test
      clearBranchCache();
      const branch = getCurrentBranch();

      assert.strictEqual(branch, "detached", "Should return 'detached' for detached HEAD");
    } finally {
      teardown(testDir);
    }
  });

  test("handles non-git directory", () => {
    // Create a temporary non-git directory
    const testDir = mkdtempSync(join(tmpdir(), "lex-nongit-test-"));

    try {
      process.chdir(testDir);

      const branch = getCurrentBranch();

      assert.strictEqual(branch, "unknown", "Should return 'unknown' for non-git directory");
    } finally {
      teardown(testDir);
    }
  });

  test("respects LEX_DEFAULT_BRANCH environment variable", () => {
    try {
      process.env.LEX_DEFAULT_BRANCH = "custom-branch";
      clearBranchCache();

      const branch = getCurrentBranch();

      assert.strictEqual(branch, "custom-branch", "Should return env var value");
    } finally {
      teardown();
    }
  });

  test("environment variable override takes precedence over git", () => {
    try {
      // Even in a git repo, env var should take precedence
      process.env.LEX_DEFAULT_BRANCH = "env-override";
      clearBranchCache();

      const branch = getCurrentBranch();

      assert.strictEqual(branch, "env-override", "Env var should override git detection");
    } finally {
      teardown();
    }
  });

  test("caches branch result for performance", () => {
    try {
      clearBranchCache();

      // First call
      const branch1 = getCurrentBranch();

      // Second call should return cached value (same result)
      const branch2 = getCurrentBranch();

      assert.strictEqual(branch1, branch2, "Cached result should match first call");
    } finally {
      teardown();
    }
  });

  test("clearBranchCache allows re-detection", () => {
    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-cache-test-"));

    try {
      process.chdir(testDir);

      // Initialize git repo with a branch
      execSync("git init", { stdio: "pipe" });
      execSync('git config user.email "test@example.com"', { stdio: "pipe" });
      execSync('git config user.name "Test User"', { stdio: "pipe" });
      execSync("git config commit.gpgsign false", { stdio: "pipe" });
      execSync("touch test.txt", { stdio: "pipe" });
      execSync("git add test.txt", { stdio: "pipe" });
      execSync('git commit -m "Initial commit"', { stdio: "pipe" });

      // Get initial branch
      clearBranchCache();
      const branch1 = getCurrentBranch();

      // Switch to a new branch
      execSync("git checkout -b feature-branch", { stdio: "pipe" });

      // Without clearing cache, should return old value
      const branch2 = getCurrentBranch();
      assert.strictEqual(branch2, branch1, "Should return cached value");

      // After clearing cache, should detect new branch
      clearBranchCache();
      const branch3 = getCurrentBranch();
      assert.strictEqual(branch3, "feature-branch", "Should detect new branch after cache clear");
    } finally {
      teardown(testDir);
    }
  });

  test("handles git command errors gracefully", () => {
    // Create a temporary directory
    const testDir = mkdtempSync(join(tmpdir(), "lex-error-test-"));

    try {
      process.chdir(testDir);

      // No git repo, so command should fail
      const branch = getCurrentBranch();

      assert.strictEqual(branch, "unknown", "Should handle git errors gracefully");
    } finally {
      teardown(testDir);
    }
  });
});
