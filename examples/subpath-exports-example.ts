/**
 * Subpath Exports Example
 *
 * This example demonstrates all documented subpath exports from the Lex package.
 * It validates that the imports compile and basic operations work.
 */

// Main entry point
import { saveFrame, getDb, closeDb, searchFrames, getFrameById } from 'lex';
import type { Frame, Policy } from 'lex';

// CLI entry point
import { createProgram } from 'lex/cli';

// Memory store (alternative import)
import { getFramesByBranch, getFramesByJira } from 'lex/memory/store';

// Policy utilities
import { loadPolicy, clearPolicyCache } from 'lex/shared/policy';

// Atlas frame generation
import {
  generateAtlasFrame,
  buildPolicyGraph,
  computeFoldRadius,
  estimateTokens,
} from 'lex/shared/atlas';

async function main(): Promise<void> {
  console.log("Subpath Exports Validation");
  console.log("===========================\n");

  // Test 1: Main entry point - frame operations
  console.log("✓ Main entry imports compiled successfully");
  console.log("  - saveFrame, getDb, closeDb, searchFrames, getFrameById");

  const db = getDb(":memory:");
  
  const testFrame: Frame = {
    id: `frame-test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    reference_point: "testing subpath exports",
    summary_caption: "Validating all import paths",
    status_snapshot: {
      next_action: "Complete validation",
      blockers: [],
    },
    module_scope: ["examples/test"],
    branch: "test/subpath-exports",
    keywords: ["test", "exports"],
  };

  await saveFrame(db, testFrame);
  const retrieved = await getFrameById(db, testFrame.id);
  
  if (!retrieved) {
    throw new Error("Frame not saved/retrieved correctly");
  }
  
  console.log("✓ Main entry operations work correctly\n");

  // Test 2: CLI entry point
  console.log("✓ CLI entry imports compiled successfully");
  console.log("  - createProgram");
  
  const program = createProgram();
  if (!program || typeof program.parse !== 'function') {
    throw new Error("CLI program not created correctly");
  }
  
  console.log("✓ CLI program created successfully\n");

  // Test 3: Memory store alternative imports
  console.log("✓ Memory store imports compiled successfully");
  console.log("  - getFramesByBranch, getFramesByJira");
  
  const branchFrames = await getFramesByBranch(db, "test/subpath-exports");
  if (branchFrames.length !== 1) {
    throw new Error("getFramesByBranch failed");
  }
  
  console.log("✓ Memory store operations work correctly\n");

  // Test 4: Policy utilities
  console.log("✓ Policy utilities imports compiled successfully");
  console.log("  - loadPolicy, clearPolicyCache");
  
  // Note: loadPolicy requires a policy file, so we just verify import works
  clearPolicyCache(); // Safe to call even if cache is empty
  
  console.log("✓ Policy utilities available\n");

  // Test 5: Atlas frame generation
  console.log("✓ Atlas frame imports compiled successfully");
  console.log("  - generateAtlasFrame, buildPolicyGraph, computeFoldRadius, estimateTokens");
  
  // Create a minimal test policy
  const testPolicy: Policy = {
    modules: {
      "test/module-a": {
        owns_paths: ["test/a/**"],
        allowed_callers: ["test/module-b"],
      },
      "test/module-b": {
        owns_paths: ["test/b/**"],
      },
    },
    global_kill_patterns: [],
  };
  
  // Build graph
  const graph = buildPolicyGraph(testPolicy);
  if (!graph || !graph.nodes) {
    throw new Error("buildPolicyGraph failed");
  }
  
  // Generate atlas frame
  const atlasFrame = generateAtlasFrame({
    policy: testPolicy,
    graph,
    moduleScope: ["test/module-a"],
    foldRadius: 1,
  });
  
  if (!atlasFrame || !atlasFrame.modules) {
    throw new Error("generateAtlasFrame failed");
  }
  
  console.log("✓ Atlas frame operations work correctly\n");

  // Clean up
  closeDb(db);

  // Final validation
  console.log("=" .repeat(50));
  console.log("✓ ALL SUBPATH EXPORTS VALIDATED");
  console.log("=" .repeat(50));
  console.log("\nValidated exports:");
  console.log("  • lex (main entry)");
  console.log("  • lex/cli");
  console.log("  • lex/memory/store");
  console.log("  • lex/shared/policy");
  console.log("  • lex/shared/atlas");
  console.log("\nAll imports compiled and basic operations work!");
}

main().catch((error) => {
  console.error("\n❌ Validation failed:", error);
  process.exit(1);
});
