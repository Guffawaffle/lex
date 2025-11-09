/**
 * Tests for substring/wildcard matching in alias resolution
 *
 * Tests pattern matching functionality with glob patterns,
 * substring matches, and edge cases.
 *
 * Run with: node --test src/shared/aliases/substring.spec.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import { minimatch } from "minimatch";
import {
  resolveModuleId,
  findSubstringMatches,
  clearAliasTableCache,
} from "../../../dist/shared/aliases/resolver.js";

// Sample policy with various module paths
const samplePolicy = {
  modules: {
    "src/cli/flags.ts": {
      description: "CLI flags module",
      owns_paths: ["src/cli/flags.ts"],
    },
    "src/cli/commands.ts": {
      description: "CLI commands module",
      owns_paths: ["src/cli/commands.ts"],
    },
    "src/gates/runner.ts": {
      description: "Gates runner module",
      owns_paths: ["src/gates/runner.ts"],
    },
    "test/integration.test.ts": {
      description: "Integration test",
      owns_paths: ["test/integration.test.ts"],
    },
    "test/unit.test.ts": {
      description: "Unit test",
      owns_paths: ["test/unit.test.ts"],
    },
    "src/core/auth.ts": {
      description: "Core auth module",
      owns_paths: ["src/core/auth.ts"],
    },
  },
};

describe("Pattern/Wildcard Matching", () => {
  test("pattern src/cli/**/*.ts matches src/cli/flags.ts (using minimatch)", () => {
    const pattern = "src/cli/**/*.ts";
    const path = "src/cli/flags.ts";

    const matches = minimatch(path, pattern);
    assert.ok(matches, `Expected ${path} to match pattern ${pattern}`);
  });

  test("pattern src/cli/**/*.ts matches src/cli/commands.ts", () => {
    const pattern = "src/cli/**/*.ts";
    const path = "src/cli/commands.ts";

    const matches = minimatch(path, pattern);
    assert.ok(matches);
  });

  test("pattern src/cli/**/*.ts does NOT match src/gates/runner.ts", () => {
    const pattern = "src/cli/**/*.ts";
    const path = "src/gates/runner.ts";

    const matches = minimatch(path, pattern);
    assert.ok(!matches, `Expected ${path} to NOT match pattern ${pattern}`);
  });

  test("wildcard **/*.test.ts matches all test files", () => {
    const pattern = "**/*.test.ts";
    const testPaths = ["test/integration.test.ts", "test/unit.test.ts"];

    for (const path of testPaths) {
      const matches = minimatch(path, pattern);
      assert.ok(matches, `Expected ${path} to match pattern ${pattern}`);
    }
  });

  test("pattern **/*.test.ts does NOT match non-test files", () => {
    const pattern = "**/*.test.ts";
    const nonTestPaths = ["src/cli/flags.ts", "src/core/auth.ts"];

    for (const path of nonTestPaths) {
      const matches = minimatch(path, pattern);
      assert.ok(!matches, `Expected ${path} to NOT match pattern ${pattern}`);
    }
  });
});

describe("Substring Matching via findSubstringMatches", () => {
  test("substring 'cli' matches multiple modules", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("cli", availableModules);

    assert.equal(matches.length, 2);
    assert.ok(matches.includes("src/cli/flags.ts"));
    assert.ok(matches.includes("src/cli/commands.ts"));
  });

  test("substring 'flags' matches single module uniquely", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("flags", availableModules);

    assert.equal(matches.length, 1);
    assert.equal(matches[0], "src/cli/flags.ts");
  });

  test("substring 'gate' matches gate-related modules", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("gate", availableModules);

    assert.equal(matches.length, 1);
    assert.ok(matches.includes("src/gates/runner.ts"));
  });

  test("substring matching is case-insensitive", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matchesLower = findSubstringMatches("cli", availableModules);
    const matchesUpper = findSubstringMatches("CLI", availableModules);

    assert.deepEqual(matchesLower, matchesUpper);
  });

  test("substring shorter than minLength (default 3) returns empty", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("cl", availableModules);

    assert.equal(matches.length, 0);
  });

  test("substring with custom minLength=2 allows shorter matches", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("cl", availableModules, 2);

    assert.ok(matches.length > 0);
    assert.ok(matches.some((m) => m.includes("cli")));
  });

  test("empty substring returns no matches", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("", availableModules);

    assert.equal(matches.length, 0);
  });

  test("substring with no matches returns empty array", () => {
    const availableModules = new Set(Object.keys(samplePolicy.modules));
    const matches = findSubstringMatches("nonexistent", availableModules);

    assert.equal(matches.length, 0);
  });
});

