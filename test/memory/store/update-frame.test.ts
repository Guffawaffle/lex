/**
 * Tests for FrameStore updateFrame() method and saveFrame bug fix.
 * Issue #705 — Add updateFrame() + fix latent saveFrame column omission.
 *
 * Verifies:
 * 1. updateFrame() works on both SqliteFrameStore and MemoryFrameStore
 * 2. saveFrame() now persists superseded_by and merged_from columns (bug fix)
 * 3. consolidate.ts functions work correctly with updateFrame()
 *
 * Run with: npm test
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import type { Frame } from "@app/memory/frames/types.js";
import type { FrameStore } from "@app/memory/store/frame-store.js";
import {
  markFrameAsSuperseded,
  updateFrameWithMergedFrom,
  consolidateViaSupersede,
  consolidateViaMerge,
} from "@app/memory/store/consolidate.js";

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
 * Test suite factory for a specific FrameStore implementation.
 */
function createUpdateFrameTests(name: string, createStore: () => FrameStore) {
  describe(`${name} updateFrame()`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("returns false for non-existent Frame", async () => {
      const result = await store.updateFrame("non-existent", {
        branch: "updated",
      });
      assert.strictEqual(result, false);
    });

    test("returns true for existing Frame", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      const result = await store.updateFrame("f-001", {
        branch: "updated-branch",
      });
      assert.strictEqual(result, true);
    });

    test("updates branch field", async () => {
      await store.saveFrame(createTestFrame("f-001", { branch: "original" }));
      await store.updateFrame("f-001", { branch: "updated" });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.branch, "updated");
    });

    test("updates summary_caption", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.updateFrame("f-001", { summary_caption: "Updated caption" });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.summary_caption, "Updated caption");
    });

    test("updates superseded_by field", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.updateFrame("f-001", { superseded_by: "f-002" });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.superseded_by, "f-002");
    });

    test("updates merged_from field", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.updateFrame("f-001", {
        merged_from: ["f-002", "f-003"],
      });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.deepStrictEqual(frame.merged_from, ["f-002", "f-003"]);
    });

    test("preserves unchanged fields", async () => {
      const original = createTestFrame("f-001", {
        branch: "my-branch",
        jira: "TICKET-999",
        keywords: ["alpha", "beta"],
      });
      await store.saveFrame(original);

      await store.updateFrame("f-001", { summary_caption: "New caption" });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.branch, "my-branch");
      assert.strictEqual(frame.jira, "TICKET-999");
      assert.deepStrictEqual(frame.keywords, ["alpha", "beta"]);
      assert.strictEqual(frame.summary_caption, "New caption");
    });

    test("does not change id or timestamp", async () => {
      const original = createTestFrame("f-001");
      await store.saveFrame(original);

      // Even if someone passes id/timestamp in updates object, they should be ignored
      // (TypeScript prevents this via Omit<> but runtime safety matters)
      await store.updateFrame("f-001", {
        branch: "updated",
      });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.id, "f-001");
      assert.strictEqual(frame.timestamp, original.timestamp);
    });

    test("updates multiple fields at once", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.updateFrame("f-001", {
        branch: "new-branch",
        jira: "NEW-TICKET",
        superseded_by: "f-999",
        keywords: ["new", "keywords"],
      });

      const frame = await store.getFrameById("f-001");
      assert.ok(frame);
      assert.strictEqual(frame.branch, "new-branch");
      assert.strictEqual(frame.jira, "NEW-TICKET");
      assert.strictEqual(frame.superseded_by, "f-999");
      assert.deepStrictEqual(frame.keywords, ["new", "keywords"]);
    });

    test("handles empty updates object", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      const result = await store.updateFrame("f-001", {});
      // Should return true (frame exists) even with no fields to update
      assert.strictEqual(result, true);
    });
  });
}

/**
 * Test suite for saveFrame bug fix: superseded_by and merged_from persistence.
 */
function createSaveFrameBugFixTests(name: string, createStore: () => FrameStore) {
  describe(`${name} saveFrame() dedup column bug fix`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("saveFrame persists superseded_by", async () => {
      const frame = createTestFrame("f-001", {
        superseded_by: "f-002",
      });
      await store.saveFrame(frame);

      const retrieved = await store.getFrameById("f-001");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.superseded_by, "f-002");
    });

    test("saveFrame persists merged_from", async () => {
      const frame = createTestFrame("f-001", {
        merged_from: ["f-002", "f-003"],
      });
      await store.saveFrame(frame);

      const retrieved = await store.getFrameById("f-001");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved.merged_from, ["f-002", "f-003"]);
    });

    test("saveFrame upsert preserves superseded_by", async () => {
      // Save with superseded_by
      await store.saveFrame(createTestFrame("f-001", { superseded_by: "f-002" }));

      // Upsert (re-save) the same frame with superseded_by in the payload
      const updated = createTestFrame("f-001", {
        superseded_by: "f-002",
        summary_caption: "Updated",
      });
      await store.saveFrame(updated);

      const retrieved = await store.getFrameById("f-001");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.superseded_by, "f-002");
      assert.strictEqual(retrieved.summary_caption, "Updated");
    });

    test("saveFrames batch persists superseded_by and merged_from", async () => {
      const frames = [
        createTestFrame("f-001", { superseded_by: "f-003" }),
        createTestFrame("f-002", { merged_from: ["f-004", "f-005"] }),
      ];
      const results = await store.saveFrames(frames);
      assert.ok(results.every((r) => r.success));

      const f1 = await store.getFrameById("f-001");
      assert.ok(f1);
      assert.strictEqual(f1.superseded_by, "f-003");

      const f2 = await store.getFrameById("f-002");
      assert.ok(f2);
      assert.deepStrictEqual(f2.merged_from, ["f-004", "f-005"]);
    });
  });
}

