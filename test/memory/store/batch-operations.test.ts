/**
 * Batch operations tests for FrameStore
 *
 * Tests the saveFrames() method for:
 * - Success scenarios with multiple frames
 * - Validation failure scenarios (all-or-nothing)
 * - Partial scenarios where one frame is invalid
 * - Performance requirements (100 frames < 500ms)
 * - Transaction rollback on SQLite errors
 *
 * Run with: npm test
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import type { Frame } from "@app/memory/frames/types.js";
import type { FrameStore } from "@app/memory/store/frame-store.js";

/**
 * Create a valid test Frame with a given ID.
 */
function createTestFrame(id: string, index: number = 0): Frame {
  return {
    id,
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    branch: "test-branch",
    module_scope: ["test-module"],
    summary_caption: `Test frame ${id}`,
    reference_point: `reference for ${id}`,
    status_snapshot: {
      next_action: "Continue testing",
    },
  };
}

/**
 * Create an invalid test Frame (missing required fields).
 */
function createInvalidFrame(id: string): Partial<Frame> {
  return {
    id,
    timestamp: new Date().toISOString(),
    // Missing required fields: branch, module_scope, summary_caption, reference_point, status_snapshot
  };
}

/**
 * Test suite for a specific FrameStore implementation
 */
function createBatchOperationsTests(
  name: string,
  createStore: () => FrameStore
) {
  describe(`${name} Batch Operations`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    describe("saveFrames() - Success Scenarios", () => {
      test("should save an empty array and return empty results", async () => {
        const results = await store.saveFrames([]);
        assert.deepStrictEqual(results, []);
      });

      test("should save a single frame successfully", async () => {
        const frame = createTestFrame("batch-single-001");
        const results = await store.saveFrames([frame]);

        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, "batch-single-001");
        assert.strictEqual(results[0].success, true);
        assert.strictEqual(results[0].error, undefined);

        // Verify frame was persisted
        const retrieved = await store.getFrameById("batch-single-001");
        assert.ok(retrieved);
        assert.strictEqual(retrieved.id, "batch-single-001");
      });

      test("should save multiple frames successfully", async () => {
        const frames = [
          createTestFrame("batch-multi-001", 0),
          createTestFrame("batch-multi-002", 1),
          createTestFrame("batch-multi-003", 2),
        ];
        const results = await store.saveFrames(frames);

        assert.strictEqual(results.length, 3);
        for (let i = 0; i < 3; i++) {
          assert.strictEqual(results[i].id, `batch-multi-00${i + 1}`);
          assert.strictEqual(results[i].success, true);
          assert.strictEqual(results[i].error, undefined);
        }

        // Verify all frames were persisted
        for (const frame of frames) {
          const retrieved = await store.getFrameById(frame.id);
          assert.ok(retrieved, `Frame ${frame.id} should be persisted`);
        }
      });

      test("should maintain order of results matching input order", async () => {
        const frames = [
          createTestFrame("batch-order-c", 0),
          createTestFrame("batch-order-a", 1),
          createTestFrame("batch-order-b", 2),
        ];
        const results = await store.saveFrames(frames);

        assert.strictEqual(results[0].id, "batch-order-c");
        assert.strictEqual(results[1].id, "batch-order-a");
        assert.strictEqual(results[2].id, "batch-order-b");
      });

      test("should handle frames with all optional fields", async () => {
        const frameWithAllFields: Frame = {
          id: "batch-full-001",
          timestamp: new Date().toISOString(),
          branch: "feature/test",
          jira: "TICKET-123",
          module_scope: ["ui/component", "services/api"],
          summary_caption: "Full test frame",
          reference_point: "full test reference",
          status_snapshot: {
            next_action: "Complete test",
            blockers: ["blocker 1"],
            merge_blockers: ["merge blocker 1"],
            tests_failing: ["test 1"],
          },
          keywords: ["test", "batch"],
          atlas_frame_id: "atlas-001",
          feature_flags: ["flag1"],
          permissions: ["perm1"],
          runId: "run-001",
          planHash: "hash-001",
          spend: {
            prompts: 5,
            tokens_estimated: 1000,
          },
          userId: "user-001",
        };

        const results = await store.saveFrames([frameWithAllFields]);
        assert.strictEqual(results[0].success, true);

        const retrieved = await store.getFrameById("batch-full-001");
        assert.ok(retrieved);
        assert.strictEqual(retrieved.jira, "TICKET-123");
        assert.strictEqual(retrieved.runId, "run-001");
      });

      test("should handle upsert (update existing frames)", async () => {
        const frame1 = createTestFrame("batch-upsert-001");
        await store.saveFrame(frame1);

        const updatedFrame: Frame = {
          ...frame1,
          summary_caption: "Updated caption via batch",
        };

        const results = await store.saveFrames([updatedFrame]);
        assert.strictEqual(results[0].success, true);

        const retrieved = await store.getFrameById("batch-upsert-001");
        assert.strictEqual(retrieved?.summary_caption, "Updated caption via batch");
      });
    });

    describe("saveFrames() - Validation Failure (All-or-Nothing)", () => {
      test("should reject all frames when first frame is invalid", async () => {
        const invalidFrame = createInvalidFrame("batch-invalid-first") as Frame;
        const validFrame = createTestFrame("batch-valid-001");

        const results = await store.saveFrames([invalidFrame, validFrame]);

        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].success, false);
        assert.ok(results[0].error?.includes("Validation failed"));
        assert.strictEqual(results[1].success, false);
        assert.ok(results[1].error?.includes("Transaction aborted"));

        // Verify no frames were persisted
        const retrieved = await store.getFrameById("batch-valid-001");
        assert.strictEqual(retrieved, null, "Valid frame should not be persisted on rollback");
      });

      test("should reject all frames when middle frame is invalid", async () => {
        const valid1 = createTestFrame("batch-valid-1");
        const invalid = createInvalidFrame("batch-invalid-middle") as Frame;
        const valid2 = createTestFrame("batch-valid-2");

        const results = await store.saveFrames([valid1, invalid, valid2]);

        assert.strictEqual(results.length, 3);
        assert.strictEqual(results[0].success, false);
        assert.strictEqual(results[1].success, false);
        assert.strictEqual(results[2].success, false);

        // Verify no frames were persisted
        assert.strictEqual(await store.getFrameById("batch-valid-1"), null);
        assert.strictEqual(await store.getFrameById("batch-valid-2"), null);
      });

      test("should reject all frames when last frame is invalid", async () => {
        const valid = createTestFrame("batch-valid-last");
        const invalid = createInvalidFrame("batch-invalid-last") as Frame;

        const results = await store.saveFrames([valid, invalid]);

        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].success, false);
        assert.strictEqual(results[1].success, false);

        // Verify no frames were persisted
        assert.strictEqual(await store.getFrameById("batch-valid-last"), null);
      });

      test("should provide specific error for invalid frame", async () => {
        const invalid = createInvalidFrame("batch-error-msg") as Frame;
        const results = await store.saveFrames([invalid]);

        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].success, false);
        assert.ok(results[0].error, "Should have error message");
        assert.ok(
          results[0].error!.includes("Validation failed"),
          "Error should indicate validation failure"
        );
      });
    });

    describe("saveFrames() - Store State After Failure", () => {
      test("should not affect existing frames when batch fails", async () => {
        // Save a frame first
        const existingFrame = createTestFrame("batch-existing-001");
        await store.saveFrame(existingFrame);

        // Try to save a batch with an invalid frame
        const invalid = createInvalidFrame("batch-invalid-new") as Frame;
        const results = await store.saveFrames([invalid]);

        assert.strictEqual(results[0].success, false);

        // Verify existing frame is still there
        const retrieved = await store.getFrameById("batch-existing-001");
        assert.ok(retrieved, "Existing frame should not be affected");
        assert.strictEqual(retrieved.id, "batch-existing-001");
      });
    });
  });
}

