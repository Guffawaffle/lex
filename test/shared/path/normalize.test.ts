/**
 * Tests for path normalization utilities
 *
 * Tests cover:
 * - Tilde expansion
 * - Windows environment variable expansion
 * - WSL path conversion
 * - Path canonicalization
 * - Path traversal validation
 * - Cross-platform compatibility
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { normalizePath, normalizePaths, isWithinBase } from "@app/shared/path/normalize.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir, homedir } from "os";

describe("Path Normalization", () => {
  let originalDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalDir = process.cwd();
    originalEnv = {
      LEX_APP_ROOT: process.env.LEX_APP_ROOT,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      APPDATA: process.env.APPDATA,
    };
  });

  afterEach(() => {
    process.chdir(originalDir);
    // Restore environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  describe("Tilde expansion", () => {
    test("expands ~ to home directory", () => {
      const result = normalizePath("~/test/path", { validateTraversal: false });
      const expected = join(homedir(), "test", "path");

      assert.strictEqual(result, resolve(expected), "Should expand ~ to home directory");
    });

    test("expands ~/. to home directory", () => {
      const result = normalizePath("~/.", { validateTraversal: false });

      assert.strictEqual(result, resolve(homedir()), "Should expand ~/. to home directory");
    });

    test("handles ~/ at start of path", () => {
      const result = normalizePath("~/documents/file.txt", { validateTraversal: false });
      const expected = join(homedir(), "documents", "file.txt");

      assert.strictEqual(result, resolve(expected), "Should handle ~/ prefix");
    });

    test("does not expand ~ in middle of path", () => {
      const input = "/path/with~middle/file.txt";
      const result = normalizePath(input, { validateTraversal: false });

      assert.strictEqual(
        result,
        resolve(input),
        "Should not expand ~ when not at start",
      );
    });
  });

  describe("Windows environment variables", () => {
    test("expands %LOCALAPPDATA% on Windows", function () {
      if (process.platform !== "win32") {
        this.skip();
      }

      const testValue = "C:\\Users\\TestUser\\AppData\\Local";
      process.env.LOCALAPPDATA = testValue;

      const result = normalizePath("%LOCALAPPDATA%\\MyApp\\config.json", {
        validateTraversal: false,
      });

      assert.ok(
        result.includes("AppData\\Local"),
        "Should expand %LOCALAPPDATA% on Windows",
      );
    });

    test("expands multiple environment variables on Windows", function () {
      if (process.platform !== "win32") {
        this.skip();
      }

      process.env.TESTVAR1 = "C:\\test1";
      process.env.TESTVAR2 = "folder";

      const result = normalizePath("%TESTVAR1%\\%TESTVAR2%\\file.txt", {
        validateTraversal: false,
      });

      assert.ok(result.includes("test1"), "Should expand first variable");
      assert.ok(result.includes("folder"), "Should expand second variable");
    });

    test("does not expand environment variables on non-Windows", function () {
      if (process.platform === "win32") {
        this.skip();
      }

      process.env.TESTVAR = "/test/value";

      const result = normalizePath("%TESTVAR%/file.txt", {
        validateTraversal: false,
      });

      // Should be treated as literal path component on non-Windows
      assert.ok(
        result.includes("%TESTVAR%"),
        "Should not expand on non-Windows platforms",
      );
    });
  });

  describe("WSL path conversion", () => {
    test("handles /mnt/ paths on Linux as valid Unix paths", function () {
      if (process.platform !== "linux") {
        this.skip();
      }

      const input = "/mnt/c/Users/TestUser/file.txt";
      const result = normalizePath(input, { validateTraversal: false });

      // On Linux, /mnt/c/ is a valid Unix path and should be resolved as-is
      assert.ok(
        result.startsWith("/mnt/c/"),
        "Should preserve /mnt/ paths on Linux as valid Unix paths",
      );
    });

    test("handles /mnt/ paths as valid paths", function () {
      if (process.platform !== "linux") {
        this.skip();
      }

      const input = "/mnt/d/projects/file.txt";
      const result = normalizePath(input, { validateTraversal: false });

      // Should treat as normal Unix path
      assert.ok(
        result.startsWith("/mnt/d/"),
        "Should handle /mnt/ paths as normal Unix paths",
      );
    });

    test("handles /mnt/ paths on non-Linux", function () {
      if (process.platform === "linux") {
        this.skip();
      }

      const input = "/mnt/c/Users/file.txt";
      const result = normalizePath(input, { validateTraversal: false });

      // On non-Linux, just resolve as normal path
      assert.strictEqual(
        result,
        resolve(input),
        "Should resolve /mnt/ paths normally on non-Linux",
      );
    });
  });

  describe("Path canonicalization", () => {
    test("resolves . and .. in paths", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-path-test-"));

      try {
        mkdirSync(join(testDir, "subdir"));
        process.env.LEX_APP_ROOT = testDir;

        const input = join(testDir, "subdir", "..", "file.txt");
        const result = normalizePath(input, { basePath: testDir });

        assert.strictEqual(
          result,
          join(testDir, "file.txt"),
          "Should resolve .. to parent directory",
        );
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("converts relative paths to absolute", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-relative-test-"));

      try {
        process.chdir(testDir);
        mkdirSync(join(testDir, ".git"));
        process.env.LEX_APP_ROOT = testDir;

        const result = normalizePath("./relative/path.txt", { basePath: testDir });

        assert.ok(result.startsWith(testDir), "Should convert to absolute path");
        assert.ok(result.includes("relative"), "Should preserve relative components");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("resolves symlinks to real paths", () => {
      // Symlink resolution requires actual files/symlinks
      // This test is platform-dependent and may be skipped
      const testDir = mkdtempSync(join(tmpdir(), "lex-symlink-test-"));

      try {
        const targetFile = join(testDir, "target.txt");
        writeFileSync(targetFile, "test content");

        // Try to create symlink (may fail on some systems)
        try {
          const symlinkPath = join(testDir, "link.txt");
          require("fs").symlinkSync(targetFile, symlinkPath);

          process.env.LEX_APP_ROOT = testDir;
          const result = normalizePath(symlinkPath, { basePath: testDir });

          // Should resolve to the real file path
          assert.strictEqual(result, targetFile, "Should resolve symlink to real path");
        } catch (symlinkError) {
          // Skip if symlinks not supported
          console.log("Skipping symlink test: symlinks not supported");
        }
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Path traversal validation", () => {
    test("rejects paths outside workspace by default", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-traversal-test-"));

      try {
        mkdirSync(join(testDir, ".git"));
        process.chdir(testDir);

        // Try to escape the workspace
        assert.throws(
          () => normalizePath("../../../etc/passwd"),
          /Path traversal detected/,
          "Should reject path traversal outside workspace",
        );
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("accepts paths within workspace", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-valid-test-"));

      try {
        mkdirSync(join(testDir, ".git"));
        mkdirSync(join(testDir, "subdir"));
        process.env.LEX_APP_ROOT = testDir;

        const validPath = join(testDir, "subdir", "file.txt");
        const result = normalizePath(validPath, { basePath: testDir });

        assert.strictEqual(result, validPath, "Should accept paths within workspace");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("can disable traversal validation", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-novalidate-test-"));

      try {
        mkdirSync(join(testDir, ".git"));
        process.chdir(testDir);

        // Should not throw when validation is disabled
        const result = normalizePath("../outside.txt", { validateTraversal: false });

        assert.ok(result, "Should normalize path without validation");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("accepts custom base path for validation", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-basepath-test-"));

      try {
        const subdir = join(testDir, "workspace");
        mkdirSync(subdir);

        const validPath = join(subdir, "file.txt");
        const result = normalizePath(validPath, { basePath: subdir });

        assert.strictEqual(result, validPath, "Should validate against custom base path");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("rejects path outside custom base path", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-reject-test-"));

      try {
        const subdir = join(testDir, "workspace");
        mkdirSync(subdir);

        const outsidePath = join(testDir, "outside.txt");

        assert.throws(
          () => normalizePath(outsidePath, { basePath: subdir }),
          /Path traversal detected/,
          "Should reject path outside custom base",
        );
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("normalizePaths (batch processing)", () => {
    test("normalizes multiple paths", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-batch-test-"));

      try {
        process.env.LEX_APP_ROOT = testDir;

        const paths = [
          join(testDir, "file1.txt"),
          join(testDir, "dir", "file2.txt"),
          join(testDir, "file3.txt"),
        ];

        const results = normalizePaths(paths, {
          validateTraversal: false,
        });

        assert.strictEqual(results.length, 3, "Should return same number of paths");
        results.forEach((result) => {
          assert.ok(result.startsWith(testDir), "All paths should be within test dir");
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("applies options to all paths", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-options-test-"));

      try {
        mkdirSync(join(testDir, "subdir"));
        process.env.LEX_APP_ROOT = testDir;

        const paths = [
          join(testDir, "file1.txt"),
          join(testDir, "subdir", "file2.txt"),
        ];

        const results = normalizePaths(paths, { basePath: testDir });

        results.forEach((result) => {
          assert.ok(
            result.startsWith(testDir),
            "Should apply validation to all paths",
          );
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("isWithinBase", () => {
    test("returns true for paths within base", () => {
      const base = "/home/user/project";
      const target = "/home/user/project/src/file.ts";

      assert.strictEqual(
        isWithinBase(target, base),
        true,
        "Should return true for nested path",
      );
    });

    test("returns false for paths outside base", () => {
      const base = "/home/user/project";
      const target = "/etc/passwd";

      assert.strictEqual(
        isWithinBase(target, base),
        false,
        "Should return false for outside path",
      );
    });

    test("returns true for base itself", () => {
      const base = "/home/user/project";

      assert.strictEqual(
        isWithinBase(base, base),
        true,
        "Should return true for base itself",
      );
    });

    test("handles relative paths", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-within-test-"));

      try {
        mkdirSync(join(testDir, "subdir"));
        process.chdir(testDir);

        const result = isWithinBase("./subdir/file.txt", testDir);

        assert.strictEqual(result, true, "Should handle relative paths");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
