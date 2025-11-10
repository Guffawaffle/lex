/**
 * Lex Consumer Example (ESM JavaScript)
 *
 * This example demonstrates using the Lex package API from plain JavaScript.
 * It captures a frame, recalls it, and validates the output.
 */

import { saveFrame, searchFrames, getDb, closeDb } from "lex";

async function main() {
  console.log("Lex Consumer Example (JavaScript ESM)");
  console.log("======================================\n");

  // Initialize database (in-memory for testing)
  const db = getDb(":memory:");

  try {
    // Step 1: Save a frame
    console.log("Step 1: Capturing a work session frame...");
    const frameData = {
      id: `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      reference_point: "implementing receipt validation",
      summary_caption: "Added receipt generation to policy checker",
      status_snapshot: {
        next_action: "Add unit tests for receipt format",
        blockers: [],
      },
      module_scope: ["policy/check", "shared/types"],
      branch: "feature/receipts",
      jira: "LEX-001",
      keywords: ["receipts", "policy", "validation"],
    };

    await saveFrame(db, frameData);

    console.log(`✓ Frame captured: ${frameData.id}`);
    console.log(`  Summary: ${frameData.summary_caption}`);
    console.log(`  Modules: ${frameData.module_scope.join(", ")}\n`);

    // Step 2: Recall the frame
    console.log("Step 2: Recalling frame by keyword...");
    const recalled = await searchFrames(db, "receipt validation");

    console.log(`✓ Found ${recalled.length} matching frame(s)`);

    recalled.forEach((f) => {
      console.log(`  [${f.branch}] ${f.summary_caption}`);
      console.log(`  Next: ${f.status_snapshot.next_action}`);
    });

    // Step 3: Validate expected behavior
    console.log("\nStep 3: Validating...");
    if (recalled.length === 0) {
      throw new Error("No frames found - search failed");
    }

    if (recalled[0].module_scope.includes("policy/check")) {
      console.log("✓ Module scope validated");
    } else {
      throw new Error("Module scope incorrect");
    }

    // Final output: RECEIPT_OK token for smoke test assertion
    console.log("\n" + "=".repeat(40));
    console.log("RECEIPT_OK: All validations passed");
    console.log("=".repeat(40));
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    closeDb(db);
  }
}

main();
