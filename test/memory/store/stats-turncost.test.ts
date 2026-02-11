/**
 * Tests for FrameStore getStats() and getTurnCostMetrics() methods.
 * Issue #689 — Eliminate raw db leaks in MCPServer.
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
 * Test suite for a specific FrameStore implementation.
 */
function createStatsTests(name: string, createStore: () => FrameStore) {
  describe(`${name} getStats()`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("returns zeros for empty store", async () => {
      const stats = await store.getStats();
      assert.strictEqual(stats.totalFrames, 0);
      assert.strictEqual(stats.thisWeek, 0);
      assert.strictEqual(stats.thisMonth, 0);
      assert.strictEqual(stats.oldestDate, null);
      assert.strictEqual(stats.newestDate, null);
    });

    test("counts a single Frame", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      const stats = await store.getStats();
      assert.strictEqual(stats.totalFrames, 1);
      assert.strictEqual(stats.thisWeek, 1);
      assert.strictEqual(stats.thisMonth, 1);
      assert.ok(stats.newestDate !== null);
      assert.ok(stats.oldestDate !== null);
    });

    test("counts multiple Frames", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      await store.saveFrame(createTestFrame("f-002", { module_scope: ["test/module-b"] }));
      await store.saveFrame(createTestFrame("f-003"));
      const stats = await store.getStats();
      assert.strictEqual(stats.totalFrames, 3);
    });

    test("thisWeek and thisMonth count recent Frames correctly", async () => {
      // Create a frame with an old timestamp (60 days ago)
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await store.saveFrame(createTestFrame("f-old", { timestamp: oldDate.toISOString() }));
      // Create a recent frame
      await store.saveFrame(createTestFrame("f-new"));

      const stats = await store.getStats();
      assert.strictEqual(stats.totalFrames, 2);
      // Only the recent frame should be in thisWeek and thisMonth
      assert.strictEqual(stats.thisWeek, 1);
      assert.strictEqual(stats.thisMonth, 1);
    });

    test("date range returns oldest and newest", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const newDate = new Date("2025-06-15T12:00:00Z");
      await store.saveFrame(createTestFrame("f-old", { timestamp: oldDate.toISOString() }));
      await store.saveFrame(createTestFrame("f-new", { timestamp: newDate.toISOString() }));

      const stats = await store.getStats();
      assert.ok(stats.oldestDate !== null);
      assert.ok(stats.newestDate !== null);
      // Oldest should be 2024 date, newest should be 2025 date
      assert.ok(new Date(stats.oldestDate!).getTime() <= new Date(stats.newestDate!).getTime());
    });

    test("detailed=false omits moduleDistribution", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      const stats = await store.getStats(false);
      assert.strictEqual(stats.moduleDistribution, undefined);
    });

    test("detailed=true includes moduleDistribution", async () => {
      await store.saveFrame(createTestFrame("f-001", { module_scope: ["mod/alpha", "mod/beta"] }));
      await store.saveFrame(createTestFrame("f-002", { module_scope: ["mod/alpha"] }));
      const stats = await store.getStats(true);
      assert.ok(stats.moduleDistribution !== undefined);
      assert.ok(
        (stats.moduleDistribution!["mod/alpha"] ?? 0) >= 1,
        "mod/alpha should appear at least once"
      );
    });
  });

  describe(`${name} getTurnCostMetrics()`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = createStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test("returns zeros for empty store", async () => {
      const metrics = await store.getTurnCostMetrics();
      assert.strictEqual(metrics.frameCount, 0);
      assert.strictEqual(metrics.estimatedTokens, 0);
      assert.strictEqual(metrics.prompts, 0);
    });

    test("counts Frames without spend metadata", async () => {
      await store.saveFrame(createTestFrame("f-001"));
      const metrics = await store.getTurnCostMetrics();
      assert.strictEqual(metrics.frameCount, 1);
      // No spend => tokens and prompts should be 0
      assert.strictEqual(metrics.estimatedTokens, 0);
      assert.strictEqual(metrics.prompts, 0);
    });

    test("aggregates spend metadata", async () => {
      await store.saveFrame(
        createTestFrame("f-001", {
          spend: { tokens_estimated: 500, prompts: 2 },
        })
      );
      await store.saveFrame(
        createTestFrame("f-002", {
          spend: { tokens_estimated: 300, prompts: 1 },
        })
      );
      const metrics = await store.getTurnCostMetrics();
      assert.strictEqual(metrics.frameCount, 2);
      assert.strictEqual(metrics.estimatedTokens, 800);
      assert.strictEqual(metrics.prompts, 3);
    });

    test("filters by since timestamp", async () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const recentDate = new Date();
      await store.saveFrame(
        createTestFrame("f-old", {
          timestamp: oldDate.toISOString(),
          spend: { tokens_estimated: 100, prompts: 1 },
        })
      );
      await store.saveFrame(
        createTestFrame("f-new", {
          timestamp: recentDate.toISOString(),
          spend: { tokens_estimated: 200, prompts: 1 },
        })
      );

      // Filter to only recent (last 30 days)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const metrics = await store.getTurnCostMetrics(since);
      assert.strictEqual(metrics.frameCount, 1);
      assert.strictEqual(metrics.estimatedTokens, 200);
      assert.strictEqual(metrics.prompts, 1);
    });

    test("returns all-time metrics when since is omitted", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      await store.saveFrame(
        createTestFrame("f-old", {
          timestamp: oldDate.toISOString(),
          spend: { tokens_estimated: 100, prompts: 1 },
        })
      );
      await store.saveFrame(
        createTestFrame("f-new", {
          spend: { tokens_estimated: 200, prompts: 2 },
        })
      );

      const metrics = await store.getTurnCostMetrics();
      assert.strictEqual(metrics.frameCount, 2);
      assert.strictEqual(metrics.estimatedTokens, 300);
      assert.strictEqual(metrics.prompts, 3);
    });
  });
}

// Run tests for both FrameStore implementations
createStatsTests("SqliteFrameStore", () => new SqliteFrameStore(":memory:"));
createStatsTests("MemoryFrameStore", () => new MemoryFrameStore());
