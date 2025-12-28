/**
 * Example: External Orchestrator Batch Frame Ingestion
 *
 * This example demonstrates how an external orchestrator can use the
 * batch Frame ingestion API to record multi-step workflows atomically,
 * and optionally trigger Atlas rebuilds after successful ingestion.
 *
 * Usage:
 *   npx tsx examples/batch-ingestion-example.ts
 */

import { insertFramesBatch } from "../src/memory/batch.js";
import { createFrameStore } from "../src/memory/store/index.js";
import type { FrameInput } from "../src/memory/batch.js";

/**
 * Simulate a multi-step workflow orchestrator
 */
async function runWorkflow(workflowId: string, steps: string[]) {
  console.log(`\n🚀 Starting workflow: ${workflowId}`);
  console.log(`   Steps: ${steps.join(" → ")}\n`);

  // Create Frame store
  const store = createFrameStore(":memory:");

  // Generate Frames for each workflow step
  const frames: FrameInput[] = steps.map((step, index) => ({
    id: `${workflowId}-step-${index + 1}`,
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    branch: "main",
    module_scope: ["workflow-engine"],
    summary_caption: `Completed: ${step}`,
    reference_point: step,
    status_snapshot: {
      next_action: index < steps.length - 1 ? steps[index + 1] : "Workflow complete",
    },
    runId: workflowId,
  }));

  // Ingest batch atomically
  console.log(`📦 Ingesting ${frames.length} Frames in batch...`);
  const startTime = performance.now();
  const result = await insertFramesBatch(store, frames);
  const duration = performance.now() - startTime;

  if (result.success) {
    console.log(`✅ Success! Ingested ${result.count} Frames in ${duration.toFixed(2)}ms`);

    // Verify persistence
    const allFrames = await store.listFrames();
    console.log(`   Total Frames in store: ${allFrames.length}`);
  } else {
    console.log(`❌ Failed! Validation errors:`);
    for (const error of result.validationErrors) {
      console.log(`   - Frame ${error.frameId}: ${error.validation.errors.length} error(s)`);
    }
  }

  await store.close();
  return result.success;
}

/**
 * Simulate a workflow with validation failure
 */
async function runFailingWorkflow() {
  console.log(`\n🔴 Testing failure scenario with invalid Frame...`);

  const store = createFrameStore(":memory:");

  const frames: FrameInput[] = [
    {
      id: "valid-1",
      timestamp: new Date().toISOString(),
      branch: "main",
      module_scope: ["test"],
      summary_caption: "Valid frame 1",
      reference_point: "step 1",
      status_snapshot: { next_action: "step 2" },
    },
    // Invalid frame - missing required fields
    {
      id: "invalid",
      timestamp: new Date().toISOString(),
    } as FrameInput,
    {
      id: "valid-2",
      timestamp: new Date().toISOString(),
      branch: "main",
      module_scope: ["test"],
      summary_caption: "Valid frame 2",
      reference_point: "step 2",
      status_snapshot: { next_action: "complete" },
    },
  ];

  const result = await insertFramesBatch(store, frames);

  if (!result.success) {
    console.log(`✅ Correctly rejected batch with validation errors`);
    console.log(`   Errors found: ${result.validationErrors.length}`);

    // Verify atomicity - no frames should be persisted
    const allFrames = await store.listFrames();
    console.log(`   Frames in store: ${allFrames.length} (should be 0 due to rollback)`);
  }

  await store.close();
}

/**
 * Example: Batch ingestion with Atlas rebuild hook
 *
 * Demonstrates using the onSuccess callback to trigger Atlas rebuilds
 * after successful batch ingestion.
 */
async function runWorkflowWithAtlasRebuild(workflowId: string, steps: string[]) {
  console.log(`\n🔄 Running workflow with Atlas rebuild hook: ${workflowId}`);
  console.log(`   Steps: ${steps.join(" → ")}\n`);

  const store = createFrameStore(":memory:");

  const frames: FrameInput[] = steps.map((step, index) => ({
    id: `${workflowId}-step-${index + 1}`,
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    branch: "main",
    module_scope: ["atlas-demo"],
    summary_caption: `Completed: ${step}`,
    reference_point: step,
    status_snapshot: {
      next_action: index < steps.length - 1 ? steps[index + 1] : "Workflow complete",
    },
    runId: workflowId,
  }));

  console.log(`📦 Ingesting ${frames.length} Frames with rebuild hook...`);

  const result = await insertFramesBatch(store, frames, {
    // Hook to trigger after successful batch ingestion
    onSuccess: async (batchResult) => {
      console.log(`   🔄 onSuccess hook triggered!`);
      console.log(`   📊 Batch result: ${batchResult.count} frames ingested`);

      // In a real application, you would trigger Atlas rebuild here:
      // import { triggerAtlasRebuild } from '@smartergpt/lex/atlas';
      // await triggerAtlasRebuild();

      console.log(`   ✨ Simulated Atlas rebuild scheduling`);
    },
  });

  if (result.success) {
    console.log(`✅ Workflow complete with ${result.count} Frames`);
  }

  await store.close();
}

/**
 * Main example runner
 */
async function main() {
  console.log("=================================================");
  console.log("  Batch Frame Ingestion API - Example");
  console.log("=================================================");

  // Example 1: Successful multi-step workflow
  await runWorkflow("deploy-v1.2.3", [
    "Run tests",
    "Build artifacts",
    "Deploy to staging",
    "Run smoke tests",
    "Deploy to production",
  ]);

  // Example 2: Parallel data processing workflow
  await runWorkflow("data-import-2024-01", [
    "Load dataset A",
    "Load dataset B",
    "Load dataset C",
    "Merge results",
    "Generate report",
  ]);

  // Example 3: Workflow with Atlas rebuild hook (L-EXE-004)
  await runWorkflowWithAtlasRebuild("atlas-workflow-001", [
    "Initialize system",
    "Process data",
    "Generate insights",
  ]);

  // Example 4: Failure scenario (validation error)
  await runFailingWorkflow();

  console.log("\n=================================================");
  console.log("  Examples complete!");
  console.log("=================================================\n");
}

// Run examples
main().catch(console.error);
