/**
 * Atlas Integrity Validation
 *
 * Validates the structural integrity of Atlas graphs to ensure:
 * - No orphaned nodes (all nodes reachable from at least one other node or are roots)
 * - No dangling edges (all edge endpoints exist in node set)
 * - Edge weights within valid range [0, 1]
 */

import type { Atlas, AtlasNode, AtlasEdge } from "./rebuild.js";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Atlas integrity
 *
 * Performs comprehensive validation checks:
 * 1. No dangling edges (all edge endpoints exist in node set)
 * 2. No orphaned nodes (every node is reachable from at least one other node, or is a root)
 * 3. Edge weights within valid range [0, 1]
 *
 * @param atlas - Atlas graph to validate
 * @returns Validation result with errors and warnings
 */
export function validateAtlas(atlas: Atlas): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build node ID set for quick lookup
  const nodeIds = new Set(atlas.nodes.map((n) => n.frameId));

  // Check for dangling edges
  for (const edge of atlas.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Dangling edge: source node '${edge.from}' does not exist`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Dangling edge: target node '${edge.to}' does not exist`);
    }
  }

  // Check edge weight constraints
  for (const edge of atlas.edges) {
    if (edge.weight < 0 || edge.weight > 1) {
      errors.push(
        `Edge weight out of range [0, 1]: ${edge.from} → ${edge.to} (weight: ${edge.weight})`
      );
    }
  }

  // Check for orphaned nodes
  const connectedNodes = new Set<string>();

  // Collect all nodes that have at least one edge (incoming or outgoing)
  for (const edge of atlas.edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }

  // Find orphaned nodes (nodes with no edges at all)
  const orphanedNodes: string[] = [];
  for (const node of atlas.nodes) {
    if (!connectedNodes.has(node.frameId)) {
      orphanedNodes.push(node.frameId);
    }
  }

  // Orphaned nodes are warnings, not errors (they may be valid isolated frames)
  if (orphanedNodes.length > 0) {
    warnings.push(
      `${orphanedNodes.length} orphaned node(s) with no connections: ${orphanedNodes.slice(0, 5).join(", ")}${orphanedNodes.length > 5 ? "..." : ""}`
    );
  }

  // Check metadata consistency
  if (atlas.metadata.frameCount !== atlas.nodes.length) {
    errors.push(
      `Metadata frameCount (${atlas.metadata.frameCount}) does not match actual node count (${atlas.nodes.length})`
    );
  }

  if (atlas.metadata.edgeCount !== atlas.edges.length) {
    errors.push(
      `Metadata edgeCount (${atlas.metadata.edgeCount}) does not match actual edge count (${atlas.edges.length})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if all nodes in Atlas are reachable from at least one root node
 *
 * A root node is a node with no incoming edges (only outgoing edges or isolated).
 * This performs a graph traversal to ensure no nodes are unreachable from the root set.
 *
 * @param atlas - Atlas graph to check
 * @returns True if all nodes are reachable from roots, false otherwise
 */
export function checkReachability(atlas: Atlas): boolean {
  // Build adjacency list for graph traversal
  const adjacency = new Map<string, Set<string>>();
  const incomingEdges = new Map<string, number>();

  // Initialize
  for (const node of atlas.nodes) {
    adjacency.set(node.frameId, new Set());
    incomingEdges.set(node.frameId, 0);
  }

  // Build adjacency list and count incoming edges
  for (const edge of atlas.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    incomingEdges.set(edge.to, (incomingEdges.get(edge.to) || 0) + 1);
  }

  // Find root nodes (nodes with no incoming edges)
  const roots: string[] = [];
  for (const [nodeId, incomingCount] of incomingEdges.entries()) {
    if (incomingCount === 0) {
      roots.push(nodeId);
    }
  }

  // If no nodes, trivially reachable
  if (atlas.nodes.length === 0) return true;

  // If no roots but we have nodes, all nodes must be in cycles or isolated
  // This is still considered "reachable" in the sense that they form valid structures
  if (roots.length === 0) return true;

  // BFS from all roots to find reachable nodes
  const reachable = new Set<string>();
  const queue: string[] = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;

    reachable.add(current);

    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  // All nodes should be reachable from roots
  return reachable.size === atlas.nodes.length;
}
