/**
 * Unit tests for epic sync logic
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { parseEpicRef } from "../../../dist/shared/github/epic-sync.js";

describe("Epic Sync", () => {
  describe("parseEpicRef", () => {
    it("should parse epic reference with org", () => {
      const ref = parseEpicRef("Guffawaffle/lexrunner#653");
      assert.ok(ref);
      assert.strictEqual(ref.owner, "Guffawaffle");
      assert.strictEqual(ref.repo, "lexrunner");
      assert.strictEqual(ref.number, 653);
    });

    it("should parse epic reference without org", () => {
      const ref = parseEpicRef("lexrunner#653");
      assert.ok(ref);
      assert.strictEqual(ref.owner, undefined);
      assert.strictEqual(ref.repo, "lexrunner");
      assert.strictEqual(ref.number, 653);
    });

    it("should return null for invalid reference", () => {
      assert.strictEqual(parseEpicRef("invalid"), null);
      assert.strictEqual(parseEpicRef("123"), null);
    });
  });

  // Note: Full integration tests for syncEpicStatus would require
  // GitHub API mocking or live API access, which is beyond the scope
  // of unit tests. The core logic is tested via the markdown parser tests.
});
