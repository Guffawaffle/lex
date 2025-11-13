/**
 * Tests for Prompt Loader
 *
 * Run with: npx tsx --test test/shared/prompts/loader.test.ts
 */

import { strict as assert } from "assert";
import { test, describe, before, after } from "node:test";
import { loadPrompt, getPromptPath, listPrompts } from "@app/shared/prompts/loader.js";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("loadPrompt", () => {
  test("loads prompt from package canon", () => {
    const prompt = loadPrompt("test.md");
    assert.ok(prompt);
    assert.ok(prompt.includes("test prompt"));
  });

  test("throws error for non-existent prompt", () => {
    assert.throws(() => {
      loadPrompt("nonexistent-prompt.md");
    }, /Prompt file 'nonexistent-prompt.md' not found/);
  });

  test("error message shows all attempted paths", () => {
    try {
      loadPrompt("missing.md");
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assert.ok(error.message.includes("Tried:"));
        assert.ok(error.message.includes(".smartergpt.local"));
      } else {
        assert.fail("Error should be an instance of Error");
      }
    }
  });

  test("local overlay takes precedence over package canon", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const localDir = join(repoRoot, ".smartergpt.local", "prompts");
    const localPath = join(localDir, "test-overlay.md");

    let createdLocalFile = false;

    try {
      // Create local overlay
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }
      writeFileSync(localPath, "# Local Overlay\n\nThis is from local overlay");
      createdLocalFile = true;

      const prompt = loadPrompt("test-overlay.md");
      assert.ok(prompt.includes("Local Overlay"));
      assert.ok(prompt.includes("local overlay"));
    } finally {
      // Cleanup
      if (createdLocalFile && existsSync(localPath)) {
        unlinkSync(localPath);
      }
    }
  });

  test("environment variable override works", async () => {
    const originalEnv = process.env.LEX_PROMPTS_DIR;
    const repoRoot = resolve(__dirname, "../../..");
    const envDir = join(repoRoot, ".tmp-prompts-test");
    const envPath = join(envDir, "env-test.md");

    let createdEnvFile = false;

    try {
      // Create env override directory
      if (!existsSync(envDir)) {
        mkdirSync(envDir, { recursive: true });
      }
      writeFileSync(envPath, "# Env Override\n\nThis is from env override");
      createdEnvFile = true;

      process.env.LEX_PROMPTS_DIR = envDir;
      const prompt = loadPrompt("env-test.md");
      assert.ok(prompt.includes("Env Override"));
    } finally {
      // Cleanup
      if (originalEnv) {
        process.env.LEX_PROMPTS_DIR = originalEnv;
      } else {
        delete process.env.LEX_PROMPTS_DIR;
      }
      if (createdEnvFile && existsSync(envPath)) {
        unlinkSync(envPath);
      }
      if (existsSync(envDir)) {
        try {
          const fs = await import("fs");
          fs.rmSync(envDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });
});

describe("getPromptPath", () => {
  test("returns path for existing prompt", () => {
    const path = getPromptPath("test.md");
    assert.ok(path);
    assert.ok(path.endsWith("test.md"));
  });

  test("returns null for non-existent prompt", () => {
    const path = getPromptPath("nonexistent.md");
    assert.strictEqual(path, null);
  });
});

describe("listPrompts", () => {
  test("lists available prompts", () => {
    const prompts = listPrompts();
    assert.ok(Array.isArray(prompts));
    // Should include at least the test prompt
    assert.ok(prompts.includes("test.md"));
  });

  test("returns sorted array", () => {
    const prompts = listPrompts();
    const sorted = [...prompts].sort();
    assert.deepEqual(prompts, sorted);
  });
});
