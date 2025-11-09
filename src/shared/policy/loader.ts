/**
 * Policy Loading Utility
 *
 * Loads and caches policy from lexmap.policy.json
 * Supports custom policy path via environment variable
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
// @ts-ignore - importing from compiled dist directory
import type { Policy } from "../../types/policy.js";

/**
 * Default working policy path (from repository root)
 */
const DEFAULT_POLICY_PATH = ".smartergpt.local/lex/lexmap.policy.json";

/**
 * Fallback example policy path (from repository root)
 */
const EXAMPLE_POLICY_PATH = "src/policy/policy_spec/lexmap.policy.json.example";

/**
 * Legacy policy path (for backward compatibility during transition)
 */
const LEGACY_POLICY_PATH = "src/policy/policy_spec/lexmap.policy.json";

/**
 * Environment variable for custom policy path
 */
const POLICY_PATH_ENV = "LEX_POLICY_PATH";

/**
 * Cached policy to avoid re-reading from disk
 */
let cachedPolicy: Policy | null = null;

/**
 * Find repository root by looking for package.json
 */
function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    const packageJsonPath = join(currentPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      // Check if this is the lex root package
      if (packageJson.name === "lex") {
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
function transformPolicy(rawPolicy: any): Policy {
  // If already in the correct format, return as-is
  if (rawPolicy.modules && !rawPolicy.modules.patterns) {
    return rawPolicy as Policy;
  }

  // Transform patterns format to modules format
  const modules: Record<string, any> = {};

  if (rawPolicy.modules?.patterns) {
    for (const pattern of rawPolicy.modules.patterns) {
      modules[pattern.name] = {
        owns_paths: [pattern.match],
        allowed_callers: [],
        forbidden_callers: [],
      };
    }
  }

  return {
    modules,
    // NOTE: global_kill_patterns transformation is not currently used by module validation
    // The kind/match fields may need verification if this feature is enabled in the future
    // For now, this maps kind→pattern and match→description as a placeholder
    global_kill_patterns: rawPolicy.kill_patterns?.map((kp: any) => ({
      pattern: kp.kind,
      description: kp.match,
    })),
  };
}

/**
 * Load policy from lexmap.policy.json
 *
 * @param path - Optional custom policy path (defaults to working file with fallback to example)
 * @returns Policy object
 * @throws Error if policy file cannot be read or parsed
 *
 * Policy loading precedence:
 * 1. LEX_POLICY_PATH environment variable (explicit override)
 * 2. Custom path parameter (if provided)
 * 3. .smartergpt.local/lex/lexmap.policy.json (working file)
 * 4. src/policy/policy_spec/lexmap.policy.json.example (example template)
 * 5. src/policy/policy_spec/lexmap.policy.json (legacy location)
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
export function loadPolicy(path?: string): Policy {
  // Return cached policy if available and no custom path specified
  if (cachedPolicy && !path) {
    return cachedPolicy;
  }

  // Determine policy path with fallback chain
  const envPath = process.env[POLICY_PATH_ENV];
  
  try {
    let resolvedPath: string;
    let usedFallback = false;

    if (envPath) {
      // Priority 1: Environment variable (explicit override)
      resolvedPath = resolve(envPath);
    } else if (path) {
      // Priority 2: Custom path parameter
      resolvedPath = resolve(path);
    } else {
      // Priority 3-5: Try working file, then example, then legacy
      const repoRoot = findRepoRoot(process.cwd());
      
      // Try working file first
      const workingPath = join(repoRoot, DEFAULT_POLICY_PATH);
      if (existsSync(workingPath)) {
        resolvedPath = workingPath;
      } else {
        // Fallback to example file
        const examplePath = join(repoRoot, EXAMPLE_POLICY_PATH);
        if (existsSync(examplePath)) {
          resolvedPath = examplePath;
          usedFallback = true;
        } else {
          // Last resort: try legacy location
          const legacyPath = join(repoRoot, LEGACY_POLICY_PATH);
          if (existsSync(legacyPath)) {
            resolvedPath = legacyPath;
            usedFallback = true;
          } else {
            throw new Error(
              `Policy file not found. Tried:\n` +
              `  1. ${workingPath}\n` +
              `  2. ${examplePath}\n` +
              `  3. ${legacyPath}\n\n` +
              `Run 'npm run setup-local' to initialize working files.`
            );
          }
        }
      }
    }

    // Read and parse policy file
    const policyContent = readFileSync(resolvedPath, "utf-8");
    const rawPolicy = JSON.parse(policyContent);

    // Transform to expected format
    const policy = transformPolicy(rawPolicy);

    // Validate basic structure
    if (!policy.modules || typeof policy.modules !== "object") {
      throw new Error('Invalid policy structure: missing or invalid "modules" field');
    }

    // Cache policy if using default path (not env var or custom path)
    if (!envPath && !path) {
      cachedPolicy = policy;
    }

    return policy;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Policy file not found: ${envPath || path || DEFAULT_POLICY_PATH}\n` +
        `Run 'npm run setup-local' to initialize working files.`
      );
    }
    throw new Error(
      `Failed to load policy from ${envPath || path || DEFAULT_POLICY_PATH}: ${error.message}`
    );
  }
}

/**
 * Clear cached policy (useful for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
}
