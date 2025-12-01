/**
 * Tests for the Canonical Instruction Loader
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadCanonicalInstructions,
  computeHash,
  getDefaultCanonicalPath,
} from "../../../src/shared/instructions/canonical-loader.js";

describe("Canonical Instruction Loader", () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-loader-test-"));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadCanonicalInstructions", () => {
    it("loads content from default path when file exists", () => {
      const repoRoot = path.join(tempDir, "default-path");
      const canonicalDir = path.join(repoRoot, ".smartergpt", "instructions");
      fs.mkdirSync(canonicalDir, { recursive: true });

      const content = "# Lex Instructions\n\nThis is the canonical source.";
      fs.writeFileSync(path.join(canonicalDir, "lex.md"), content);

      const result = loadCanonicalInstructions(repoRoot);

      assert.equal(result.exists, true);
      assert.equal(result.content, content);
      assert.ok(result.path.endsWith("lex.md"));
      assert.ok(result.hash.length > 0);
    });

    it("returns empty content when file does not exist", () => {
      const repoRoot = path.join(tempDir, "no-file");
      fs.mkdirSync(repoRoot, { recursive: true });

      const result = loadCanonicalInstructions(repoRoot);

      assert.equal(result.exists, false);
      assert.equal(result.content, "");
      assert.ok(result.path.includes(".smartergpt/instructions/lex.md"));
    });

    it("uses custom path from config", () => {
      const repoRoot = path.join(tempDir, "custom-path");
      const customDir = path.join(repoRoot, "docs", "ai");
      fs.mkdirSync(customDir, { recursive: true });

      const content = "# Custom Location";
      fs.writeFileSync(path.join(customDir, "instructions.md"), content);

      const config = {
        version: 1 as const,
        instructions: {
          canonical: "docs/ai/instructions.md",
        },
      };

      const result = loadCanonicalInstructions(repoRoot, config);

      assert.equal(result.exists, true);
      assert.equal(result.content, content);
      assert.ok(result.path.includes("docs/ai/instructions.md"));
    });

    it("generates deterministic hash for content", () => {
      const repoRoot = path.join(tempDir, "hash-test");
      const canonicalDir = path.join(repoRoot, ".smartergpt", "instructions");
      fs.mkdirSync(canonicalDir, { recursive: true });

      const content = "Consistent content";
      fs.writeFileSync(path.join(canonicalDir, "lex.md"), content);

      const result1 = loadCanonicalInstructions(repoRoot);
      const result2 = loadCanonicalInstructions(repoRoot);

      assert.equal(result1.hash, result2.hash);
    });

    it("generates different hashes for different content", () => {
      const repoRoot1 = path.join(tempDir, "hash-diff-1");
      const repoRoot2 = path.join(tempDir, "hash-diff-2");

      for (const root of [repoRoot1, repoRoot2]) {
        fs.mkdirSync(path.join(root, ".smartergpt", "instructions"), {
          recursive: true,
        });
      }

      fs.writeFileSync(path.join(repoRoot1, ".smartergpt", "instructions", "lex.md"), "Content A");
      fs.writeFileSync(path.join(repoRoot2, ".smartergpt", "instructions", "lex.md"), "Content B");

      const result1 = loadCanonicalInstructions(repoRoot1);
      const result2 = loadCanonicalInstructions(repoRoot2);

      assert.notEqual(result1.hash, result2.hash);
    });
  });

  describe("computeHash", () => {
    it("returns SHA-256 hex string", () => {
      const hash = computeHash("test content");

      assert.equal(hash.length, 64); // SHA-256 produces 64 hex chars
      assert.match(hash, /^[a-f0-9]+$/);
    });

    it("is deterministic", () => {
      const content = "same input";
      assert.equal(computeHash(content), computeHash(content));
    });

    it("handles empty string", () => {
      const hash = computeHash("");
      assert.equal(hash.length, 64);
    });
  });

  describe("getDefaultCanonicalPath", () => {
    it("returns expected default path", () => {
      const defaultPath = getDefaultCanonicalPath();
      assert.equal(defaultPath, ".smartergpt/instructions/lex.md");
    });
  });
});
