/**
 * Tests for path normalization utilities
 *
 * Tests cover:
 * - Tilde expansion
 * - Windows environment variable expansion
 * - WSL path conversion
 * - Path canonicalization
 * - Path traversal validation
 * - Repository root detection
 * - Workspace root detection
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  normalizePath,
  findRepoRoot,
  getRepoRoot,
  getWorkspaceRoot,
  expandPath,
} from "../../../src/shared/paths/normalizer.js";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir, homedir, platform } from "os";

// Helper to detect if we're in an environment without .git (e.g., Docker CI)
const hasGitRepo = existsSync(join(process.cwd(), ".git"));

describe("Path Normalization", () => {
  let originalDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalDir = process.cwd();
    originalEnv = {
      LEX_WORKSPACE_ROOT: process.env.LEX_WORKSPACE_ROOT,
      LEX_APP_ROOT: process.env.LEX_APP_ROOT,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
    };
  });

  afterEach(() => {
    process.chdir(originalDir);
    // Restore environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("Tilde Expansion", () => {
    test("expands ~ to home directory", () => {
      const result = normalizePath("~/documents", { validateTraversal: false });
      const expected = resolve(homedir(), "documents");
      assert.strictEqual(result, expected);
    });

    test("expands ~ with subdirectories", () => {
      const result = normalizePath("~/path/to/file.txt", { validateTraversal: false });
      const expected = resolve(homedir(), "path/to/file.txt");
      assert.strictEqual(result, expected);
    });

    test("handles ~ alone", () => {
      const result = normalizePath("~", { validateTraversal: false });
      assert.strictEqual(result, homedir());
    });
  });

  describe("Windows Environment Variable Expansion", () => {
    test("expands %LOCALAPPDATA% on Windows", () => {
      if (platform() !== "win32") {
        // Skip this test on non-Windows platforms
        return;
      }

      process.env.LOCALAPPDATA = "C:\\Users\\TestUser\\AppData\\Local";
      const result = normalizePath("%LOCALAPPDATA%\\myapp", { validateTraversal: false });
      assert.ok(result.includes("AppData\\Local\\myapp"));
    });

    test("preserves %VAR% if environment variable is not set", () => {
      if (platform() !== "win32") {
        return;
      }

      delete process.env.NONEXISTENT_VAR;
      const result = normalizePath("%NONEXISTENT_VAR%\\path", { validateTraversal: false });
      assert.ok(result.includes("%NONEXISTENT_VAR%"));
    });

    test("does not expand %VAR% on non-Windows platforms", () => {
      if (platform() === "win32") {
        return;
      }

      process.env.TESTVAR = "/some/path";
      const input = "%TESTVAR%/subdir";
      const result = normalizePath(input, { validateTraversal: false });
      // On non-Windows, %VAR% should be treated as literal characters
      assert.ok(result.includes("%TESTVAR%"));
    });
  });

  describe("WSL Path Conversion", () => {
    test("converts /mnt/c/ to C:\\ on Linux", () => {
      if (platform() !== "linux") {
        // Skip on non-Linux
        return;
      }

      const result = normalizePath("/mnt/c/Users/TestUser", { validateTraversal: false });
      // On WSL, this should convert to Windows path format
      assert.strictEqual(result, "C:\\Users\\TestUser");
    });

    test("converts /mnt/d/ to D:\\ on Linux", () => {
      if (platform() !== "linux") {
        return;
      }

      const result = normalizePath("/mnt/d/Projects/app", { validateTraversal: false });
      assert.strictEqual(result, "D:\\Projects\\app");
    });

    test("handles /mnt/c without trailing path", () => {
      if (platform() !== "linux") {
        return;
      }

      const result = normalizePath("/mnt/c", { validateTraversal: false });
      assert.strictEqual(result, "C:");
    });
  });

  describe("Relative Path Resolution", () => {
    test("resolves relative paths against basePath", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-path-test-"));
      try {
        const result = normalizePath("./subdir", {
          basePath: testDir,
          validateTraversal: false,
        });
        assert.strictEqual(result, join(testDir, "subdir"));
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("resolves .. parent directory references", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-path-test-"));
      try {
        mkdirSync(join(testDir, "subdir"));
        const result = normalizePath("../parent", {
          basePath: join(testDir, "subdir"),
          validateTraversal: false,
        });
        assert.strictEqual(result, join(testDir, "parent"));
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("resolves . current directory references", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-path-test-"));
      try {
        const result = normalizePath("./file.txt", {
          basePath: testDir,
          validateTraversal: false,
        });
        assert.strictEqual(result, join(testDir, "file.txt"));
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Symlink Resolution", () => {
    test("resolves symlinks to canonical paths", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-symlink-test-"));
      try {
        const realDir = join(testDir, "real");
        const linkDir = join(testDir, "link");
        mkdirSync(realDir);

        // Create symlink (skip on platforms that don't support it)
        try {
          symlinkSync(realDir, linkDir, "dir");
        } catch {
          // Skip test if symlink creation fails
          return;
        }

        const result = normalizePath(linkDir, {
          resolveSymlinks: true,
          validateTraversal: false,
        });

        // Result should be the real path
        assert.strictEqual(result, realDir);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("does not resolve symlinks when disabled", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-symlink-test-"));
      try {
        const realDir = join(testDir, "real");
        const linkDir = join(testDir, "link");
        mkdirSync(realDir);

        try {
          symlinkSync(realDir, linkDir, "dir");
        } catch {
          return;
        }

        const result = normalizePath(linkDir, {
          resolveSymlinks: false,
          validateTraversal: false,
        });

        // Result should be the link path (resolved but not dereferenced)
        assert.strictEqual(result, resolve(linkDir));
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Path Traversal Validation", () => {
    test("rejects path traversal outside allowed root", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-traversal-test-"));
      try {
        assert.throws(
          () =>
            normalizePath("../../../etc/passwd", {
              basePath: testDir,
              allowedRoot: testDir,
              validateTraversal: true,
            }),
          (err: Error) => {
            return err.message.includes("Path traversal detected");
          }
        );
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("allows paths within allowed root", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-traversal-test-"));
      try {
        const result = normalizePath("subdir/file.txt", {
          basePath: testDir,
          allowedRoot: testDir,
          validateTraversal: true,
        });
        assert.ok(result.startsWith(testDir));
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("bypasses validation when disabled", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-traversal-test-"));
      try {
        const result = normalizePath("../../../etc/passwd", {
          basePath: testDir,
          validateTraversal: false,
        });
        // Should not throw
        assert.ok(result);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Repository Root Detection", () => {
    test("finds .git directory in current repo", { skip: !hasGitRepo }, () => {
      const root = findRepoRoot();
      assert.ok(root, "Should find repo root");
      assert.ok(root!.endsWith("lex"), "Should find lex repo root");
    });

    test("finds .git directory when starting from subdirectory", { skip: !hasGitRepo }, () => {
      const repoRoot = findRepoRoot();
      assert.ok(repoRoot);

      const subdirRoot = findRepoRoot(join(repoRoot, "src"));
      assert.strictEqual(subdirRoot, repoRoot, "Should find same root from subdirectory");
    });

    test("returns null when .git not found", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-nogit-test-"));
      try {
        const root = findRepoRoot(testDir);
        assert.strictEqual(root, null, "Should return null when .git not found");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("getRepoRoot throws when .git not found", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-nogit-test-"));
      try {
        process.chdir(testDir);
        assert.throws(
          () => getRepoRoot(),
          (err: Error) => {
            return (
              err.message.includes("Repository root not found") &&
              err.message.includes("LEX_APP_ROOT")
            );
          }
        );
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("getRepoRoot returns root when .git exists", { skip: !hasGitRepo }, () => {
      const root = getRepoRoot();
      assert.ok(root);
      assert.ok(root.endsWith("lex"));
    });
  });

  describe("Workspace Root Detection", () => {
    test("respects LEX_WORKSPACE_ROOT environment variable", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-workspace-test-"));
      try {
        process.env.LEX_WORKSPACE_ROOT = testDir;
        const root = getWorkspaceRoot();
        assert.strictEqual(root, testDir);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test("falls back to repository root when env not set", { skip: !hasGitRepo }, () => {
      delete process.env.LEX_WORKSPACE_ROOT;
      const root = getWorkspaceRoot();
      const repoRoot = findRepoRoot();
      assert.strictEqual(root, repoRoot);
    });

    test("falls back to cwd when repo root not found", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-workspace-test-"));
      try {
        delete process.env.LEX_WORKSPACE_ROOT;
        process.chdir(testDir);
        const root = getWorkspaceRoot();
        assert.strictEqual(root, testDir);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("expandPath convenience function", () => {
    test("is an alias for normalizePath", () => {
      const input = "~/test";
      const result1 = expandPath(input, { validateTraversal: false });
      const result2 = normalizePath(input, { validateTraversal: false });
      assert.strictEqual(result1, result2);
    });
  });
});
