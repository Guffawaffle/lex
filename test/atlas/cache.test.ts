/**
 * Atlas Frame Cache Edge Case Tests
 *
 * Tests for cache eviction, concurrent access, hit rate tracking,
 * and cache invalidation behaviors.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  AtlasFrameCache,
  getCache,
  resetCache,
  getCacheStats,
  setEnableCache,
} from "../../src/shared/atlas/cache.js";
import type { AtlasFrame } from "../../src/shared/atlas/types.js";

// Helper function to create a minimal test AtlasFrame
function createTestFrame(seedModules: string[], foldRadius: number): AtlasFrame {
  return {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: seedModules,
    fold_radius: foldRadius,
    modules: [],
    edges: [],
    critical_rule: "test-rule",
  };
}

describe("AtlasFrameCache edge cases", () => {
  describe("LRU eviction behavior", () => {
    test("evicts least recently used entry when cache is full", () => {
      const cache = new AtlasFrameCache(3); // Small cache for testing

      // Fill cache with 3 entries
      cache.set(["module-a"], 1, createTestFrame(["module-a"], 1));
      cache.set(["module-b"], 1, createTestFrame(["module-b"], 1));
      cache.set(["module-c"], 1, createTestFrame(["module-c"], 1));

      // Verify all entries are present
      assert.ok(cache.get(["module-a"], 1));
      assert.ok(cache.get(["module-b"], 1));
      assert.ok(cache.get(["module-c"], 1));

      // Add a 4th entry - should evict module-a (LRU after the gets above)
      // Note: module-a was accessed first, so after accessing b and c, a is LRU
      cache.set(["module-d"], 1, createTestFrame(["module-d"], 1));

      // module-a should be evicted (it was accessed earliest in the get sequence)
      assert.strictEqual(cache.get(["module-a"], 1), undefined);
      // Others should still be present
      assert.ok(cache.get(["module-b"], 1));
      assert.ok(cache.get(["module-c"], 1));
      assert.ok(cache.get(["module-d"], 1));

      const stats = cache.getStats();
      assert.strictEqual(stats.evictions, 1);
    });

    test("accessing entry updates its LRU position", () => {
      const cache = new AtlasFrameCache(3);

      // Fill cache
      cache.set(["module-1"], 1, createTestFrame(["module-1"], 1));
      cache.set(["module-2"], 1, createTestFrame(["module-2"], 1));
      cache.set(["module-3"], 1, createTestFrame(["module-3"], 1));

      // Access module-1 to make it most recently used
      cache.get(["module-1"], 1);

      // Add new entry - should evict module-2 (now LRU)
      cache.set(["module-4"], 1, createTestFrame(["module-4"], 1));

      // module-2 should be evicted
      assert.strictEqual(cache.get(["module-2"], 1), undefined);
      // module-1 should still be present (was accessed recently)
      assert.ok(cache.get(["module-1"], 1));
    });

    test("evicts multiple entries when adding many at once", () => {
      const cache = new AtlasFrameCache(2);

      // Fill cache
      cache.set(["a"], 1, createTestFrame(["a"], 1));
      cache.set(["b"], 1, createTestFrame(["b"], 1));

      // Add 2 more entries - should evict both original entries
      cache.set(["c"], 1, createTestFrame(["c"], 1));
      cache.set(["d"], 1, createTestFrame(["d"], 1));

      assert.strictEqual(cache.get(["a"], 1), undefined);
      assert.strictEqual(cache.get(["b"], 1), undefined);
      assert.ok(cache.get(["c"], 1));
      assert.ok(cache.get(["d"], 1));

      const stats = cache.getStats();
      assert.strictEqual(stats.evictions, 2);
    });
  });

  describe("cache key normalization", () => {
    test("same modules in different order produce same cache key", () => {
      const cache = new AtlasFrameCache();
      const frame = createTestFrame(["b", "a", "c"], 1);

      // Set with one order
      cache.set(["c", "a", "b"], 1, frame);

      // Get with different order - should hit cache
      const result = cache.get(["a", "b", "c"], 1);
      assert.ok(result);
      assert.deepStrictEqual(result.seed_modules, ["b", "a", "c"]);
    });

    test("different radius produces different cache key", () => {
      const cache = new AtlasFrameCache();
      const frame1 = createTestFrame(["module"], 1);
      const frame2 = createTestFrame(["module"], 2);

      cache.set(["module"], 1, frame1);
      cache.set(["module"], 2, frame2);

      const result1 = cache.get(["module"], 1);
      const result2 = cache.get(["module"], 2);

      assert.ok(result1);
      assert.ok(result2);
      assert.strictEqual(result1.fold_radius, 1);
      assert.strictEqual(result2.fold_radius, 2);
    });
  });

  describe("cache statistics", () => {
    test("tracks hits and misses accurately", () => {
      const cache = new AtlasFrameCache();

      // Initial state
      let stats = cache.getStats();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);

      // Miss
      cache.get(["nonexistent"], 1);
      stats = cache.getStats();
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hits, 0);

      // Add entry
      cache.set(["test"], 1, createTestFrame(["test"], 1));

      // Hit
      cache.get(["test"], 1);
      stats = cache.getStats();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);

      // Multiple hits
      cache.get(["test"], 1);
      cache.get(["test"], 1);
      stats = cache.getStats();
      assert.strictEqual(stats.hits, 3);
    });

    test("calculates hit rate correctly", () => {
      const cache = new AtlasFrameCache();

      // 0 operations = 0 hit rate
      assert.strictEqual(cache.getHitRate(), 0);

      cache.set(["test"], 1, createTestFrame(["test"], 1));

      // 2 hits
      cache.get(["test"], 1);
      cache.get(["test"], 1);
      // 1 miss
      cache.get(["nonexistent"], 1);

      // 2 hits / 3 total = 0.666...
      const hitRate = cache.getHitRate();
      assert.ok(hitRate > 0.66 && hitRate < 0.67);
    });

    test("resetStats clears stats but preserves cache entries", () => {
      const cache = new AtlasFrameCache();

      cache.set(["test"], 1, createTestFrame(["test"], 1));
      cache.get(["test"], 1);
      cache.get(["nonexistent"], 1);

      cache.resetStats();

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.evictions, 0);
      // But entry should still be in cache
      assert.strictEqual(stats.size, 1);
      assert.ok(cache.get(["test"], 1));
    });

    test("tracks size correctly through operations", () => {
      const cache = new AtlasFrameCache(5);

      assert.strictEqual(cache.getStats().size, 0);

      cache.set(["a"], 1, createTestFrame(["a"], 1));
      assert.strictEqual(cache.getStats().size, 1);

      cache.set(["b"], 1, createTestFrame(["b"], 1));
      assert.strictEqual(cache.getStats().size, 2);

      // Update existing entry
      cache.set(["a"], 1, createTestFrame(["a-updated"], 1));
      assert.strictEqual(cache.getStats().size, 2);

      cache.clear();
      assert.strictEqual(cache.getStats().size, 0);
    });
  });

  describe("clear behavior", () => {
    test("clear removes all entries and resets access order", () => {
      const cache = new AtlasFrameCache();

      cache.set(["a"], 1, createTestFrame(["a"], 1));
      cache.set(["b"], 1, createTestFrame(["b"], 1));
      cache.set(["c"], 1, createTestFrame(["c"], 1));

      cache.clear();

      assert.strictEqual(cache.get(["a"], 1), undefined);
      assert.strictEqual(cache.get(["b"], 1), undefined);
      assert.strictEqual(cache.get(["c"], 1), undefined);
      assert.strictEqual(cache.getStats().size, 0);
    });
  });

  describe("global cache functions", () => {
    test("getCache returns cache when enabled", () => {
      setEnableCache(true);
      const cache = getCache();
      assert.ok(cache instanceof AtlasFrameCache);
    });

    test("getCache returns null when disabled", () => {
      setEnableCache(false);
      const cache = getCache();
      assert.strictEqual(cache, null);
      // Re-enable for other tests
      setEnableCache(true);
    });

    test("setEnableCache clears cache when disabling", () => {
      setEnableCache(true);
      const cache = getCache();
      cache?.set(["test"], 1, createTestFrame(["test"], 1));

      setEnableCache(false);
      setEnableCache(true);

      // Cache should have been cleared
      const newCache = getCache();
      assert.strictEqual(newCache?.get(["test"], 1), undefined);
    });

    test("resetCache clears entries and stats", () => {
      setEnableCache(true);
      const cache = getCache();
      cache?.set(["test"], 1, createTestFrame(["test"], 1));
      cache?.get(["test"], 1);

      resetCache();

      const stats = getCacheStats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
    });

    test("getCacheStats returns zero stats when cache disabled", () => {
      setEnableCache(false);
      const stats = getCacheStats();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.evictions, 0);
      assert.strictEqual(stats.size, 0);
      // Re-enable for other tests
      setEnableCache(true);
    });
  });

  describe("edge cases with empty and special inputs", () => {
    test("handles empty module scope", () => {
      const cache = new AtlasFrameCache();
      const frame = createTestFrame([], 1);

      cache.set([], 1, frame);
      const result = cache.get([], 1);

      assert.ok(result);
      assert.deepStrictEqual(result.seed_modules, []);
    });

    test("handles zero fold radius", () => {
      const cache = new AtlasFrameCache();
      const frame = createTestFrame(["test"], 0);

      cache.set(["test"], 0, frame);
      const result = cache.get(["test"], 0);

      assert.ok(result);
      assert.strictEqual(result.fold_radius, 0);
    });

    test("handles modules with special characters", () => {
      const cache = new AtlasFrameCache();
      const specialModules = ["module/path", "module:with:colons", "module,with,commas"];
      const frame = createTestFrame(specialModules, 1);

      cache.set(specialModules, 1, frame);
      const result = cache.get(specialModules, 1);

      assert.ok(result);
      assert.deepStrictEqual(result.seed_modules, specialModules);
    });

    test("handles very large fold radius", () => {
      const cache = new AtlasFrameCache();
      const frame = createTestFrame(["test"], 999999);

      cache.set(["test"], 999999, frame);
      const result = cache.get(["test"], 999999);

      assert.ok(result);
      assert.strictEqual(result.fold_radius, 999999);
    });

    test("handles cache of size 1", () => {
      const cache = new AtlasFrameCache(1);

      cache.set(["a"], 1, createTestFrame(["a"], 1));
      assert.ok(cache.get(["a"], 1));

      cache.set(["b"], 1, createTestFrame(["b"], 1));
      assert.strictEqual(cache.get(["a"], 1), undefined);
      assert.ok(cache.get(["b"], 1));

      const stats = cache.getStats();
      assert.strictEqual(stats.evictions, 1);
      assert.strictEqual(stats.size, 1);
    });
  });
});
