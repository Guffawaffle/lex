/**
 * Frame Graph rebuild - deterministic graph construction from Frames
 *
 * Rebuilds a historical Frame Graph deterministically when Frames are ingested.
 * Public symbols retain legacy Atlas compatibility names.
 */

import type { Frame } from "../types/frame.js";

/**
 * Legacy AtlasNode name for a Frame Graph node
 */
export interface AtlasNode {
  frameId: string;
  timestamp: string;
  moduleScope: string[];
  branch: string;
}

/**
 * Legacy AtlasEdge name for a Frame Graph relationship
 */
export interface AtlasEdge {
  from: string; // Frame ID
  to: string; // Frame ID
  weight: number; // Strength of connection (0-1)
  reason: "module_overlap" | "temporal_proximity" | "branch_relation";
}

/**
 * Legacy Atlas name for the complete historical Frame Graph
 */
export interface Atlas {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  metadata: {
    buildTimestamp: string;
    frameCount: number;
    edgeCount: number;
  };
}

/**
 * Rebuild a Frame Graph from a collection of Frames
 *
 * Algorithm:
 * 1. Sort Frames by ID for deterministic ordering
 * 2. Create nodes for each Frame
 * 3. Build edges based on:
 *    - Module scope overlap (shared modules)
 *    - Temporal proximity (frames close in time)
 *    - Branch relationships (same branch)
 * 4. Return the deterministic Frame Graph through the legacy Atlas shape
 *
 * Deterministic guarantee: same input Frames (regardless of order) → identical Frame Graph
 *
 * @param frames - Array of Frames from which to build the Frame Graph
 * @returns Frame Graph through the legacy Atlas shape
 */
export function rebuildAtlas(frames: Frame[]): Atlas {
  // Sort frames by ID for deterministic ordering
  const sortedFrames = [...frames].sort((a, b) => a.id.localeCompare(b.id));

  // Build nodes
  const nodes: AtlasNode[] = sortedFrames.map((frame) => ({
    frameId: frame.id,
    timestamp: frame.timestamp,
    moduleScope: [...frame.module_scope].sort(), // Sort for determinism
    branch: frame.branch,
  }));

  // Build edges
  const edges: AtlasEdge[] = [];

  // Compare each pair of frames to determine edges
  for (let i = 0; i < sortedFrames.length; i++) {
    for (let j = i + 1; j < sortedFrames.length; j++) {
      const frameA = sortedFrames[i];
      const frameB = sortedFrames[j];

      // Calculate module overlap
      const overlapWeight = calculateModuleOverlap(frameA, frameB);

      // Calculate temporal proximity
      const temporalWeight = calculateTemporalProximity(frameA, frameB);

      // Check branch relation
      const branchWeight = frameA.branch === frameB.branch ? 0.2 : 0;

      // Combine weights to determine if edge should exist
      const totalWeight = Math.max(overlapWeight, temporalWeight + branchWeight);

      // Create edge if weight exceeds threshold (0.1 = 10% connection strength)
      if (totalWeight > 0.1) {
        // Deterministic edge direction: always from earlier to later (by ID)
        edges.push({
          from: frameA.id,
          to: frameB.id,
          weight: totalWeight,
          reason: determineEdgeReason(overlapWeight, temporalWeight, branchWeight),
        });
      }
    }
  }

  // Sort edges by (from, to) for determinism
  edges.sort((a, b) => {
    const fromCompare = a.from.localeCompare(b.from);
    return fromCompare !== 0 ? fromCompare : a.to.localeCompare(b.to);
  });

  return {
    nodes,
    edges,
    metadata: {
      buildTimestamp: new Date().toISOString(),
      frameCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

/**
 * Calculate module overlap weight between two frames
 * Returns weight in range [0, 1] based on Jaccard similarity
 */
function calculateModuleOverlap(frameA: Frame, frameB: Frame): number {
  const modulesA = new Set(frameA.module_scope);
  const modulesB = new Set(frameB.module_scope);

  // Calculate intersection
  const intersection = new Set([...modulesA].filter((m) => modulesB.has(m)));

  // Calculate union
  const union = new Set([...modulesA, ...modulesB]);

  // Jaccard similarity: |A ∩ B| / |A ∪ B|
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate temporal proximity weight between two frames
 * Returns weight in range [0, 1] based on time distance
 */
function calculateTemporalProximity(frameA: Frame, frameB: Frame): number {
  const timeA = new Date(frameA.timestamp).getTime();
  const timeB = new Date(frameB.timestamp).getTime();

  const timeDiff = Math.abs(timeB - timeA);

  // Time windows for proximity scoring:
  // - Same time: weight = 0 (no temporal connection)
  // - Within 1 hour: weight = 0.8
  // - Within 1 day: weight = 0.5
  // - Within 1 week: weight = 0.2
  // - Beyond 1 week: weight = 0

  if (timeDiff === 0) return 0; // Same timestamp = no temporal connection

  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;

  if (timeDiff < oneHour) return 0.8;
  if (timeDiff < oneDay) return 0.5;
  if (timeDiff < oneWeek) return 0.2;
  return 0;
}

/**
 * Determine the primary reason for an edge based on weight contributions
 */
function determineEdgeReason(
  overlapWeight: number,
  temporalWeight: number,
  branchWeight: number
): "module_overlap" | "temporal_proximity" | "branch_relation" {
  if (overlapWeight >= temporalWeight && overlapWeight >= branchWeight) {
    return "module_overlap";
  }
  if (temporalWeight >= branchWeight) {
    return "temporal_proximity";
  }
  return "branch_relation";
}
