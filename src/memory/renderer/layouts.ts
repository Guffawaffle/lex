/**
 * Layout algorithms for graph visualization
 * Provides force-directed and hierarchical layout options
 */

import type { GraphNode } from "./graph.js";

// Use inline type to avoid cross-package dependencies
export interface AtlasEdge {
  from: string;
  to: string;
  allowed: boolean;
  reason?: string;
}

export interface LayoutConfig {
  iterations?: number;
  repulsion?: number;
  attraction?: number;
  damping?: number;
  levelSpacing?: number;
  nodeSpacing?: number;
}

export interface Layout {
  nodes: GraphNode[];
  width: number;
  height: number;
}

const DEFAULT_FORCE_CONFIG: Required<LayoutConfig> = {
  iterations: 100,
  repulsion: 2000,
  attraction: 0.02,
  damping: 0.85,
  levelSpacing: 150,
  nodeSpacing: 100,
};

// Constants for layout calculations
const MIN_DISTANCE_THRESHOLD = 0.1;

/**
 * Force-directed graph layout (Fruchterman-Reingold algorithm)
 * Creates organic-looking layouts where connected nodes attract and all nodes repel
 */
export function forceDirectedLayout(
  nodes: GraphNode[],
  edges: AtlasEdge[],
  config: LayoutConfig = {}
): Layout {
  const cfg = { ...DEFAULT_FORCE_CONFIG, ...config };

  if (nodes.length === 0) {
    return { nodes: [], width: 800, height: 600 };
  }

  // Create a mutable copy of nodes with positions
  const layoutNodes = nodes.map((n) => ({ ...n }));

  // Initialize velocities
  const velocities = new Map<string, { vx: number; vy: number }>();
  layoutNodes.forEach((node) => {
    velocities.set(node.id, { vx: 0, vy: 0 });
  });

  // Build adjacency for quick edge lookups
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)!.add(edge.to);
    // For undirected behavior, also add reverse
    adjacency.get(edge.to)!.add(edge.from);
  }

  const width = 1000;
  const height = 1000;
  const minDistance = 10;

  // Run iterations
  for (let iter = 0; iter < cfg.iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();

    // Initialize forces
    for (const node of layoutNodes) {
      forces.set(node.id, { fx: 0, fy: 0 });
    }

    // Repulsive forces (all pairs)
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const n1 = layoutNodes[i];
        const n2 = layoutNodes[j];

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < MIN_DISTANCE_THRESHOLD) continue;

        // Coulomb's law: F = k / r^2
        const force = cfg.repulsion / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const f1 = forces.get(n1.id)!;
        const f2 = forces.get(n2.id)!;
        f1.fx -= fx;
        f1.fy -= fy;
        f2.fx += fx;
        f2.fy += fy;
      }
    }

    // Attractive forces (connected nodes)
    for (const edge of edges) {
      // Only use allowed edges for attraction
      if (!edge.allowed) continue;

      const n1 = layoutNodes.find((n) => n.id === edge.from);
      const n2 = layoutNodes.find((n) => n.id === edge.to);

      if (!n1 || !n2) continue;

      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MIN_DISTANCE_THRESHOLD) continue;

      // Hooke's law: F = k * d
      const force = dist * cfg.attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      const f1 = forces.get(n1.id)!;
      const f2 = forces.get(n2.id)!;
      f1.fx += fx;
      f1.fy += fy;
      f2.fx -= fx;
      f2.fy -= fy;
    }

    // Update positions
    for (const node of layoutNodes) {
      const vel = velocities.get(node.id)!;
      const force = forces.get(node.id)!;

      // Update velocity with damping
      vel.vx = (vel.vx + force.fx) * cfg.damping;
      vel.vy = (vel.vy + force.fy) * cfg.damping;

      // Update position
      node.x += vel.vx;
      node.y += vel.vy;

      // Keep within bounds
      node.x = Math.max(minDistance, Math.min(width - minDistance, node.x));
      node.y = Math.max(minDistance, Math.min(height - minDistance, node.y));
    }
  }

  return { nodes: layoutNodes, width, height };
}

