/**
 * Tests for FTS5 query normalization utilities
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { normalizeFTS5Query } from "../../../src/memory/store/fts5-utils.js";

describe("normalizeFTS5Query", () => {
  describe("hyphen handling (FTS5 negation operator)", () => {
    it("replaces single hyphens with spaces and adds wildcards", () => {
      assert.strictEqual(normalizeFTS5Query("senior-dev"), "senior* dev*");
    });

    it("handles multiple hyphens", () => {
      assert.strictEqual(normalizeFTS5Query("AX-manifesto-2025-12"), "AX* manifesto* 2025* 12*");
    });

    it("handles hyphen at start (which would negate first term)", () => {
      assert.strictEqual(normalizeFTS5Query("-senior"), "senior*");
    });

    it("handles hyphen at end", () => {
      assert.strictEqual(normalizeFTS5Query("senior-"), "senior*");
    });
  });

  describe("other FTS5 special characters", () => {
    it("removes colons (column-specific syntax) and adds wildcards", () => {
      assert.strictEqual(normalizeFTS5Query("keywords:test"), "keywords* test*");
    });

    it("preserves trailing asterisks (valid prefix wildcard)", () => {
      assert.strictEqual(normalizeFTS5Query("test*"), "test*");
    });

    it("removes leading asterisks (invalid in FTS5) and adds trailing", () => {
      assert.strictEqual(normalizeFTS5Query("*test"), "test*");
    });

    it("removes quotes (phrase grouping)", () => {
      assert.strictEqual(normalizeFTS5Query('"exact phrase"'), "exact* phrase*");
    });

    it("handles mixed special characters with preserved trailing asterisk", () => {
      // Note: The trailing asterisk after "dev" is preserved since it's a valid FTS5 prefix query
      assert.strictEqual(normalizeFTS5Query('ref:"senior-dev*"'), "ref* senior* dev*");
    });
  });

  describe("whitespace normalization", () => {
    it("collapses multiple spaces", () => {
      assert.strictEqual(normalizeFTS5Query("test   search"), "test* search*");
    });

    it("trims leading and trailing whitespace", () => {
      assert.strictEqual(normalizeFTS5Query("  test search  "), "test* search*");
    });

    it("handles tabs and newlines", () => {
      assert.strictEqual(normalizeFTS5Query("test\t\nsearch"), "test* search*");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for only special characters", () => {
      assert.strictEqual(normalizeFTS5Query("---"), "");
    });

    it("returns empty string for only whitespace", () => {
      assert.strictEqual(normalizeFTS5Query("   "), "");
    });

    it("preserves alphanumeric content and adds wildcards", () => {
      assert.strictEqual(normalizeFTS5Query("Test123"), "Test123*");
    });

    it("handles empty string input", () => {
      assert.strictEqual(normalizeFTS5Query(""), "");
    });
  });

  describe("real-world recall queries (dogfood)", () => {
    // These are actual queries that failed before the fix
    it("senior-dev reference point", () => {
      assert.strictEqual(
        normalizeFTS5Query("senior-dev-enhancements-2025-12"),
        "senior* dev* enhancements* 2025* 12*"
      );
    });

    it("AX-001 issue reference", () => {
      assert.strictEqual(normalizeFTS5Query("AX-001"), "AX* 001*");
    });

    it("merge-weave workflow", () => {
      assert.strictEqual(normalizeFTS5Query("merge-weave"), "merge* weave*");
    });

    it("frame ID with uuid", () => {
      // Users might try to search by frame ID
      assert.strictEqual(
        normalizeFTS5Query("0db4dc19-4dbb-4313-8816-2d8e12bb0cef"),
        "0db4dc19* 4dbb* 4313* 8816* 2d8e12bb0cef*"
      );
    });

    it("prefix wildcard search (FTS5 feature)", () => {
      // Trailing asterisk should be preserved for prefix queries
      assert.strictEqual(normalizeFTS5Query("datab*"), "datab*");
    });
  });

  describe("fuzzy matching (AX-006)", () => {
    it("adds prefix wildcard to single term", () => {
      assert.strictEqual(normalizeFTS5Query("debug"), "debug*");
    });

    it("adds prefix wildcards to multiple terms", () => {
      assert.strictEqual(normalizeFTS5Query("debug hidden variables"), "debug* hidden* variables*");
    });

    it("doesn't double-add wildcards", () => {
      assert.strictEqual(normalizeFTS5Query("debug*"), "debug*");
    });

    it("adds wildcards after hyphen normalization", () => {
      assert.strictEqual(normalizeFTS5Query("hidden-variables"), "hidden* variables*");
    });
  });

  describe("exact mode (disable fuzzy matching)", () => {
    it("skips automatic prefix wildcards when exact=true", () => {
      assert.strictEqual(normalizeFTS5Query("debug", true), "debug");
    });

    it("normalizes hyphens but doesn't add wildcards when exact=true", () => {
      assert.strictEqual(normalizeFTS5Query("senior-dev", true), "senior dev");
    });

    it("still preserves user-provided wildcards when exact=true", () => {
      assert.strictEqual(normalizeFTS5Query("test*", true), "test*");
    });

    it("normalizes special chars but doesn't add wildcards when exact=true", () => {
      assert.strictEqual(normalizeFTS5Query("AX-001", true), "AX 001");
    });
  });
});
