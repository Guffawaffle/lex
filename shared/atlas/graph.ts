/**
 * Graph Algorithms for Policy Graph Traversal
 *
 * Provides BFS/DFS traversal with hop limiting for fold radius computation.
 * Used by Atlas Frame generation to extract module neighborhoods.
 */

// @ts-ignore - importing from compiled dist directory
import type { Policy, PolicyModule } from "../../types/dist/policy.js";

export interface GraphEdge {
  from: string;
  to: string;
  type: "allowed" | "forbidden";
}

export interface NeighborhoodResult {
  modules: Set<string>;
  edges: GraphEdge[];
}

/**
 * Build adjacency lists from policy graph
 *
 * Creates both allowed and forbidden edge lists from the policy.
 * This enables traversal along allowed paths while tracking forbidden
 * edges for context.
 *
 * @param policy - The policy object containing module definitions
 * @returns Object with allowed and forbidden adjacency lists
 */
export function buildAdjacencyLists(policy: Policy): {
  allowedEdges: Map<string, Set<string>>;
  forbiddenEdges: Map<string, Set<string>>;
} {
  const allowedEdges = new Map<string, Set<string>>();
  const forbiddenEdges = new Map<string, Set<string>>();

  // Initialize empty sets for all modules
  for (const moduleId of Object.keys(policy.modules)) {
    allowedEdges.set(moduleId, new Set());
    forbiddenEdges.set(moduleId, new Set());
  }

  // Build edges from allowed_callers and forbidden_callers
  for (const [moduleId, moduleData] of Object.entries(policy.modules)) {
    const module = moduleData as PolicyModule;
    // allowed_callers defines who can call this module (inbound edges)
    if (module.allowed_callers) {
      for (const callerId of module.allowed_callers) {
        // Add edge from caller to this module
        if (!allowedEdges.has(callerId)) {
          allowedEdges.set(callerId, new Set());
        }
        allowedEdges.get(callerId)!.add(moduleId);
      }
    }

    // forbidden_callers defines who cannot call this module (inbound forbidden edges)
    if (module.forbidden_callers) {
      for (const callerId of module.forbidden_callers) {
        // Add forbidden edge from caller to this module
        if (!forbiddenEdges.has(callerId)) {
          forbiddenEdges.set(callerId, new Set());
        }
        forbiddenEdges.get(callerId)!.add(moduleId);
      }
    }
  }

  return { allowedEdges, forbiddenEdges };
}

/**
 * Extract N-hop neighborhood from seed modules using BFS
 *
 * Traverses the policy graph starting from seed modules, expanding
 * up to N hops away. Includes both allowed and forbidden edges for context.
 *
 * Algorithm:
 * 1. Start with seed modules at distance 0
 * 2. For each module at distance d < foldRadius:
 *    - Find all neighbors via allowed edges (both inbound and outbound)
 *    - Find all neighbors via forbidden edges (both inbound and outbound)
 *    - Mark neighbors at distance d+1
 * 3. Collect all edges (allowed + forbidden) between discovered modules
 *
 * @param policy - The policy object containing module definitions
 * @param seedModules - Starting module IDs
 * @param foldRadius - Maximum number of hops to expand (default: 1)
 * @returns Set of module IDs and edges in the neighborhood
 */
export function extractNeighborhood(
  policy: Policy,
  seedModules: string[],
  foldRadius: number = 1
): NeighborhoodResult {
  const { allowedEdges, forbiddenEdges } = buildAdjacencyLists(policy);

  // Track discovered modules and their distance from seeds
  const discovered = new Map<string, number>();
  const queue: Array<{ moduleId: string; distance: number }> = [];

  // Initialize with seed modules
  for (const seedId of seedModules) {
    if (policy.modules[seedId]) {
      discovered.set(seedId, 0);
      queue.push({ moduleId: seedId, distance: 0 });
    }
  }

  // BFS traversal
  while (queue.length > 0) {
    const { moduleId, distance } = queue.shift()!;

    // Stop if we've reached the fold radius
    if (distance >= foldRadius) {
      continue;
    }

    // Find neighbors via allowed edges (outbound)
    const outboundNeighbors = allowedEdges.get(moduleId) || new Set();
    for (const neighborId of outboundNeighbors) {
      if (!discovered.has(neighborId)) {
        discovered.set(neighborId, distance + 1);
        queue.push({ moduleId: neighborId, distance: distance + 1 });
      }
    }

    // Find neighbors via allowed edges (inbound - modules that can call this one)
    for (const [potentialCallerId, targets] of allowedEdges.entries()) {
      if (targets.has(moduleId) && !discovered.has(potentialCallerId)) {
        discovered.set(potentialCallerId, distance + 1);
        queue.push({ moduleId: potentialCallerId, distance: distance + 1 });
      }
    }

    // Find neighbors via forbidden edges (outbound)
    const forbiddenOutbound = forbiddenEdges.get(moduleId) || new Set();
    for (const neighborId of forbiddenOutbound) {
      if (!discovered.has(neighborId)) {
        discovered.set(neighborId, distance + 1);
        queue.push({ moduleId: neighborId, distance: distance + 1 });
      }
    }

    // Find neighbors via forbidden edges (inbound - modules that cannot call this one)
    for (const [potentialCallerId, targets] of forbiddenEdges.entries()) {
      if (targets.has(moduleId) && !discovered.has(potentialCallerId)) {
        discovered.set(potentialCallerId, distance + 1);
        queue.push({ moduleId: potentialCallerId, distance: distance + 1 });
      }
    }
  }

  // Collect all edges between discovered modules
  const edges: GraphEdge[] = [];
  const discoveredModules = new Set(discovered.keys());

  // Collect allowed edges
  for (const [from, targets] of allowedEdges.entries()) {
    if (discoveredModules.has(from)) {
      for (const to of targets) {
        if (discoveredModules.has(to)) {
          edges.push({ from, to, type: "allowed" });
        }
      }
    }
  }

  // Collect forbidden edges (for context)
  for (const [from, targets] of forbiddenEdges.entries()) {
    if (discoveredModules.has(from)) {
      for (const to of targets) {
        if (discoveredModules.has(to)) {
          edges.push({ from, to, type: "forbidden" });
        }
      }
    }
  }

  return {
    modules: discoveredModules,
    edges,
  };
}

