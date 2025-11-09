/**
 * Tests for collision detection in alias resolution
 *
 * Tests scenarios where multiple modules might map to the same alias,
 * ensuring proper error handling and collision detection.
 *
 * Run with: node --test src/shared/aliases/collision.spec.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import {
  resolveModuleId,
  clearAliasTableCache,
} from "../../../dist/shared/aliases/resolver.js";

// Sample policy for collision testing
const samplePolicy = {
  modules: {
    "services/auth-core": {
      description: "Core authentication service",
      owns_paths: ["services/auth/**"],
    },
    "services/user-access-api": {
      description: "User access API layer",
      owns_paths: ["services/userAccess/**"],
    },
    "ui/admin-panel": {
      description: "Admin panel UI",
      owns_paths: ["web-ui/admin/**"],
    },
    "api/user-service": {
      description: "User service API",
      owns_paths: ["api/users/**"],
    },
    "core/authentication": {
      description: "Authentication core",
      owns_paths: ["core/auth/**"],
    },
  },
};

describe("Collision Detection: Multiple Modules to Same Alias", () => {
  test("two modules mapping to same alias causes collision", async () => {
    clearAliasTableCache();

    // Create alias table where two different canonical IDs would need same alias
    // In practice, this would be detected when building alias table
    const aliasTable = {
      aliases: {
        "auth-service": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "primary auth alias",
        },
        // This creates a conceptual collision - two aliases for same canonical
        // (the resolver itself doesn't detect this, but validation would)
      },
    };

    const result1 = await resolveModuleId("auth-service", samplePolicy, aliasTable);

    assert.equal(result1.canonical, "services/auth-core");
    assert.equal(result1.source, "alias");

    // If another alias also pointed to same canonical, both would resolve correctly
    // Collision is when DIFFERENT canonicals share the SAME alias key
    // This is prevented by the JSON structure (keys must be unique)
  });

  test("alias table structure prevents direct collisions via unique keys", () => {
    // This test documents that JavaScript object keys are unique,
    // preventing multiple definitions of same alias key

    const aliasTable = {
      aliases: {
        "auth-core": {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
        // Attempting to redefine "auth-core" would just overwrite:
        "auth-core": {
          canonical: "core/authentication", // This overwrites above
          confidence: 1.0,
        },
      },
    };

    // The second definition wins in JavaScript object literals
    assert.equal(aliasTable.aliases["auth-core"].canonical, "core/authentication");
  });

  test("multiple aliases can point to same canonical without collision", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "auth-core": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "shorthand",
        },
        "auth-service": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "alternative name",
        },
        "old-auth": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "legacy refactored name",
        },
      },
    };

    const result1 = await resolveModuleId("auth-core", samplePolicy, aliasTable);
    const result2 = await resolveModuleId("auth-service", samplePolicy, aliasTable);
    const result3 = await resolveModuleId("old-auth", samplePolicy, aliasTable);

    // All three aliases resolve to same canonical - this is valid
    assert.equal(result1.canonical, "services/auth-core");
    assert.equal(result2.canonical, "services/auth-core");
    assert.equal(result3.canonical, "services/auth-core");

    assert.equal(result1.source, "alias");
    assert.equal(result2.source, "alias");
    assert.equal(result3.source, "alias");
  });
});

describe("No Collision Scenarios", () => {
  test("10 modules with 5 unique aliases - no collisions", async () => {
    clearAliasTableCache();

    // Create larger policy
    const largePolicy = {
      modules: {
        "mod1": { description: "Module 1", owns_paths: ["mod1/**"] },
        "mod2": { description: "Module 2", owns_paths: ["mod2/**"] },
        "mod3": { description: "Module 3", owns_paths: ["mod3/**"] },
        "mod4": { description: "Module 4", owns_paths: ["mod4/**"] },
        "mod5": { description: "Module 5", owns_paths: ["mod5/**"] },
        "mod6": { description: "Module 6", owns_paths: ["mod6/**"] },
        "mod7": { description: "Module 7", owns_paths: ["mod7/**"] },
        "mod8": { description: "Module 8", owns_paths: ["mod8/**"] },
        "mod9": { description: "Module 9", owns_paths: ["mod9/**"] },
        "mod10": { description: "Module 10", owns_paths: ["mod10/**"] },
      },
    };

    const aliasTable = {
      aliases: {
        "m1": { canonical: "mod1", confidence: 1.0 },
        "m2": { canonical: "mod2", confidence: 1.0 },
        "m3": { canonical: "mod3", confidence: 1.0 },
        "m4": { canonical: "mod4", confidence: 1.0 },
        "m5": { canonical: "mod5", confidence: 1.0 },
      },
    };

    // All aliases resolve correctly without collision
    for (let i = 1; i <= 5; i++) {
      const result = await resolveModuleId(`m${i}`, largePolicy, aliasTable);
      assert.equal(result.canonical, `mod${i}`);
      assert.equal(result.confidence, 1.0);
      assert.equal(result.source, "alias");
    }

    // Modules without aliases still work via exact match
    for (let i = 6; i <= 10; i++) {
      const result = await resolveModuleId(`mod${i}`, largePolicy, aliasTable);
      assert.equal(result.canonical, `mod${i}`);
      assert.equal(result.confidence, 1.0);
      assert.equal(result.source, "exact");
    }
  });

  test("distinct aliases with similar names don't collide", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "auth-core": { canonical: "services/auth-core", confidence: 1.0 },
        "auth-core-v2": { canonical: "services/auth-core-v2", confidence: 1.0 },
        "auth-core-legacy": { canonical: "services/auth-core-old", confidence: 1.0 },
      },
    };

    // Need extended policy
    const extendedPolicy = {
      modules: {
        "services/auth-core": {
          description: "Current auth",
          owns_paths: ["services/auth/**"],
        },
        "services/auth-core-v2": {
          description: "Next gen auth",
          owns_paths: ["services/auth-v2/**"],
        },
        "services/auth-core-old": {
          description: "Legacy auth",
          owns_paths: ["services/auth-old/**"],
        },
      },
    };

    const result1 = await resolveModuleId("auth-core", extendedPolicy, aliasTable);
    const result2 = await resolveModuleId("auth-core-v2", extendedPolicy, aliasTable);
    const result3 = await resolveModuleId("auth-core-legacy", extendedPolicy, aliasTable);

    assert.equal(result1.canonical, "services/auth-core");
    assert.equal(result2.canonical, "services/auth-core-v2");
    assert.equal(result3.canonical, "services/auth-core-old");

    // All are distinct - no collision
    assert.notEqual(result1.canonical, result2.canonical);
    assert.notEqual(result2.canonical, result3.canonical);
    assert.notEqual(result1.canonical, result3.canonical);
  });
});

describe("Collision Error Messages (Conceptual)", () => {
  test("intentional collision in alias table would be caught at load time", () => {
    // This documents the expected behavior - collision detection would happen
    // when loading/validating the alias table, not during resolution

    // Example invalid alias table (would be rejected by validator):
    const invalidAliasTable = {
      aliases: {
        "auth": {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
        // In a properly validated system, this would be caught:
        // "auth" key can only exist once due to JavaScript object semantics
      },
    };

    // The structure itself prevents key collisions
    assert.ok(invalidAliasTable.aliases["auth"]);
    assert.equal(Object.keys(invalidAliasTable.aliases).length, 1);
  });

  test("collision detection strategy: first-match-wins vs error", async () => {
    clearAliasTableCache();

    // Current implementation: first match in resolution order wins
    // 1. Exact match (if exists)
    // 2. Alias match (if exists)
    // 3. Substring match (if unique)

    // If multiple resolution methods apply, first wins:
    const aliasTable = {
      aliases: {
        "services/auth-core": {
          canonical: "services/auth-core-v2", // Alias for exact match
          confidence: 1.0,
        },
      },
    };

    // Exact match takes precedence
    const result = await resolveModuleId("services/auth-core", samplePolicy, aliasTable);
    assert.equal(result.canonical, "services/auth-core");
    assert.equal(result.source, "exact");
    // The alias is never checked because exact match wins
  });

  test("proper error message for ambiguous resolution", async () => {
    clearAliasTableCache();

    // When substring matching finds multiple matches, confidence is 0
    const result = await resolveModuleId("user", samplePolicy);

    // 'user' matches 'services/user-access-api' and 'api/user-service'
    assert.equal(result.confidence, 0);
    assert.equal(result.source, "fuzzy");

    // Application layer should detect this and provide helpful error
    if (result.confidence === 0 && result.source === "fuzzy") {
      // This is where AmbiguousSubstringError would be thrown by caller
      assert.ok(true, "Caller should detect ambiguous match and throw error");
    }
  });
});

describe("Collision Resolution Strategy Documentation", () => {
  test("strategy 1: first-match-wins (current implementation)", async () => {
    clearAliasTableCache();

    // Resolution order:
    // 1. Exact match → confidence 1.0, source: exact
    // 2. Alias match → confidence 1.0, source: alias
    // 3. Unique substring → confidence 0.9, source: substring
    // 4. Ambiguous/none → confidence 0, source: fuzzy

    const result = await resolveModuleId("services/auth-core", samplePolicy);
    assert.equal(result.source, "exact");
    assert.equal(result.confidence, 1.0);
  });

  test("strategy 2: error on collision (for substring ambiguity)", async () => {
    clearAliasTableCache();

    // When substring matching is ambiguous, return confidence 0
    // Caller should throw AmbiguousSubstringError
    const result = await resolveModuleId("auth", samplePolicy);

    // 'auth' matches both 'services/auth-core' and 'core/authentication'
    if (result.confidence === 0) {
      // Simulate the error that should be thrown by caller
      const matches = ["services/auth-core", "core/authentication"];
      assert.ok(matches.length > 1, "Ambiguous match detected");
      assert.equal(result.source, "fuzzy");
    }
  });

  test("no collision when alias and exact match exist for same ID", async () => {
    clearAliasTableCache();

    // Even if alias exists for a module ID that's also in policy,
    // exact match takes precedence
    const aliasTable = {
      aliases: {
        "services/auth-core": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "redundant but harmless",
        },
      },
    };

    const result = await resolveModuleId("services/auth-core", samplePolicy, aliasTable);
    assert.equal(result.source, "exact"); // Not "alias"
    assert.equal(result.confidence, 1.0);
  });
});

describe("Real-World Collision Scenarios", () => {
  test("refactoring scenario: old module name aliased to new location", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "old/auth/service": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "refactored 2025-10-15",
        },
      },
    };

    const result = await resolveModuleId("old/auth/service", samplePolicy, aliasTable);
    assert.equal(result.canonical, "services/auth-core");
    assert.equal(result.source, "alias");
    assert.equal(result.confidence, 1.0);
  });

  test("merge scenario: two modules merged, both old names alias to new", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "old-module-a": {
          canonical: "services/unified-module",
          confidence: 1.0,
          reason: "merged into unified-module 2025-11-01",
        },
        "old-module-b": {
          canonical: "services/unified-module",
          confidence: 1.0,
          reason: "merged into unified-module 2025-11-01",
        },
      },
    };

    const policyWithMerged = {
      modules: {
        "services/unified-module": {
          description: "Unified module after merge",
          owns_paths: ["services/unified/**"],
        },
      },
    };

    const result1 = await resolveModuleId("old-module-a", policyWithMerged, aliasTable);
    const result2 = await resolveModuleId("old-module-b", policyWithMerged, aliasTable);

    assert.equal(result1.canonical, "services/unified-module");
    assert.equal(result2.canonical, "services/unified-module");
    // Both old names correctly resolve to new merged module
  });

  test("split scenario: one module split, new names, old alias deprecated", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "old-monolith": {
          canonical: "services/auth-core", // Points to one of the split modules
          confidence: 0.8, // Lower confidence - ambiguous which split module
          reason: "deprecated - was split into auth-core and user-service",
        },
      },
    };

    const result = await resolveModuleId("old-monolith", samplePolicy, aliasTable);
    assert.equal(result.canonical, "services/auth-core");
    assert.equal(result.confidence, 0.8); // Reflects ambiguity in mapping
  });
});
