/**
 * LexRunner Merge Sequence Example
 *
 * Demonstrates how LexRunner maintains frame continuity across a multi-PR
 * merge sequence, including handling module renames mid-sequence.
 */

import { resolveModuleId } from "../../dist/shared/aliases/resolver.js";
import type { Policy } from "../../dist/shared/types/policy.js";

// Initial policy (before rename)
const policyV1: Policy = {
  modules: {
    "services/auth-core": {
      description: "Auth service",
      owns_paths: ["services/auth/**"],
    },
    "services/user-access-api": {
      description: "User access API (old location)",
      owns_paths: ["services/userAccess/**"],
    },
    "ui/admin-panel": {
      description: "Admin UI",
      owns_paths: ["ui/admin/**"],
    },
  },
};

// Updated policy (after PR-102 refactors user-access-api)
const policyV2: Policy = {
  modules: {
    "services/auth-core": {
      description: "Auth service",
      owns_paths: ["services/auth/**"],
    },
    "api/user-access": {
      description: "User access API (new location)",
      owns_paths: ["api/userAccess/**"],
    },
    "ui/admin-panel": {
      description: "Admin UI",
      owns_paths: ["ui/admin/**"],
    },
  },
};

// Alias table to handle the rename
const aliasesAfterRename = {
  aliases: {
    // Historical alias for old module ID
    "services/user-access-api": {
      canonical: "api/user-access",
      confidence: 1.0,
      reason: "refactored in PR-102 (2025-11-09)",
    },
    // Team shorthands
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
  },
};

/**
 * Simulated frame data structure
 */
interface Frame {
  id: string;
  prNumber: string;
  moduleScope: string[];
  summary: string;
}

/**
 * Simulate capturing a frame for a PR
 */
async function capturePRFrame(
  prNumber: string,
  modules: string[],
  policy: Policy,
  aliasTable?: any
): Promise<Frame> {
  const resolvedModules: string[] = [];

  console.log(`\nPR-${prNumber}: Resolving modules [${modules.join(", ")}]`);

  for (const moduleId of modules) {
    const resolution = await resolveModuleId(moduleId, policy, aliasTable);

    if (resolution.confidence > 0) {
      resolvedModules.push(resolution.canonical);
      console.log(
        `  ✓ '${moduleId}' → '${resolution.canonical}' (${resolution.source}, confidence ${resolution.confidence})`
      );
    } else {
      throw new Error(`Module '${moduleId}' not found in policy`);
    }
  }

  const frame: Frame = {
    id: `frame-${prNumber}`,
    prNumber,
    moduleScope: resolvedModules,
    summary: `PR-${prNumber} validation`,
  };

  console.log(`  → Frame stored with canonical IDs: [${resolvedModules.join(", ")}]`);
  return frame;
}

/**
 * Example: Multi-PR merge sequence with module rename
 */
async function main() {
  console.log("LexRunner Merge Sequence Example");
  console.log("=================================\n");
  console.log("Scenario: 3-PR sequence with mid-sequence module rename\n");

  const frames: Frame[] = [];

  // PR-100: Initial work (uses old module ID)
  console.log("--- Phase 1: Before Rename ---");
  const frame100 = await capturePRFrame(
    "100",
    ["services/auth-core", "services/user-access-api"],
    policyV1
  );
  frames.push(frame100);

  // PR-101: More work (still uses old module ID)
  const frame101 = await capturePRFrame(
    "101",
    ["services/user-access-api", "ui/admin-panel"],
    policyV1
  );
  frames.push(frame101);

  // PR-102: REFACTOR - Rename services/user-access-api → api/user-access
  console.log("\n--- Phase 2: Refactor (PR-102 renames module) ---");
  console.log("Policy updated: services/user-access-api → api/user-access");
  console.log("Alias table updated to maintain continuity\n");

  const frame102 = await capturePRFrame(
    "102",
    ["api/user-access"], // New module ID
    policyV2,
    aliasesAfterRename
  );
  frames.push(frame102);

  // PR-103: Post-refactor work (uses new module ID)
  console.log("\n--- Phase 3: After Rename ---");
  const frame103 = await capturePRFrame(
    "103",
    ["services/auth-core", "api/user-access"], // New module ID
    policyV2,
    aliasesAfterRename
  );
  frames.push(frame103);

  // PR-104: Developer accidentally uses old name (alias resolves it)
  const frame104 = await capturePRFrame(
    "104",
    ["services/user-access-api"], // Old name, but alias resolves it!
    policyV2,
    aliasesAfterRename
  );
  frames.push(frame104);

  // Demonstrate querying frames across the rename boundary
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Frame Summary Across Merge Sequence:");
  console.log("=".repeat(60));

  frames.forEach((frame) => {
    console.log(`\n${frame.id} (PR-${frame.prNumber}):`);
    console.log(`  Module scope: [${frame.moduleScope.join(", ")}]`);
  });

  // Show how to query for all frames related to user-access
  console.log("\n" + "=".repeat(60));
  console.log("\n🔍 Query: Find all frames touching user-access functionality");
  console.log("=".repeat(60));

  // With aliases, we can search for either old or new name
  const searchTerms = ["services/user-access-api", "api/user-access"];
  const relatedFrames = frames.filter((frame) =>
    frame.moduleScope.some((mod) => searchTerms.includes(mod))
  );

  console.log(`\nFound ${relatedFrames.length} frames:`);
  relatedFrames.forEach((frame) => {
    console.log(`  - PR-${frame.prNumber}: [${frame.moduleScope.join(", ")}]`);
  });

  // Demonstrate resolution of old module ID still works after rename
  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Continuity Verification:");
  console.log("=".repeat(60));

  const oldModuleResolution = await resolveModuleId(
    "services/user-access-api",
    policyV2,
    aliasesAfterRename
  );

  console.log("\nResolving old module ID 'services/user-access-api':");
  console.log(`  → '${oldModuleResolution.canonical}' (${oldModuleResolution.source})`);
  console.log("  ✓ Historical frames remain queryable!");

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Merge sequence example completed successfully!");
  console.log("\nKey takeaways:");
  console.log("  1. Aliases maintain continuity across module renames");
  console.log("  2. Old frames (PR-100, PR-101) use old module ID");
  console.log("  3. New frames (PR-103+) use new module ID");
  console.log("  4. All frames remain queryable via either name");
  console.log("  5. LexRunner can handle mid-sequence policy changes safely");
}

// Run the example
main().catch((error) => {
  console.error("❌ Example failed:", error);
  process.exit(1);
});
