/**
 * LexRunner Strict Mode Example
 *
 * Demonstrates CI-safe validation that only accepts exact matches and explicit aliases.
 * No fuzzy matching or substring guessing allowed.
 */

import { resolveModuleId } from "../../dist/shared/aliases/resolver.js";
import type { Policy } from "../../dist/shared/types/policy.js";

const examplePolicy: Policy = {
  modules: {
    "services/auth-core": {
      description: "Auth service",
      owns_paths: ["services/auth/**"],
    },
    "api/user-access": {
      description: "User API",
      owns_paths: ["api/user/**"],
    },
    "ui/admin-panel": {
      description: "Admin UI",
      owns_paths: ["ui/admin/**"],
    },
  },
};

const aliasTable = {
  aliases: {
    auth: {
      canonical: "services/auth-core",
      confidence: 1.0,
      reason: "team shorthand",
    },
  },
};

/**
 * Strict validation for CI - only exact matches and explicit aliases
 */
async function strictValidateModuleIds(
  modules: string[],
  policy: Policy,
  aliasTable?: any
): Promise<{ valid: boolean; canonical: string[]; errors: string[] }> {
  const canonical: string[] = [];
  const errors: string[] = [];

  for (const moduleId of modules) {
    const resolution = await resolveModuleId(moduleId, policy, aliasTable, {
      noSubstring: true, // Disable substring matching
    });

    // In strict mode, only accept confidence 1.0 (exact or alias)
    if (resolution.confidence === 1.0) {
      canonical.push(resolution.canonical);
    } else {
      errors.push(`Module '${moduleId}' not found in policy (strict mode: no fuzzy matching)`);
    }
  }

  return {
    valid: errors.length === 0,
    canonical,
    errors,
  };
}

async function main() {
  console.log("LexRunner Strict Mode Example");
  console.log("==============================\n");
  console.log("CI-safe validation: Only exact matches and explicit aliases\n");

  // Test 1: Exact matches - PASS
  console.log("Test 1: Exact module IDs");
  console.log("-------------------------");
  const test1 = await strictValidateModuleIds(
    ["services/auth-core", "api/user-access"],
    examplePolicy,
    aliasTable
  );
  console.log("Input: ['services/auth-core', 'api/user-access']");
  console.log(`Result: ${test1.valid ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Canonical: [${test1.canonical.join(", ")}]`);

  // Test 2: Explicit alias - PASS
  console.log("\n\nTest 2: Explicit alias");
  console.log("----------------------");
  const test2 = await strictValidateModuleIds(["auth"], examplePolicy, aliasTable);
  console.log("Input: ['auth']");
  console.log(`Result: ${test2.valid ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Canonical: [${test2.canonical.join(", ")}]`);
  console.log("Note: 'auth' is in alias table → 'services/auth-core'");

  // Test 3: Substring match - FAIL in strict mode
  console.log("\n\nTest 3: Substring (no alias defined)");
  console.log("-------------------------------------");
  const test3 = await strictValidateModuleIds(["auth-core"], examplePolicy, aliasTable);
  console.log("Input: ['auth-core']");
  console.log(`Result: ${test3.valid ? "✅ PASS" : "❌ FAIL"}`);
  if (!test3.valid) {
    console.log("Errors:");
    test3.errors.forEach((err) => console.log(`  - ${err}`));
  }
  console.log("Note: 'auth-core' would match in fuzzy mode, but strict mode rejects it");

  // Test 4: Typo - FAIL in strict mode
  console.log("\n\nTest 4: Typo");
  console.log("-------------");
  const test4 = await strictValidateModuleIds(["services/auth-cor"], examplePolicy, aliasTable);
  console.log("Input: ['services/auth-cor']");
  console.log(`Result: ${test4.valid ? "✅ PASS" : "❌ FAIL"}`);
  if (!test4.valid) {
    console.log("Errors:");
    test4.errors.forEach((err) => console.log(`  - ${err}`));
  }

  // Test 5: Compare strict vs non-strict
  console.log("\n\n" + "=".repeat(60));
  console.log("Comparison: Strict vs Non-Strict Mode");
  console.log("=".repeat(60));

  const testInput = ["auth-core"]; // Substring of "services/auth-core"

  console.log(`\nInput: [${testInput.join(", ")}]`);

  // Non-strict (allows substring matching)
  const nonStrict = await resolveModuleId(testInput[0], examplePolicy, aliasTable);
  console.log("\nNon-strict mode:");
  console.log(
    `  → '${nonStrict.canonical}' (${nonStrict.source}, confidence ${nonStrict.confidence})`
  );

  // Strict (rejects substring)
  const strict = await resolveModuleId(testInput[0], examplePolicy, aliasTable, {
    noSubstring: true,
  });
  console.log("\nStrict mode:");
  console.log(`  → '${strict.canonical}' (${strict.source}, confidence ${strict.confidence})`);

  if (strict.confidence < 1.0) {
    console.log("  ❌ Would FAIL in CI (confidence < 1.0)");
  }

  // Recommendations
  console.log("\n\n" + "=".repeat(60));
  console.log("CI Best Practices");
  console.log("=".repeat(60));
  console.log("\n1. Use strict mode in CI pipelines:");
  console.log("   LEX_STRICT_MODE=1 lexrunner merge-weave plan.json");
  console.log("\n2. Enable non-strict locally for DX:");
  console.log("   lex remember --modules auth-core  # substring match OK");
  console.log("\n3. Add aliases for common shorthands:");
  console.log("   {'auth': 'services/auth-core'} → Pass in both modes");
  console.log("\n4. Fix validation errors by:");
  console.log("   a) Using exact module IDs");
  console.log("   b) Adding explicit aliases");
  console.log("   c) NOT by disabling strict mode in CI!");

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("✅ Strict mode example completed!");
  console.log("=".repeat(60));
  console.log("\nStrict mode accepts:");
  console.log("  ✓ Exact matches (confidence 1.0)");
  console.log("  ✓ Explicit aliases (confidence 1.0)");
  console.log("\nStrict mode rejects:");
  console.log("  ✗ Substring matches (confidence 0.9)");
  console.log("  ✗ Typos (confidence < 1.0)");
  console.log("  ✗ Unknown modules (confidence 0.0)");
}

main().catch((error) => {
  console.error("❌ Example failed:", error);
  process.exit(1);
});
