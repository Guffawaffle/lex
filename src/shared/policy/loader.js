/**
 * Policy Loading Utility
 *
 * Loads and caches policy from lexmap.policy.json
 * Supports custom policy path via environment variable
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
/**
 * Default policy path (from repository root)
 */
const DEFAULT_POLICY_PATH = 'policy/policy_spec/lexmap.policy.json';
/**
 * Environment variable for custom policy path
 */
const POLICY_PATH_ENV = 'LEX_POLICY_PATH';
/**
 * Cached policy to avoid re-reading from disk
 */
let cachedPolicy = null;
/**
 * Find repository root by looking for package.json
 */
function findRepoRoot(startPath) {
    let currentPath = startPath;
    while (currentPath !== dirname(currentPath)) {
        const packageJsonPath = join(currentPath, 'package.json');
        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            // Check if this is the lex root package
            if (packageJson.name === 'lex') {
                return currentPath;
            }
        }
        currentPath = dirname(currentPath);
    }
    throw new Error('Could not find repository root (looking for package.json with name "lex")');
}
/**
 * Transform lexmap.policy.json format to Policy type format
 *
 * lexmap.policy.json uses a "patterns" array, but the Policy type expects
 * modules to be a Record<string, PolicyModule>
 */
function transformPolicy(rawPolicy) {
    // If already in the correct format, return as-is
    if (rawPolicy.modules && !rawPolicy.modules.patterns) {
        return rawPolicy;
    }
    // Transform patterns format to modules format
    const modules = {};
    if (rawPolicy.modules?.patterns) {
        for (const pattern of rawPolicy.modules.patterns) {
            modules[pattern.name] = {
                owns_paths: [pattern.match],
                allowed_callers: [],
                forbidden_callers: []
            };
        }
    }
    return {
        modules,
        // NOTE: global_kill_patterns transformation is not currently used by module validation
        // The kind/match fields may need verification if this feature is enabled in the future
        // For now, this maps kind→pattern and match→description as a placeholder
        global_kill_patterns: rawPolicy.kill_patterns?.map((kp) => ({
            pattern: kp.kind,
            description: kp.match
        }))
    };
}
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
export function loadPolicy(path) {
    // Return cached policy if available and no custom path specified
    if (cachedPolicy && !path) {
        return cachedPolicy;
    }
    // Determine policy path
    const policyPath = path || process.env[POLICY_PATH_ENV];
    try {
        let resolvedPath;
        if (policyPath) {
            // Use provided path (can be absolute or relative to cwd)
            resolvedPath = resolve(policyPath);
        }
        else {
            // Find repo root and use default path
            const repoRoot = findRepoRoot(process.cwd());
            resolvedPath = join(repoRoot, DEFAULT_POLICY_PATH);
        }
        // Read and parse policy file
        const policyContent = readFileSync(resolvedPath, 'utf-8');
        const rawPolicy = JSON.parse(policyContent);
        // Transform to expected format
        const policy = transformPolicy(rawPolicy);
        // Validate basic structure
        if (!policy.modules || typeof policy.modules !== 'object') {
            throw new Error('Invalid policy structure: missing or invalid "modules" field');
        }
        // Cache policy if using default path
        if (!path) {
            cachedPolicy = policy;
        }
        return policy;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Policy file not found: ${policyPath || DEFAULT_POLICY_PATH}`);
        }
        throw new Error(`Failed to load policy from ${policyPath || DEFAULT_POLICY_PATH}: ${error.message}`);
    }
}
/**
 * Clear cached policy (useful for testing)
 */
export function clearPolicyCache() {
    cachedPolicy = null;
}
//# sourceMappingURL=loader.js.map