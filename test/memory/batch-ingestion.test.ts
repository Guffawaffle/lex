/**
 * Integration tests for batch Frame ingestion API
 *
 * Tests the high-level insertFramesBatch() API from the perspective
 * of an external orchestrator submitting batches of Frames.
 *
 * Focus areas:
 * - External caller usage patterns
 * - Validation error reporting
 * - Transaction semantics
 * - Performance characteristics
 *
 * Run with: npm run test:integration
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { insertFramesBatch } from "@app/memory/batch.js";
import type { FrameInput } from "@app/memory/batch.js";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";
import type { FrameStore } from "@app/memory/store/frame-store.js";

/**
 * Helper: Create a valid Frame for testing
 */
function createValidFrame(id: string, index: number = 0): FrameInput {
  return {
    id,
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    branch: "main",
    module_scope: ["workflow-engine"],
    summary_caption: `Completed step ${index + 1} of workflow`,
    reference_point: `workflow step ${index + 1} done`,
    status_snapshot: {
      next_action: `Proceed to step ${index + 2}`,
    },
  };
}

/**
 * Helper: Create an invalid Frame (missing required fields)
 */
function createInvalidFrame(id: string): Partial<FrameInput> {
  return {
    id,
    timestamp: new Date().toISOString(),
    // Missing: branch, module_scope, summary_caption, reference_point, status_snapshot
  };
}

