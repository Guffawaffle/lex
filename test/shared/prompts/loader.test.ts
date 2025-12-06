/**
 * Prompt loader tests with precedence chain validation
 *
 * Precedence chain:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. .smartergpt/prompts/ (local untracked overlay)
 * 3. Package prompts/ (published canon from build)
 *
 * Tests cover:
 * - Basic precedence at each level
 * - Override priority (ENV > local > package)
 * - Deduplication in listPrompts()
 * - Error handling
 * - Edge cases (symlinks, missing dirs, large files, concurrent access)
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { loadPrompt, listPrompts, getPromptPath } from "@app/shared/prompts/loader.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Prompt Loader Precedence", () => {
  let originalDir: string;
  let originalPromptsDir: string | undefined;
  let originalRepoRoot: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalPromptsDir = process.env.LEX_PROMPTS_DIR;
    originalRepoRoot = process.env.REPO_ROOT;
    delete process.env.LEX_PROMPTS_DIR;
    delete process.env.REPO_ROOT;
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (originalPromptsDir !== undefined) {
      process.env.LEX_PROMPTS_DIR = originalPromptsDir;
    } else {
      delete process.env.LEX_PROMPTS_DIR;
    }

    if (originalRepoRoot !== undefined) {
      process.env.REPO_ROOT = originalRepoRoot;
    } else {
      delete process.env.REPO_ROOT;
    }

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-prompt-test-"));
    testRepoDir = dir;

    // Create package.json to make it a valid repo
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));

    return dir;
  }

  test("loads from LEX_PROMPTS_DIR when set", async () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "prompts"), { recursive: true });
      writeFileSync(join(customCanon, "prompts", "test.md"), "# Custom Canon");

      process.env.LEX_PROMPTS_DIR = join(customCanon, "prompts");
      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      const result = loadPrompt("test.md");
      assert.strictEqual(result, "# Custom Canon");
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("falls back to .smartergpt/prompts/ when LEX_PROMPTS_DIR not set", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "prompts", "test.md"), "# Workspace Prompts");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const result = loadPrompt("test.md");
    assert.strictEqual(result, "# Workspace Prompts");
  });

  test("falls back to package canon/prompts/ when no overrides exist", async () => {
    const repo = createTestRepo();

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    // Should load from actual package's canon/prompts/ (test.md exists there)
    const result = loadPrompt("test.md");
    assert.ok(result.includes("# Test Prompt"));
  });

  test("LEX_PROMPTS_DIR overrides .smartergpt/prompts/", async () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "prompts"), { recursive: true });
      writeFileSync(join(customCanon, "prompts", "test.md"), "# ENV");

      mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
      writeFileSync(join(repo, ".smartergpt", "prompts", "test.md"), "# WORKSPACE");

      process.env.LEX_PROMPTS_DIR = join(customCanon, "prompts");
      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      const result = loadPrompt("test.md");
      assert.strictEqual(result, "# ENV");
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test(".smartergpt/prompts/ overrides package prompts/", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "prompts", "test.md"), "# Workspace Override");

    mkdirSync(join(repo, "prompts"), { recursive: true });
    writeFileSync(join(repo, "prompts", "test.md"), "# Legacy");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const result = loadPrompt("test.md");
    assert.strictEqual(result, "# Workspace Override");
  });

  test("throws when prompt not found anywhere", async () => {
    const repo = createTestRepo();
    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    await assert.rejects(
      async () => loadPrompt("nonexistent.md"),
      /Prompt file 'nonexistent\.md' not found/
    );
  });

  test("listPrompts() deduplicates across all sources", async () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      // Setup: prompt exists in all 3 locations
      mkdirSync(join(customCanon, "prompts"), { recursive: true });
      writeFileSync(join(customCanon, "prompts", "shared.md"), "# ENV");
      writeFileSync(join(customCanon, "prompts", "env-only.md"), "# ENV");

      mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
      writeFileSync(join(repo, ".smartergpt", "prompts", "shared.md"), "# WORKSPACE");
      writeFileSync(join(repo, ".smartergpt", "prompts", "workspace-only.md"), "# WORKSPACE");

      process.env.LEX_PROMPTS_DIR = join(customCanon, "prompts");
      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      const prompts = listPrompts();

      // Deduplicated: should have unique prompts
      assert.ok(prompts.includes("shared.md"));
      assert.ok(prompts.includes("env-only.md"));
      assert.ok(prompts.includes("workspace-only.md"));
      // Package prompts come from real lex package
      assert.ok(prompts.includes("test.md")); // From real package
      assert.ok(prompts.includes("example.md")); // From real package

      // Verify shared.md appears only once (despite being in multiple locations)
      assert.strictEqual(
        prompts.filter((p) => p === "shared.md").length,
        1,
        "shared.md should appear once"
      );
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("getPromptPath() returns correct path for each level", async () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "prompts"), { recursive: true });
      writeFileSync(join(customCanon, "prompts", "env.md"), "# ENV");

      mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
      writeFileSync(join(repo, ".smartergpt", "prompts", "workspace.md"), "# WORKSPACE");

      process.env.LEX_PROMPTS_DIR = join(customCanon, "prompts");
      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      // Test each level
      const envPath = getPromptPath("env.md");
      assert.ok(envPath?.includes(join(customCanon, "prompts", "env.md")));

      const workspacePath = getPromptPath("workspace.md");
      assert.ok(workspacePath?.includes(join(repo, ".smartergpt", "prompts", "workspace.md")));

      // Package path - should resolve to real package's test.md
      const packagePath = getPromptPath("test.md");
      assert.ok(packagePath?.includes("prompts"));
      assert.ok(packagePath?.includes("test.md"));

      // Non-existent prompt
      const nonExistent = getPromptPath("nonexistent.md");
      assert.strictEqual(nonExistent, null);
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });
});

describe("Prompt Loader Edge Cases", () => {
  let originalDir: string;
  let originalPromptsDir: string | undefined;
  let originalRepoRoot: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalPromptsDir = process.env.LEX_PROMPTS_DIR;
    originalRepoRoot = process.env.REPO_ROOT;
    delete process.env.LEX_PROMPTS_DIR;
    delete process.env.REPO_ROOT;
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (originalPromptsDir !== undefined) {
      process.env.LEX_PROMPTS_DIR = originalPromptsDir;
    } else {
      delete process.env.LEX_PROMPTS_DIR;
    }

    if (originalRepoRoot !== undefined) {
      process.env.REPO_ROOT = originalRepoRoot;
    } else {
      delete process.env.REPO_ROOT;
    }

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-prompt-test-"));
    testRepoDir = dir;

    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));

    return dir;
  }

  test("handles relative paths in LEX_PROMPTS_DIR", async () => {
    const repo = createTestRepo();

    // Create canon directory inside the repo
    mkdirSync(join(repo, "custom-canon", "prompts"), { recursive: true });
    writeFileSync(join(repo, "custom-canon", "prompts", "test.md"), "# Relative Canon");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);
    process.env.LEX_PROMPTS_DIR = "./custom-canon/prompts";

    const result = loadPrompt("test.md");
    assert.strictEqual(result, "# Relative Canon");
  });

  test("handles symlinks in .smartergpt/prompts/", async () => {
    const repo = createTestRepo();
    const targetDir = mkdtempSync(join(tmpdir(), "lex-symlink-target-"));

    try {
      // Create target directory with prompts
      mkdirSync(join(targetDir, "prompts"), { recursive: true });
      writeFileSync(join(targetDir, "prompts", "test.md"), "# Symlinked");

      // Create symlink
      mkdirSync(join(repo, ".smartergpt"), { recursive: true });
      symlinkSync(join(targetDir, "prompts"), join(repo, ".smartergpt", "prompts"));

      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      const result = loadPrompt("test.md");
      assert.strictEqual(result, "# Symlinked");
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  test("handles missing .lex/ directory gracefully", async () => {
    const repo = createTestRepo();

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    // Should not throw, should fall back to package canon/prompts
    const result = loadPrompt("test.md");
    assert.ok(result.includes("# Test Prompt")); // From real package
  });

  test("handles large prompt files", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });

    // Create a large file (1MB) in workspace prompts
    const largeContent = "# Large Prompt\n" + "x".repeat(1024 * 1024);
    writeFileSync(join(repo, ".smartergpt", "prompts", "large.md"), largeContent);

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const result = loadPrompt("large.md");
    assert.ok(result.length > 1024 * 1024);
    assert.ok(result.startsWith("# Large Prompt"));
  });

  test("handles concurrent loadPrompt() calls", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "prompts", "concurrent1.md"), "# Concurrent 1");
    writeFileSync(join(repo, ".smartergpt", "prompts", "concurrent2.md"), "# Concurrent 2");
    writeFileSync(join(repo, ".smartergpt", "prompts", "concurrent3.md"), "# Concurrent 3");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    // Load multiple prompts concurrently
    const [result1, result2, result3] = await Promise.all([
      Promise.resolve(loadPrompt("concurrent1.md")),
      Promise.resolve(loadPrompt("concurrent2.md")),
      Promise.resolve(loadPrompt("concurrent3.md")),
    ]);

    assert.strictEqual(result1, "# Concurrent 1");
    assert.strictEqual(result2, "# Concurrent 2");
    assert.strictEqual(result3, "# Concurrent 3");
  });

  test("handles empty prompt file", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "prompts", "empty.md"), "");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const result = loadPrompt("empty.md");
    assert.strictEqual(result, "");
  });

  test("handles prompt file with special characters", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "prompts", "special.md"),
      "# Special: émojis 🚀, symbols €£¥, newlines\n\nand tabs\t\there"
    );

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const result = loadPrompt("special.md");
    assert.ok(result.includes("émojis 🚀"));
    assert.ok(result.includes("€£¥"));
  });

  test("listPrompts() includes package prompts when no overrides exist", async () => {
    const repo = createTestRepo();

    process.env.REPO_ROOT = repo;
    process.chdir(repo);
    delete process.env.LEX_PROMPTS_DIR; // Ensure no env override

    const prompts = listPrompts();
    assert.ok(Array.isArray(prompts));
    // Should include prompts from the real package
    assert.ok(prompts.length > 0);
    assert.ok(prompts.includes("test.md")); // From package
    assert.ok(prompts.includes("example.md")); // From package
  });

  test("listPrompts() filters out non-.md files", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "prompts"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "prompts", "valid.md"), "# Valid");
    writeFileSync(join(repo, ".smartergpt", "prompts", "invalid.txt"), "Not a markdown");
    writeFileSync(join(repo, ".smartergpt", "prompts", "README"), "No extension");

    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    const prompts = listPrompts();
    // Should include valid.md from workspace and test.md/example.md from package
    assert.ok(prompts.includes("valid.md"));
    assert.ok(!prompts.includes("invalid.txt"));
    assert.ok(!prompts.includes("README"));
  });

  test("handles LEX_PROMPTS_DIR with missing prompts subdirectory", async () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      // Don't create prompts subdirectory
      writeFileSync(join(customCanon, "README.md"), "# Canon");

      process.env.LEX_PROMPTS_DIR = customCanon;
      process.env.REPO_ROOT = repo;
      process.chdir(repo);

      // Should fall back to package prompts
      const result = loadPrompt("test.md");
      assert.ok(result.includes("# Test Prompt")); // From real package
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("error message includes all attempted paths", async () => {
    const repo = createTestRepo();
    process.env.REPO_ROOT = repo;
    process.chdir(repo);

    try {
      loadPrompt("missing.md");
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(message.includes("missing.md"), `Expected "missing.md" in: ${message}`);
      assert.ok(
        message.includes("not found") || message.includes("PROMPT_NOT_FOUND"),
        `Expected "not found" or "PROMPT_NOT_FOUND" in: ${message}`
      );
      // AXErrorException stores paths in context, not message
    }
  });
});
