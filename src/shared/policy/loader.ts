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
import { getNDJSONLogger } from "../logger/index.js";

const logger = getNDJSONLogger("policy/loader");

/**
 * Default working policy path (from repository root)
 */
const DEFAULT_POLICY_PATH = ".smartergpt/lex/lexmap.policy.json";

/**
 * Canonical policy path (from repository root)
 * Used as fallback when working file doesn't exist (after fresh clone + npm install)
 */
const CANON_POLICY_PATH = "canon/policy/lexmap.policy.json";

/**
 * Fallback example policy path (from repository root)
 */
const EXAMPLE_POLICY_PATH = "src/policy/policy_spec/lexmap.policy.json.example";

/**
 * Environment variable for custom policy path
 */
const POLICY_PATH_ENV = "LEX_POLICY_PATH";

/**
 * Environment variable for workspace root override
 * Points to the root directory of the user's project/workspace
 */
const WORKSPACE_ROOT_ENV = "LEX_WORKSPACE_ROOT";

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
      // Check if this is the lex root package (with or without scope)
      if (packageJson.name === "lex" || packageJson.name === "@smartergpt/lex") {
        return currentPath;
      }
    }
    currentPath = dirname(currentPath);
  }

  throw new Error(
    'Could not find repository root (looking for package.json with name "lex" or "@smartergpt/lex")'
  );
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
 * 3. .smartergpt/lex/lexmap.policy.json (working file)
 * 4. canon/policy/lexmap.policy.json (canonical policy - checked in git)
 * 5. src/policy/policy_spec/lexmap.policy.json.example (example template)
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

    if (envPath) {
      // Priority 1: Environment variable (explicit override)
      resolvedPath = resolve(envPath);
    } else if (path) {
      // Priority 2: Custom path parameter
      resolvedPath = resolve(path);
    } else {
      // Priority 3-5: Try working file, then canon, then example
      // Check for workspace root override from environment
      const repoRoot = process.env[WORKSPACE_ROOT_ENV]
        ? process.env[WORKSPACE_ROOT_ENV]
        : findRepoRoot(process.cwd());

      // Try working file first
      const workingPath = join(repoRoot, DEFAULT_POLICY_PATH);
      if (existsSync(workingPath)) {
        resolvedPath = workingPath;
      } else {
        // Fallback to canonical policy file
        const canonPath = join(repoRoot, CANON_POLICY_PATH);
        if (existsSync(canonPath)) {
          resolvedPath = canonPath;
          logger.warn("Using canonical policy (working file not found)", {
            operation: "loadPolicy",
            metadata: { path: canonPath },
          });
        } else {
          // Fallback to example file
          const examplePath = join(repoRoot, EXAMPLE_POLICY_PATH);
          if (existsSync(examplePath)) {
            resolvedPath = examplePath;
            logger.warn("Using fallback policy path", {
              operation: "loadPolicy",
              metadata: { path: examplePath },
            });
          } else {
            throw new Error(
              `Policy file not found. Tried:\n` +
                `  1. ${workingPath}\n` +
                `  2. ${canonPath}\n` +
                `  3. ${examplePath}\n\n` +
                `Run 'npm run setup-local' to initialize working files.`
            );
          }
        }
      }
    }

    // Read and parse policy file
    const startTime = Date.now();
    const policyContent = readFileSync(resolvedPath, "utf-8");
    const rawPolicy = JSON.parse(policyContent);

    // Cast to Policy type (no transformation needed - all policies use modules format)
    const policy = rawPolicy as Policy;

    // Validate basic structure
    if (!policy.modules || typeof policy.modules !== "object") {
      throw new Error('Invalid policy structure: missing or invalid "modules" field');
    }

    const duration = Date.now() - startTime;
    logger.info("Policy loaded", {
      operation: "loadPolicy",
      duration_ms: duration,
      metadata: { path: resolvedPath, moduleCount: Object.keys(policy.modules).length },
    });

    // Cache policy if using default path (not env var or custom path)
    if (!envPath && !path) {
      cachedPolicy = policy;
    }

    return policy;
  } catch (error: unknown) {
    interface NodeError extends Error {
      code?: string;
    }
    const err = error as NodeError;
    if (err.code === "ENOENT") {
      logger.error("Policy file not found", {
        operation: "loadPolicy",
        error: err,
        metadata: { path: envPath || path || DEFAULT_POLICY_PATH },
      });
      throw new Error(
        `Policy file not found: ${envPath || path || DEFAULT_POLICY_PATH}\n` +
          `Run 'npm run setup-local' to initialize working files.`
      );
    }
    logger.error("Failed to load policy", {
      operation: "loadPolicy",
      error: err instanceof Error ? err : new Error(String(error)),
      metadata: { path: envPath || path || DEFAULT_POLICY_PATH },
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load policy from ${envPath || path || DEFAULT_POLICY_PATH}: ${errorMessage}`
    );
  }
}

/**
 * Clear cached policy (useful for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
}
