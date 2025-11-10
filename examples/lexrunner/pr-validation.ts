/**
 * LexRunner PR Validation Example
 *
 * Demonstrates how LexRunner validates module IDs in a PR using alias resolution.
 * This is a simplified example showing the core pattern.
 */

import { resolveModuleId, loadAliasTable } from "../../dist/shared/aliases/resolver.js";
import type { Policy } from "../../dist/shared/types/policy.js";

// Example policy (in real LexRunner, this is loaded from lexmap.policy.json)
const examplePolicy: Policy = {
  modules: {
    "services/auth-core": {
      description: "Core authentication service",
      owns_paths: ["services/auth/**"],
      dependencies_allowed: ["infrastructure/database"],
    },
    "api/user-access": {
      description: "User access API",
      owns_paths: ["api/user/**"],
      dependencies_allowed: ["services/auth-core"],
    },
    "ui/admin-panel": {
      description: "Admin UI",
      owns_paths: ["ui/admin/**"],
      dependencies_allowed: ["api/user-access"],
    },
    "infrastructure/database": {
      description: "Database layer",
      owns_paths: ["infra/db/**"],
      dependencies_allowed: [],
    },
  },
};

// Example alias table (team conventions)
const exampleAliases = {
  aliases: {
    auth: {
      canonical: "services/auth-core",
      confidence: 1.0,
      reason: "team shorthand",
    },
    "user-api": {
      canonical: "api/user-access",
      confidence: 1.0,
      reason: "team shorthand",
    },
    "ui-admin": {
      canonical: "ui/admin-panel",
      confidence: 1.0,
      reason: "team shorthand",
    },
    db: {
      canonical: "infrastructure/database",
      confidence: 1.0,
      reason: "common abbreviation",
    },
  },
};

/**
 * Validates module IDs from a PR, resolving aliases
 */
async function validatePRModules(
  prModules: string[],
  policy: Policy,
  aliasTable?: any
): Promise<{
  canonical: string[];
  warnings: Array<{ original: string; canonical: string; confidence: number }>;
  errors: string[];
}> {
  const canonical: string[] = [];
  const warnings: Array<{ original: string; canonical: string; confidence: number }> = [];
  const errors: string[] = [];

  for (const moduleId of prModules) {
    try {
      const resolution = await resolveModuleId(moduleId, policy, aliasTable);

      if (resolution.confidence === 1.0) {
        // Exact match or explicit alias - good!
        canonical.push(resolution.canonical);

        if (resolution.source === "alias") {
          console.log(`  ✓ '${moduleId}' → '${resolution.canonical}' (alias)`);
        } else {
          console.log(`  ✓ '${moduleId}' (exact match)`);
        }
      } else if (resolution.confidence > 0) {
        // Fuzzy/substring match - warning
        canonical.push(resolution.canonical);
        warnings.push({
          original: moduleId,
          canonical: resolution.canonical,
          confidence: resolution.confidence,
        });
        console.log(
          `  ⚠️  '${moduleId}' → '${resolution.canonical}' (${resolution.source}, confidence ${resolution.confidence})`
        );
      } else {
        // Unknown module
        errors.push(`Module '${moduleId}' not found in policy`);
        console.log(`  ❌ '${moduleId}' not found`);
      }
    } catch (error: any) {
      errors.push(`Error resolving '${moduleId}': ${error.message}`);
      console.log(`  ❌ '${moduleId}' error: ${error.message}`);
    }
  }

  return { canonical, warnings, errors };
}

/**
 * Example: LexRunner PR validation flow
 */
async function main() {
  console.log("LexRunner PR Validation Example");
  console.log("================================\n");

  // Simulate PR-123 touching these modules (using team shorthand)
  const pr123Modules = ["auth", "user-api", "ui-admin"];

  console.log("PR-123 modules (team shorthand):", pr123Modules);
  console.log("\nResolving with alias table...");

  const result = await validatePRModules(pr123Modules, examplePolicy, exampleAliases);

  console.log("\n✅ Validation Result:");
  console.log("  Canonical IDs:", result.canonical);
  console.log("  Warnings:", result.warnings.length);
  console.log("  Errors:", result.errors.length);

  if (result.errors.length > 0) {
    console.log("\n❌ Validation FAILED");
    console.log("Errors:");
    result.errors.forEach((err) => console.log(`  - ${err}`));
    process.exit(1);
  }

  // Simulate PR-124 with mixed exact and alias usage
  console.log("\n" + "=".repeat(50));
  const pr124Modules = ["services/auth-core", "db", "api/user-access"];

  console.log("\nPR-124 modules (mixed):", pr124Modules);
  console.log("\nResolving with alias table...");

  const result2 = await validatePRModules(pr124Modules, examplePolicy, exampleAliases);

  console.log("\n✅ Validation Result:");
  console.log("  Canonical IDs:", result2.canonical);

  // Example without alias table (fallback to substring matching)
  console.log("\n" + "=".repeat(50));
  const pr125Modules = ["auth-core", "user-access"];

  console.log("\nPR-125 modules (no alias table):", pr125Modules);
  console.log("\nResolving WITHOUT alias table (substring matching)...");

  const result3 = await validatePRModules(pr125Modules, examplePolicy);

  console.log("\n✅ Validation Result:");
  console.log("  Canonical IDs:", result3.canonical);

  if (result3.warnings.length > 0) {
    console.log("\n⚠️  Warnings (substring matches - consider adding explicit aliases):");
    result3.warnings.forEach((w) => {
      console.log(`  - '${w.original}' matched '${w.canonical}' (confidence ${w.confidence})`);
    });
  }

  console.log("\n" + "=".repeat(50));
  console.log("\n✅ All examples completed successfully!");
  console.log("\nKey takeaways:");
  console.log("  1. Aliases enable team shorthand (auth → services/auth-core)");
  console.log("  2. Canonical IDs are always stored in frames");
  console.log("  3. Substring matching works as fallback (confidence 0.9)");
  console.log("  4. LexRunner should validate all module IDs before frame capture");
}

// Run the example
main().catch((error) => {
  console.error("❌ Example failed:", error);
  process.exit(1);
});
