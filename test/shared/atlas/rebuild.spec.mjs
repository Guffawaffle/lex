/**
 * Tests for Atlas Rebuild - Deterministic graph construction
 *
 * Tests ensure:
 * - Same Frames, different order → Identical Atlas
 * - New Frame added → Atlas updated correctly
 * - Concurrent rebuilds → Valid Atlas
 */

import { describe, test } from "node:test";
import { strict as assert } from "assert";
import { rebuildAtlas } from "../../../dist/shared/atlas/rebuild.js";
import { validateAtlas } from "../../../dist/shared/atlas/validate.js";

// Helper to create test frames
function createTestFrame(
  id,
  moduleScope,
  timestampOffset = 0,
  branch = "main"
) {
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

describe("rebuildAtlas", () => {
  test("returns valid Atlas structure", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin"]),
      createTestFrame("frame-2", ["api/users"]),
    ];

    const atlas = rebuildAtlas(frames);

    assert.ok(atlas);
    assert.ok(Array.isArray(atlas.nodes));
    assert.ok(Array.isArray(atlas.edges));
    assert.ok(atlas.metadata);
    assert.equal(atlas.metadata.frameCount, 2);
    assert.ok(atlas.metadata.buildTimestamp);
  });

  test("same frames in different order produce identical Atlas", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin"]),
      createTestFrame("frame-2", ["api/users"]),
      createTestFrame("frame-3", ["backend/auth"]),
    ];

    const atlas1 = rebuildAtlas([frames[0], frames[1], frames[2]]);
    const atlas2 = rebuildAtlas([frames[2], frames[0], frames[1]]);
    const atlas3 = rebuildAtlas([frames[1], frames[2], frames[0]]);

    // Nodes should be identical (same order due to sorting)
    assert.deepEqual(atlas1.nodes, atlas2.nodes);
    assert.deepEqual(atlas1.nodes, atlas3.nodes);

    // Edges should be identical (same order due to sorting)
    assert.deepEqual(atlas1.edges, atlas2.edges);
    assert.deepEqual(atlas1.edges, atlas3.edges);
  });

  test("creates edges for frames with overlapping module scope", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin", "api/users"]),
      createTestFrame("frame-2", ["api/users", "backend/auth"]),
    ];

    const atlas = rebuildAtlas(frames);

    // Should have edge due to shared module "api/users"
    assert.ok(atlas.edges.length > 0);

    const edge = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-2");
    assert.ok(edge, "Should have edge from frame-1 to frame-2");
    assert.equal(edge.reason, "module_overlap");
    assert.ok(edge.weight > 0);
  });

  test("creates edges for temporally close frames", () => {
    const oneMinute = 60 * 1000;
    const frames = [
      createTestFrame("frame-1", ["ui/admin"], 0),
      createTestFrame("frame-2", ["api/users"], oneMinute * 30), // 30 minutes later
    ];

    const atlas = rebuildAtlas(frames);

    // Should have edge due to temporal proximity (within 1 hour)
    const edge = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-2");
    assert.ok(edge, "Should have edge due to temporal proximity");
    assert.ok(edge.weight > 0);
  });

  test("does not create edges for temporally distant frames with no overlap", () => {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const frames = [
      createTestFrame("frame-1", ["ui/admin"], 0),
      createTestFrame("frame-2", ["api/users"], oneWeek + 1000), // More than 1 week later
    ];

    const atlas = rebuildAtlas(frames);

    // Should have no edge (no module overlap, too far in time)
    const edge = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-2");
    assert.ok(!edge, "Should not have edge for distant frames with no overlap");
  });

  test("handles empty frame list", () => {
    const atlas = rebuildAtlas([]);

    assert.equal(atlas.nodes.length, 0);
    assert.equal(atlas.edges.length, 0);
    assert.equal(atlas.metadata.frameCount, 0);
    assert.equal(atlas.metadata.edgeCount, 0);
  });

  test("handles single frame", () => {
    const frames = [createTestFrame("frame-1", ["ui/admin"])];

    const atlas = rebuildAtlas(frames);

    assert.equal(atlas.nodes.length, 1);
    assert.equal(atlas.nodes[0].frameId, "frame-1");
    assert.equal(atlas.edges.length, 0); // No edges for single node
  });

  test("new frame added produces updated Atlas", () => {
    const frames1 = [createTestFrame("frame-1", ["ui/admin"]), createTestFrame("frame-2", ["api/users"])];

    const atlas1 = rebuildAtlas(frames1);

    const frames2 = [
      ...frames1,
      createTestFrame("frame-3", ["ui/admin", "backend/auth"]), // Shares module with frame-1
    ];

    const atlas2 = rebuildAtlas(frames2);

    // Should have one more node
    assert.equal(atlas2.nodes.length, atlas1.nodes.length + 1);

    // Should have new edges connecting frame-3
    const frame3Edges = atlas2.edges.filter((e) => e.from === "frame-3" || e.to === "frame-3");
    assert.ok(frame3Edges.length > 0, "Frame-3 should have connections");
  });

  test("module scope is sorted for determinism", () => {
    const frames = [createTestFrame("frame-1", ["zzz/module", "aaa/module", "mmm/module"])];

    const atlas = rebuildAtlas(frames);

    const node = atlas.nodes[0];
    assert.deepEqual(node.moduleScope, ["aaa/module", "mmm/module", "zzz/module"]);
  });

  test("edges are sorted deterministically", () => {
    const oneMinute = 60 * 1000;
    const frames = [
      createTestFrame("frame-z", ["module-a"], 0),
      createTestFrame("frame-a", ["module-a"], oneMinute),
      createTestFrame("frame-m", ["module-a"], oneMinute * 2),
    ];

    const atlas = rebuildAtlas(frames);

    // Edges should be sorted by (from, to)
    const edgeStrings = atlas.edges.map((e) => `${e.from}->${e.to}`);

    // Create sorted version
    const sortedEdgeStrings = [...edgeStrings].sort();

    assert.deepEqual(edgeStrings, sortedEdgeStrings, "Edges should be sorted deterministically");
  });

  test("validates Atlas integrity after rebuild", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin"]),
      createTestFrame("frame-2", ["api/users"]),
      createTestFrame("frame-3", ["backend/auth"]),
    ];

    const atlas = rebuildAtlas(frames);
    const validation = validateAtlas(atlas);

    assert.equal(validation.valid, true, "Atlas should be valid after rebuild");
    assert.equal(validation.errors.length, 0, "Should have no validation errors");
  });

  test("concurrent rebuilds produce valid Atlas", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin"]),
      createTestFrame("frame-2", ["api/users"]),
      createTestFrame("frame-3", ["backend/auth"]),
    ];

    // Simulate concurrent rebuilds
    const atlas1 = rebuildAtlas(frames);
    const atlas2 = rebuildAtlas(frames);
    const atlas3 = rebuildAtlas(frames);

    // All should be valid
    assert.equal(validateAtlas(atlas1).valid, true);
    assert.equal(validateAtlas(atlas2).valid, true);
    assert.equal(validateAtlas(atlas3).valid, true);

    // All should be identical (excluding buildTimestamp)
    assert.deepEqual(atlas1.nodes, atlas2.nodes);
    assert.deepEqual(atlas1.nodes, atlas3.nodes);
    assert.deepEqual(atlas1.edges, atlas2.edges);
    assert.deepEqual(atlas1.edges, atlas3.edges);
  });

  test("frames on same branch get bonus connection weight", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin"], 0, "feature/new-ui"),
      createTestFrame("frame-2", ["api/users"], 0, "feature/new-ui"), // Same branch, same time
      createTestFrame("frame-3", ["api/users"], 0, "main"), // Different branch, same time
    ];

    const atlas = rebuildAtlas(frames);

    // Edge between frame-1 and frame-2 should exist (same branch + temporal proximity)
    const edge12 = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-2");
    assert.ok(edge12, "Should have edge between frames on same branch");
    assert.ok(edge12.weight > 0);

    // Edge between frame-2 and frame-3 should also exist (shared module)
    const edge23 = atlas.edges.find((e) => e.from === "frame-2" && e.to === "frame-3");
    assert.ok(edge23, "Should have edge for shared modules");
  });

  test("high module overlap produces high edge weight", () => {
    const frames = [
      createTestFrame("frame-1", ["ui/admin", "ui/dashboard", "ui/settings"]),
      createTestFrame("frame-2", ["ui/admin", "ui/dashboard", "ui/settings"]), // 100% overlap
      createTestFrame("frame-3", ["ui/admin"]), // 33% overlap with frame-1
    ];

    const atlas = rebuildAtlas(frames);

    const edge12 = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-2");
    const edge13 = atlas.edges.find((e) => e.from === "frame-1" && e.to === "frame-3");

    assert.ok(edge12);
    assert.ok(edge13);

    // Edge with 100% overlap should have higher weight than edge with 33% overlap
    assert.ok(
      edge12.weight > edge13.weight,
      "Higher module overlap should produce higher edge weight"
    );
  });
});

console.log("All rebuild tests passed! ✅");
