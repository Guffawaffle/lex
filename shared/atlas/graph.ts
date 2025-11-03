/**
 * Graph utilities for building and querying the policy graph
 */

import { Policy, Graph } from './types.js';

/**
 * Build a bidirectional adjacency graph from the policy
 * 
 * Creates edges in both directions:
 * - From caller to callee (based on allowed_callers)
 * - From callee to forbidden caller (based on forbidden_callers)
 * 
 * This allows BFS to traverse in any direction to find the neighborhood.
 * 
 * @param policy - The policy object containing module definitions
 * @returns Graph with adjacency list representation
 */
export function buildPolicyGraph(policy: Policy): Graph {
  const adjacencyList: Record<string, string[]> = {};
  
  // Initialize adjacency list for all modules
  for (const moduleId of Object.keys(policy.modules)) {
    adjacencyList[moduleId] = [];
  }
  
  // Build edges from allowed_callers and forbidden_callers
  for (const [moduleId, module] of Object.entries(policy.modules)) {
    // Add edges from allowed callers to this module
    if (module.allowed_callers) {
      for (const callerId of module.allowed_callers) {
        // Edge from caller to callee
        if (adjacencyList[callerId]) {
          if (!adjacencyList[callerId].includes(moduleId)) {
            adjacencyList[callerId].push(moduleId);
          }
        }
        
        // Bidirectional edge - from callee back to caller
        if (!adjacencyList[moduleId].includes(callerId)) {
          adjacencyList[moduleId].push(callerId);
        }
      }
    }
    
    // Add edges from forbidden callers to this module
    // Forbidden relationships are still part of the spatial neighborhood
    if (module.forbidden_callers) {
      for (const callerId of module.forbidden_callers) {
        // Edge from forbidden caller to this module
        if (adjacencyList[callerId]) {
          if (!adjacencyList[callerId].includes(moduleId)) {
            adjacencyList[callerId].push(moduleId);
          }
        }
        
        // Bidirectional edge - from this module back to forbidden caller
        if (!adjacencyList[moduleId].includes(callerId)) {
          adjacencyList[moduleId].push(callerId);
        }
      }
    }
  }
  
  return { adjacencyList };
}

/**
 * Get all neighbors of a module in the graph
 * 
 * @param moduleId - The module ID to find neighbors for
 * @param graph - The policy graph
 * @returns Array of neighbor module IDs
 */
export function getNeighbors(moduleId: string, graph: Graph): string[] {
  return graph.adjacencyList[moduleId] || [];
}