/**
 * Hierarchical graph layout (top-down tree)
 * Organizes nodes in layers based on dependency structure
 */
export function hierarchicalLayout(
  nodes: GraphNode[],
  edges: AtlasEdge[],
  _config: LayoutConfig = {}
): Layout {
  const cfg = { ...DEFAULT_FORCE_CONFIG, ...config };

  if (nodes.length === 0) {
    return { nodes: [], width: 800, height: 600 };
  }

  // Create a mutable copy of nodes
  const layoutNodes = nodes.map((n) => ({ ...n }));

  // Build adjacency lists (directed)
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const node of layoutNodes) {
    outgoing.set(node.id, new Set());
    incoming.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!edge.allowed) continue; // Only use allowed edges for hierarchy

    const out = outgoing.get(edge.from);
    const inc = incoming.get(edge.to);

    if (out) out.add(edge.to);
    if (inc) inc.add(edge.from);
  }

  // Assign layers using topological sort (BFS from roots)
  const layers = new Map<string, number>();
  const queue: string[] = [];

  // Start with nodes that have no incoming edges (roots)
  for (const node of layoutNodes) {
    if (incoming.get(node.id)!.size === 0) {
      layers.set(node.id, 0);
      queue.push(node.id);
    }
  }

  // If no roots found, start with seed nodes
  if (queue.length === 0) {
    for (const node of layoutNodes) {
      if (node.isSeed) {
        layers.set(node.id, 0);
        queue.push(node.id);
      }
    }
  }

  // BFS to assign layers
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLayer = layers.get(nodeId)!;

    const neighbors = outgoing.get(nodeId);
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      const existingLayer = layers.get(neighborId);
      const newLayer = currentLayer + 1;

      if (existingLayer === undefined || newLayer > existingLayer) {
        layers.set(neighborId, newLayer);
        queue.push(neighborId);
      }
    }
  }

  // Assign remaining nodes to a default layer
  for (const node of layoutNodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  // Group nodes by layer
  const layerGroups = new Map<number, GraphNode[]>();
  for (const node of layoutNodes) {
    const layer = layers.get(node.id)!;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(node);
  }

  // Calculate positions
  const maxLayer = Math.max(...Array.from(layers.values()), 0);
  const height = (maxLayer + 1) * cfg.levelSpacing + 100;

  let maxWidth = 0;
  for (const [layer, layerNodes] of layerGroups.entries()) {
    const layerWidth = layerNodes.length * cfg.nodeSpacing;
    maxWidth = Math.max(maxWidth, layerWidth);
  }
  const width = maxWidth + 100;

  // Position nodes
  for (const [layer, layerNodes] of layerGroups.entries()) {
    const y = 50 + layer * cfg.levelSpacing;
    const layerWidth = layerNodes.length * cfg.nodeSpacing;
    const startX = (width - layerWidth) / 2;

    layerNodes.forEach((node, index) => {
      node.x = startX + index * cfg.nodeSpacing + cfg.nodeSpacing / 2;
      node.y = y;
    });
  }

  return { nodes: layoutNodes, width, height };
}

/**
 * Circular layout (nodes arranged in a circle)
 * Simple fallback layout for small graphs
 */
export function circularLayout(
  nodes: GraphNode[],
  edges: AtlasEdge[],
  config: LayoutConfig = {}
): Layout {
  if (nodes.length === 0) {
    return { nodes: [], width: 800, height: 600 };
  }

  const layoutNodes = nodes.map((n) => ({ ...n }));
  const width = 800;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 100;

  const angleStep = (2 * Math.PI) / layoutNodes.length;

  layoutNodes.forEach((node, index) => {
    const angle = index * angleStep;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });

  return { nodes: layoutNodes, width, height };
}
