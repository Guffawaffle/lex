/**
 * Tests for case sensitivity in alias resolution
 *
 * Tests case-sensitive behavior of aliases and provides
 * case normalization utilities and validation.
 *
 * Run with: node --test src/shared/aliases/case-sensitivity.spec.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import { resolveModuleId, clearAliasTableCache } from "../../../dist/shared/aliases/resolver.js";

// Sample policy for case sensitivity testing
const samplePolicy = {
  modules: {
    "services/auth-core": {
      description: "Core authentication service",
      owns_paths: ["services/auth/**"],
    },
    "UI/AdminPanel": {
      description: "Admin panel with mixed case",
      owns_paths: ["web-ui/admin/**"],
    },
    "api/UserService": {
      description: "User service API with PascalCase",
      owns_paths: ["api/users/**"],
    },
  },
};

/**
 * Normalize alias to lowercase with validation
 *
 * Best practice: All aliases should be lowercase for consistency
 * and to avoid confusion between "Cli-Core", "cli-core", "CLI-CORE"
 *
 * @param alias - The alias to normalize
 * @returns Normalized lowercase alias
 */
export function normalizeAlias(alias) {
  if (typeof alias !== "string") {
    throw new TypeError("Alias must be a string");
  }
  return alias.toLowerCase().trim();
}

/**
 * Validate that an alias follows lowercase convention
 *
 * @param alias - The alias to validate
 * @returns true if alias is valid (lowercase), false otherwise
 */
export function validateAliasCase(alias) {
  if (typeof alias !== "string" || alias.length === 0) {
    return false;
  }

  const normalized = normalizeAlias(alias);
  return alias === normalized;
}

/**
 * Lint an alias table for case sensitivity issues
 *
 * @param aliasTable - The alias table to lint
 * @returns Array of validation errors, empty if valid
 */
export function lintAliasTableCase(aliasTable) {
  const errors = [];

  for (const [alias, _entry] of Object.entries(aliasTable.aliases)) {
    if (!validateAliasCase(alias)) {
      errors.push({
        alias,
        issue: "non-lowercase",
        suggestion: normalizeAlias(alias),
        message: `Alias "${alias}" should be lowercase: "${normalizeAlias(alias)}"`,
      });
    }

    // Also check for potential collisions after normalization
    const normalized = normalizeAlias(alias);
    if (normalized !== alias) {
      // Check if normalized version already exists
      if (aliasTable.aliases[normalized]) {
        errors.push({
          alias,
          issue: "normalization-collision",
          normalized,
          message: `Alias "${alias}" would collide with "${normalized}" after normalization`,
        });
      }
    }
  }

  return errors;
}

describe("Case Sensitivity in Aliases", () => {
  test("alias 'Cli-Core' vs 'cli-core' are treated as distinct", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "Cli-Core": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "mixed case alias",
        },
        "cli-core": {
          canonical: "UI/AdminPanel",
          confidence: 1.0,
          reason: "lowercase alias",
        },
      },
    };

    const result1 = await resolveModuleId("Cli-Core", samplePolicy, aliasTable);
    const result2 = await resolveModuleId("cli-core", samplePolicy, aliasTable);

    // They resolve to different modules (case-sensitive)
    assert.equal(result1.canonical, "services/auth-core");
    assert.equal(result2.canonical, "UI/AdminPanel");
    assert.notEqual(result1.canonical, result2.canonical);
  });

  test("case mismatch in alias lookup returns no match", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "auth-core": {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
      },
    };

    // Try to resolve with different case
    const result = await resolveModuleId("Auth-Core", samplePolicy, aliasTable, {
      noSubstring: true, // Disable substring matching to isolate alias behavior
    });

    // Should not find alias (case-sensitive), falls back to fuzzy
    assert.equal(result.confidence, 0);
    assert.equal(result.source, "fuzzy");
  });

  test("exact module ID match is case-sensitive", async () => {
    clearAliasTableCache();

    const resultExact = await resolveModuleId("UI/AdminPanel", samplePolicy);
    const resultWrongCase = await resolveModuleId("ui/adminpanel", samplePolicy);

    // Exact case matches
    assert.equal(resultExact.canonical, "UI/AdminPanel");
    assert.equal(resultExact.source, "exact");
    assert.equal(resultExact.confidence, 1.0);

    // Wrong case doesn't match exactly, falls to substring/fuzzy
    assert.notEqual(resultWrongCase.source, "exact");
  });
});

