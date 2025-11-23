/**
 * Tests for token expansion utilities
 *
 * Tests cover:
 * - Date/time token expansion ({{today}}, {{now}})
 * - Repository tokens ({{repo_root}}, {{workspace_root}})
 * - Git tokens ({{branch}}, {{commit}})
 * - Token detection and extraction
 * - Object token expansion
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  expandTokens,
  hasTokens,
  extractTokens,
  expandTokensInObject,
} from "../../../src/shared/tokens/expander.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Token Expansion", () => {
  let originalDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalDir = process.cwd();
    originalEnv = {
      LEX_WORKSPACE_ROOT: process.env.LEX_WORKSPACE_ROOT,
      LEX_DEFAULT_BRANCH: process.env.LEX_DEFAULT_BRANCH,
    };
  });

  afterEach(() => {
    process.chdir(originalDir);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("Date/Time Tokens", () => {
    test("expands {{today}} to YYYY-MM-DD format", () => {
      const testDate = new Date("2025-11-09T15:30:00Z");
      const result = expandTokens("{{today}}", { today: testDate });
      assert.strictEqual(result, "2025-11-09");
    });

    test("expands {{now}} to YYYYMMDDTHHMMSS format", () => {
      const testDate = new Date("2025-11-09T15:30:45Z");
      const result = expandTokens("{{now}}", { now: testDate });
      assert.strictEqual(result, "20251109T153045");
    });

    test("uses current date/time when context not provided", () => {
      const result = expandTokens("{{today}}");
      // Should be in YYYY-MM-DD format
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/);

      const nowResult = expandTokens("{{now}}");
      // Should be in YYYYMMDDTHHMMSS format
      assert.match(nowResult, /^\d{8}T\d{6}$/);
    });

    test("handles both tokens in same string", () => {
      const testDate = new Date("2025-11-09T12:34:56Z");
      const result = expandTokens("Created on {{today}} at {{now}}", {
        today: testDate,
        now: testDate,
      });
      assert.strictEqual(result, "Created on 2025-11-09 at 20251109T123456");
    });
  });

  describe("Repository Tokens", () => {
    test("expands {{repo_root}} to repository root", () => {
      const result = expandTokens("{{repo_root}}/file.txt");
      assert.ok(result.endsWith("/lex/file.txt") || result.endsWith("\\lex\\file.txt"));
    });

    test("expands {{workspace_root}} to workspace root", () => {
      const result = expandTokens("{{workspace_root}}/config");
      assert.ok(result.includes("lex"));
    });

    test("uses context override for repo_root", () => {
      const result = expandTokens("{{repo_root}}/test", {
        repoRoot: "/custom/repo",
      });
      assert.strictEqual(result, "/custom/repo/test");
    });

    test("uses context override for workspace_root", () => {
      const result = expandTokens("{{workspace_root}}/test", {
        workspaceRoot: "/custom/workspace",
      });
      assert.strictEqual(result, "/custom/workspace/test");
    });

    test("handles missing repo_root gracefully", () => {
      const testDir = mkdtempSync(join(tmpdir(), "lex-no-repo-"));
      try {
        process.chdir(testDir);
        const result = expandTokens("{{repo_root}}/file");
        // Should replace with empty string when not in a repo
        assert.strictEqual(result, "/file");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("Git Tokens", () => {
    test("expands {{branch}} to current branch", () => {
      const result = expandTokens("{{branch}}");
      // Should not be empty and should match actual branch
      assert.ok(result.length > 0);
      assert.notStrictEqual(result, "{{branch}}");
    });

    test("expands {{commit}} to short commit hash", () => {
      const result = expandTokens("{{commit}}");
      // Should be 7 characters or "unknown"
      assert.ok(result.length > 0);
      assert.notStrictEqual(result, "{{commit}}");
    });

    test("uses context override for branch", () => {
      const result = expandTokens("{{branch}}", { branch: "feature-test" });
      assert.strictEqual(result, "feature-test");
    });

    test("uses context override for commit", () => {
      const result = expandTokens("{{commit}}", { commit: "abc1234" });
      assert.strictEqual(result, "abc1234");
    });

    test("handles all git tokens together", () => {
      const result = expandTokens("Branch: {{branch}}, Commit: {{commit}}", {
        branch: "main",
        commit: "abc1234",
      });
      assert.strictEqual(result, "Branch: main, Commit: abc1234");
    });
  });

  describe("Complex Token Combinations", () => {
    test("expands multiple different token types", () => {
      const testDate = new Date("2025-11-09T12:00:00Z");
      const result = expandTokens(
        "{{repo_root}}/.smartergpt.local/deliverables/weave-{{today}}-{{now}}",
        {
          today: testDate,
          now: testDate,
          repoRoot: "/test/repo",
        }
      );
      assert.strictEqual(
        result,
        "/test/repo/.smartergpt.local/deliverables/weave-2025-11-09-20251109T120000"
      );
    });

    test("expands all tokens in a complex path", () => {
      const testDate = new Date("2025-11-09T12:00:00Z");
      const result = expandTokens(
        "{{workspace_root}}/logs/{{branch}}/{{commit}}/{{today}}/{{now}}.log",
        {
          today: testDate,
          now: testDate,
          workspaceRoot: "/workspace",
          branch: "main",
          commit: "abc1234",
        }
      );
      assert.strictEqual(result, "/workspace/logs/main/abc1234/2025-11-09/20251109T120000.log");
    });

    test("preserves non-token content", () => {
      const result = expandTokens("some text {{today}} more text {{branch}} end", {
        today: new Date("2025-11-09"),
        branch: "main",
      });
      assert.strictEqual(result, "some text 2025-11-09 more text main end");
    });

    test("handles repeated tokens", () => {
      const result = expandTokens("{{today}}-{{today}}-{{today}}", {
        today: new Date("2025-11-09"),
      });
      assert.strictEqual(result, "2025-11-09-2025-11-09-2025-11-09");
    });
  });

  describe("Token Detection", () => {
    test("hasTokens detects token presence", () => {
      assert.strictEqual(hasTokens("{{today}}"), true);
      assert.strictEqual(hasTokens("{{now}}"), true);
      assert.strictEqual(hasTokens("{{repo_root}}"), true);
      assert.strictEqual(hasTokens("{{workspace_root}}"), true);
      assert.strictEqual(hasTokens("{{branch}}"), true);
      assert.strictEqual(hasTokens("{{commit}}"), true);
    });

    test("hasTokens returns false for non-tokens", () => {
      assert.strictEqual(hasTokens("no tokens here"), false);
      assert.strictEqual(hasTokens("{{variable}}"), false);
      assert.strictEqual(hasTokens("{{#if condition}}"), false);
    });

    test("hasTokens detects tokens in complex strings", () => {
      assert.strictEqual(hasTokens("path/{{today}}/file"), true);
      assert.strictEqual(hasTokens("{{repo_root}}/{{branch}}"), true);
    });
  });

  describe("Token Extraction", () => {
    test("extractTokens returns all unique tokens", () => {
      const tokens = extractTokens("{{today}}-{{now}}-{{branch}}");
      assert.deepStrictEqual(tokens.sort(), ["branch", "now", "today"]);
    });

    test("extractTokens deduplicates repeated tokens", () => {
      const tokens = extractTokens("{{today}}-{{today}}-{{today}}");
      assert.deepStrictEqual(tokens, ["today"]);
    });

    test("extractTokens returns empty array for no tokens", () => {
      const tokens = extractTokens("no tokens here");
      assert.deepStrictEqual(tokens, []);
    });

    test("extractTokens ignores non-token patterns", () => {
      const tokens = extractTokens("{{variable}} {{#if condition}} {{today}}");
      assert.deepStrictEqual(tokens, ["today"]);
    });

    test("extractTokens finds all supported tokens", () => {
      const input = "{{today}} {{now}} {{repo_root}} {{workspace_root}} {{branch}} {{commit}}";
      const tokens = extractTokens(input);
      assert.deepStrictEqual(tokens.sort(), [
        "branch",
        "commit",
        "now",
        "repo_root",
        "today",
        "workspace_root",
      ]);
    });
  });

  describe("Object Token Expansion", () => {
    test("expands tokens in object string values", () => {
      const testDate = new Date("2025-11-09");
      const input = {
        path: "{{repo_root}}/file",
        date: "{{today}}",
      };
      const result = expandTokensInObject(input, {
        today: testDate,
        repoRoot: "/repo",
      });
      assert.deepStrictEqual(result, {
        path: "/repo/file",
        date: "2025-11-09",
      });
    });

    test("expands tokens in nested objects", () => {
      const testDate = new Date("2025-11-09");
      const input = {
        config: {
          deliverables: "{{repo_root}}/{{today}}",
          metadata: {
            branch: "{{branch}}",
            commit: "{{commit}}",
          },
        },
      };
      const result = expandTokensInObject(input, {
        today: testDate,
        repoRoot: "/repo",
        branch: "main",
        commit: "abc1234",
      });
      assert.deepStrictEqual(result, {
        config: {
          deliverables: "/repo/2025-11-09",
          metadata: {
            branch: "main",
            commit: "abc1234",
          },
        },
      });
    });

    test("expands tokens in arrays", () => {
      const testDate = new Date("2025-11-09");
      const input = ["{{today}}", "{{branch}}", "plain text"];
      const result = expandTokensInObject(input, {
        today: testDate,
        branch: "main",
      });
      assert.deepStrictEqual(result, ["2025-11-09", "main", "plain text"]);
    });

    test("preserves non-string values", () => {
      const input = {
        string: "{{today}}",
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
      };
      const result = expandTokensInObject(input, {
        today: new Date("2025-11-09"),
      });
      assert.strictEqual(result.string, "2025-11-09");
      assert.strictEqual(result.number, 42);
      assert.strictEqual(result.boolean, true);
      assert.strictEqual(result.null, null);
      assert.strictEqual(result.undefined, undefined);
    });

    test("handles complex nested structures", () => {
      const testDate = new Date("2025-11-09T12:00:00Z");
      const input = {
        root: "{{workspace_root}}",
        branches: ["{{branch}}", "develop", "{{branch}}-backup"],
        config: {
          paths: {
            output: "{{repo_root}}/dist/{{today}}",
            logs: "{{repo_root}}/logs/{{now}}.log",
          },
          git: {
            branch: "{{branch}}",
            commit: "{{commit}}",
          },
        },
      };
      const result = expandTokensInObject(input, {
        today: testDate,
        now: testDate,
        workspaceRoot: "/workspace",
        repoRoot: "/repo",
        branch: "main",
        commit: "abc1234",
      });
      assert.deepStrictEqual(result, {
        root: "/workspace",
        branches: ["main", "develop", "main-backup"],
        config: {
          paths: {
            output: "/repo/dist/2025-11-09",
            logs: "/repo/logs/20251109T120000.log",
          },
          git: {
            branch: "main",
            commit: "abc1234",
          },
        },
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles empty string", () => {
      const result = expandTokens("");
      assert.strictEqual(result, "");
    });

    test("handles string with no tokens", () => {
      const result = expandTokens("plain text without tokens");
      assert.strictEqual(result, "plain text without tokens");
    });

    test("handles malformed token syntax", () => {
      const result = expandTokens("{{incomplete");
      assert.strictEqual(result, "{{incomplete");
    });

    test("handles empty context", () => {
      const result = expandTokens("{{today}}", {});
      // Should use current date
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
