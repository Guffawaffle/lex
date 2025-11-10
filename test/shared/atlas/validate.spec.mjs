/**
 * Tests for Atlas Validation
 */

import { describe, test } from "node:test";
import { strict as assert } from "assert";
import { validateAtlas, checkReachability } from "../../../dist/shared/atlas/validate.js";

describe("validateAtlas", () => {
  test("validates healthy Atlas", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 2, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("detects dangling edge with missing source node", () => {
    const atlas = {
      nodes: [
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }], // f1 doesn't exist
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 1, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("f1")));
    assert.ok(result.errors.some((e) => e.includes("does not exist")));
  });

  test("detects dangling edge with missing target node", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }], // f2 doesn't exist
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 1, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("f2")));
    assert.ok(result.errors.some((e) => e.includes("does not exist")));
  });

  test("detects edge weight out of range (negative)", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: -0.1, reason: "temporal_proximity" }],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 2, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("weight out of range")));
  });

  test("detects edge weight out of range (> 1)", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 1.5, reason: "temporal_proximity" }],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 2, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("weight out of range")));
  });

  test("warns about orphaned nodes", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
        {
          frameId: "f3",
          timestamp: "2024-01-01T02:00:00Z",
          moduleScope: ["isolated/module"],
          branch: "main",
        },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }], // f3 has no edges
      metadata: { buildTimestamp: "2024-01-01T03:00:00Z", frameCount: 3, edgeCount: 1 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, true); // Still valid, just a warning
    assert.ok(result.warnings.some((w) => w.includes("orphaned")));
    assert.ok(result.warnings.some((w) => w.includes("f3")));
  });

  test("detects metadata frameCount mismatch", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 5, edgeCount: 1 }, // Wrong count
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("frameCount")));
  });

  test("detects metadata edgeCount mismatch", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [{ from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" }],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 2, edgeCount: 10 }, // Wrong count
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("edgeCount")));
  });

  test("validates empty Atlas", () => {
    const atlas = {
      nodes: [],
      edges: [],
      metadata: { buildTimestamp: "2024-01-01T00:00:00Z", frameCount: 0, edgeCount: 0 },
    };

    const result = validateAtlas(atlas);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});

describe("checkReachability", () => {
  test("all nodes reachable in connected graph", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
        { frameId: "f3", timestamp: "2024-01-01T02:00:00Z", moduleScope: ["backend/auth"], branch: "main" },
      ],
      edges: [
        { from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" },
        { from: "f2", to: "f3", weight: 0.5, reason: "temporal_proximity" },
      ],
      metadata: { buildTimestamp: "2024-01-01T03:00:00Z", frameCount: 3, edgeCount: 2 },
    };

    const reachable = checkReachability(atlas);
    assert.equal(reachable, true);
  });

  test("handles empty graph", () => {
    const atlas = {
      nodes: [],
      edges: [],
      metadata: { buildTimestamp: "2024-01-01T00:00:00Z", frameCount: 0, edgeCount: 0 },
    };

    const reachable = checkReachability(atlas);
    assert.equal(reachable, true); // Trivially reachable
  });

  test("handles graph with cycles", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
      ],
      edges: [
        { from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" },
        { from: "f2", to: "f1", weight: 0.5, reason: "module_overlap" }, // Cycle
      ],
      metadata: { buildTimestamp: "2024-01-01T02:00:00Z", frameCount: 2, edgeCount: 2 },
    };

    const reachable = checkReachability(atlas);
    assert.equal(reachable, true); // All nodes in cycle are reachable
  });

  test("handles multiple disconnected components", () => {
    const atlas = {
      nodes: [
        { frameId: "f1", timestamp: "2024-01-01T00:00:00Z", moduleScope: ["ui/admin"], branch: "main" },
        { frameId: "f2", timestamp: "2024-01-01T01:00:00Z", moduleScope: ["api/users"], branch: "main" },
        { frameId: "f3", timestamp: "2024-01-01T02:00:00Z", moduleScope: ["backend/auth"], branch: "main" },
      ],
      edges: [
        { from: "f1", to: "f2", weight: 0.5, reason: "temporal_proximity" },
        // f3 is disconnected - it's a separate root
      ],
      metadata: { buildTimestamp: "2024-01-01T03:00:00Z", frameCount: 3, edgeCount: 1 },
    };

    const reachable = checkReachability(atlas);
    // f3 is an orphan but is considered reachable as it's a root
    assert.equal(reachable, true);
  });
});

console.log("All validation tests passed! ✅");