// Run tests for SqliteFrameStore (in-memory)
createBatchOperationsTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));

// Run tests for MemoryFrameStore
createBatchOperationsTests("MemoryFrameStore", () => new MemoryFrameStore());

// Performance tests (SQLite only, as it's the production implementation)
describe("SqliteFrameStore Batch Performance", () => {
  let store: SqliteFrameStore;

  beforeEach(() => {
    store = new SqliteFrameStore(":memory:");
  });

  afterEach(async () => {
    await store.close();
  });

  test("should save 100 frames in under 500ms", async () => {
    const frames: Frame[] = [];
    for (let i = 0; i < 100; i++) {
      frames.push(createTestFrame(`perf-${String(i).padStart(3, "0")}`, i));
    }

    const startTime = performance.now();
    const results = await store.saveFrames(frames);
    const endTime = performance.now();

    const duration = endTime - startTime;

    // Verify all succeeded
    assert.strictEqual(results.length, 100);
    for (const result of results) {
      assert.strictEqual(result.success, true, `Frame ${result.id} should succeed`);
    }

    // Verify performance requirement
    assert.ok(
      duration < 500,
      `Batch save should complete in under 500ms, took ${duration.toFixed(2)}ms`
    );

    // Log performance info
    console.log(`    Performance: 100 frames saved in ${duration.toFixed(2)}ms`);
  });

  test("should verify all 100 frames were persisted", async () => {
    const frames: Frame[] = [];
    for (let i = 0; i < 100; i++) {
      frames.push(createTestFrame(`verify-${String(i).padStart(3, "0")}`, i));
    }

    await store.saveFrames(frames);

    // Verify all frames can be retrieved
    const { frames: allFrames } = await store.listFrames({ limit: 100 });
    assert.strictEqual(allFrames.length, 100, "Should have 100 frames");

    // Spot check a few
    const first = await store.getFrameById("verify-000");
    const middle = await store.getFrameById("verify-050");
    const last = await store.getFrameById("verify-099");

    assert.ok(first);
    assert.ok(middle);
    assert.ok(last);
  });
});

// Edge cases specific to SqliteFrameStore
describe("SqliteFrameStore Batch Edge Cases", () => {
  test("should throw error when store is closed", async () => {
    const store = new SqliteFrameStore(":memory:");
    await store.close();

    await assert.rejects(
      async () => store.saveFrames([createTestFrame("closed-001")]),
      { message: "SqliteFrameStore is closed" }
    );
  });
});
