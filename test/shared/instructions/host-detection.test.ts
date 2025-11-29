/**
 * Tests for host detection utilities
 *
 * Tests cover:
 * - Both hosts present
 * - Copilot only
 * - Cursor only
 * - Neither present
 * - Edge cases
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectAvailableHosts } from "../../../src/shared/instructions/host-detection.js";

describe("Host Detection", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-host-detection-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("detectAvailableHosts", () => {
    it("should detect both hosts when .github/ and .cursorrules exist", () => {
      // Create .github directory
      mkdirSync(join(testDir, ".github"));
      // Create .cursorrules file
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor rules");

      const result = detectAvailableHosts(testDir);

      assert.strictEqual(result.copilot.available, true, "Copilot should be available");
      assert.strictEqual(
        result.copilot.path,
        join(testDir, ".github", "copilot-instructions.md"),
        "Copilot path should point to copilot-instructions.md"
      );
      assert.strictEqual(result.cursor.available, true, "Cursor should be available");
      assert.strictEqual(
        result.cursor.path,
        join(testDir, ".cursorrules"),
        "Cursor path should point to .cursorrules"
      );
    });

    it("should detect only Copilot when only .github/ exists", () => {
      // Create .github directory
      mkdirSync(join(testDir, ".github"));

      const result = detectAvailableHosts(testDir);

      assert.strictEqual(result.copilot.available, true, "Copilot should be available");
      assert.strictEqual(
        result.copilot.path,
        join(testDir, ".github", "copilot-instructions.md"),
        "Copilot path should point to copilot-instructions.md"
      );
      assert.strictEqual(result.cursor.available, false, "Cursor should not be available");
      assert.strictEqual(result.cursor.path, null, "Cursor path should be null");
    });

    it("should detect only Cursor when only .cursorrules exists", () => {
      // Create .cursorrules file
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor rules");

      const result = detectAvailableHosts(testDir);

      assert.strictEqual(result.copilot.available, false, "Copilot should not be available");
      assert.strictEqual(result.copilot.path, null, "Copilot path should be null");
      assert.strictEqual(result.cursor.available, true, "Cursor should be available");
      assert.strictEqual(
        result.cursor.path,
        join(testDir, ".cursorrules"),
        "Cursor path should point to .cursorrules"
      );
    });

    it("should detect neither host when neither .github/ nor .cursorrules exist", () => {
      const result = detectAvailableHosts(testDir);

      assert.strictEqual(result.copilot.available, false, "Copilot should not be available");
      assert.strictEqual(result.copilot.path, null, "Copilot path should be null");
      assert.strictEqual(result.cursor.available, false, "Cursor should not be available");
      assert.strictEqual(result.cursor.path, null, "Cursor path should be null");
    });

    describe("Edge cases", () => {
      it("should not detect Copilot when .github is a file instead of directory", () => {
        // Create .github as a file, not a directory
        writeFileSync(join(testDir, ".github"), "# Not a directory");

        const result = detectAvailableHosts(testDir);

        assert.strictEqual(
          result.copilot.available,
          false,
          "Copilot should not be available when .github is a file"
        );
        assert.strictEqual(result.copilot.path, null, "Copilot path should be null");
      });

      it("should not detect Cursor when .cursorrules is a directory instead of file", () => {
        // Create .cursorrules as a directory, not a file
        mkdirSync(join(testDir, ".cursorrules"));

        const result = detectAvailableHosts(testDir);

        assert.strictEqual(
          result.cursor.available,
          false,
          "Cursor should not be available when .cursorrules is a directory"
        );
        assert.strictEqual(result.cursor.path, null, "Cursor path should be null");
      });

      it("should detect Copilot even when .github/ is empty", () => {
        // Create empty .github directory
        mkdirSync(join(testDir, ".github"));

        const result = detectAvailableHosts(testDir);

        assert.strictEqual(
          result.copilot.available,
          true,
          "Copilot should be available with empty .github directory"
        );
        assert.strictEqual(
          result.copilot.path,
          join(testDir, ".github", "copilot-instructions.md"),
          "Copilot path should point to copilot-instructions.md"
        );
      });

      it("should detect Cursor even when .cursorrules is empty", () => {
        // Create empty .cursorrules file
        writeFileSync(join(testDir, ".cursorrules"), "");

        const result = detectAvailableHosts(testDir);

        assert.strictEqual(
          result.cursor.available,
          true,
          "Cursor should be available with empty .cursorrules file"
        );
        assert.strictEqual(
          result.cursor.path,
          join(testDir, ".cursorrules"),
          "Cursor path should point to .cursorrules"
        );
      });

      it("should return correct structure shape", () => {
        const result = detectAvailableHosts(testDir);

        // Verify structure has expected properties
        assert.ok("copilot" in result, "Result should have copilot property");
        assert.ok("cursor" in result, "Result should have cursor property");
        assert.ok("available" in result.copilot, "Copilot should have available property");
        assert.ok("path" in result.copilot, "Copilot should have path property");
        assert.ok("available" in result.cursor, "Cursor should have available property");
        assert.ok("path" in result.cursor, "Cursor should have path property");

        // Verify types
        assert.strictEqual(typeof result.copilot.available, "boolean");
        assert.strictEqual(typeof result.cursor.available, "boolean");
      });
    });
  });
});
