/**
 * Policy Schema Validation Tests
 *
 * Tests for the Zod-based policy schema validation used by `lex policy check`.
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import { validatePolicySchema } from "@app/shared/policy/schema.js";

describe("validatePolicySchema", () => {
  describe("Valid Policies", () => {
    test("validates a minimal valid policy", () => {
      const policy = {
        modules: {},
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.equal(result.moduleCount, 0);
      assert.equal(result.errors.length, 0);
    });

    test("validates a policy with schemaVersion", () => {
      const policy = {
        schemaVersion: "1.0.0",
        modules: {},
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
    });

    test("validates a policy with valid module IDs", () => {
      const policy = {
        modules: {
          "memory/store": { description: "Memory store module" },
          "shared/types": { description: "Shared types" },
          cli: { description: "CLI module" },
          "ui/admin-panel": { description: "Admin panel" },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.equal(result.moduleCount, 4);
    });

    test("validates a fully-specified module", () => {
      const policy = {
        modules: {
          "hie/core": {
            description: "Core HIE abstractions",
            owns_paths: ["src/hie/core/**"],
            owns_namespaces: ["App\\Hie\\Core\\"],
            exposes: ["TransportClient", "IdentifierMapper"],
            coords: [0, 1],
            allowed_callers: ["hie/surescripts", "hie/adapter"],
            forbidden_callers: ["ui/admin"],
            feature_flags: ["hie_enabled"],
            requires_permissions: ["hie_access"],
            kill_patterns: ["legacy_transport"],
            notes: "Canonical HIE core module",
            match: ["src/hie/core/**"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.equal(result.moduleCount, 1);
    });

    test("validates a policy with global_kill_patterns (object format)", () => {
      const policy = {
        modules: {
          test: { description: "Test module" },
        },
        global_kill_patterns: [
          { pattern: "legacy_api", description: "Remove legacy API usage" },
          { pattern: "deprecated_auth", description: "Remove deprecated auth" },
        ],
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
    });

    test("validates a policy with global_kill_patterns (string format)", () => {
      const policy = {
        modules: {
          test: { description: "Test module" },
        },
        global_kill_patterns: ["legacy_api", "deprecated_auth"],
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
    });
  });

  describe("Invalid Policies", () => {
    test("rejects null input", () => {
      const result = validatePolicySchema(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    test("rejects missing modules field", () => {
      const policy = {
        schemaVersion: "1.0.0",
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.path.includes("modules")));
    });

    test("rejects modules as non-object", () => {
      const policy = {
        modules: "not an object",
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });

    test("rejects invalid module ID format (uppercase)", () => {
      const policy = {
        modules: {
          "INVALID/UPPERCASE": { description: "test" },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.message.includes("Invalid")));
    });

    test("rejects invalid module ID format (spaces)", () => {
      const policy = {
        modules: {
          "invalid space": { description: "test" },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });

    test("rejects invalid coords (not a tuple)", () => {
      const policy = {
        modules: {
          test: {
            description: "test",
            coords: [1, 2, 3], // Should be exactly 2 elements
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });

    test("rejects invalid coords (non-numbers)", () => {
      const policy = {
        modules: {
          test: {
            description: "test",
            coords: ["a", "b"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });

    test("rejects owns_paths as non-array", () => {
      const policy = {
        modules: {
          test: {
            description: "test",
            owns_paths: "not an array",
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });

    test("rejects allowed_callers as non-array", () => {
      const policy = {
        modules: {
          test: {
            description: "test",
            allowed_callers: "not an array",
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });
  });

  describe("Semantic Warnings", () => {
    test("warns about modules without ownership definition", () => {
      const policy = {
        modules: {
          "test/module": { description: "No ownership" },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((w) => w.code === "missing_ownership"));
    });

    test("no warning when module has owns_paths", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Has paths",
            owns_paths: ["src/test/**"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(!result.warnings.some((w) => w.code === "missing_ownership"));
    });

    test("no warning when module has owns_namespaces", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Has namespaces",
            owns_namespaces: ["App\\Test\\"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(!result.warnings.some((w) => w.code === "missing_ownership"));
    });

    test("no warning when module has match", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Has match",
            match: ["src/test/**"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(!result.warnings.some((w) => w.code === "missing_ownership"));
    });

    test("warns about self-reference in allowed_callers", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Self-referencing",
            owns_paths: ["src/test/**"],
            allowed_callers: ["test/module", "other/module"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((w) => w.code === "self_reference"));
    });

    test("warns about self-reference in forbidden_callers", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Self-referencing",
            owns_paths: ["src/test/**"],
            forbidden_callers: ["test/module"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((w) => w.code === "self_reference"));
    });

    test("warns about reference to unknown module in allowed_callers", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "References unknown",
            owns_paths: ["src/test/**"],
            allowed_callers: ["unknown/module"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((w) => w.code === "unknown_module_reference"));
    });

    test("does not warn about glob patterns in allowed_callers", () => {
      const policy = {
        modules: {
          "test/module": {
            description: "Uses glob pattern",
            owns_paths: ["src/test/**"],
            allowed_callers: ["ui/**", "services/*"],
          },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, true);
      assert.ok(!result.warnings.some((w) => w.code === "unknown_module_reference"));
    });
  });
});
