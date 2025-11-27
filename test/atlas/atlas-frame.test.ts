/**
 * Atlas Frame Generation Edge Case Tests
 *
 * Tests for frame generation with edge cases around empty repositories,
 * large file counts, special characters, and error handling.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  extractNeighborhood,
  buildAdjacencyLists,
  generateCoordinates,
  buildPolicyGraph,
  getNeighbors,
} from "../../src/shared/atlas/graph.js";
import { validateAtlas, checkReachability } from "../../src/shared/atlas/validate.js";
import type { Policy } from "../../src/shared/atlas/types.js";
import type { Atlas, AtlasNode } from "../../src/shared/atlas/rebuild.js";

// Helper function to create a minimal policy for testing
function createTestPolicy(modules: Record<string, object>): Policy {
  return { modules };
}

describe("Atlas Frame generation edge cases", () => {
  describe("empty and minimal inputs", () => {
    test("handles empty policy (no modules)", () => {
      const policy = createTestPolicy({});
      const result = extractNeighborhood(policy, ["nonexistent"], 1);

      assert.strictEqual(result.modules.size, 0);
      assert.strictEqual(result.edges.length, 0);
    });

    test("handles empty seed modules array", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-b"] },
        "module-b": {},
      });
      const result = extractNeighborhood(policy, [], 1);

      assert.strictEqual(result.modules.size, 0);
      assert.strictEqual(result.edges.length, 0);
    });

    test("handles zero fold radius", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-b"] },
        "module-b": {},
      });
      const result = extractNeighborhood(policy, ["module-a"], 0);

      // With fold radius 0, only the seed module should be included
      assert.strictEqual(result.modules.size, 1);
      assert.ok(result.modules.has("module-a"));
    });

    test("handles seed module not in policy", () => {
      const policy = createTestPolicy({
        "module-a": {},
      });
      const result = extractNeighborhood(policy, ["nonexistent"], 1);

      assert.strictEqual(result.modules.size, 0);
    });

    test("handles single isolated module", () => {
      const policy = createTestPolicy({
        "lonely-module": { notes: "No connections" },
      });
      const result = extractNeighborhood(policy, ["lonely-module"], 3);

      assert.strictEqual(result.modules.size, 1);
      assert.ok(result.modules.has("lonely-module"));
      assert.strictEqual(result.edges.length, 0);
    });
  });

  describe("large module counts", () => {
    test("handles policy with many modules (100+)", () => {
      const modules: Record<string, object> = {};
      for (let i = 0; i < 150; i++) {
        const moduleId = `module-${i}`;
        // Create some connections
        if (i > 0) {
          modules[moduleId] = { allowed_callers: [`module-${i - 1}`] };
        } else {
          modules[moduleId] = {};
        }
      }
      const policy = createTestPolicy(modules);

      // Start from module-0 and expand to see if it handles large traversals
      const result = extractNeighborhood(policy, ["module-0"], 5);

      assert.ok(result.modules.size > 0);
      assert.ok(result.modules.has("module-0"));
    });

    test("generates coordinates for many modules", () => {
      const modules = new Set<string>();
      for (let i = 0; i < 50; i++) {
        modules.add(`module-${i}`);
      }

      const edges = [];
      for (let i = 1; i < 50; i++) {
        edges.push({ from: `module-${i - 1}`, to: `module-${i}`, type: "allowed" as const });
      }

      const coords = generateCoordinates(modules, edges, 1000, 1000, 10);

      assert.strictEqual(coords.size, 50);
      // All coordinates should be within bounds
      for (const [, coord] of coords) {
        const [x, y] = coord;
        assert.ok(x >= 0 && x <= 1000);
        assert.ok(y >= 0 && y <= 1000);
      }
    });
  });

  describe("complex graph structures", () => {
    test("handles circular dependencies", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-c"] },
        "module-b": { allowed_callers: ["module-a"] },
        "module-c": { allowed_callers: ["module-b"] },
      });

      const result = extractNeighborhood(policy, ["module-a"], 3);

      // Should include all modules in the cycle
      assert.ok(result.modules.has("module-a"));
      assert.ok(result.modules.has("module-b"));
      assert.ok(result.modules.has("module-c"));
    });

    test("handles deeply nested module hierarchy", () => {
      const modules: Record<string, object> = {};
      const depth = 20;

      for (let i = 0; i < depth; i++) {
        if (i > 0) {
          modules[`level-${i}`] = { allowed_callers: [`level-${i - 1}`] };
        } else {
          modules["level-0"] = {};
        }
      }
      const policy = createTestPolicy(modules);

      // With limited fold radius, should only get nearby modules
      const result = extractNeighborhood(policy, ["level-10"], 3);

      assert.ok(result.modules.has("level-10"));
      // Should have some neighbors but not all 20
      assert.ok(result.modules.size > 1);
      assert.ok(result.modules.size < 20);
    });

    test("handles mixed allowed and forbidden callers", () => {
      const policy = createTestPolicy({
        "public-api": { allowed_callers: ["frontend", "backend"] },
        "internal-api": {
          allowed_callers: ["backend"],
          forbidden_callers: ["frontend"],
        },
        frontend: {},
        backend: {},
      });

      const result = extractNeighborhood(policy, ["public-api"], 2);

      // Should include modules from both allowed and forbidden edges
      assert.ok(result.modules.has("public-api"));
      assert.ok(result.modules.has("frontend"));
      assert.ok(result.modules.has("backend"));

      // Check edge types
      const allowedEdges = result.edges.filter((e) => e.type === "allowed");
      const _forbiddenEdges = result.edges.filter((e) => e.type === "forbidden");

      assert.ok(allowedEdges.length > 0);
    });
  });

  describe("special characters in module names", () => {
    test("handles module names with slashes (path-like)", () => {
      const policy = createTestPolicy({
        "src/core/utils": { allowed_callers: ["src/api/handler"] },
        "src/api/handler": {},
      });

      const result = extractNeighborhood(policy, ["src/core/utils"], 1);

      assert.ok(result.modules.has("src/core/utils"));
      assert.ok(result.modules.has("src/api/handler"));
    });

    test("handles module names with dots", () => {
      const policy = createTestPolicy({
        "com.example.core": { allowed_callers: ["com.example.api"] },
        "com.example.api": {},
      });

      const result = extractNeighborhood(policy, ["com.example.core"], 1);

      assert.ok(result.modules.has("com.example.core"));
      assert.ok(result.modules.has("com.example.api"));
    });

    test("handles module names with underscores and hyphens", () => {
      const policy = createTestPolicy({
        auth_service: { allowed_callers: ["user-manager"] },
        "user-manager": {},
      });

      const result = extractNeighborhood(policy, ["auth_service"], 1);

      assert.ok(result.modules.has("auth_service"));
      assert.ok(result.modules.has("user-manager"));
    });

    test("handles unicode module names", () => {
      const policy = createTestPolicy({
        "модуль": { allowed_callers: ["another"] },
        another: {},
      });

      const result = extractNeighborhood(policy, ["модуль"], 1);

      assert.ok(result.modules.has("модуль"));
    });
  });

  describe("adjacency list building", () => {
    test("builds correct allowed edges", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-b", "module-c"] },
        "module-b": {},
        "module-c": {},
      });

      const { allowedEdges } = buildAdjacencyLists(policy);

      // module-b and module-c can call module-a
      assert.ok(allowedEdges.get("module-b")?.has("module-a"));
      assert.ok(allowedEdges.get("module-c")?.has("module-a"));
    });

    test("builds correct forbidden edges", () => {
      const policy = createTestPolicy({
        "module-a": { forbidden_callers: ["module-x"] },
        "module-x": {},
      });

      const { forbiddenEdges } = buildAdjacencyLists(policy);

      assert.ok(forbiddenEdges.get("module-x")?.has("module-a"));
    });

    test("handles callers not in policy", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["nonexistent-caller"] },
      });

      // Should not throw, just create edges for the caller
      const { allowedEdges } = buildAdjacencyLists(policy);

      assert.ok(allowedEdges.get("nonexistent-caller")?.has("module-a"));
    });
  });

  describe("coordinate generation", () => {
    test("generates coordinates for empty module set", () => {
      const coords = generateCoordinates(new Set(), [], 1000, 1000, 10);

      assert.strictEqual(coords.size, 0);
    });

    test("generates coordinates for single module", () => {
      const modules = new Set(["single"]);
      const coords = generateCoordinates(modules, [], 1000, 1000, 10);

      assert.strictEqual(coords.size, 1);
      const coord = coords.get("single");
      assert.ok(coord);
      const [x, y] = coord;
      assert.ok(typeof x === "number");
      assert.ok(typeof y === "number");
    });

    test("coordinates are integers", () => {
      const modules = new Set(["a", "b", "c"]);
      const edges = [{ from: "a", to: "b", type: "allowed" as const }];
      const coords = generateCoordinates(modules, edges, 1000, 1000, 10);

      for (const [, coord] of coords) {
        const [x, y] = coord;
        assert.strictEqual(x, Math.round(x));
        assert.strictEqual(y, Math.round(y));
      }
    });

    test("respects canvas dimensions", () => {
      const modules = new Set(["a", "b", "c", "d", "e"]);
      const edges = [
        { from: "a", to: "b", type: "allowed" as const },
        { from: "b", to: "c", type: "allowed" as const },
      ];
      const width = 500;
      const height = 300;
      const coords = generateCoordinates(modules, edges, width, height, 20);

      for (const [, coord] of coords) {
        const [x, y] = coord;
        assert.ok(x >= 0 && x <= width);
        assert.ok(y >= 0 && y <= height);
      }
    });
  });

  describe("policy graph utilities", () => {
    test("buildPolicyGraph creates correct structure", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-b"] },
        "module-b": {},
        "module-c": {},
      });

      const graph = buildPolicyGraph(policy);

      assert.strictEqual(graph.modules.size, 3);
      assert.ok(graph.modules.has("module-a"));
      assert.ok(graph.modules.has("module-b"));
      assert.ok(graph.modules.has("module-c"));
    });

    test("getNeighbors returns correct neighbors", () => {
      const policy = createTestPolicy({
        "module-a": { allowed_callers: ["module-b"] },
        "module-b": {},
      });

      const graph = buildPolicyGraph(policy);
      const neighbors = getNeighbors("module-b", graph);

      assert.ok(neighbors.includes("module-a"));
    });

    test("getNeighbors returns empty array for isolated module", () => {
      const policy = createTestPolicy({
        "module-a": {},
        "module-b": {},
      });

      const graph = buildPolicyGraph(policy);
      const neighbors = getNeighbors("module-a", graph);

      assert.deepStrictEqual(neighbors, []);
    });

    test("getNeighbors handles nonexistent module", () => {
      const policy = createTestPolicy({
        "module-a": {},
      });

      const graph = buildPolicyGraph(policy);
      const neighbors = getNeighbors("nonexistent", graph);

      assert.deepStrictEqual(neighbors, []);
    });
  });
});

describe("Atlas validation edge cases", () => {
  // Helper to create test Atlas
  function createTestAtlas(
    nodes: AtlasNode[],
    edges: Array<{ from: string; to: string; weight: number }>
  ): Atlas {
    return {
      nodes,
      edges,
      metadata: {
        generatedAt: new Date().toISOString(),
        frameCount: nodes.length,
        edgeCount: edges.length,
        version: "1.0",
      },
    };
  }

  describe("validateAtlas", () => {
    test("validates empty atlas", () => {
      const atlas = createTestAtlas([], []);
      const result = validateAtlas(atlas);

      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    });

    test("detects dangling edge source", () => {
      const nodes: AtlasNode[] = [{ frameId: "node-a", position: [0, 0] }];
      const edges = [{ from: "nonexistent", to: "node-a", weight: 0.5 }];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("Dangling edge") && e.includes("nonexistent")));
    });

    test("detects dangling edge target", () => {
      const nodes: AtlasNode[] = [{ frameId: "node-a", position: [0, 0] }];
      const edges = [{ from: "node-a", to: "nonexistent", weight: 0.5 }];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("Dangling edge") && e.includes("nonexistent")));
    });

    test("detects edge weight out of range (negative)", () => {
      const nodes: AtlasNode[] = [
        { frameId: "node-a", position: [0, 0] },
        { frameId: "node-b", position: [1, 1] },
      ];
      const edges = [{ from: "node-a", to: "node-b", weight: -0.1 }];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("weight out of range")));
    });

    test("detects edge weight out of range (greater than 1)", () => {
      const nodes: AtlasNode[] = [
        { frameId: "node-a", position: [0, 0] },
        { frameId: "node-b", position: [1, 1] },
      ];
      const edges = [{ from: "node-a", to: "node-b", weight: 1.5 }];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("weight out of range")));
    });

    test("detects metadata frameCount mismatch", () => {
      const nodes: AtlasNode[] = [{ frameId: "node-a", position: [0, 0] }];
      const atlas: Atlas = {
        nodes,
        edges: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          frameCount: 5, // Wrong count
          edgeCount: 0,
          version: "1.0",
        },
      };

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("frameCount")));
    });

    test("detects metadata edgeCount mismatch", () => {
      const nodes: AtlasNode[] = [
        { frameId: "node-a", position: [0, 0] },
        { frameId: "node-b", position: [1, 1] },
      ];
      const edges = [{ from: "node-a", to: "node-b", weight: 0.5 }];
      const atlas: Atlas = {
        nodes,
        edges,
        metadata: {
          generatedAt: new Date().toISOString(),
          frameCount: 2,
          edgeCount: 5, // Wrong count
          version: "1.0",
        },
      };

      const result = validateAtlas(atlas);

      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes("edgeCount")));
    });

    test("warns about orphaned nodes", () => {
      const nodes: AtlasNode[] = [
        { frameId: "connected-a", position: [0, 0] },
        { frameId: "connected-b", position: [1, 1] },
        { frameId: "orphan", position: [2, 2] },
      ];
      const edges = [{ from: "connected-a", to: "connected-b", weight: 0.5 }];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(result.valid); // Orphans are warnings, not errors
      assert.ok(result.warnings.some((w) => w.includes("orphan")));
    });

    test("valid atlas with all edge weights at boundary values", () => {
      const nodes: AtlasNode[] = [
        { frameId: "node-a", position: [0, 0] },
        { frameId: "node-b", position: [1, 1] },
        { frameId: "node-c", position: [2, 2] },
      ];
      const edges = [
        { from: "node-a", to: "node-b", weight: 0 },
        { from: "node-b", to: "node-c", weight: 1 },
      ];
      const atlas = createTestAtlas(nodes, edges);

      const result = validateAtlas(atlas);

      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  describe("checkReachability", () => {
    test("empty atlas is reachable", () => {
      const atlas = createTestAtlas([], []);
      assert.ok(checkReachability(atlas));
    });

    test("single node is reachable", () => {
      const atlas = createTestAtlas([{ frameId: "single", position: [0, 0] }], []);
      assert.ok(checkReachability(atlas));
    });

    test("connected nodes are reachable", () => {
      const nodes: AtlasNode[] = [
        { frameId: "root", position: [0, 0] },
        { frameId: "child", position: [1, 1] },
        { frameId: "grandchild", position: [2, 2] },
      ];
      const edges = [
        { from: "root", to: "child", weight: 0.5 },
        { from: "child", to: "grandchild", weight: 0.5 },
      ];
      const atlas = createTestAtlas(nodes, edges);

      assert.ok(checkReachability(atlas));
    });

    test("cyclic graph is reachable", () => {
      const nodes: AtlasNode[] = [
        { frameId: "a", position: [0, 0] },
        { frameId: "b", position: [1, 1] },
        { frameId: "c", position: [2, 2] },
      ];
      const edges = [
        { from: "a", to: "b", weight: 0.5 },
        { from: "b", to: "c", weight: 0.5 },
        { from: "c", to: "a", weight: 0.5 },
      ];
      const atlas = createTestAtlas(nodes, edges);

      assert.ok(checkReachability(atlas));
    });
  });
});
