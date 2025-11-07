/**
 * Atlas Frame - Spatial neighborhood extraction from policy graph
 *
 * Computes the "map page" around a set of modules with fold radius.
 * Implements full policy graph traversal with N-hop neighborhood extraction.
 */

// @ts-ignore - importing from compiled dist directory (follows mcp_server pattern)
// TypeScript compilation of cross-package dependencies is complex due to rootDir constraints.
// Use package export for policy loader to avoid fragile relative dist paths
import { loadPolicy } from '@lex/policy';
// @ts-ignore - type re-export from shared types package
import type { PolicyModule } from '@lex/types/policy';
import { extractNeighborhood, generateCoordinates } from './graph.js';
import { getCache } from './cache.js';

export interface AtlasFrame {
  atlas_timestamp: string;
  seed_modules: string[];
  fold_radius: number;
  modules: AtlasModule[];
  edges: AtlasEdge[];
  critical_rule: string;
}

export interface AtlasModule {
  id: string;
  coords?: [number, number];
  owns_paths?: string[];
  owns_namespaces?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
  notes?: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Generate Atlas Frame for a set of seed modules
 *
 * Implements full fold radius algorithm with policy graph traversal:
 * - Loads policy graph from lexmap.policy.json
 * - Starts with seed modules
 * - Expands N hops via allowed_callers/forbidden_callers edges
 * - Includes full policy metadata for all discovered modules
 * - Returns complete neighborhood with edges and coordinates
 *
 * Caching:
 * - Caches results by (module_scope, radius) key
 * - Cache is keyed on sorted module IDs for consistency
 * - Cache can be disabled via setEnableCache(false)
 *
 * Algorithm:
 * 1. Check cache for existing result
 * 2. Load policy from lexmap.policy.json
 * 3. Use BFS to extract N-hop neighborhood from seed modules
 * 4. Generate 2D coordinates for visualization
 * 5. Include full PolicyModule metadata for each module
 * 6. Include all edges (allowed + forbidden) between modules
 * 7. Store result in cache
 *
 * @param seedModules - Module IDs from Frame.module_scope
 * @param foldRadius - How many hops to expand (default: 1)
 * @param policyPath - Optional custom policy path
 * @returns Atlas Frame with neighborhood context
 */
export function generateAtlasFrame(
  seedModules: string[],
  foldRadius: number = 1,
  policyPath?: string
): AtlasFrame {
  // Check cache first (if enabled)
  const cache = getCache();
  if (cache && !policyPath) {
    // Only use cache if using default policy path
    const cached = cache.get(seedModules, foldRadius);
    if (cached) {
      return cached;
    }
  }

  const timestamp = new Date().toISOString();

  // Load policy graph
  const policy = loadPolicy(policyPath);

  // Extract neighborhood using BFS traversal
  const neighborhood = extractNeighborhood(policy, seedModules, foldRadius);

  // Generate coordinates for visualization
  const coordinates = generateCoordinates(
    neighborhood.modules,
    neighborhood.edges
  );

  // Build AtlasModule objects with full metadata
  const modules: AtlasModule[] = [];
  for (const moduleId of neighborhood.modules) {
    const policyModule = policy.modules[moduleId];

    if (!policyModule) {
      // Module not found in policy - include minimal data
      modules.push({
        id: moduleId,
        coords: coordinates.get(moduleId),
      });
      continue;
    }

    // Include full policy metadata
    const atlasModule: AtlasModule = {
      id: moduleId,
      coords: coordinates.get(moduleId),
    };

    // Copy all PolicyModule fields to AtlasModule
    if (policyModule.owns_paths) {
      atlasModule.owns_paths = policyModule.owns_paths;
    }
    if (policyModule.owns_namespaces) {
      atlasModule.owns_namespaces = policyModule.owns_namespaces;
    }
    if (policyModule.allowed_callers) {
      atlasModule.allowed_callers = policyModule.allowed_callers;
    }
    if (policyModule.forbidden_callers) {
      atlasModule.forbidden_callers = policyModule.forbidden_callers;
    }
    if (policyModule.feature_flags) {
      atlasModule.feature_flags = policyModule.feature_flags;
    }
    if (policyModule.requires_permissions) {
      atlasModule.requires_permissions = policyModule.requires_permissions;
    }
    if (policyModule.kill_patterns) {
      atlasModule.kill_patterns = policyModule.kill_patterns;
    }
    if (policyModule.notes) {
      atlasModule.notes = policyModule.notes;
    }

    modules.push(atlasModule);
  }

  // Convert edges to AtlasEdge format
  const edges: AtlasEdge[] = neighborhood.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    allowed: edge.type === 'allowed',
    reason: edge.type === 'forbidden' ? 'forbidden_caller' : undefined,
  }));

  const atlasFrame: AtlasFrame = {
    atlas_timestamp: timestamp,
    seed_modules: seedModules,
    fold_radius: foldRadius,
    modules,
    edges,
    critical_rule:
      "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming.",
  };

  // Cache the result if using default policy path
  if (cache && !policyPath) {
    cache.set(seedModules, foldRadius, atlasFrame);
  }

  return atlasFrame;
}

/**
 * Format Atlas Frame for display in MCP response
 */
export function formatAtlasFrame(atlasFrame: AtlasFrame): string {
  const { seed_modules, fold_radius, modules, edges } = atlasFrame;

  let output = `\n📊 Atlas Frame (fold radius: ${fold_radius})\n`;
  output += `🌱 Seed modules: ${seed_modules.join(", ")}\n`;
  output += `📦 Total modules in neighborhood: ${modules.length}\n`;

  if (edges.length > 0) {
    output += `\n🔗 Edges:\n`;
    edges.forEach((edge) => {
      const status = edge.allowed ? "✅ Allowed" : "🚫 Forbidden";
      output += `  ${edge.from} → ${edge.to} [${status}]`;
      if (edge.reason) {
        output += ` - ${edge.reason}`;
      }
      output += "\n";
    });
  }

  return output;
}
