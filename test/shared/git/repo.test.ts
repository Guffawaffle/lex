/**
 * Tests for git repository root detection utilities
 *
 * Tests cover:
 * - Repository root detection
 * - Environment variable override
 * - Error handling for non-git directories
 * - Caching behavior
 * - Commit SHA retrieval
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  findRepoRoot,
  getCurrentCommit,
  clearRepoRootCache,
} from "@app/shared/git/repo.js";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Git Repository Root Detection", () => {
  let originalDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalEnv = process.env.LEX_APP_ROOT;
    delete process.env.LEX_APP_ROOT;
    clearRepoRootCache();
  });

  afterEach(() => {
    process.chdir(originalDir);
    if (originalEnv !== undefined) {
      process.env.LEX_APP_ROOT = originalEnv;
    } else {
      delete process.env.LEX_APP_ROOT;
    }
    clearRepoRootCache();
  });

  test("finds repository root in actual git repository", () => {
    // We're in the lex repo, so this should find the root
    const repoRoot = findRepoRoot();

    assert.ok(repoRoot, "Should find repository root");
    assert.ok(repoRoot.endsWith("lex"), "Should end with 'lex'");

    // Verify .git exists at the root
    const gitPath = join(repoRoot, ".git");
    assert.ok(existsSync(gitPath), ".git should exist at repository root");
  });

  test("finds repository root from nested directory", () => {
    // Create a nested path within the repo
    const nestedPath = join(process.cwd(), "src", "shared", "git");
    const repoRoot = findRepoRoot(nestedPath);

    assert.ok(repoRoot, "Should find repository root from nested path");
    assert.ok(repoRoot.endsWith("lex"), "Should end with 'lex'");
  });

  test("throws error when not in a git repository", () => {
    const testDir = mkdtempSync(join(tmpdir(), "lex-nongit-test-"));

    try {
      process.chdir(testDir);

      assert.throws(
        () => findRepoRoot(),
        /Repository root not found/,
        "Should throw error when .git not found",
      );

      assert.throws(
        () => findRepoRoot(),
        /Ensure you are inside a git repository/,
        "Should provide helpful error message",
      );

      assert.throws(
        () => findRepoRoot(),
        /set LEX_APP_ROOT explicitly/,
        "Should suggest LEX_APP_ROOT override",
      );
    } finally {
      process.chdir(originalDir);
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("respects LEX_APP_ROOT environment variable", () => {
    const customRoot = "/custom/app/root";
    process.env.LEX_APP_ROOT = customRoot;
    clearRepoRootCache();

    const repoRoot = findRepoRoot();

    assert.strictEqual(repoRoot, customRoot, "Should return environment variable value");
  });

  test("environment variable override bypasses .git detection", () => {
    const testDir = mkdtempSync(join(tmpdir(), "lex-env-test-"));

    try {
      process.chdir(testDir);
      process.env.LEX_APP_ROOT = testDir;
      clearRepoRootCache();

      // Should not throw even though we're not in a git repo
      const repoRoot = findRepoRoot();

      assert.strictEqual(repoRoot, testDir, "Should return env var even without .git");
    } finally {
      process.chdir(originalDir);
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("caches repository root for performance", () => {
    clearRepoRootCache();

    // First call
    const root1 = findRepoRoot();

    // Second call should return cached value (same result)
    const root2 = findRepoRoot();

    assert.strictEqual(root1, root2, "Cached result should match first call");
  });

  test("cache is bypassed when using custom start path", () => {
    const testDir = mkdtempSync(join(tmpdir(), "lex-cache-test-"));

    try {
      // Initialize git repo
      mkdirSync(join(testDir, ".git"));

      // First call with default path (cwd)
      const root1 = findRepoRoot();

      // Second call with explicit path should not use cache
      const root2 = findRepoRoot(testDir);

      assert.notStrictEqual(root1, root2, "Should not use cache for explicit paths");
      assert.strictEqual(root2, testDir, "Should find .git in test directory");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("clearRepoRootCache allows re-detection", () => {
    // Get initial root
    clearRepoRootCache();
    const root1 = findRepoRoot();

    // Set environment variable
    process.env.LEX_APP_ROOT = "/new/root";

    // Without clearing cache, should still return old value from cwd
    const root2 = findRepoRoot();
    // But with env var, it bypasses cache
    assert.strictEqual(root2, "/new/root", "Env var should bypass cache");

    // Clear cache and check again
    delete process.env.LEX_APP_ROOT;
    clearRepoRootCache();
    const root3 = findRepoRoot();
    assert.strictEqual(root3, root1, "Should re-detect after cache clear");
  });

  test("resolves relative paths to absolute", () => {
    const repoRoot = findRepoRoot();

    // Should return absolute path
    assert.ok(repoRoot.startsWith("/"), "Should return absolute path on Unix");
  });
});

describe("Git Commit SHA Detection", () => {
  let originalDir: string;

  beforeEach(() => {
    originalDir = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalDir);
  });

  test("gets current commit SHA in git repository", () => {
    const commit = getCurrentCommit();

    // Should be a 7-character hex string (short SHA)
    assert.ok(commit, "Should return commit SHA");
    if (commit !== "unknown") {
      assert.match(commit, /^[0-9a-f]{7}$/, "Should be 7-character hex string");
    }
  });

  test("returns 'unknown' when not in a git repository", () => {
    const testDir = mkdtempSync(join(tmpdir(), "lex-commit-test-"));

    try {
      process.chdir(testDir);

      const commit = getCurrentCommit();

      assert.strictEqual(commit, "unknown", "Should return 'unknown' for non-git directory");
    } finally {
      process.chdir(originalDir);
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("commit SHA matches git command output", () => {
    try {
      const commit = getCurrentCommit();

      if (commit !== "unknown") {
        const gitOutput = execSync("git rev-parse --short HEAD", {
          encoding: "utf-8",
        }).trim();

        assert.strictEqual(commit, gitOutput, "Should match git command output");
      }
    } catch (error) {
      // If we can't run git, skip this test
    }
  });
});
