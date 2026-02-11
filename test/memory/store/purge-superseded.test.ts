/**
 * Tests for FrameStore purgeSuperseded() method.
 * Issue #704 — Bulk dead-frame cleanup for superseded frames.
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
 * Create a valid test Frame.
 */
function createTestFrame(id: string, overrides: Partial<Frame> = {}): Frame {
  return {
    id,
    timestamp: new Date().toISOString(),
    branch: "test-branch",
    module_scope: ["test/module-a"],
    summary_caption: `Test frame ${id}`,
    reference_point: `reference for ${id}`,
    status_snapshot: {
      next_action: "Continue testing",
    },
    ...overrides,
  };
}

/**
 * Test suite factory for purgeSuperseded on a specific FrameStore implementation.
 */
function createPurgeTests(name: string, createStore: () => FrameStore) {
  describe(`${name} purgeSuperseded()`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("returns 0 for empty store", async () => {
      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 0);
    });

    test("returns 0 when no frames are superseded", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.saveFrame(createTestFrame("f-002"));
      await store.saveFrame(createTestFrame("f-003"));

      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 0);

      const count = await store.getFrameCount();
      assert.strictEqual(count, 3);
    });

    test("deletes a single superseded frame", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.saveFrame(createTestFrame("f-002", { superseded_by: "f-001" }));

      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 1);

      const count = await store.getFrameCount();
      assert.strictEqual(count, 1);

      // The superseded frame should be gone
      const purged = await store.getFrameById("f-002");
      assert.strictEqual(purged, null);

      // The superseding frame should remain
      const remaining = await store.getFrameById("f-001");
      assert.ok(remaining);
    });

    test("deletes multiple superseded frames", async () => {
      await store.saveFrame(createTestFrame("f-latest"));
      await store.saveFrame(createTestFrame("f-old-1", { superseded_by: "f-latest" }));
      await store.saveFrame(createTestFrame("f-old-2", { superseded_by: "f-latest" }));
      await store.saveFrame(createTestFrame("f-old-3", { superseded_by: "f-old-2" }));
      await store.saveFrame(createTestFrame("f-unrelated"));

      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 3);

      const count = await store.getFrameCount();
      assert.strictEqual(count, 2);

      // Non-superseded frames should remain
      assert.ok(await store.getFrameById("f-latest"));
      assert.ok(await store.getFrameById("f-unrelated"));

      // Superseded frames should be gone
      assert.strictEqual(await store.getFrameById("f-old-1"), null);
      assert.strictEqual(await store.getFrameById("f-old-2"), null);
      assert.strictEqual(await store.getFrameById("f-old-3"), null);
    });

    test("works with updateFrame-based supersession", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.saveFrame(createTestFrame("f-002"));

      // Mark f-001 as superseded via updateFrame
      await store.updateFrame("f-001", { superseded_by: "f-002" });

      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 1);

      assert.strictEqual(await store.getFrameById("f-001"), null);
      assert.ok(await store.getFrameById("f-002"));
    });

    test("preserves frames with merged_from but no superseded_by", async () => {
      await store.saveFrame(createTestFrame("f-merged", { merged_from: ["f-src-a", "f-src-b"] }));

      const deleted = await store.purgeSuperseded();
      assert.strictEqual(deleted, 0);

      assert.ok(await store.getFrameById("f-merged"));
    });

    test("is idempotent (second call returns 0)", async () => {
      await store.saveFrame(createTestFrame("f-001", { superseded_by: "f-002" }));
      await store.saveFrame(createTestFrame("f-002"));

      const first = await store.purgeSuperseded();
      assert.strictEqual(first, 1);

      const second = await store.purgeSuperseded();
      assert.strictEqual(second, 0);
    });
  });
}

// Run tests for both implementations
createPurgeTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));
createPurgeTests("MemoryFrameStore", () => new MemoryFrameStore());
