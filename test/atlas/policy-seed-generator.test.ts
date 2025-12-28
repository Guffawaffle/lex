/**
 * Policy Seed Generator Tests
 *
 * Unit tests for the policy seed generator function
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { generatePolicySeed } from "../../src/atlas/policy-seed-generator.js";
import type { CodeUnit } from "../../src/atlas/schemas/code-unit.js";

// Counter for generating deterministic test IDs
let testUnitCounter = 0;

// Helper function to create test code units with deterministic IDs
function createCodeUnit(
  overrides: Partial<CodeUnit> & { filePath: string; name: string; kind: CodeUnit["kind"] }
): CodeUnit {
  testUnitCounter++;
  return {
    id: `test-unit-${testUnitCounter}`,
    repoId: "test-repo",
    language: "ts",
    symbolPath: `${overrides.filePath}::${overrides.name}`,
    span: { startLine: 1, endLine: 10 },
    discoveredAt: "2025-11-26T00:00:00Z",
    schemaVersion: "code-unit-v0",
    ...overrides,
  };
}

describe("generatePolicySeed", () => {
  test("returns valid seed structure with empty units", () => {
    const seed = generatePolicySeed([], "empty-repo");

    assert.strictEqual(seed.version, 0);
    assert.strictEqual(seed.generatedBy, "code-atlas-v0");
    assert.strictEqual(seed.repoId, "empty-repo");
    assert.ok(seed.generatedAt);
    assert.ok(Array.isArray(seed.modules));
    assert.strictEqual(seed.modules.length, 0);
  });

  test("groups units by directory", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/core/utils.ts", name: "helper", kind: "function" }),
      createCodeUnit({ filePath: "src/core/types.ts", name: "Model", kind: "class" }),
      createCodeUnit({ filePath: "src/api/handler.ts", name: "handle", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "grouped-repo");

    // Should have at least 2 modules (core and api)
    assert.ok(seed.modules.length >= 2);

    // Find core module
    const coreModule = seed.modules.find((m) => m.id.includes("core"));
    assert.ok(coreModule, "Should have a core module");
    assert.ok(coreModule.match.some((p) => p.includes("core")));

    // Find api module
    const apiModule = seed.modules.find((m) => m.id.includes("api"));
    assert.ok(apiModule, "Should have an api module");
    assert.ok(apiModule.match.some((p) => p.includes("api")));
  });

  test("counts units per module correctly", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/services/auth.ts", name: "login", kind: "function" }),
      createCodeUnit({ filePath: "src/services/auth.ts", name: "logout", kind: "function" }),
      createCodeUnit({ filePath: "src/services/auth.ts", name: "AuthService", kind: "class" }),
    ];

    const seed = generatePolicySeed(units, "count-repo");

    const servicesModule = seed.modules.find((m) => m.id.includes("services"));
    assert.ok(servicesModule);
    assert.strictEqual(servicesModule.unitCount, 3);
  });

  test("collects unique kinds per module", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/models/user.ts", name: "User", kind: "class" }),
      createCodeUnit({ filePath: "src/models/user.ts", name: "getName", kind: "method" }),
      createCodeUnit({ filePath: "src/models/user.ts", name: "setName", kind: "method" }),
      createCodeUnit({ filePath: "src/models/user.ts", name: "createUser", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "kinds-repo");

    const modelsModule = seed.modules.find((m) => m.id.includes("models"));
    assert.ok(modelsModule);
    assert.ok(modelsModule.kinds.includes("class"));
    assert.ok(modelsModule.kinds.includes("method"));
    assert.ok(modelsModule.kinds.includes("function"));
    // Should be sorted
    assert.deepStrictEqual(modelsModule.kinds, [...modelsModule.kinds].sort());
  });

  test("generates notes for test directories", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "test/unit/auth.test.ts", name: "testLogin", kind: "function" }),
      createCodeUnit({ filePath: "test/unit/auth.test.ts", name: "testLogout", kind: "function" }),
      createCodeUnit({ filePath: "test/unit/auth.test.ts", name: "testSession", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "test-repo");

    const testModule = seed.modules.find((m) => m.id.includes("test"));
    assert.ok(testModule);
    assert.ok(testModule.notes, "Test module should have notes");
    assert.ok(testModule.notes.toLowerCase().includes("test"), "Notes should mention test");
  });

  test("generates notes for utility directories", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/utils/string.ts", name: "capitalize", kind: "function" }),
      createCodeUnit({ filePath: "src/utils/array.ts", name: "flatten", kind: "function" }),
      createCodeUnit({ filePath: "src/utils/date.ts", name: "format", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "util-repo");

    const utilsModule = seed.modules.find((m) => m.id.includes("utils"));
    assert.ok(utilsModule);
    assert.ok(utilsModule.notes, "Utils module should have notes");
    assert.ok(
      utilsModule.notes.toLowerCase().includes("util") ||
        utilsModule.notes.toLowerCase().includes("helper"),
      "Notes should mention utility/helper"
    );
  });

  test("consolidates small directories", () => {
    // Small directories with less than minUnitsPerModule should be consolidated
    const units: CodeUnit[] = [
      // Only 2 units in parent/small - should potentially be consolidated
      createCodeUnit({ filePath: "src/parent/small/a.ts", name: "a", kind: "function" }),
      createCodeUnit({ filePath: "src/parent/small/b.ts", name: "b", kind: "function" }),
      // 5 units in parent/large - should stay separate
      createCodeUnit({ filePath: "src/parent/large/c.ts", name: "c", kind: "function" }),
      createCodeUnit({ filePath: "src/parent/large/d.ts", name: "d", kind: "function" }),
      createCodeUnit({ filePath: "src/parent/large/e.ts", name: "e", kind: "function" }),
      createCodeUnit({ filePath: "src/parent/large/f.ts", name: "f", kind: "function" }),
      createCodeUnit({ filePath: "src/parent/large/g.ts", name: "g", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "consolidate-repo");

    // The large directory should definitely exist
    const largeModule = seed.modules.find((m) => m.id.includes("large"));
    assert.ok(largeModule, "Large module should exist");
    assert.strictEqual(largeModule.unitCount, 5);
  });

  test("sorts modules by unit count descending", () => {
    const units: CodeUnit[] = [
      // Small module with 2 units
      createCodeUnit({ filePath: "src/small/a.ts", name: "a", kind: "function" }),
      createCodeUnit({ filePath: "src/small/b.ts", name: "b", kind: "function" }),
      createCodeUnit({ filePath: "src/small/c.ts", name: "c", kind: "function" }),
      // Large module with 5 units
      createCodeUnit({ filePath: "src/large/d.ts", name: "d", kind: "function" }),
      createCodeUnit({ filePath: "src/large/e.ts", name: "e", kind: "function" }),
      createCodeUnit({ filePath: "src/large/f.ts", name: "f", kind: "function" }),
      createCodeUnit({ filePath: "src/large/g.ts", name: "g", kind: "function" }),
      createCodeUnit({ filePath: "src/large/h.ts", name: "h", kind: "function" }),
    ];

    const seed = generatePolicySeed(units, "sort-repo");

    // Modules should be sorted by unitCount descending
    for (let i = 0; i < seed.modules.length - 1; i++) {
      assert.ok(
        seed.modules[i].unitCount >= seed.modules[i + 1].unitCount,
        `Module at index ${i} should have >= unitCount than next module`
      );
    }
  });

  test("generates match patterns with glob format", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/features/auth/login.ts", name: "login", kind: "function" }),
      createCodeUnit({ filePath: "src/features/auth/logout.ts", name: "logout", kind: "function" }),
      createCodeUnit({ filePath: "src/features/auth/session.ts", name: "session", kind: "class" }),
    ];

    const seed = generatePolicySeed(units, "glob-repo");

    const authModule = seed.modules.find((m) => m.match.some((p) => p.includes("auth")));
    assert.ok(authModule);
    assert.ok(
      authModule.match.some((p) => p.endsWith("/**")),
      "Match patterns should use glob format"
    );
  });

  test("handles root-level files", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "index.ts", name: "main", kind: "function" }),
      createCodeUnit({ filePath: "config.ts", name: "Config", kind: "class" }),
    ];

    const seed = generatePolicySeed(units, "root-repo");

    // Should have a root module
    const rootModule = seed.modules.find((m) => m.id === "root");
    assert.ok(rootModule, "Should have a root module for root-level files");
    assert.strictEqual(rootModule.unitCount, 2);
  });

  test("strips common src prefix from module IDs", () => {
    const units: CodeUnit[] = [
      createCodeUnit({ filePath: "src/core/index.ts", name: "main", kind: "function" }),
      createCodeUnit({ filePath: "src/core/utils.ts", name: "util", kind: "function" }),
      createCodeUnit({ filePath: "src/core/types.ts", name: "Type", kind: "class" }),
    ];

    const seed = generatePolicySeed(units, "prefix-repo");

    const coreModule = seed.modules.find((m) => m.id === "core");
    assert.ok(coreModule, "Module ID should be 'core' not 'src-core'");
  });
});
