/**
 * Tests for path glob matcher
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  matchesPattern,
  isPathAllowed,
  filterPathsByPolicy,
  getDenialReason,
} from "../../../dist/shared/policy/path-matcher.js";

describe("matchesPattern", () => {
  describe("single segment wildcard (*)", () => {
    it("matches *.ts against foo.ts", () => {
      assert.strictEqual(matchesPattern("foo.ts", "*.ts"), true);
    });

    it("does not match *.ts against foo.js", () => {
      assert.strictEqual(matchesPattern("foo.js", "*.ts"), false);
    });

    it("does not match *.ts against src/foo.ts (no directory match)", () => {
      assert.strictEqual(matchesPattern("src/foo.ts", "*.ts"), false);
    });

    it("matches src/*.ts against src/foo.ts", () => {
      assert.strictEqual(matchesPattern("src/foo.ts", "src/*.ts"), true);
    });

    it("does not match src/*.ts against src/sub/foo.ts", () => {
      assert.strictEqual(matchesPattern("src/sub/foo.ts", "src/*.ts"), false);
    });
  });

  describe("recursive wildcard (**)", () => {
    it("matches src/** against src/foo.ts", () => {
      assert.strictEqual(matchesPattern("src/foo.ts", "src/**"), true);
    });

    it("matches src/** against src/sub/foo.ts", () => {
      assert.strictEqual(matchesPattern("src/sub/foo.ts", "src/**"), true);
    });

    it("matches src/** against src/a/b/c/d.ts", () => {
      assert.strictEqual(matchesPattern("src/a/b/c/d.ts", "src/**"), true);
    });

    it("does not match src/** against test/foo.ts", () => {
      assert.strictEqual(matchesPattern("test/foo.ts", "src/**"), false);
    });

    it("matches **/*.ts against src/foo.ts", () => {
      assert.strictEqual(matchesPattern("src/foo.ts", "**/*.ts"), true);
    });

    it("matches **/*.ts against deep/path/file.ts", () => {
      assert.strictEqual(matchesPattern("deep/path/file.ts", "**/*.ts"), true);
    });

    it("matches **/*.spec.ts against test/unit/foo.spec.ts", () => {
      assert.strictEqual(matchesPattern("test/unit/foo.spec.ts", "**/*.spec.ts"), true);
    });
  });

  describe("exact matches", () => {
    it("matches exact path", () => {
      assert.strictEqual(matchesPattern("src/foo.ts", "src/foo.ts"), true);
    });

    it("does not match different path", () => {
      assert.strictEqual(matchesPattern("src/bar.ts", "src/foo.ts"), false);
    });
  });

  describe("path normalization", () => {
    it("normalizes backslashes to forward slashes", () => {
      assert.strictEqual(matchesPattern("src\\foo\\bar.ts", "src/**"), true);
    });

    it("removes leading ./", () => {
      assert.strictEqual(matchesPattern("./src/foo.ts", "src/**"), true);
    });
  });
});

describe("isPathAllowed", () => {
  describe("denied paths take precedence", () => {
    it("denies path matching denied pattern even if allowed", () => {
      const allowed = ["src/**"];
      const denied = ["src/secrets/**"];
      assert.strictEqual(isPathAllowed("src/secrets/key.ts", allowed, denied), false);
    });

    it("allows path not matching denied pattern", () => {
      const allowed = ["src/**"];
      const denied = ["src/secrets/**"];
      assert.strictEqual(isPathAllowed("src/utils/helper.ts", allowed, denied), true);
    });
  });

  describe("empty allowed list means allow all", () => {
    it("allows any path when allowed is empty", () => {
      assert.strictEqual(isPathAllowed("anywhere/file.ts", [], []), true);
    });

    it("still respects denied even with empty allowed", () => {
      assert.strictEqual(isPathAllowed("secrets/key.txt", [], ["secrets/**"]), false);
    });
  });

  describe("allowed list filtering", () => {
    it("allows path matching allowed pattern", () => {
      assert.strictEqual(isPathAllowed("src/foo.ts", ["src/**"], []), true);
    });

    it("denies path not matching any allowed pattern", () => {
      assert.strictEqual(isPathAllowed("docs/readme.md", ["src/**", "test/**"], []), false);
    });

    it("allows path matching any of multiple allowed patterns", () => {
      const allowed = ["src/**", "test/**", "docs/**"];
      assert.strictEqual(isPathAllowed("test/foo.spec.ts", allowed, []), true);
      assert.strictEqual(isPathAllowed("docs/api.md", allowed, []), true);
    });
  });
});

describe("filterPathsByPolicy", () => {
  it("separates paths into allowed and denied", () => {
    const paths = ["src/foo.ts", "src/bar.ts", "secrets/key.txt", "docs/readme.md"];
    const allowed = ["src/**"];
    const denied = ["secrets/**"];

    const result = filterPathsByPolicy(paths, allowed, denied);

    assert.deepStrictEqual(result.allowed, ["src/foo.ts", "src/bar.ts"]);
    assert.deepStrictEqual(result.denied, ["secrets/key.txt", "docs/readme.md"]);
  });

  it("handles empty input", () => {
    const result = filterPathsByPolicy([], ["src/**"], []);
    assert.deepStrictEqual(result.allowed, []);
    assert.deepStrictEqual(result.denied, []);
  });
});

describe("getDenialReason", () => {
  it("returns null for allowed paths", () => {
    const reason = getDenialReason("src/foo.ts", ["src/**"], []);
    assert.strictEqual(reason, null);
  });

  it("explains denial due to denied pattern", () => {
    const reason = getDenialReason("secrets/key.txt", ["src/**"], ["secrets/**"]);
    assert.ok(reason?.includes("denied pattern"));
    assert.ok(reason?.includes("secrets/**"));
  });

  it("explains denial due to not matching allowed patterns", () => {
    const reason = getDenialReason("docs/readme.md", ["src/**", "test/**"], []);
    assert.ok(reason?.includes("does not match any allowed"));
    assert.ok(reason?.includes("src/**"));
  });
});
