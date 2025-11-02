/**
 * Fold radius algorithm - extract spatial neighborhood from policy graph
 * 
 * Starting from seed modules, expand N hops via BFS to find adjacent modules
 * through allowed_callers/forbidden_callers relationships.
 */

import { Policy, AtlasFrame, AtlasModuleData, AtlasEdge } from './types.js';
import { buildPolicyGraph, getNeighbors } from './graph.js';

/**
 * Compute the fold radius neighborhood around seed modules
 * 
 * Uses BFS to traverse the policy graph up to N hops from seed modules,
 * collecting all modules and edges within the specified radius.
 * 
 * @param seedModules - Array of module IDs to start from (from Frame.module_scope)
 * @param radius - Number of hops to expand (0 = only seeds, 1 = seeds + immediate neighbors, etc.)
 * @param policy - The policy object containing module definitions
 * @returns AtlasFrame with the spatial neighborhood
 */
export function computeFoldRadius(
  seedModules: string[],
  radius: number,
  policy: Policy
): AtlasFrame {
  // Build the policy graph
  const graph = buildPolicyGraph(policy);
  
  // Track visited modules and their distance from seeds
  const visited = new Set<string>();
  const modulesByDistance = new Map<string, number>();
  const inQueue = new Set<string>(); // Track modules already in queue
  
  // BFS queue: [moduleId, distance]
  // Using array with pop() for O(1) dequeue (process in reverse)
  const queue: Array<[string, number]> = [];
  
  // Initialize with seed modules
  for (const seedId of seedModules) {
    if (policy.modules[seedId]) {
      queue.push([seedId, 0]);
      modulesByDistance.set(seedId, 0);
      inQueue.add(seedId);
    }
  }
  
  // BFS traversal (process from back for efficiency)
  while (queue.length > 0) {
    const [currentId, distance] = queue.shift()!;
    inQueue.delete(currentId);
    
    // Skip if already visited
    if (visited.has(currentId)) {
      continue;
    }
    
    visited.add(currentId);
    
    // Stop expanding if we've reached the radius limit
    if (distance >= radius) {
      continue;
    }
    
    // Expand to neighbors
    const neighbors = getNeighbors(currentId, graph);
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId) && !inQueue.has(neighborId) && policy.modules[neighborId]) {
        // Add to queue only if not already visited or queued
        modulesByDistance.set(neighborId, distance + 1);
        queue.push([neighborId, distance + 1]);
        inQueue.add(neighborId);
      }
    }
  }
  
  // Collect module data for all visited modules
  const modules: AtlasModuleData[] = [];
  const moduleIds = Array.from(visited);
  
  for (const moduleId of moduleIds) {
    const policyModule = policy.modules[moduleId];
    if (!policyModule) continue;
    
    const atlasModule: AtlasModuleData = {
      id: moduleId,
    };
    
    // Include optional fields if present
    if (policyModule.coords) {
      atlasModule.coords = policyModule.coords;
    }
    if (policyModule.allowed_callers && policyModule.allowed_callers.length > 0) {
      atlasModule.allowed_callers = policyModule.allowed_callers;
    }
    if (policyModule.forbidden_callers && policyModule.forbidden_callers.length > 0) {
      atlasModule.forbidden_callers = policyModule.forbidden_callers;
    }
    if (policyModule.feature_flags && policyModule.feature_flags.length > 0) {
      atlasModule.feature_flags = policyModule.feature_flags;
    }
    if (policyModule.requires_permissions && policyModule.requires_permissions.length > 0) {
      atlasModule.requires_permissions = policyModule.requires_permissions;
    }
    if (policyModule.kill_patterns && policyModule.kill_patterns.length > 0) {
      atlasModule.kill_patterns = policyModule.kill_patterns;
    }
    
    modules.push(atlasModule);
  }
  
  // Build edges between modules in the neighborhood
  const edges: AtlasEdge[] = [];
  const edgeSet = new Set<string>(); // Track unique edges
  
  for (const moduleId of moduleIds) {
    const policyModule = policy.modules[moduleId];
    if (!policyModule) continue;
    
    // Add edges for allowed callers
    if (policyModule.allowed_callers) {
      for (const callerId of policyModule.allowed_callers) {
        // Only include edge if both modules are in the neighborhood
        if (visited.has(callerId)) {
          const edgeKey = `${callerId}->${moduleId}:allowed`;
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              from: callerId,
              to: moduleId,
              allowed: true,
            });
            edgeSet.add(edgeKey);
          }
        }
      }
    }
    
    // Add edges for forbidden callers
    if (policyModule.forbidden_callers) {
      for (const callerId of policyModule.forbidden_callers) {
        // Only include edge if both modules are in the neighborhood
        if (visited.has(callerId)) {
          const edgeKey = `${callerId}->${moduleId}:forbidden`;
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              from: callerId,
              to: moduleId,
              allowed: false,
              reason: 'forbidden_caller',
            });
            edgeSet.add(edgeKey);
          }
        }
      }
    }
  }
  
  // Create Atlas Frame
  const atlasFrame: AtlasFrame = {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: seedModules,
    fold_radius: radius,
    modules,
    edges,
    critical_rule: "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming.",
  };
  
  return atlasFrame;
}