describe("Edge Cases", () => {
  test("empty path input resolves with confidence 0", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("", samplePolicy);

    assert.equal(result.confidence, 0);
    assert.equal(result.original, "");
    assert.equal(result.source, "fuzzy");
  });

  test("whitespace-only input resolves with confidence 0", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("   ", samplePolicy);

    assert.equal(result.confidence, 0);
    assert.equal(result.original, "   ");
  });

  test("very long substring still works", async () => {
    clearAliasTableCache();
    const longSubstring = "cli/flags";
    const result = await resolveModuleId(longSubstring, samplePolicy);

    // Should match 'src/cli/flags.ts' as unique substring
    assert.equal(result.canonical, "src/cli/flags.ts");
    assert.equal(result.confidence, 0.9);
    assert.equal(result.source, "substring");
  });

  test("special characters in input are handled safely", async () => {
    clearAliasTableCache();
    const specialInput = "src/cli/**/*.ts";
    const result = await resolveModuleId(specialInput, samplePolicy);

    // Should not cause error, returns fuzzy with confidence 0
    assert.ok(result);
    assert.equal(result.confidence, 0);
  });

  test("module ID with slash at end is handled", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("src/cli/", samplePolicy);

    // Should match cli modules as substring
    // But it's ambiguous (multiple matches), so confidence 0
    assert.equal(result.confidence, 0);
  });
});

describe("Substring Resolution Priority", () => {
  test("unique substring match resolves with confidence 0.9", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("flags", samplePolicy);

    assert.equal(result.canonical, "src/cli/flags.ts");
    assert.equal(result.confidence, 0.9);
    assert.equal(result.source, "substring");
  });

  test("ambiguous substring returns confidence 0 (no resolution)", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("test", samplePolicy);

    // 'test' matches multiple: test/integration.test.ts, test/unit.test.ts
    assert.equal(result.confidence, 0);
    assert.equal(result.source, "fuzzy");
  });

  test("exact match takes precedence over substring", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("src/cli/flags.ts", samplePolicy);

    assert.equal(result.canonical, "src/cli/flags.ts");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.source, "exact");
  });

  test("noSubstring option disables substring matching", async () => {
    clearAliasTableCache();
    const result = await resolveModuleId("flags", samplePolicy, undefined, {
      noSubstring: true,
    });

    // Should not resolve via substring
    assert.equal(result.confidence, 0);
    assert.equal(result.source, "fuzzy");
  });
});

describe("Alias with Wildcards (Conceptual)", () => {
  test("alias table could map wildcards to specific module groups", async () => {
    clearAliasTableCache();

    // This test demonstrates how wildcards could work in alias table
    // For now, we test that if we had an alias 'cli-core' that mapped to 'src/cli/flags.ts',
    // it would resolve correctly

    const aliasTable = {
      aliases: {
        "cli-core": {
          canonical: "src/cli/flags.ts",
          confidence: 1.0,
          reason: "wildcard group alias",
        },
      },
    };

    const result = await resolveModuleId("cli-core", samplePolicy, aliasTable);

    assert.equal(result.canonical, "src/cli/flags.ts");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.source, "alias");
  });

  test("wildcard alias concept: tests group resolves to test modules", async () => {
    clearAliasTableCache();

    // Conceptual test: An alias 'tests' could map to a canonical test module
    const aliasTable = {
      aliases: {
        tests: {
          canonical: "test/integration.test.ts",
          confidence: 1.0,
          reason: "test group shorthand",
        },
      },
    };

    const result = await resolveModuleId("tests", samplePolicy, aliasTable);

    assert.equal(result.canonical, "test/integration.test.ts");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.source, "alias");
  });
});
