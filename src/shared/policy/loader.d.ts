/**
 * Policy Loading Utility
 *
 * Loads and caches policy from lexmap.policy.json
 * Supports custom policy path via environment variable
 */
import type { Policy } from '../../types/policy.js';
/**
 * Load policy from lexmap.policy.json
 *
 * @param path - Optional custom policy path (defaults to policy/policy_spec/lexmap.policy.json)
 * @returns Policy object
 * @throws Error if policy file cannot be read or parsed
 *
 * @example
 * ```typescript
 * const policy = loadPolicy();
 * console.log(Object.keys(policy.modules)); // ['indexer', 'ts', 'php', 'mcp']
 * ```
 *
 * @example With custom path
 * ```typescript
 * const policy = loadPolicy('/custom/path/policy.json');
 * ```
 *
 * @example With environment variable
 * ```typescript
 * process.env.LEX_POLICY_PATH = '/custom/path/policy.json';
 * const policy = loadPolicy();
 * ```
 */
export declare function loadPolicy(path?: string): Policy;
/**
 * Clear cached policy (useful for testing)
 */
export declare function clearPolicyCache(): void;
//# sourceMappingURL=loader.d.ts.map