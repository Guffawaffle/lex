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
 * For now, returns a minimal Atlas Frame with just the seed modules
 *
 * @param seedModules - Module IDs from Frame.module_scope
 * @param foldRadius - How many hops to expand (default: 1)
 * @returns Atlas Frame with neighborhood context
 */
export declare function generateAtlasFrame(seedModules: string[], foldRadius?: number): AtlasFrame;
/**
 * Format Atlas Frame for display in MCP response
 */
export declare function formatAtlasFrame(atlasFrame: AtlasFrame): string;
//# sourceMappingURL=atlas-frame.d.ts.map