/**
 * Generate 2D coordinates for modules using a simple force-directed layout
 *
 * Uses a basic spring-embedding algorithm:
 * - Modules repel each other (avoid overlap)
 * - Connected modules attract each other (edges pull them together)
 * - Iteratively adjust positions until stable or max iterations reached
 *
 * @param modules - Module IDs to position
 * @param edges - Edges between modules
 * @param width - Canvas width (default: 1000)
 * @param height - Canvas height (default: 1000)
 * @param iterations - Number of layout iterations (default: 50)
 * @returns Map of module ID to [x, y] coordinates
 */
export function generateCoordinates(
  modules: Set<string>,
  edges: GraphEdge[],
  width: number = 1000,
  height: number = 1000,
  iterations: number = 50
): Map<string, [number, number]> {
  const coords = new Map<string, [number, number]>();
  const velocities = new Map<string, [number, number]>();

  // Initialize with random positions
  const moduleList = Array.from(modules);
  for (const moduleId of moduleList) {
    coords.set(moduleId, [Math.random() * width, Math.random() * height]);
    velocities.set(moduleId, [0, 0]);
  }

  // Spring-embedding parameters
  const repulsionStrength = 1000;
  const attractionStrength = 0.01;
  const damping = 0.8;
  const minDistance = 50; // Minimum distance between nodes

  // Iterative force-directed layout
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, [number, number]>();

    // Initialize forces
    for (const moduleId of moduleList) {
      forces.set(moduleId, [0, 0]);
    }

    // Repulsion forces (all pairs)
    for (let i = 0; i < moduleList.length; i++) {
      for (let j = i + 1; j < moduleList.length; j++) {
        const m1 = moduleList[i];
        const m2 = moduleList[j];
        const [x1, y1] = coords.get(m1)!;
        const [x2, y2] = coords.get(m2)!;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);

        // Prevent division by zero for overlapping nodes
        if (distance < 0.01) continue;

        // Apply inverse-square repulsion
        const force = repulsionStrength / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        const [f1x, f1y] = forces.get(m1)!;
        const [f2x, f2y] = forces.get(m2)!;
        forces.set(m1, [f1x - fx, f1y - fy]);
        forces.set(m2, [f2x + fx, f2y + fy]);
      }
    }

    // Attraction forces (connected nodes)
    for (const edge of edges) {
      // Only use allowed edges for attraction (forbidden edges don't pull)
      if (edge.type !== "allowed") continue;

      const [x1, y1] = coords.get(edge.from)!;
      const [x2, y2] = coords.get(edge.to)!;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Skip if nodes are at the same position
      if (distance < 0.01) continue;

      // Spring force proportional to distance
      const force = distance * attractionStrength;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      const [f1x, f1y] = forces.get(edge.from)!;
      const [f2x, f2y] = forces.get(edge.to)!;
      forces.set(edge.from, [f1x + fx, f1y + fy]);
      forces.set(edge.to, [f2x - fx, f2y - fy]);
    }

    // Update positions with damping
    for (const moduleId of moduleList) {
      const [vx, vy] = velocities.get(moduleId)!;
      const [fx, fy] = forces.get(moduleId)!;
      const [x, y] = coords.get(moduleId)!;

      // Update velocity with damping
      const newVx = (vx + fx) * damping;
      const newVy = (vy + fy) * damping;
      velocities.set(moduleId, [newVx, newVy]);

      // Update position
      let newX = x + newVx;
      let newY = y + newVy;

      // Keep within bounds
      newX = Math.max(minDistance, Math.min(width - minDistance, newX));
      newY = Math.max(minDistance, Math.min(height - minDistance, newY));

      coords.set(moduleId, [newX, newY]);
    }
  }

  // Round coordinates to integers for cleaner output
  for (const [moduleId, [x, y]] of coords.entries()) {
    coords.set(moduleId, [Math.round(x), Math.round(y)]);
  }

  return coords;
}

/**
 * Adapter function for backward compatibility with fold-radius.ts
 * Builds a simple graph representation for BFS traversal
 */
export interface Graph {
  modules: Set<string>;
  adjacency: Map<string, Set<string>>;
}

export function buildPolicyGraph(policy: Policy): Graph {
  const modules = new Set(Object.keys(policy.modules));
  const adjacency = new Map<string, Set<string>>();

  for (const moduleId of modules) {
    adjacency.set(moduleId, new Set());
  }

  for (const [moduleId, moduleData] of Object.entries(policy.modules)) {
    const module = moduleData as PolicyModule;
    if (module.allowed_callers) {
      for (const caller of module.allowed_callers) {
        if (adjacency.has(caller)) {
          adjacency.get(caller)!.add(moduleId);
        }
      }
    }
  }

  return { modules, adjacency };
}

export function getNeighbors(moduleId: string, graph: Graph): string[] {
  const neighbors = graph.adjacency.get(moduleId);
  return neighbors ? Array.from(neighbors) : [];
}