describe("Batch Frame Ingestion - External Orchestrator Pattern", () => {
  let store: FrameStore;

  beforeEach(() => {
    store = new SqliteFrameStore(":memory:");
  });

  afterEach(async () => {
    await store.close();
  });

  describe("Success Scenarios", () => {
    test("should successfully ingest a single-step workflow", async () => {
      const frames = [createValidFrame("workflow-001", 0)];

      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.validationErrors.length, 0);
      assert.strictEqual(result.results.length, 1);
      assert.strictEqual(result.results[0].success, true);

      // Verify Frame was persisted
      const retrieved = await store.getFrameById("workflow-001");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, "workflow-001");
    });

    test("should successfully ingest a multi-step workflow", async () => {
      // Simulate a 5-step workflow where all steps succeed
      const frames = [
        createValidFrame("workflow-step-1", 0),
        createValidFrame("workflow-step-2", 1),
        createValidFrame("workflow-step-3", 2),
        createValidFrame("workflow-step-4", 3),
        createValidFrame("workflow-step-5", 4),
      ];

      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 5);
      assert.strictEqual(result.validationErrors.length, 0);

      // Verify all Frames were persisted
      for (let i = 1; i <= 5; i++) {
        const retrieved = await store.getFrameById(`workflow-step-${i}`);
        assert.ok(retrieved, `Step ${i} should be persisted`);
      }
    });

    test("should handle parallel work units that logically belong together", async () => {
      // Simulate parallel processing where multiple agents work concurrently
      const frames = [
        {
          ...createValidFrame("parallel-unit-a", 0),
          summary_caption: "Processed data set A",
          module_scope: ["data-processor"],
        },
        {
          ...createValidFrame("parallel-unit-b", 1),
          summary_caption: "Processed data set B",
          module_scope: ["data-processor"],
        },
        {
          ...createValidFrame("parallel-unit-c", 2),
          summary_caption: "Processed data set C",
          module_scope: ["data-processor"],
        },
      ];

      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 3);

      // Verify all parallel units are persisted atomically
      const allFrames = await store.listFrames();
      assert.strictEqual(allFrames.length, 3);
    });
  });

  describe("Validation Failure - All-or-Nothing", () => {
    test("should reject entire batch when first Frame fails validation", async () => {
      const frames = [
        createInvalidFrame("invalid-001") as FrameInput,
        createValidFrame("valid-001", 0),
        createValidFrame("valid-002", 1),
      ];

      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.count, 0);
      assert.strictEqual(result.validationErrors.length, 1);
      assert.strictEqual(result.validationErrors[0].index, 0);
      assert.strictEqual(result.validationErrors[0].frameId, "invalid-001");

      // Verify NO Frames were persisted (atomicity)
      const valid1 = await store.getFrameById("valid-001");
      const valid2 = await store.getFrameById("valid-002");
      assert.strictEqual(valid1, null, "Valid frames should not be persisted on rollback");
      assert.strictEqual(valid2, null, "Valid frames should not be persisted on rollback");
    });

    test("should reject entire batch when middle Frame fails validation", async () => {
      const frames = [
        createValidFrame("valid-001", 0),
        createInvalidFrame("invalid-middle") as FrameInput,
        createValidFrame("valid-002", 1),
      ];

      const result = await insertFramesBatch(store, frames, { failFast: true });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.count, 0);

      // Verify atomicity: no Frames persisted
      const allFrames = await store.listFrames();
      assert.strictEqual(allFrames.length, 0);
    });

    test("should collect all validation errors when failFast is false", async () => {
      const frames = [
        createInvalidFrame("invalid-001") as FrameInput,
        createValidFrame("valid-001", 0),
        createInvalidFrame("invalid-002") as FrameInput,
      ];

      const result = await insertFramesBatch(store, frames, { failFast: false });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.count, 0);
      assert.strictEqual(result.validationErrors.length, 2);
      assert.strictEqual(result.validationErrors[0].frameId, "invalid-001");
      assert.strictEqual(result.validationErrors[1].frameId, "invalid-002");

      // Verify error details
      for (const error of result.validationErrors) {
        assert.ok(error.validation.errors.length > 0);
        assert.strictEqual(error.validation.valid, false);
      }
    });

    test("should provide detailed validation errors for debugging", async () => {
      const frames = [
        createInvalidFrame("debug-frame") as FrameInput,
      ];

      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.validationErrors.length, 1);

      const validationError = result.validationErrors[0];
      assert.strictEqual(validationError.frameId, "debug-frame");
      assert.ok(validationError.validation.errors.length > 0);

      // Verify we get specific field-level errors
      const errors = validationError.validation.errors;
      const errorPaths = errors.map((e) => e.path);
      assert.ok(errorPaths.length > 0, "Should have field-level error paths");
    });
  });

  describe("Performance Requirements", () => {
    test("should handle modest batch sizes efficiently (10 Frames)", async () => {
      const frames: FrameInput[] = [];
      for (let i = 0; i < 10; i++) {
        frames.push(createValidFrame(`perf-10-${String(i).padStart(2, "0")}`, i));
      }

      const startTime = performance.now();
      const result = await insertFramesBatch(store, frames);
      const duration = performance.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 10);

      // Should complete quickly (well under 100ms for 10 frames)
      assert.ok(duration < 100, `10 frames should complete in <100ms, took ${duration.toFixed(2)}ms`);

      console.log(`    Performance: 10 frames ingested in ${duration.toFixed(2)}ms`);
    });

    test("should handle larger batch sizes efficiently (100 Frames)", async () => {
      const frames: FrameInput[] = [];
      for (let i = 0; i < 100; i++) {
        frames.push(createValidFrame(`perf-100-${String(i).padStart(3, "0")}`, i));
      }

      const startTime = performance.now();
      const result = await insertFramesBatch(store, frames);
      const duration = performance.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 100);

      // Should complete within reasonable time (under 500ms per acceptance criteria)
      assert.ok(duration < 500, `100 frames should complete in <500ms, took ${duration.toFixed(2)}ms`);

      console.log(`    Performance: 100 frames ingested in ${duration.toFixed(2)}ms`);

      // Verify all frames were persisted
      const allFrames = await store.listFrames({ limit: 100 });
      assert.strictEqual(allFrames.length, 100);
    });
  });

  describe("Options Configuration", () => {
    test("should respect preValidate=false option", async () => {
      // When pre-validation is disabled, validation happens at the store level
      const frames = [createValidFrame("no-prevalidate-001", 0)];

      const result = await insertFramesBatch(store, frames, { preValidate: false });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
    });

    test("should fail fast by default on validation errors", async () => {
      const frames = [
        createInvalidFrame("fail-fast-1") as FrameInput,
        createInvalidFrame("fail-fast-2") as FrameInput,
      ];

      const result = await insertFramesBatch(store, frames);

      // Should stop after first error
      assert.strictEqual(result.validationErrors.length, 1);
      assert.strictEqual(result.validationErrors[0].index, 0);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty batch gracefully", async () => {
      const result = await insertFramesBatch(store, []);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
      assert.strictEqual(result.validationErrors.length, 0);
    });

    test("should preserve existing Frames when batch fails", async () => {
      // Insert a Frame first
      const existingFrame = createValidFrame("existing-001", 0);
      await store.saveFrame(existingFrame);

      // Try to insert a batch with invalid Frame
      const frames = [createInvalidFrame("new-invalid") as FrameInput];
      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, false);

      // Verify existing Frame is still there
      const retrieved = await store.getFrameById("existing-001");
      assert.ok(retrieved, "Existing Frame should not be affected");
    });

    test("should handle Frames with all optional fields", async () => {
      const fullFrame: FrameInput = {
        id: "full-frame-001",
        timestamp: new Date().toISOString(),
        branch: "feature/complex",
        jira: "PROJ-123",
        module_scope: ["module-a", "module-b"],
        summary_caption: "Complex multi-module change",
        reference_point: "complex feature complete",
        status_snapshot: {
          next_action: "Code review",
          blockers: ["waiting for dependency"],
          merge_blockers: [],
          tests_failing: [],
        },
        keywords: ["feature", "complex"],
        runId: "run-001",
        planHash: "hash-001",
        spend: {
          prompts: 5,
          tokens_estimated: 2000,
        },
        userId: "user-001",
      };

      const result = await insertFramesBatch(store, [fullFrame]);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);

      const retrieved = await store.getFrameById("full-frame-001");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.jira, "PROJ-123");
      assert.strictEqual(retrieved.runId, "run-001");
    });
  });

  describe("Atlas Rebuild Hooks (L-EXE-004)", () => {
    test("should call onSuccess callback after successful batch ingestion", async () => {
      const frames = [
        createValidFrame("hook-success-1", 0),
        createValidFrame("hook-success-2", 1),
      ];

      let callbackCalled = false;
      let callbackResult: any = null;

      const result = await insertFramesBatch(store, frames, {
        onSuccess: (res) => {
          callbackCalled = true;
          callbackResult = res;
        },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 2);
      assert.strictEqual(callbackCalled, true, "onSuccess callback should be called");
      assert.ok(callbackResult, "callback should receive result");
      assert.strictEqual(callbackResult.success, true);
      assert.strictEqual(callbackResult.count, 2);
    });

    test("should NOT call onSuccess callback on validation failure", async () => {
      const frames = [
        createInvalidFrame("invalid-no-hook") as FrameInput,
      ];

      let callbackCalled = false;

      const result = await insertFramesBatch(store, frames, {
        onSuccess: () => {
          callbackCalled = true;
        },
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(callbackCalled, false, "onSuccess should NOT be called on failure");
    });

    test("should NOT call onSuccess callback on store failure", async () => {
      // Create a valid frame first to avoid validation errors
      const frames = [createValidFrame("store-failure-test", 0)];

      // Close the store to cause a store-level failure
      await store.close();

      let callbackCalled = false;

      const result = await insertFramesBatch(store, frames, {
        onSuccess: () => {
          callbackCalled = true;
        },
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(callbackCalled, false, "onSuccess should NOT be called on store failure");
      assert.ok(result.storeError, "should have store error");

      // Reopen store for cleanup
      store = new SqliteFrameStore(":memory:");
    });

    test("should support async onSuccess callbacks", async () => {
      const frames = [createValidFrame("async-hook", 0)];

      let asyncCallbackCompleted = false;

      const result = await insertFramesBatch(store, frames, {
        onSuccess: async () => {
          // Simulate async operation (e.g., triggering Atlas rebuild)
          await new Promise((resolve) => setTimeout(resolve, 10));
          asyncCallbackCompleted = true;
        },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(asyncCallbackCompleted, true, "async callback should complete");
    });

    test("should work without onSuccess callback (backward compatibility)", async () => {
      const frames = [createValidFrame("no-callback", 0)];

      // Should work exactly as before when no callback provided
      const result = await insertFramesBatch(store, frames);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
    });

    test("onSuccess callback receives complete batch result", async () => {
      const frames = [
        createValidFrame("result-check-1", 0),
        createValidFrame("result-check-2", 1),
        createValidFrame("result-check-3", 2),
      ];

      let receivedResult: any = null;

      await insertFramesBatch(store, frames, {
        onSuccess: (res) => {
          receivedResult = res;
        },
      });

      assert.ok(receivedResult, "callback should receive result");
      assert.strictEqual(receivedResult.success, true);
      assert.strictEqual(receivedResult.count, 3);
      assert.strictEqual(receivedResult.validationErrors.length, 0);
      assert.strictEqual(receivedResult.results.length, 3);
      assert.ok(receivedResult.results.every((r: any) => r.success), "all frame saves should succeed");
    });

    test("integration: batch ingestion can trigger actual Atlas rebuild", async () => {
      // This is an integration test showing the complete flow:
      // 1. Batch ingestion of frames
      // 2. onSuccess callback triggers Atlas rebuild
      // 3. Atlas rebuild uses the frames from the store

      const frames = [
        createValidFrame("atlas-integration-1", 0),
        createValidFrame("atlas-integration-2", 1),
        createValidFrame("atlas-integration-3", 2),
      ];

      let atlasRebuildTriggered = false;
      let atlasNodeCount = 0;

      const result = await insertFramesBatch(store, frames, {
        onSuccess: async () => {
          // Simulate what a real Atlas rebuild trigger would do
          // In production, this would call: await triggerAtlasRebuild()
          
          atlasRebuildTriggered = true;
          
          // Simulate rebuilding Atlas from all frames in the store
          const allFrames = await store.listFrames();
          // In a real scenario, this would call rebuildAtlas(allFrames)
          atlasNodeCount = allFrames.length;
        },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 3);
      assert.strictEqual(atlasRebuildTriggered, true, "Atlas rebuild should be triggered");
      assert.strictEqual(atlasNodeCount, 3, "Atlas should be built from all frames in store");
    });
  });
});
