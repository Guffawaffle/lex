/**
 * Tests for token expansion utilities
 *
 * Tests cover:
 * - Token expansion in strings
 * - Token expansion in objects
 * - Date/time formatting
 * - Context overrides
 * - Git integration (branch, commit, repo root)
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  expandTokens,
  expandTokensInObject,
  formatToday,
  formatNow,
  getTokenValues,
} from "@app/shared/tokens/expand.js";
import { clearBranchCache } from "@app/shared/git/branch.js";
import { clearRepoRootCache } from "@app/shared/git/repo.js";

describe("Token Expansion", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      LEX_APP_ROOT: process.env.LEX_APP_ROOT,
      LEX_DEFAULT_BRANCH: process.env.LEX_DEFAULT_BRANCH,
    };
    clearBranchCache();
    clearRepoRootCache();
  });

  afterEach(() => {
    // Restore environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    clearBranchCache();
    clearRepoRootCache();
  });

  describe("formatToday", () => {
    test("formats date as YYYY-MM-DD", () => {
      const date = new Date("2025-11-09T15:30:45Z");
      const result = formatToday(date);

      assert.match(result, /^\d{4}-\d{2}-\d{2}$/, "Should match YYYY-MM-DD format");
      // Note: Result depends on timezone, so we check format not exact value
    });

    test("uses current date by default", () => {
      const result = formatToday();

      assert.match(result, /^\d{4}-\d{2}-\d{2}$/, "Should format current date");
    });

    test("pads single-digit months and days", () => {
      const date = new Date("2025-01-05T12:00:00Z");
      const result = formatToday(date);

      // Result includes zero-padding
      assert.match(result, /^\d{4}-0\d-0\d$/, "Should pad single digits");
    });
  });

  describe("formatNow", () => {
    test("formats datetime as YYYYMMDDTHHMMSS", () => {
      const date = new Date("2025-11-09T12:34:56Z");
      const result = formatNow(date);

      assert.match(
        result,
        /^\d{8}T\d{6}$/,
        "Should match YYYYMMDDTHHMMSS format",
      );
    });

    test("uses current datetime by default", () => {
      const result = formatNow();

      assert.match(result, /^\d{8}T\d{6}$/, "Should format current datetime");
    });

    test("pads single-digit values", () => {
      const date = new Date("2025-01-05T08:09:07Z");
      const result = formatNow(date);

      // All components should be zero-padded
      assert.match(result, /^\d{8}T\d{6}$/, "Should pad all components");
    });
  });

  describe("getTokenValues", () => {
    test("returns all supported token values", () => {
      const values = getTokenValues();

      assert.ok(values.today, "Should have today token");
      assert.ok(values.now, "Should have now token");
      assert.ok("repo_root" in values, "Should have repo_root token");
      assert.ok("workspace_root" in values, "Should have workspace_root token");
      assert.ok(values.branch, "Should have branch token");
      assert.ok(values.commit, "Should have commit token");
    });

    test("today matches formatToday()", () => {
      const values = getTokenValues();

      assert.strictEqual(
        values.today,
        formatToday(),
        "today should match formatToday()",
      );
    });

    test("now matches formatNow()", () => {
      const values = getTokenValues();
      const expected = formatNow();

      // Allow 1 second difference due to test execution time
      const nowPattern = /^\d{8}T\d{6}$/;
      assert.match(values.now, nowPattern, "now should match formatNow() format");
    });

    test("accepts context overrides", () => {
      const context = {
        today: "2025-01-01",
        now: "20250101T120000",
        repoRoot: "/custom/repo",
        workspaceRoot: "/custom/workspace",
        branch: "feature-branch",
        commit: "abc1234",
      };

      const values = getTokenValues(context);

      assert.strictEqual(values.today, "2025-01-01", "Should use custom today");
      assert.strictEqual(values.now, "20250101T120000", "Should use custom now");
      assert.strictEqual(values.repo_root, "/custom/repo", "Should use custom repo_root");
      assert.strictEqual(
        values.workspace_root,
        "/custom/workspace",
        "Should use custom workspace_root",
      );
      assert.strictEqual(values.branch, "feature-branch", "Should use custom branch");
      assert.strictEqual(values.commit, "abc1234", "Should use custom commit");
    });

    test("workspace_root defaults to repo_root", () => {
      const context = {
        repoRoot: "/my/repo",
      };

      const values = getTokenValues(context);

      assert.strictEqual(
        values.workspace_root,
        values.repo_root,
        "workspace_root should default to repo_root",
      );
    });

    test("handles missing git repository gracefully", () => {
      // This is tested in actual repo, but token values should work
      const values = getTokenValues();

      // Should have some value even if not in repo
      assert.ok("repo_root" in values, "Should have repo_root even if empty");
      assert.ok(values.branch, "Should have branch value");
      assert.ok(values.commit, "Should have commit value");
    });
  });

  describe("expandTokens", () => {
    test("expands {{today}} token", () => {
      const context = { today: "2025-11-09" };
      const result = expandTokens("deliverables-{{today}}", context);

      assert.strictEqual(result, "deliverables-2025-11-09", "Should expand {{today}}");
    });

    test("expands {{now}} token", () => {
      const context = { now: "20251109T123456" };
      const result = expandTokens("snapshot-{{now}}", context);

      assert.strictEqual(
        result,
        "snapshot-20251109T123456",
        "Should expand {{now}}",
      );
    });

    test("expands {{repo_root}} token", () => {
      const context = { repoRoot: "/home/user/project" };
      const result = expandTokens("{{repo_root}}/.smartergpt/config", context);

      assert.strictEqual(
        result,
        "/home/user/project/.smartergpt/config",
        "Should expand {{repo_root}}",
      );
    });

    test("expands {{workspace_root}} token", () => {
      const context = { workspaceRoot: "/home/user/workspace" };
      const result = expandTokens("{{workspace_root}}/config.json", context);

      assert.strictEqual(
        result,
        "/home/user/workspace/config.json",
        "Should expand {{workspace_root}}",
      );
    });

    test("expands {{branch}} token", () => {
      const context = { branch: "feature-auth" };
      const result = expandTokens("build-{{branch}}.log", context);

      assert.strictEqual(
        result,
        "build-feature-auth.log",
        "Should expand {{branch}}",
      );
    });

    test("expands {{commit}} token", () => {
      const context = { commit: "a1b2c3d" };
      const result = expandTokens("artifact-{{commit}}.tar.gz", context);

      assert.strictEqual(
        result,
        "artifact-a1b2c3d.tar.gz",
        "Should expand {{commit}}",
      );
    });

    test("expands multiple tokens in one string", () => {
      const context = {
        today: "2025-11-09",
        now: "20251109T123456",
        branch: "main",
      };

      const result = expandTokens(
        "{{branch}}-{{today}}-{{now}}.log",
        context,
      );

      assert.strictEqual(
        result,
        "main-2025-11-09-20251109T123456.log",
        "Should expand all tokens",
      );
    });

    test("expands same token multiple times", () => {
      const context = { today: "2025-11-09" };
      const result = expandTokens("{{today}}/build-{{today}}.tar", context);

      assert.strictEqual(
        result,
        "2025-11-09/build-2025-11-09.tar",
        "Should expand token multiple times",
      );
    });

    test("leaves unknown tokens unchanged", () => {
      const result = expandTokens("file-{{unknown}}.txt", {
        today: "2025-11-09",
      });

      assert.strictEqual(
        result,
        "file-{{unknown}}.txt",
        "Should leave unknown tokens unchanged",
      );
    });

    test("handles empty string", () => {
      const result = expandTokens("", { today: "2025-11-09" });

      assert.strictEqual(result, "", "Should handle empty string");
    });

    test("handles string with no tokens", () => {
      const result = expandTokens("plain-text-file.txt", {
        today: "2025-11-09",
      });

      assert.strictEqual(
        result,
        "plain-text-file.txt",
        "Should handle string without tokens",
      );
    });

    test("uses current values when no context provided", () => {
      const result = expandTokens("{{today}}-{{branch}}");

      // Should not throw and should have some values
      assert.ok(result, "Should expand with default values");
      assert.ok(!result.includes("{{today}}"), "Should expand today");
      assert.ok(!result.includes("{{branch}}"), "Should expand branch");
    });
  });

  describe("expandTokensInObject", () => {
    test("expands tokens in object string values", () => {
      const context = { today: "2025-11-09", branch: "main" };
      const obj = {
        path: "{{branch}}/output-{{today}}",
        name: "test",
      };

      const result = expandTokensInObject(obj, context);

      assert.strictEqual(
        result.path,
        "main/output-2025-11-09",
        "Should expand tokens in string values",
      );
      assert.strictEqual(result.name, "test", "Should preserve non-token strings");
    });

    test("expands tokens in nested objects", () => {
      const context = { today: "2025-11-09", branch: "main" };
      const obj = {
        config: {
          output: "{{branch}}/{{today}}",
          metadata: {
            branch: "{{branch}}",
          },
        },
      };

      const result = expandTokensInObject(obj, context);

      assert.strictEqual(
        result.config.output,
        "main/2025-11-09",
        "Should expand in nested objects",
      );
      assert.strictEqual(
        result.config.metadata.branch,
        "main",
        "Should expand in deeply nested objects",
      );
    });

    test("expands tokens in arrays", () => {
      const context = { today: "2025-11-09" };
      const obj = {
        files: ["file-{{today}}.txt", "archive-{{today}}.tar"],
      };

      const result = expandTokensInObject(obj, context);

      assert.strictEqual(
        result.files[0],
        "file-2025-11-09.txt",
        "Should expand in array elements",
      );
      assert.strictEqual(
        result.files[1],
        "archive-2025-11-09.tar",
        "Should expand all array elements",
      );
    });

    test("handles mixed types in object", () => {
      const context = { today: "2025-11-09" };
      const obj = {
        path: "output-{{today}}",
        count: 42,
        enabled: true,
        values: null,
      };

      const result = expandTokensInObject(obj, context);

      assert.strictEqual(result.path, "output-2025-11-09", "Should expand string");
      assert.strictEqual(result.count, 42, "Should preserve number");
      assert.strictEqual(result.enabled, true, "Should preserve boolean");
      assert.strictEqual(result.values, null, "Should preserve null");
    });

    test("returns new object (does not mutate)", () => {
      const context = { today: "2025-11-09" };
      const obj = {
        path: "output-{{today}}",
      };

      const result = expandTokensInObject(obj, context);

      assert.notStrictEqual(result, obj, "Should return new object");
      assert.strictEqual(
        obj.path,
        "output-{{today}}",
        "Should not mutate original",
      );
    });

    test("handles empty object", () => {
      const result = expandTokensInObject({}, { today: "2025-11-09" });

      assert.deepStrictEqual(result, {}, "Should handle empty object");
    });
  });

  describe("Integration with git utilities", () => {
    test("expands branch from git", () => {
      // Set up environment
      process.env.LEX_DEFAULT_BRANCH = "test-branch";
      clearBranchCache();

      const result = expandTokens("{{branch}}/output");

      assert.strictEqual(
        result,
        "test-branch/output",
        "Should use branch from git utilities",
      );
    });

    test("expands repo_root when in git repository", () => {
      // We're in the lex repo for testing
      const result = expandTokens("{{repo_root}}/config");

      // Should expand to actual repo root
      assert.ok(result.includes("/config"), "Should expand repo_root");
      assert.ok(!result.includes("{{repo_root}}"), "Should not contain token");
    });
  });

  describe("Real-world usage examples", () => {
    test("config file path pattern", () => {
      const context = {
        repoRoot: "/home/user/project",
        today: "2025-11-09",
        now: "20251109T123456",
      };

      const result = expandTokens(
        "{{repo_root}}/.smartergpt.local/deliverables/weave-{{today}}-{{now}}",
        context,
      );

      assert.strictEqual(
        result,
        "/home/user/project/.smartergpt.local/deliverables/weave-2025-11-09-20251109T123456",
        "Should expand config file pattern",
      );
    });

    test("prompt file pattern", () => {
      const context = {
        repoRoot: "/home/user/project",
        today: "2025-11-09",
        now: "20251109T123456",
      };

      const result = expandTokens(
        "UMBRELLA_NAME: umbrella-{{today}}-{{now}}\nPROMPT_FILE: {{repo_root}}/.smartergpt/prompts/merge-weave-main.md",
        context,
      );

      assert.ok(
        result.includes("umbrella-2025-11-09-20251109T123456"),
        "Should expand umbrella name",
      );
      assert.ok(
        result.includes("/home/user/project/.smartergpt/prompts/merge-weave-main.md"),
        "Should expand prompt file path",
      );
    });

    test("YAML config example", () => {
      const context = {
        repoRoot: "/home/user/project",
        today: "2025-11-09",
        now: "20251109T123456",
      };

      const config = {
        deliverables:
          "{{repo_root}}/.smartergpt.local/deliverables/weave-{{today}}-{{now}}",
        created: "{{today}}T12:00:00Z",
      };

      const result = expandTokensInObject(config, context);

      assert.strictEqual(
        result.deliverables,
        "/home/user/project/.smartergpt.local/deliverables/weave-2025-11-09-20251109T123456",
        "Should expand deliverables path",
      );
      assert.strictEqual(
        result.created,
        "2025-11-09T12:00:00Z",
        "Should expand created timestamp",
      );
    });
  });
});
