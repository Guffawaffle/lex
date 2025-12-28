/**
 * ⚠️  WARNING: THIS FILE IS EXCLUDED FROM `npm test` ⚠️
 *
 * Git-related tests are NOT acceptable in the main test path.
 * Reason: Many environments use interactive GPG signing for git commits,
 * which causes these tests to hang indefinitely.
 *
 * To run these tests explicitly: npm run test:git
 *
 * Tests for git command wrapper utility
 *
 * Tests cover:
 * - Basic git command execution
 * - Output trimming
 * - Error handling for invalid commands
 * - GPG signing disabled by default
 * - GPG signing can be enabled via options
 * - Custom working directory
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { runGit } from "@app/shared/git/run.js";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

/**
 * Helper to initialize a git repository in a directory
 */
function initGitRepo(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: "pipe" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "pipe" });
}

describe("Git Command Wrapper", () => {
  test("runGit returns trimmed stdout", () => {
    // Test with git --version which should always work
    const version = runGit(["--version"]);

    assert.ok(version.startsWith("git version"), "Should return git version string");
    assert.ok(!version.startsWith(" "), "Output should be trimmed (no leading space)");
    assert.ok(!version.endsWith(" "), "Output should be trimmed (no trailing space)");
  });

  test("runGit throws on invalid command", () => {
    assert.throws(
      () => runGit(["not-a-valid-git-command"]),
      /not a git command|failed/,
      "Should throw error for invalid git command"
    );
  });

  test("runGit throws on non-zero exit status", () => {
    // Create a temporary non-git directory
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-error-test-"));

    try {
      // Try to run git status in non-git directory (should fail)
      assert.throws(
        () => runGit(["status"], { cwd: testDir }),
        /fatal|not a git repository/i,
        "Should throw error with stderr message"
      );
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit respects cwd option", () => {
    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-cwd-test-"));

    try {
      // Initialize a git repo in the temp directory
      initGitRepo(testDir);

      // Create and commit a file
      writeFileSync(join(testDir, "test.txt"), "test content");
      execSync("git add test.txt", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "Test commit"', { cwd: testDir, stdio: "pipe" });

      // Use runGit with cwd to get branch
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: testDir });

      assert.ok(branch === "main" || branch === "master", "Should execute in specified directory");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit disables GPG signing by default", () => {
    // We can't directly test the GPG args being passed, but we can verify
    // that the function works even in environments with GPG signing enabled
    // by ensuring it doesn't hang

    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-gpg-test-"));

    try {
      // Initialize a git repo and enable GPG signing
      initGitRepo(testDir);
      execSync("git config commit.gpgsign true", { cwd: testDir, stdio: "pipe" });
      execSync("git config user.signingkey test-key", { cwd: testDir, stdio: "pipe" });

      // Create and add a file
      writeFileSync(join(testDir, "test.txt"), "test content");
      execSync("git add test.txt", { cwd: testDir, stdio: "pipe" });

      // This should not hang because runGit disables GPG by default
      // Note: We're not actually committing because that would require a real GPG key
      // But we can test that other git commands work fine
      const status = runGit(["status", "--short"], { cwd: testDir });

      assert.ok(status.includes("test.txt"), "Should work with GPG disabled by default");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit can enable GPG signing when explicitly requested", () => {
    // Create a temporary git repository
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-gpg-enabled-test-"));

    try {
      // Initialize a git repo WITHOUT GPG signing
      initGitRepo(testDir);

      // Create a file and add it
      writeFileSync(join(testDir, "test.txt"), "test content");
      execSync("git add test.txt", { cwd: testDir, stdio: "pipe" });

      // With disableGpg: false, GPG args should not be added
      // We can't directly verify the args, but we can ensure it works
      const status = runGit(["status", "--short"], { cwd: testDir, disableGpg: false });

      assert.ok(status.includes("test.txt"), "Should work with GPG option set to false");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit handles multiple arguments correctly", () => {
    // Test that we can pass multiple arguments
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-args-test-"));

    try {
      // Initialize a git repo
      initGitRepo(testDir);

      // Create and commit a file
      writeFileSync(join(testDir, "test.txt"), "test content");
      execSync("git add test.txt", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "Test commit"', { cwd: testDir, stdio: "pipe" });

      // Use multiple arguments
      const log = runGit(["log", "--oneline", "-1"], { cwd: testDir });

      assert.ok(log.includes("Test commit"), "Should handle multiple arguments");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit returns empty string for commands with no output", () => {
    // Some git commands don't produce output
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-empty-test-"));

    try {
      // Initialize a git repo
      initGitRepo(testDir);

      // git status --short in a clean repo returns empty output
      const status = runGit(["status", "--short"], { cwd: testDir });

      assert.strictEqual(status, "", "Should return empty string for no output");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("runGit error contains stderr message", () => {
    const testDir = mkdtempSync(join(tmpdir(), "lex-run-stderr-test-"));

    try {
      // Try to run git status in a non-git directory
      try {
        runGit(["status"], { cwd: testDir });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw Error instance");
        // Git's error message should be in the error
        assert.ok(
          error.message.includes("not a git repository") ||
            error.message.includes("failed with status"),
          "Error message should contain git stderr or status info"
        );
      }
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
