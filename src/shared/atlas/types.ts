/**
 * Legacy AtlasFrame type definitions for Policy Neighborhoods and policy graphs
 *
 * These types represent the spatial neighborhood extraction from policy graphs.
 */

/**
 * Policy module definition from lexmap.policy.json
 */
export interface PolicyModule {
  coords?: [number, number];
  owns_paths?: string[];
  owns_namespaces?: string[];
  exposes?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
  notes?: string;
}

/**
 * Policy definition - the entire lexmap.policy.json structure
 */
export interface Policy {
  modules: Record<string, PolicyModule>;
  global_kill_patterns?: Array<{
    pattern: string;
    description: string;
  }>;
}

/**
 * Graph representation - adjacency list for policy modules
 */
export interface Graph {
  // Maps module ID to array of neighbor module IDs
  adjacencyList: Record<string, string[]>;
}

/**
 * Module data in Policy Neighborhood output
 */
export interface AtlasModuleData {
  id: string;
  coords?: [number, number];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
}

/**
 * Edge data in Policy Neighborhood output
 */
export interface AtlasEdge {
  from: string;
  to: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Policy Neighborhood compatibility shape around seed modules
 */
export interface AtlasFrame {
  atlas_timestamp: string; // ISO 8601
  seed_modules: string[];
  fold_radius: number;
  modules: AtlasModuleData[];
  edges: AtlasEdge[];
  critical_rule: string;
}
