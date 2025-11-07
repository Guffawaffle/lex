/**
 * Tests for Atlas Frame Cache
 *
 * Run with: node shared/atlas/cache.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import path to built dist output
import { AtlasFrameCache } from "../../../dist/shared/atlas/cache.js";

describe("AtlasFrameCache", () => {
  test("stores and retrieves cache entries", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a", "module-b"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    // Cache miss initially
    const result1 = cache.get(["module-a", "module-b"], 1);
    assert.equal(result1, undefined);

    // Store in cache
    cache.set(["module-a", "module-b"], 1, mockFrame);

    // Cache hit
    const result2 = cache.get(["module-a", "module-b"], 1);
    assert.deepEqual(result2, mockFrame);
  });

  test("normalizes module order for cache keys", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a", "module-b"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    // Store with one order
    cache.set(["module-b", "module-a"], 1, mockFrame);

    // Retrieve with different order - should hit cache
    const result = cache.get(["module-a", "module-b"], 1);
    assert.deepEqual(result, mockFrame);
  });

  test("different radii create different cache entries", () => {
    const cache = new AtlasFrameCache();
    const frame1 = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };
    const frame2 = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 2,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    cache.set(["module-a"], 1, frame1);
    cache.set(["module-a"], 2, frame2);

    const result1 = cache.get(["module-a"], 1);
    const result2 = cache.get(["module-a"], 2);

    assert.deepEqual(result1, frame1);
    assert.deepEqual(result2, frame2);
  });

  test("tracks cache hits and misses", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    // Initial stats
    let stats = cache.getStats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 0);

    // Cache miss
    cache.get(["module-a"], 1);
    stats = cache.getStats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 1);

    // Store and hit
    cache.set(["module-a"], 1, mockFrame);
    cache.get(["module-a"], 1);
    stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);

    // Multiple hits
    cache.get(["module-a"], 1);
    cache.get(["module-a"], 1);
    stats = cache.getStats();
    assert.equal(stats.hits, 3);
    assert.equal(stats.misses, 1);
  });

  test("calculates hit rate correctly", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    // No accesses yet
    assert.equal(cache.getHitRate(), 0);

    // 1 miss, 0 hits = 0% hit rate
    cache.get(["module-a"], 1);
    assert.equal(cache.getHitRate(), 0);

    // Store and get - 1 miss, 1 hit = 50%
    cache.set(["module-a"], 1, mockFrame);
    cache.get(["module-a"], 1);
    assert.equal(cache.getHitRate(), 0.5);

    // 1 miss, 3 hits = 75%
    cache.get(["module-a"], 1);
    cache.get(["module-a"], 1);
    assert.equal(cache.getHitRate(), 0.75);
  });

  test("evicts LRU entries when cache is full", () => {
    const cache = new AtlasFrameCache(3); // Small cache for testing
    const makeFrame = (id) => ({
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: [id],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    });

    // Fill cache
    cache.set(["module-1"], 1, makeFrame("module-1"));
    cache.set(["module-2"], 1, makeFrame("module-2"));
    cache.set(["module-3"], 1, makeFrame("module-3"));

    let stats = cache.getStats();
    assert.equal(stats.size, 3);
    assert.equal(stats.evictions, 0);

    // Access module-1 to make it more recent
    cache.get(["module-1"], 1);

    // Add module-4 - should evict module-2 (least recently used)
    cache.set(["module-4"], 1, makeFrame("module-4"));

    stats = cache.getStats();
    assert.equal(stats.size, 3);
    assert.equal(stats.evictions, 1);

    // module-2 should be evicted
    assert.equal(cache.get(["module-2"], 1), undefined);

    // module-1, module-3, module-4 should still be cached
    assert.notEqual(cache.get(["module-1"], 1), undefined);
    assert.notEqual(cache.get(["module-3"], 1), undefined);
    assert.notEqual(cache.get(["module-4"], 1), undefined);
  });

  test("clear removes all entries", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    cache.set(["module-a"], 1, mockFrame);
    cache.set(["module-b"], 1, mockFrame);

    let stats = cache.getStats();
    assert.equal(stats.size, 2);

    cache.clear();

    stats = cache.getStats();
    assert.equal(stats.size, 0);
    assert.equal(cache.get(["module-a"], 1), undefined);
    assert.equal(cache.get(["module-b"], 1), undefined);
  });

  test("resetStats clears statistics but keeps entries", () => {
    const cache = new AtlasFrameCache();
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    cache.set(["module-a"], 1, mockFrame);
    cache.get(["module-a"], 1);
    cache.get(["module-b"], 1); // miss

    let stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.size, 1);

    cache.resetStats();

    stats = cache.getStats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 0);
    assert.equal(stats.size, 1); // Size not reset

    // Entry should still be there
    assert.notEqual(cache.get(["module-a"], 1), undefined);
  });
});

console.log("All cache tests passed! ✅");
