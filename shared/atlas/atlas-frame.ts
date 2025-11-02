/**
 * Atlas Frame - Spatial neighborhood extraction from policy graph
 * 
 * Computes the "map page" around a set of modules with fold radius.
 * Currently a stub implementation - full policy graph integration pending.
 */

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
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
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
 * TODO: Integrate with lexmap.policy.json for actual policy graph traversal
 * Full implementation will:
 * - Load policy graph from lexmap.policy.json
 * - Start with seed modules
 * - Expand N hops via allowed_callers/forbidden_callers edges
 * - Include full policy metadata for all discovered modules
 * - Return complete neighborhood with edges
 * 
 * For now, returns a minimal Atlas Frame with just the seed modules
 * 
 * @param seedModules - Module IDs from Frame.module_scope
 * @param foldRadius - How many hops to expand (default: 1)
 * @returns Atlas Frame with neighborhood context
 */
export function generateAtlasFrame(
  seedModules: string[],
  foldRadius: number = 1
): AtlasFrame {
  // Stub implementation - just return seed modules without neighborhood expansion
  const timestamp = new Date().toISOString();
  
  const modules: AtlasModule[] = seedModules.map((moduleId) => ({
    id: moduleId,
    allowed_callers: [],
    forbidden_callers: [],
  }));

  return {
    atlas_timestamp: timestamp,
    seed_modules: seedModules,
    fold_radius: foldRadius,
    modules,
    edges: [],
    critical_rule:
      "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming.",
  };
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