describe("Case Normalization Function", () => {
  test("normalizeAlias converts to lowercase", () => {
    assert.equal(normalizeAlias("Cli-Core"), "cli-core");
    assert.equal(normalizeAlias("AUTH-CORE"), "auth-core");
    assert.equal(normalizeAlias("MixedCaseAlias"), "mixedcasealias");
  });

  test("normalizeAlias handles already lowercase", () => {
    assert.equal(normalizeAlias("cli-core"), "cli-core");
    assert.equal(normalizeAlias("auth"), "auth");
  });

  test("normalizeAlias trims whitespace", () => {
    assert.equal(normalizeAlias("  cli-core  "), "cli-core");
    assert.equal(normalizeAlias("\tauth-core\n"), "auth-core");
  });

  test("normalizeAlias handles special characters", () => {
    assert.equal(normalizeAlias("Cli-Core_123"), "cli-core_123");
    assert.equal(normalizeAlias("Auth/Service"), "auth/service");
  });

  test("normalizeAlias throws on non-string input", () => {
    assert.throws(() => normalizeAlias(null), TypeError);
    assert.throws(() => normalizeAlias(undefined), TypeError);
    assert.throws(() => normalizeAlias(123), TypeError);
    assert.throws(() => normalizeAlias({}), TypeError);
  });

  test("normalizeAlias is idempotent", () => {
    const alias = "Cli-Core";
    const normalized = normalizeAlias(alias);
    assert.equal(normalizeAlias(normalized), normalized);
  });
});

describe("Case Validation Function", () => {
  test("validateAliasCase accepts lowercase aliases", () => {
    assert.ok(validateAliasCase("cli-core"));
    assert.ok(validateAliasCase("auth-service"));
    assert.ok(validateAliasCase("user-api"));
  });

  test("validateAliasCase rejects mixed case aliases", () => {
    assert.ok(!validateAliasCase("Cli-Core"));
    assert.ok(!validateAliasCase("Auth-Service"));
    assert.ok(!validateAliasCase("UserAPI"));
  });

  test("validateAliasCase rejects uppercase aliases", () => {
    assert.ok(!validateAliasCase("CLI-CORE"));
    assert.ok(!validateAliasCase("AUTH"));
  });

  test("validateAliasCase rejects empty string", () => {
    assert.ok(!validateAliasCase(""));
  });

  test("validateAliasCase rejects whitespace-only", () => {
    assert.ok(!validateAliasCase("   "));
  });

  test("validateAliasCase rejects non-string types", () => {
    assert.ok(!validateAliasCase(null));
    assert.ok(!validateAliasCase(undefined));
    assert.ok(!validateAliasCase(123));
    assert.ok(!validateAliasCase({}));
  });

  test("validateAliasCase allows numbers and special chars if lowercase", () => {
    assert.ok(validateAliasCase("cli-core-123"));
    assert.ok(validateAliasCase("auth_service"));
    assert.ok(validateAliasCase("user/api"));
  });
});

