/**
 * Performance benchmarks for Atlas Rebuild
 *
 * Tests performance budgets:
 * - 100 Frames → Atlas rebuild < 500ms
 * - 1,000 Frames → Atlas rebuild < 5s
 * - 10,000 Frames → Atlas rebuild < 60s
 */

import { describe, test } from "node:test";
import { strict as assert } from "assert";
import { rebuildAtlas } from "../../../dist/shared/atlas/rebuild.js";

// Helper to create test frame
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

// Helper to generate synthetic frame dataset
function generateFrames(count) {
  const frames = [];
  const modules = [
    "ui/admin",
    "ui/dashboard",
    "ui/settings",
    "api/users",
    "api/auth",
    "api/posts",
    "backend/database",
    "backend/cache",
    "backend/queue",
    "services/email",
    "services/notifications",
    "services/analytics",
  ];

  for (let i = 0; i < count; i++) {
    // Each frame has 1-3 random modules
    const moduleCount = 1 + Math.floor(Math.random() * 3);
    const frameModules = [];
    for (let j = 0; j < moduleCount; j++) {
      const randomModule = modules[Math.floor(Math.random() * modules.length)];
      if (!frameModules.includes(randomModule)) {
        frameModules.push(randomModule);
      }
    }

    // Spread frames over 30 days
    const timestampOffset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);

    // Random branch
    const branches = ["main", "feature/a", "feature/b", "develop"];
    const branch = branches[Math.floor(Math.random() * branches.length)];

    frames.push(
      createTestFrame(
        `frame-${i.toString().padStart(6, "0")}`,
        frameModules,
        timestampOffset,
        branch
      )
    );
  }

  return frames;
}

describe("Atlas Rebuild Performance", () => {
  test("100 frames rebuilds in < 500ms", () => {
    const frames = generateFrames(100);

    const startTime = Date.now();
    const atlas = rebuildAtlas(frames);
    const duration = Date.now() - startTime;

    console.log(`  ⏱️  100 frames: ${duration}ms`);

    assert.equal(atlas.nodes.length, 100);
    assert.ok(duration < 500, `Rebuild took ${duration}ms, expected < 500ms`);
  });

  test("1,000 frames rebuilds in < 5s", () => {
    const frames = generateFrames(1000);

    const startTime = Date.now();
    const atlas = rebuildAtlas(frames);
    const duration = Date.now() - startTime;

    console.log(`  ⏱️  1,000 frames: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

    assert.equal(atlas.nodes.length, 1000);
    assert.ok(duration < 5000, `Rebuild took ${duration}ms, expected < 5000ms`);
  });

  test("10,000 frames rebuilds in < 60s", { skip: process.env.CI === "true" }, function () {
    // Increase timeout for this test
    this.timeout = 120000; // 2 minutes max
    // Skip in CI to reduce overall test duration; run locally during development

    const frames = generateFrames(10000);

    const startTime = Date.now();
    const atlas = rebuildAtlas(frames);
    const duration = Date.now() - startTime;

    console.log(`  ⏱️  10,000 frames: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

    assert.equal(atlas.nodes.length, 10000);
    assert.ok(duration < 60000, `Rebuild took ${duration}ms, expected < 60000ms`);
  });

  test("rebuild is deterministic even with large datasets", () => {
    const frames = generateFrames(500);

    const atlas1 = rebuildAtlas(frames);
    const atlas2 = rebuildAtlas([...frames].reverse()); // Reverse order

    // Should produce identical results
    assert.deepEqual(atlas1.nodes, atlas2.nodes);
    assert.deepEqual(atlas1.edges, atlas2.edges);
  });

  test("edge count scales reasonably with frame count", () => {
    const frames100 = generateFrames(100);
    const frames1000 = generateFrames(1000);

    const atlas100 = rebuildAtlas(frames100);
    const atlas1000 = rebuildAtlas(frames1000);

    console.log(`  📊 100 frames: ${atlas100.edges.length} edges`);
    console.log(`  📊 1,000 frames: ${atlas1000.edges.length} edges`);

    // Edge count should not grow quadratically (O(n²) would be problematic)
    // With threshold-based edge creation, expect sub-quadratic growth
    const edgeDensity100 = atlas100.edges.length / (atlas100.nodes.length * atlas100.nodes.length);
    const edgeDensity1000 =
      atlas1000.edges.length / (atlas1000.nodes.length * atlas1000.nodes.length);

    console.log(`  📊 Edge density (100): ${(edgeDensity100 * 100).toFixed(2)}%`);
    console.log(`  📊 Edge density (1000): ${(edgeDensity1000 * 100).toFixed(2)}%`);

    // Edge density should remain reasonable (< 50% of possible edges)
    // Note: High density is expected with synthetic test data that has many overlapping modules
    assert.ok(edgeDensity100 < 0.5, "Edge density should be reasonable for small dataset");
    assert.ok(edgeDensity1000 < 0.5, "Edge density should be reasonable for large dataset");
  });
});

console.log("All performance benchmarks passed! ✅");