/**
 * Test suite for consolidate.ts functions using updateFrame().
 */
function createConsolidateTests(name: string, createStore: () => FrameStore) {
  describe(`${name} consolidation with updateFrame()`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("markFrameAsSuperseded sets superseded_by", async () => {
      await store.saveFrame(createTestFrame("f-old"));
      await store.saveFrame(createTestFrame("f-new"));

      await markFrameAsSuperseded(store, "f-old", "f-new");

      const frame = await store.getFrameById("f-old");
      assert.ok(frame);
      assert.strictEqual(frame.superseded_by, "f-new");
    });

    test("markFrameAsSuperseded throws for missing frame", async () => {
      await assert.rejects(() => markFrameAsSuperseded(store, "non-existent", "f-new"), {
        message: "Frame non-existent not found",
      });
    });

    test("markFrameAsSuperseded preserves other fields", async () => {
      const original = createTestFrame("f-old", {
        jira: "TICKET-100",
        keywords: ["important"],
      });
      await store.saveFrame(original);

      await markFrameAsSuperseded(store, "f-old", "f-new");

      const frame = await store.getFrameById("f-old");
      assert.ok(frame);
      assert.strictEqual(frame.superseded_by, "f-new");
      assert.strictEqual(frame.jira, "TICKET-100");
      assert.deepStrictEqual(frame.keywords, ["important"]);
    });

    test("updateFrameWithMergedFrom sets merged_from", async () => {
      const frame = createTestFrame("f-merged");
      await store.saveFrame(frame);

      await updateFrameWithMergedFrom(store, frame, ["f-src-a", "f-src-b"]);

      const updated = await store.getFrameById("f-merged");
      assert.ok(updated);
      assert.deepStrictEqual(updated.merged_from, ["f-src-a", "f-src-b"]);
    });

    test("updateFrameWithMergedFrom throws for missing frame", async () => {
      const missingFrame = createTestFrame("non-existent");
      await assert.rejects(() => updateFrameWithMergedFrom(store, missingFrame, ["f-src"]), {
        message: "Frame non-existent not found",
      });
    });

    test("consolidateViaSupersede marks older frame", async () => {
      const older = createTestFrame("f-old");
      const newer = createTestFrame("f-new");
      await store.saveFrame(older);
      await store.saveFrame(newer);

      const result = await consolidateViaSupersede(store, newer, older);

      assert.strictEqual(result.framesConsolidated, 2);
      assert.deepStrictEqual(result.supersededFrameIds, ["f-old"]);

      const oldFrame = await store.getFrameById("f-old");
      assert.ok(oldFrame);
      assert.strictEqual(oldFrame.superseded_by, "f-new");

      // Newer frame should not be marked as superseded
      const newFrame = await store.getFrameById("f-new");
      assert.ok(newFrame);
      assert.strictEqual(newFrame.superseded_by, undefined);
    });

    test("consolidateViaMerge marks sources and updates merged", async () => {
      const srcA = createTestFrame("f-src-a");
      const srcB = createTestFrame("f-src-b");
      const merged = createTestFrame("f-merged");
      await store.saveFrame(srcA);
      await store.saveFrame(srcB);
      await store.saveFrame(merged);

      const result = await consolidateViaMerge(store, merged, srcA, srcB);

      assert.strictEqual(result.framesConsolidated, 3);
      assert.deepStrictEqual(result.supersededFrameIds, ["f-src-a", "f-src-b"]);
      assert.deepStrictEqual(result.updatedFrameIds, ["f-merged"]);

      // Source frames should be superseded
      const a = await store.getFrameById("f-src-a");
      assert.ok(a);
      assert.strictEqual(a.superseded_by, "f-merged");

      const b = await store.getFrameById("f-src-b");
      assert.ok(b);
      assert.strictEqual(b.superseded_by, "f-merged");

      // Merged frame should have merged_from
      const m = await store.getFrameById("f-merged");
      assert.ok(m);
      assert.deepStrictEqual(m.merged_from, ["f-src-a", "f-src-b"]);
    });
  });
}

// Run tests for both SQLite and Memory implementations
createUpdateFrameTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));
createUpdateFrameTests("MemoryFrameStore", () => new MemoryFrameStore());

createSaveFrameBugFixTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));
createSaveFrameBugFixTests("MemoryFrameStore", () => new MemoryFrameStore());

createConsolidateTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));
createConsolidateTests("MemoryFrameStore", () => new MemoryFrameStore());