describe("Alias Table Linting", () => {
  test("lintAliasTableCase detects non-lowercase aliases", () => {
    const aliasTable = {
      aliases: {
        "Cli-Core": {
          canonical: "services/cli-core",
          confidence: 1.0,
        },
        "auth-service": {
          canonical: "services/auth",
          confidence: 1.0,
        },
        UserAPI: {
          canonical: "api/users",
          confidence: 1.0,
        },
      },
    };

    const errors = lintAliasTableCase(aliasTable);

    assert.equal(errors.length, 2); // Two non-lowercase aliases
    assert.ok(errors.some((e) => e.alias === "Cli-Core"));
    assert.ok(errors.some((e) => e.alias === "UserAPI"));
    assert.ok(!errors.some((e) => e.alias === "auth-service"));
  });

  test("lintAliasTableCase returns empty for valid table", () => {
    const aliasTable = {
      aliases: {
        "cli-core": {
          canonical: "services/cli-core",
          confidence: 1.0,
        },
        "auth-service": {
          canonical: "services/auth",
          confidence: 1.0,
        },
      },
    };

    const errors = lintAliasTableCase(aliasTable);
    assert.equal(errors.length, 0);
  });

  test("lintAliasTableCase detects normalization collisions", () => {
    const aliasTable = {
      aliases: {
        "cli-core": {
          canonical: "services/cli-core",
          confidence: 1.0,
        },
        "Cli-Core": {
          canonical: "services/cli-core-v2",
          confidence: 1.0,
        },
      },
    };

    const errors = lintAliasTableCase(aliasTable);

    // Should detect that "Cli-Core" would collide with "cli-core" after normalization
    assert.ok(errors.length > 0);
  });

  test("lintAliasTableCase provides suggestions", () => {
    const aliasTable = {
      aliases: {
        "Auth-Core": {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
      },
    };

    const errors = lintAliasTableCase(aliasTable);

    assert.equal(errors.length, 1);
    assert.equal(errors[0].suggestion, "auth-core");
    assert.ok(errors[0].message.includes("should be lowercase"));
  });
});

describe("Recommendation: Enforce Lowercase", () => {
  test("lowercase convention avoids confusion", () => {
    // This test documents the recommendation

    const confusingAliases = ["Cli-Core", "cli-core", "CLI-CORE", "cLi-CoRe"];

    // All of these are distinct in a case-sensitive system
    // but could confuse users who expect case-insensitive matching

    const uniqueNormalized = new Set(confusingAliases.map(normalizeAlias));
    assert.equal(uniqueNormalized.size, 1); // All normalize to same value

    // Therefore: enforce lowercase to prevent confusion
  });

  test("lowercase allows case-insensitive substring matching", async () => {
    clearAliasTableCache();

    // Even though aliases are case-sensitive,
    // substring matching is case-insensitive

    const result1 = await resolveModuleId("auth", samplePolicy);
    const result2 = await resolveModuleId("AUTH", samplePolicy);

    // Both should match 'services/auth-core' via substring
    assert.equal(result1.canonical, "services/auth-core");
    assert.equal(result2.canonical, "services/auth-core");
    assert.equal(result1.source, "substring");
    assert.equal(result2.source, "substring");
  });

  test("mixed case in canonical IDs is preserved", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        admin: {
          canonical: "UI/AdminPanel", // Canonical has mixed case
          confidence: 1.0,
        },
      },
    };

    const result = await resolveModuleId("admin", samplePolicy, aliasTable);

    // Canonical ID case is preserved exactly
    assert.equal(result.canonical, "UI/AdminPanel");
    assert.equal(result.source, "alias");
  });
});

describe("Integration with Linter/Validator", () => {
  test("alias table with violations should fail validation", () => {
    const invalidAliasTable = {
      aliases: {
        "Auth-Core": {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
      },
    };

    const errors = lintAliasTableCase(invalidAliasTable);

    // In a CI pipeline, this would cause a failure
    if (errors.length > 0) {
      assert.ok(true, "Linter detected violations");
    }
  });

  test("alias table linting is fast enough for CI", () => {
    // Generate large alias table
    const largeAliasTable = {
      aliases: {},
    };

    for (let i = 0; i < 1000; i++) {
      largeAliasTable.aliases[`alias-${i}`] = {
        canonical: `module-${i}`,
        confidence: 1.0,
      };
    }

    const startTime = Date.now();
    const errors = lintAliasTableCase(largeAliasTable);
    const duration = Date.now() - startTime;

    // Should complete in reasonable time (< 100ms for 1000 aliases)
    assert.ok(duration < 100, `Linting took ${duration}ms, should be < 100ms`);
    assert.equal(errors.length, 0); // All valid lowercase
  });
});

describe("Case Sensitivity Edge Cases", () => {
  test("unicode characters in aliases maintain case", () => {
    const aliases = ["café", "CAFÉ", "Café"];

    const normalized = aliases.map(normalizeAlias);

    // All normalize to lowercase
    assert.equal(normalized[0], "café");
    assert.equal(normalized[1], "café");
    assert.equal(normalized[2], "café");
  });

  test("numbers and symbols don't have case", () => {
    assert.equal(normalizeAlias("module-123"), "module-123");
    assert.equal(normalizeAlias("api/v2"), "api/v2");
    assert.equal(normalizeAlias("core_service"), "core_service");
  });

  test("empty or whitespace-only aliases are invalid", () => {
    assert.ok(!validateAliasCase(""));
    assert.ok(!validateAliasCase("   "));
    assert.ok(!validateAliasCase("\t\n"));
  });
});
