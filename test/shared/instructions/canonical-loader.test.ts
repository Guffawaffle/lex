/**
 * Tests for canonical instruction loader
 *
 * Tests cover:
 * - File exists with content
 * - File missing
 * - Custom path in config
 * - Hash determinism
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadCanonicalInstructions,
  DEFAULT_CANONICAL_PATH,
} from "../../../src/shared/instructions/canonical-loader.js";
import type { LexYaml } from "../../../src/shared/config/lex-yaml-schema.js";

describe("Canonical Instruction Loader", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-canonical-loader-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("loadCanonicalInstructions", () => {
    it("should load canonical instructions when file exists", () => {
      // Create the default canonical file
      const canonicalDir = join(testDir, ".smartergpt", "instructions");
      mkdirSync(canonicalDir, { recursive: true });
      const content = "# Test Instructions\n\nThis is a test.";
      writeFileSync(join(canonicalDir, "lex.md"), content);

      const result = loadCanonicalInstructions(testDir);

      assert.strictEqual(result.exists, true, "exists should be true");
      assert.strictEqual(result.content, content, "content should match");
      assert.strictEqual(
        result.path,
        join(testDir, DEFAULT_CANONICAL_PATH),
        "path should be absolute"
      );
      assert.ok(result.hash.length === 64, "hash should be 64 character hex string");
    });

    it("should return exists: false when file is missing", () => {
      const result = loadCanonicalInstructions(testDir);

      assert.strictEqual(result.exists, false, "exists should be false");
      assert.strictEqual(result.content, "", "content should be empty");
      assert.strictEqual(result.hash, "", "hash should be empty");
      assert.strictEqual(
        result.path,
        join(testDir, DEFAULT_CANONICAL_PATH),
        "path should still be provided"
      );
    });

    it("should use custom path from config", () => {
      // Create a custom canonical file
      const customDir = join(testDir, "custom", "path");
      mkdirSync(customDir, { recursive: true });
      const content = "# Custom Instructions";
      writeFileSync(join(customDir, "instructions.md"), content);

      const config: LexYaml = {
        version: 1,
        instructions: {
          canonical: "custom/path/instructions.md",
        },
      };

      const result = loadCanonicalInstructions(testDir, config);

      assert.strictEqual(result.exists, true, "exists should be true");
      assert.strictEqual(result.content, content, "content should match");
      assert.strictEqual(
        result.path,
        join(testDir, "custom/path/instructions.md"),
        "path should use custom path"
      );
    });

    it("should return exists: false for custom path when file is missing", () => {
      const config: LexYaml = {
        version: 1,
        instructions: {
          canonical: "nonexistent/path.md",
        },
      };

      const result = loadCanonicalInstructions(testDir, config);

      assert.strictEqual(result.exists, false, "exists should be false");
      assert.strictEqual(result.content, "", "content should be empty");
      assert.strictEqual(result.hash, "", "hash should be empty");
      assert.strictEqual(
        result.path,
        join(testDir, "nonexistent/path.md"),
        "path should reflect custom path"
      );
    });

    it("should use default path when config has no instructions", () => {
      // Create the default canonical file
      const canonicalDir = join(testDir, ".smartergpt", "instructions");
      mkdirSync(canonicalDir, { recursive: true });
      const content = "# Default Instructions";
      writeFileSync(join(canonicalDir, "lex.md"), content);

      const config: LexYaml = {
        version: 1,
        // No instructions property
      };

      const result = loadCanonicalInstructions(testDir, config);

      assert.strictEqual(result.exists, true, "exists should be true");
      assert.strictEqual(result.content, content, "content should match");
      assert.strictEqual(
        result.path,
        join(testDir, DEFAULT_CANONICAL_PATH),
        "path should use default"
      );
    });

    describe("hash determinism", () => {
      it("should produce deterministic hash for same content", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });
        const content = "# Deterministic Content\n\nSame content produces same hash.";
        writeFileSync(join(canonicalDir, "lex.md"), content);

        const result1 = loadCanonicalInstructions(testDir);
        const result2 = loadCanonicalInstructions(testDir);

        assert.strictEqual(result1.hash, result2.hash, "hashes should be identical");
      });

      it("should produce different hash for different content", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });

        // First content
        writeFileSync(join(canonicalDir, "lex.md"), "Content A");
        const result1 = loadCanonicalInstructions(testDir);

        // Different content
        writeFileSync(join(canonicalDir, "lex.md"), "Content B");
        const result2 = loadCanonicalInstructions(testDir);

        assert.notStrictEqual(result1.hash, result2.hash, "hashes should be different");
      });

      it("should produce valid SHA-256 hash format", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });
        writeFileSync(join(canonicalDir, "lex.md"), "Test content");

        const result = loadCanonicalInstructions(testDir);

        // SHA-256 produces 64 character hex string
        assert.strictEqual(result.hash.length, 64, "hash should be 64 characters");
        assert.ok(/^[a-f0-9]+$/.test(result.hash), "hash should be lowercase hex");
      });
    });

    describe("edge cases", () => {
      it("should handle empty file", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });
        writeFileSync(join(canonicalDir, "lex.md"), "");

        const result = loadCanonicalInstructions(testDir);

        assert.strictEqual(result.exists, true, "exists should be true for empty file");
        assert.strictEqual(result.content, "", "content should be empty");
        assert.ok(result.hash.length === 64, "hash should still be computed for empty content");
      });

      it("should handle file with only whitespace", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });
        writeFileSync(join(canonicalDir, "lex.md"), "   \n\t\n   ");

        const result = loadCanonicalInstructions(testDir);

        assert.strictEqual(result.exists, true, "exists should be true");
        assert.strictEqual(result.content, "   \n\t\n   ", "content should preserve whitespace");
      });

      it("should handle unicode content", () => {
        const canonicalDir = join(testDir, ".smartergpt", "instructions");
        mkdirSync(canonicalDir, { recursive: true });
        const content = "# Instructions 🚀\n\nこんにちは世界\n\nÉmoji: 👍";
        writeFileSync(join(canonicalDir, "lex.md"), content);

        const result = loadCanonicalInstructions(testDir);

        assert.strictEqual(result.exists, true, "exists should be true");
        assert.strictEqual(result.content, content, "content should match unicode");
      });

      it("should return correct structure shape", () => {
        const result = loadCanonicalInstructions(testDir);

        // Verify structure has expected properties
        assert.ok("content" in result, "Result should have content property");
        assert.ok("path" in result, "Result should have path property");
        assert.ok("exists" in result, "Result should have exists property");
        assert.ok("hash" in result, "Result should have hash property");

        // Verify types
        assert.strictEqual(typeof result.content, "string");
        assert.strictEqual(typeof result.path, "string");
        assert.strictEqual(typeof result.exists, "boolean");
        assert.strictEqual(typeof result.hash, "string");
      });
    });
  });
});
