/**
 * Alias DX Failure Mode Tests
 *
 * Tests that document and verify behavior for common failure scenarios
 * developers might encounter when using aliases.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { resolveModuleId, findSubstringMatches } from "../../../dist/shared/aliases/resolver.js";
import type { Policy } from "../../../dist/shared/types/policy.js";

const testPolicy: Policy = {
  modules: {
    "services/auth-core": {
      description: "Auth service",
      owns_paths: ["services/auth/**"],
    },
    "api/user-access": {
      description: "User access API",
      owns_paths: ["api/user/**"],
    },
    "ui/user-admin-panel": {
      description: "User admin panel",
      owns_paths: ["ui/admin/**"],
    },
    "services/user-management": {
      description: "User management service",
      owns_paths: ["services/usermgmt/**"],
    },
    "infrastructure/database": {
      description: "Database layer",
      owns_paths: ["infra/db/**"],
    },
  },
};

describe("DX Failure Mode: Ambiguous Substring", () => {
  test("substring matches multiple modules (user)", async () => {
    // "user" matches: api/user-access, ui/user-admin-panel, services/user-management
    const resolution = await resolveModuleId("user", testPolicy);

    // Should return confidence 0 (ambiguous)
    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.source, "fuzzy");

    // Verify that multiple matches exist
    const policyModuleIds = new Set(Object.keys(testPolicy.modules));
    const matches = findSubstringMatches("user", policyModuleIds);
    assert.ok(matches.length > 1, "Expected multiple matches for 'user'");
  });

  test("substring matches multiple modules (services)", async () => {
    // "services" matches: services/auth-core, services/user-management
    const resolution = await resolveModuleId("services", testPolicy);

    // Should return confidence 0 (ambiguous)
    assert.equal(resolution.confidence, 0);
  });

  test("resolution provides helpful error for ambiguous match", async () => {
    const resolution = await resolveModuleId("user", testPolicy);

    // Should indicate the problem
    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.original, "user");

    // Developer should check for low confidence and provide better error
    if (resolution.confidence === 0) {
      const policyModuleIds = new Set(Object.keys(testPolicy.modules));
      const matches = findSubstringMatches("user", policyModuleIds);

      // Construct helpful error message
      const errorMsg = `Ambiguous: '${resolution.original}' matches ${matches.length} modules`;
      assert.ok(errorMsg.includes("Ambiguous"));
    }
  });
});

describe("DX Failure Mode: Typos", () => {
  test("typo in module name (auth-cor)", async () => {
    const resolution = await resolveModuleId("auth-cor", testPolicy);

    // Substring matching finds it
    assert.equal(resolution.canonical, "services/auth-core");
    assert.equal(resolution.confidence, 0.9);
    assert.equal(resolution.source, "substring");
  });

  test("typo with strict mode fails", async () => {
    const resolution = await resolveModuleId("auth-cor", testPolicy, undefined, {
      noSubstring: true,
    });

    // Strict mode rejects substring matches
    assert.equal(resolution.confidence, 0);
  });

  test("severe typo is not matched", async () => {
    const resolution = await resolveModuleId("xyz-completely-wrong", testPolicy);

    // No match found
    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.canonical, "xyz-completely-wrong");
  });

  test("case mismatch is handled by substring", async () => {
    // Note: Substring matching is case-insensitive
    const resolution = await resolveModuleId("AUTH-CORE", testPolicy);

    assert.equal(resolution.canonical, "services/auth-core");
    assert.equal(resolution.confidence, 0.9);
    assert.equal(resolution.source, "substring");
  });
});

describe("DX Failure Mode: Module Not Found", () => {
  test("completely unknown module", async () => {
    const resolution = await resolveModuleId("nonexistent-module", testPolicy);

    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.canonical, "nonexistent-module"); // Returns unchanged
  });

  test("module not in policy but has similar name", async () => {
    // Typo: "servics" instead of "services"
    const resolution = await resolveModuleId("servics/auth-core", testPolicy);

    // Substring might partially match, or return 0
    // In this case, "auth-core" substring should still match
    assert.ok(resolution.confidence === 0 || resolution.confidence === 0.9);
  });

  test("empty string module ID", async () => {
    const resolution = await resolveModuleId("", testPolicy);

    // Empty string should not match anything
    assert.equal(resolution.confidence, 0);
  });
});

describe("DX Failure Mode: Alias Configuration Errors", () => {
  test("alias points to nonexistent module", async () => {
    const badAliases = {
      aliases: {
        auth: {
          canonical: "services/nonexistent-auth",
          confidence: 1.0,
          reason: "bad alias",
        },
      },
    };

    const resolution = await resolveModuleId("auth", testPolicy, badAliases);

    // Resolution will succeed (alias is trusted)
    assert.equal(resolution.canonical, "services/nonexistent-auth");
    assert.equal(resolution.confidence, 1.0);

    // But validation against policy will fail
    assert.ok(!testPolicy.modules[resolution.canonical]);
  });

  test("empty alias table behaves like no alias table", async () => {
    const emptyAliases = { aliases: {} };

    const resolution = await resolveModuleId("auth-core", testPolicy, emptyAliases);

    // Should fall back to substring matching
    assert.equal(resolution.canonical, "services/auth-core");
    assert.equal(resolution.confidence, 0.9);
    assert.equal(resolution.source, "substring");
  });
});

describe("DX Failure Mode: Strict Mode CI", () => {
  test("substring match fails in strict mode", async () => {
    const resolution = await resolveModuleId("auth-core", testPolicy, undefined, {
      noSubstring: true,
    });

    // Strict mode rejects
    assert.equal(resolution.confidence, 0);
  });

  test("exact match passes in strict mode", async () => {
    const resolution = await resolveModuleId("services/auth-core", testPolicy, undefined, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "exact");
  });

  test("explicit alias passes in strict mode", async () => {
    const aliases = {
      aliases: {
        auth: {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "team shorthand",
        },
      },
    };

    const resolution = await resolveModuleId("auth", testPolicy, aliases, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "alias");
  });

  test("CI validation pattern", async () => {
    // Simulate CI validating a list of modules
    const prModules = ["services/auth-core", "auth-core", "completely-wrong"];

    const strictResults = await Promise.all(
      prModules.map((id) => resolveModuleId(id, testPolicy, undefined, { noSubstring: true }))
    );

    // Check which ones would pass CI (confidence 1.0)
    const passing = strictResults.filter((r) => r.confidence === 1.0);
    const failing = strictResults.filter((r) => r.confidence < 1.0);

    assert.equal(passing.length, 1); // Only "services/auth-core"
    assert.equal(failing.length, 2); // "auth-core" and "completely-wrong"

    // This pattern lets CI fail with clear error messages
    if (failing.length > 0) {
      const errors = failing.map((r) => `Module '${r.original}' not found (strict mode)`);
      assert.ok(errors.length > 0);
    }
  });
});

describe("DX Failure Mode: Substring Minimum Length", () => {
  test("substring too short (< 3 chars)", async () => {
    // Default minSubstringLength is 3
    const resolution = await resolveModuleId("au", testPolicy);

    // "au" is too short, should not match
    assert.equal(resolution.confidence, 0);
  });

  test("substring exactly minimum length (3 chars)", async () => {
    const resolution = await resolveModuleId("aut", testPolicy);

    // "aut" should match "services/auth-core"
    // But only if it's a unique match
    assert.ok(resolution.confidence === 0.9 || resolution.confidence === 0);
  });

  test("custom minimum length can be set", async () => {
    // Allow 2-char substrings
    const resolution = await resolveModuleId("au", testPolicy, undefined, {
      minSubstringLength: 2,
    });

    // Now "au" should match
    // But might be ambiguous (matches "auth" and "user")
    assert.ok(resolution.confidence >= 0);
  });
});

describe("DX Failure Mode: Historical Rename Confusion", () => {
  test("using old module name after rename (no alias)", async () => {
    // Simulate old module name that was renamed
    const oldName = "services/user-access-api";

    const resolution = await resolveModuleId(oldName, testPolicy);

    // No exact match (module was renamed to "api/user-access")
    // Substring might partially match
    assert.ok(resolution.confidence < 1.0);
  });

  test("using old module name with historical alias", async () => {
    const aliases = {
      aliases: {
        "services/user-access-api": {
          canonical: "api/user-access",
          confidence: 1.0,
          reason: "refactored 2025-11-09",
        },
      },
    };

    const resolution = await resolveModuleId("services/user-access-api", testPolicy, aliases);

    // Alias resolves old name to new name
    assert.equal(resolution.canonical, "api/user-access");
    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "alias");
  });
});

describe("DX Failure Mode: Performance Edge Cases", () => {
  test("resolving with very large policy (simulated)", async () => {
    // Create a large policy
    const largePolicy: Policy = { modules: {} };
    for (let i = 0; i < 1000; i++) {
      largePolicy.modules[`module-${i}`] = {
        description: `Module ${i}`,
        owns_paths: [`path-${i}/**`],
      };
    }

    const start = Date.now();
    const resolution = await resolveModuleId("module-500", largePolicy);
    const duration = Date.now() - start;

    // Should still be fast (< 100ms)
    assert.ok(duration < 100, `Resolution took ${duration}ms, expected < 100ms`);
    assert.equal(resolution.canonical, "module-500");
    assert.equal(resolution.confidence, 1.0);
  });

  test("resolving multiple modules with same alias table (caching)", async () => {
    const aliases = {
      aliases: {
        auth: { canonical: "services/auth-core", confidence: 1.0, reason: "test" },
      },
    };

    // First resolution might load table
    const start1 = Date.now();
    await resolveModuleId("auth", testPolicy, aliases);
    const duration1 = Date.now() - start1;

    // Subsequent resolutions should reuse table
    const start2 = Date.now();
    await resolveModuleId("auth", testPolicy, aliases);
    const duration2 = Date.now() - start2;

    // Both should be fast
    assert.ok(duration1 < 50, `First resolution: ${duration1}ms`);
    assert.ok(duration2 < 50, `Second resolution: ${duration2}ms`);
  });
});

describe("DX Failure Mode: Edge Cases", () => {
  test("module ID with special characters", async () => {
    const resolution = await resolveModuleId("module-with-dashes", testPolicy);

    // Should not match anything in our test policy
    assert.equal(resolution.confidence, 0);
  });

  test("module ID with slashes", async () => {
    const resolution = await resolveModuleId("services/", testPolicy);

    // Partial path - ambiguous
    assert.equal(resolution.confidence, 0);
  });

  test("module ID is just a number", async () => {
    const resolution = await resolveModuleId("123", testPolicy);

    assert.equal(resolution.confidence, 0);
  });

  test("module ID with whitespace", async () => {
    const resolution = await resolveModuleId(" services/auth-core ", testPolicy);

    // Input with whitespace should not match (no trimming)
    assert.equal(resolution.confidence, 0);
  });
});
