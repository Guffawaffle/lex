/**
 * PolicySeed Schema Tests
 *
 * Unit tests for PolicySeed schema validation and parsing
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  PolicySeedSchema,
  PolicySeedModuleSchema,
  parsePolicySeed,
  validatePolicySeed,
  type PolicySeed,
  type PolicySeedModule,
} from "../../../src/atlas/schemas/policy-seed.js";

describe("PolicySeed Schema Validation", () => {
  const validModule: PolicySeedModule = {
    id: "core",
    match: ["src/core/**"],
    unitCount: 42,
    kinds: ["class", "function"],
    notes: "Core domain logic; auto-detected from code density",
  };

  const validPolicySeed: PolicySeed = {
    version: 0,
    generatedBy: "code-atlas-v0",
    repoId: "test-repo",
    generatedAt: "2025-11-26T14:00:00Z",
    modules: [validModule],
  };

  test("validates a valid PolicySeed with all required fields", () => {
    const result = PolicySeedSchema.safeParse(validPolicySeed);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.version, 0);
      assert.strictEqual(result.data.generatedBy, "code-atlas-v0");
      assert.strictEqual(result.data.repoId, "test-repo");
      assert.strictEqual(result.data.modules.length, 1);
    }
  });

  test("validates a PolicySeed with multiple modules", () => {
    const multiModuleSeed: PolicySeed = {
      ...validPolicySeed,
      modules: [
        validModule,
        {
          id: "api",
          match: ["src/api/**"],
          unitCount: 28,
          kinds: ["function", "method"],
          notes: "API layer",
        },
        {
          id: "tests",
          match: ["tests/**", "**/*.test.ts"],
          unitCount: 156,
          kinds: ["function"],
        },
      ],
    };
    const result = PolicySeedSchema.safeParse(multiModuleSeed);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.modules.length, 3);
    }
  });

  test("validates a module without optional notes", () => {
    const moduleWithoutNotes: PolicySeedModule = {
      id: "api",
      match: ["src/api/**"],
      unitCount: 10,
      kinds: ["function"],
    };
    const result = PolicySeedModuleSchema.safeParse(moduleWithoutNotes);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.notes, undefined);
    }
  });

  test("rejects PolicySeed with invalid version", () => {
    const invalid = { ...validPolicySeed, version: 1 };
    const result = PolicySeedSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects PolicySeed with invalid generatedBy", () => {
    const invalid = { ...validPolicySeed, generatedBy: "invalid-generator" };
    const result = PolicySeedSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects PolicySeed with missing required field (repoId)", () => {
    const invalid = { ...validPolicySeed };
    delete (invalid as Partial<PolicySeed>).repoId;
    const result = PolicySeedSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects PolicySeed with invalid generatedAt (non-ISO8601)", () => {
    const invalid = { ...validPolicySeed, generatedAt: "not-a-date" };
    const result = PolicySeedSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects module with empty id", () => {
    const invalid = { ...validModule, id: "" };
    const result = PolicySeedModuleSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects module with empty match array containing empty string", () => {
    const invalid = { ...validModule, match: [""] };
    const result = PolicySeedModuleSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects module with negative unitCount", () => {
    const invalid = { ...validModule, unitCount: -1 };
    const result = PolicySeedModuleSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects module with empty kinds array containing empty string", () => {
    const invalid = { ...validModule, kinds: [""] };
    const result = PolicySeedModuleSchema.safeParse(invalid);
    assert.ok(!result.success);
  });
});

describe("parsePolicySeed function", () => {
  const validData: PolicySeed = {
    version: 0,
    generatedBy: "code-atlas-v0",
    repoId: "parse-test-repo",
    generatedAt: "2025-11-26T15:00:00Z",
    modules: [
      {
        id: "lib",
        match: ["lib/**"],
        unitCount: 25,
        kinds: ["class", "method"],
        notes: "Library code",
      },
    ],
  };

  test("successfully parses valid PolicySeed data", () => {
    const result = parsePolicySeed(validData);
    assert.strictEqual(result.version, 0);
    assert.strictEqual(result.repoId, "parse-test-repo");
    assert.strictEqual(result.modules.length, 1);
  });

  test("throws on invalid data", () => {
    const invalidData = { ...validData, version: 99 };
    assert.throws(() => parsePolicySeed(invalidData));
  });
});

describe("validatePolicySeed function", () => {
  const validData: PolicySeed = {
    version: 0,
    generatedBy: "code-atlas-v0",
    repoId: "validate-test-repo",
    generatedAt: "2025-11-26T16:00:00Z",
    modules: [],
  };

  test("returns success for valid data", () => {
    const result = validatePolicySeed(validData);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.repoId, "validate-test-repo");
    }
  });

  test("returns error for invalid data", () => {
    const invalidData = { ...validData, generatedBy: "invalid" };
    const result = validatePolicySeed(invalidData);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.error);
    }
  });

  test("returns error for missing required fields", () => {
    const invalidData = { version: 0 };
    const result = validatePolicySeed(invalidData);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.error);
      assert.ok(result.error.issues.length > 0);
    }
  });
});
