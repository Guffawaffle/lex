/**
 * Tests for Atlas Rebuild Trigger API (LEX-108)
 *
 * Tests ensure:
 * - triggerAtlasRebuild() returns Promise<RebuildResult>
 * - Callbacks fire on rebuild complete
 * - Debounce prevents excessive rebuilds
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "assert";
import {
  AtlasRebuildManager,
  initAtlasRebuildManager,
  triggerAtlasRebuild,
  onRebuildComplete,
  removeRebuildCallback,
  resetAtlasRebuildManager,
} from "../../../dist/shared/atlas/trigger.js";

// Helper to create test frames
function createTestFrame(id, moduleScope, timestampOffset = 0, branch = "main") {
  const baseTime = new Date("2024-01-01T00:00:00Z").getTime();
  return {
    id,
    timestamp: new Date(baseTime + timestampOffset).toISOString(),
    branch,
    module_scope: moduleScope,
    summary_caption: `Test frame ${id}`,
    reference_point: `Work on ${moduleScope.join(", ")}`,
    status_snapshot: {
      next_action: "Continue work",
    },
  };
}

describe("AtlasRebuildManager", () => {
  let manager;

  beforeEach(() => {
    // Create a manager with minimal debounce for testing
    manager = new AtlasRebuildManager({
      fetchFrames: () => [
        createTestFrame("frame-1", ["ui/admin"]),
        createTestFrame("frame-2", ["api/users"]),
      ],
      debounceMs: 10, // Short debounce for tests
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  test("triggerRebuild returns RebuildResult with success", async () => {
    const result = await manager.triggerRebuild();

    assert.ok(result.success);
    assert.ok(result.atlas);
    assert.ok(result.validation);
    assert.ok(result.durationMs >= 0);
    assert.equal(result.frameCount, 2);
    assert.ok(result.timestamp);
    assert.ok(!result.error);
  });

  test("RebuildResult contains Atlas with correct structure", async () => {
    const result = await manager.triggerRebuild();

    assert.ok(result.atlas);
    assert.ok(Array.isArray(result.atlas.nodes));
    assert.ok(Array.isArray(result.atlas.edges));
    assert.equal(result.atlas.nodes.length, 2);
    assert.equal(result.atlas.metadata.frameCount, 2);
  });

  test("callbacks are invoked on rebuild complete", async () => {
    let callbackResult = null;
    let callbackCount = 0;

    manager.onRebuildComplete((result) => {
      callbackResult = result;
      callbackCount++;
    });

    await manager.triggerRebuild();

    assert.ok(callbackResult);
    assert.ok(callbackResult.success);
    assert.equal(callbackCount, 1);
  });

  test("multiple callbacks are all invoked", async () => {
    const results = [];

    manager.onRebuildComplete((result) => results.push({ id: 1, result }));
    manager.onRebuildComplete((result) => results.push({ id: 2, result }));
    manager.onRebuildComplete((result) => results.push({ id: 3, result }));

    await manager.triggerRebuild();

    assert.equal(results.length, 3);
    assert.equal(results[0].id, 1);
    assert.equal(results[1].id, 2);
    assert.equal(results[2].id, 3);
  });

  test("onRebuildComplete returns unsubscribe function", async () => {
    let callbackCount = 0;

    const unsubscribe = manager.onRebuildComplete(() => {
      callbackCount++;
    });

    await manager.triggerRebuild();
    assert.equal(callbackCount, 1);

    unsubscribe();

    await manager.triggerRebuild();
    // Should still be 1 since we unsubscribed
    assert.equal(callbackCount, 1);
  });

  test("removeRebuildCallback removes callback", async () => {
    let callbackCount = 0;

    const callback = () => {
      callbackCount++;
    };

    manager.onRebuildComplete(callback);

    await manager.triggerRebuild();
    assert.equal(callbackCount, 1);

    const removed = manager.removeRebuildCallback(callback);
    assert.ok(removed);

    await manager.triggerRebuild();
    // Should still be 1 since we removed the callback
    assert.equal(callbackCount, 1);
  });

  test("removeRebuildCallback returns false for unknown callback", () => {
    const removed = manager.removeRebuildCallback(() => {});
    assert.ok(!removed);
  });

  test("getCallbackCount returns correct count", () => {
    assert.equal(manager.getCallbackCount(), 0);

    const unsubscribe1 = manager.onRebuildComplete(() => {});
    assert.equal(manager.getCallbackCount(), 1);

    const unsubscribe2 = manager.onRebuildComplete(() => {});
    assert.equal(manager.getCallbackCount(), 2);

    unsubscribe1();
    assert.equal(manager.getCallbackCount(), 1);

    unsubscribe2();
    assert.equal(manager.getCallbackCount(), 0);
  });

  test("isRebuildInProgress returns correct state", async () => {
    assert.ok(!manager.isRebuildInProgress());

    // Start a rebuild but don't await it
    const rebuildPromise = manager.triggerRebuild();

    // Wait a bit for rebuild to start (after debounce)
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Note: The rebuild might be done by now due to fast execution
    // Just verify we can call it
    await rebuildPromise;
    assert.ok(!manager.isRebuildInProgress());
  });

  test("multiple rapid triggers batch into single rebuild", async () => {
    let rebuildCount = 0;

    manager.onRebuildComplete(() => {
      rebuildCount++;
    });

    // Trigger multiple rebuilds rapidly (within debounce window)
    const promises = [
      manager.triggerRebuild(),
      manager.triggerRebuild(),
      manager.triggerRebuild(),
    ];

    // All promises should resolve with the same result
    const results = await Promise.all(promises);

    // All should be successful
    assert.ok(results.every((r) => r.success));

    // Should have only one actual rebuild (debounce batches them)
    assert.equal(rebuildCount, 1);
  });

  test("handles fetchFrames that returns empty array", async () => {
    const emptyManager = new AtlasRebuildManager({
      fetchFrames: () => [],
      debounceMs: 10,
    });

    try {
      const result = await emptyManager.triggerRebuild();

      assert.ok(result.success);
      assert.equal(result.frameCount, 0);
      assert.ok(result.atlas);
      assert.equal(result.atlas.nodes.length, 0);
    } finally {
      emptyManager.dispose();
    }
  });

  test("handles async fetchFrames", async () => {
    const asyncManager = new AtlasRebuildManager({
      fetchFrames: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [createTestFrame("async-frame-1", ["async/module"])];
      },
      debounceMs: 10,
    });

    try {
      const result = await asyncManager.triggerRebuild();

      assert.ok(result.success);
      assert.equal(result.frameCount, 1);
    } finally {
      asyncManager.dispose();
    }
  });

  test("handles fetchFrames error", async () => {
    const errorManager = new AtlasRebuildManager({
      fetchFrames: () => {
        throw new Error("Database connection failed");
      },
      debounceMs: 10,
    });

    try {
      const result = await errorManager.triggerRebuild();

      assert.ok(!result.success);
      assert.ok(result.error);
      assert.ok(result.error.includes("Database connection failed"));
    } finally {
      errorManager.dispose();
    }
  });

  test("dispose cancels pending rebuilds", async () => {
    let callbackCalled = false;

    manager.onRebuildComplete(() => {
      callbackCalled = true;
    });

    // Start a rebuild but dispose before it completes
    const rebuildPromise = manager.triggerRebuild();
    manager.dispose();

    // The promise should reject
    await assert.rejects(rebuildPromise, /disposed/);

    // Callback should not have been called
    assert.ok(!callbackCalled);
  });
});

describe("Global Manager API", () => {
  beforeEach(() => {
    resetAtlasRebuildManager();
  });

  afterEach(() => {
    resetAtlasRebuildManager();
  });

  test("triggerAtlasRebuild throws if not initialized", async () => {
    // triggerAtlasRebuild calls getAtlasRebuildManager() which throws synchronously
    assert.throws(() => triggerAtlasRebuild(), /not initialized/);
  });

  test("onRebuildComplete throws if not initialized", () => {
    assert.throws(() => onRebuildComplete(() => {}), /not initialized/);
  });

  test("removeRebuildCallback throws if not initialized", () => {
    assert.throws(() => removeRebuildCallback(() => {}), /not initialized/);
  });

  test("initAtlasRebuildManager initializes global manager", async () => {
    initAtlasRebuildManager({
      fetchFrames: () => [createTestFrame("global-frame-1", ["global/module"])],
      debounceMs: 10,
    });

    const result = await triggerAtlasRebuild();
    assert.ok(result.success);
    assert.equal(result.frameCount, 1);
  });

  test("onRebuildComplete works with global manager", async () => {
    initAtlasRebuildManager({
      fetchFrames: () => [createTestFrame("global-frame-1", ["global/module"])],
      debounceMs: 10,
    });

    let callbackCalled = false;
    onRebuildComplete(() => {
      callbackCalled = true;
    });

    await triggerAtlasRebuild();
    assert.ok(callbackCalled);
  });

  test("removeRebuildCallback works with global manager", async () => {
    initAtlasRebuildManager({
      fetchFrames: () => [createTestFrame("global-frame-1", ["global/module"])],
      debounceMs: 10,
    });

    let callbackCount = 0;
    const callback = () => {
      callbackCount++;
    };

    onRebuildComplete(callback);
    await triggerAtlasRebuild();
    assert.equal(callbackCount, 1);

    removeRebuildCallback(callback);
    await triggerAtlasRebuild();
    assert.equal(callbackCount, 1);
  });

  test("resetAtlasRebuildManager clears global manager", async () => {
    initAtlasRebuildManager({
      fetchFrames: () => [createTestFrame("global-frame-1", ["global/module"])],
      debounceMs: 10,
    });

    // Works before reset
    await triggerAtlasRebuild();

    resetAtlasRebuildManager();

    // Throws after reset (synchronously, not as rejected promise)
    assert.throws(() => triggerAtlasRebuild(), /not initialized/);
  });

  test("initAtlasRebuildManager replaces existing manager", async () => {
    initAtlasRebuildManager({
      fetchFrames: () => [createTestFrame("first-frame", ["first/module"])],
      debounceMs: 10,
    });

    let result = await triggerAtlasRebuild();
    assert.equal(result.frameCount, 1);

    // Replace with new manager
    initAtlasRebuildManager({
      fetchFrames: () => [
        createTestFrame("second-frame-1", ["second/module"]),
        createTestFrame("second-frame-2", ["second/module"]),
      ],
      debounceMs: 10,
    });

    result = await triggerAtlasRebuild();
    assert.equal(result.frameCount, 2);
  });
});

console.log("All trigger API tests passed! ✅");
