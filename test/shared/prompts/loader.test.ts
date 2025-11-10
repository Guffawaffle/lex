/**
 * Tests for prompt loader with precedence chain
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { loadPrompt, getPromptPath, listPrompts } from "@app/shared/prompts/loader.js";

describe("Prompt Loader", () => {
  describe("loadPrompt", () => {
    it("loads prompt from canon directory", () => {
      const prompt = loadPrompt("idea.md");
      assert.ok(prompt.length > 0, "Prompt should have content");
      assert.ok(
        prompt.includes("idea") || prompt.includes("feature"),
        "Prompt should be about ideas/features"
      );
    });

    it("loads prompt from canon directory (create-project)", () => {
      const prompt = loadPrompt("create-project.md");
      assert.ok(prompt.length > 0, "Prompt should have content");
    });

    it("throws error for non-existent prompt", () => {
      assert.throws(
        () => loadPrompt("non-existent-prompt.md"),
        /Prompt file 'non-existent-prompt.md' not found/,
        "Should throw error for missing prompt"
      );
    });
  });

  describe("getPromptPath", () => {
    it("returns path for existing canon prompt", () => {
      const path = getPromptPath("idea.md");
      assert.ok(path !== null, "Should return a path");
      assert.ok(path!.includes(".smartergpt/prompts/idea.md"), "Should point to canon directory");
    });

    it("returns null for non-existent prompt", () => {
      const path = getPromptPath("non-existent.md");
      assert.strictEqual(path, null, "Should return null for missing prompt");
    });
  });

  describe("listPrompts", () => {
    it("lists available prompts", () => {
      const prompts = listPrompts();
      assert.ok(Array.isArray(prompts), "Should return an array");
      assert.ok(prompts.length > 0, "Should have at least one prompt");
      assert.ok(prompts.includes("idea.md"), "Should include idea.md");
      assert.ok(prompts.includes("create-project.md"), "Should include create-project.md");
    });

    it("returns sorted list", () => {
      const prompts = listPrompts();
      const sorted = [...prompts].sort();
      assert.deepStrictEqual(prompts, sorted, "Should return sorted list");
    });
  });
});

describe("Prompt Loader Precedence Chain", () => {
  let tempRoot: string;
  let canonDir: string;
  let localDir: string;
  let envDir: string;
  let originalRepoRoot: string | undefined;
  let originalEnvDir: string | undefined;
  let originalCwd: string;

  before(() => {
    // Save original environment
    originalRepoRoot = process.env.REPO_ROOT;
    originalEnvDir = process.env.LEX_PROMPTS_DIR;
    originalCwd = process.cwd();

    // Create isolated temp directory structure
    tempRoot = join(process.cwd(), ".test-prompts-precedence");
    canonDir = join(tempRoot, ".smartergpt", "prompts");
    localDir = join(tempRoot, ".smartergpt.local", "prompts");
    envDir = join(tempRoot, "custom-env-prompts");

    // Create directory structure
    mkdirSync(canonDir, { recursive: true });
    mkdirSync(localDir, { recursive: true });
    mkdirSync(envDir, { recursive: true });

    // Create package.json to mark repo root
    writeFileSync(
      join(tempRoot, "package.json"),
      JSON.stringify({ name: "lex", version: "1.0.0" }, null, 2)
    );
  });

  after(() => {
    // Restore original environment
    if (originalRepoRoot !== undefined) {
      process.env.REPO_ROOT = originalRepoRoot;
    } else {
      delete process.env.REPO_ROOT;
    }

    if (originalEnvDir !== undefined) {
      process.env.LEX_PROMPTS_DIR = originalEnvDir;
    } else {
      delete process.env.LEX_PROMPTS_DIR;
    }

    // Restore working directory
    try {
      process.chdir(originalCwd);
    } catch {
      // Ignore errors on restore
    }

    // Clean up temp directory
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("prefers local overlay over canon (full precedence test)", () => {
    // Setup: Create same-named prompt in both canon and local
    const canonContent = "CANON VERSION OF PROMPT";
    const localContent = "LOCAL OVERRIDE VERSION";

    writeFileSync(join(canonDir, "idea.md"), canonContent);
    writeFileSync(join(localDir, "idea.md"), localContent);

    // Set repo root to our temp directory
    process.env.REPO_ROOT = tempRoot;

    // Change to a nested directory to test resolution
    const nestedDir = join(tempRoot, "src", "nested");
    mkdirSync(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    try {
      const loaded = loadPrompt("idea.md");
      assert.strictEqual(
        loaded,
        localContent,
        "Should load from local overlay (.smartergpt.local) over canon (.smartergpt)"
      );

      const path = getPromptPath("idea.md");
      assert.ok(path !== null, "Should return a path");
      assert.ok(
        path!.includes(".smartergpt.local/prompts/idea.md"),
        "Path should point to local overlay"
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("loads from canon when no local override exists", () => {
    const canonContent = "CANON ONLY PROMPT";
    writeFileSync(join(canonDir, "canon-only.md"), canonContent);

    process.env.REPO_ROOT = tempRoot;
    process.chdir(tempRoot);

    try {
      const loaded = loadPrompt("canon-only.md");
      assert.strictEqual(loaded, canonContent, "Should load from canon when no local override");

      const path = getPromptPath("canon-only.md");
      assert.ok(path !== null, "Should return a path");
      assert.ok(path!.includes(".smartergpt/prompts/canon-only.md"), "Path should point to canon");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("respects LEX_PROMPTS_DIR environment variable (highest priority)", () => {
    const canonContent = "CANON VERSION";
    const localContent = "LOCAL VERSION";
    const envContent = "ENV OVERRIDE VERSION";

    // Create same prompt in all three locations
    writeFileSync(join(canonDir, "env-test.md"), canonContent);
    writeFileSync(join(localDir, "env-test.md"), localContent);
    writeFileSync(join(envDir, "env-test.md"), envContent);

    // Set both REPO_ROOT and LEX_PROMPTS_DIR
    process.env.REPO_ROOT = tempRoot;
    process.env.LEX_PROMPTS_DIR = envDir;
    process.chdir(tempRoot);

    try {
      const loaded = loadPrompt("env-test.md");
      assert.strictEqual(loaded, envContent, "Should load from LEX_PROMPTS_DIR (highest priority)");

      const path = getPromptPath("env-test.md");
      assert.ok(path !== null, "Should return a path");
      assert.strictEqual(path, join(envDir, "env-test.md"), "Path should point to env dir");
    } finally {
      delete process.env.LEX_PROMPTS_DIR;
      process.chdir(originalCwd);
    }
  });

  it("loads from LEX_PROMPTS_DIR without repo root (env-only scenario)", () => {
    const envContent = "ENV ONLY PROMPT CONTENT";
    writeFileSync(join(envDir, "env-only.md"), envContent);

    // Clear REPO_ROOT and only set LEX_PROMPTS_DIR
    delete process.env.REPO_ROOT;
    process.env.LEX_PROMPTS_DIR = envDir;

    // Change to a directory outside any repo
    const isolatedDir = join(process.cwd(), ".test-isolated");
    mkdirSync(isolatedDir, { recursive: true });
    process.chdir(isolatedDir);

    try {
      const loaded = loadPrompt("env-only.md");
      assert.strictEqual(
        loaded,
        envContent,
        "Should load from LEX_PROMPTS_DIR even without repo root"
      );

      const path = getPromptPath("env-only.md");
      assert.ok(path !== null, "Should return a path");
      assert.strictEqual(path, join(envDir, "env-only.md"), "Path should point to env dir");
    } finally {
      process.chdir(originalCwd);
      delete process.env.LEX_PROMPTS_DIR;
      if (existsSync(isolatedDir)) {
        rmSync(isolatedDir, { recursive: true, force: true });
      }
    }
  });

  it("throws helpful error when prompt not found in any location", () => {
    process.env.REPO_ROOT = tempRoot;
    delete process.env.LEX_PROMPTS_DIR;
    process.chdir(tempRoot);

    try {
      assert.throws(
        () => loadPrompt("does-not-exist.md"),
        /Prompt file 'does-not-exist.md' not found/,
        "Should throw error with attempted paths"
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("lists prompts from all locations (deduplicated)", () => {
    // Create prompts across all locations
    writeFileSync(join(canonDir, "shared.md"), "canon");
    writeFileSync(join(canonDir, "canon-unique.md"), "canon");
    writeFileSync(join(localDir, "shared.md"), "local override");
    writeFileSync(join(localDir, "local-unique.md"), "local");
    writeFileSync(join(envDir, "env-unique.md"), "env");

    process.env.REPO_ROOT = tempRoot;
    process.env.LEX_PROMPTS_DIR = envDir;
    process.chdir(tempRoot);

    try {
      const prompts = listPrompts();

      assert.ok(Array.isArray(prompts), "Should return an array");
      assert.ok(prompts.includes("shared.md"), "Should include shared prompt");
      assert.ok(prompts.includes("canon-unique.md"), "Should include canon-unique");
      assert.ok(prompts.includes("local-unique.md"), "Should include local-unique");
      assert.ok(prompts.includes("env-unique.md"), "Should include env-unique");

      // Verify deduplication (shared.md appears in multiple locations)
      const sharedCount = prompts.filter((p) => p === "shared.md").length;
      assert.strictEqual(sharedCount, 1, "Should deduplicate shared prompts");

      // Verify sorting
      const sorted = [...prompts].sort();
      assert.deepStrictEqual(prompts, sorted, "Should return sorted list");
    } finally {
      delete process.env.LEX_PROMPTS_DIR;
      process.chdir(originalCwd);
    }
  });
});
