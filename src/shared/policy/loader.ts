/**
 * Policy Loading Utility
 *
 * Loads and caches policy from lexmap.policy.json
 * Supports custom policy path via environment variable
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
// @ts-ignore - importing from compiled dist directory
import type { Policy } from "../../types/policy.js";
import { getNDJSONLogger } from "../logger/index.js";
import { AXErrorException } from "../errors/ax-error.js";
import { POLICY_ERROR_CODES, STANDARD_NEXT_ACTIONS } from "../errors/error-codes.js";
import { resolveCallerWorkspaceRoot, type WorkspaceRootResolution } from "../config/index.js";

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

export type PolicyPathSource =
  | "env:LEX_POLICY_PATH"
  | "argument"
  | "workspace-working"
  | "workspace-canon"
  | "workspace-example"
  | "not-found";

export interface PolicyPathResolution {
  path: string | null;
  source: PolicyPathSource;
  searchedPaths: string[];
  workspaceRoot: WorkspaceRootResolution | null;
}

export interface PolicyPathOptions {
  startPath?: string;
  workspaceRootOverride?: string | null;
}

export function resolvePolicyPath(
  path?: string,
  options: PolicyPathOptions = {}
): PolicyPathResolution {
  const envPath = process.env[POLICY_PATH_ENV];

  if (envPath) {
    return {
      path: resolve(envPath),
      source: "env:LEX_POLICY_PATH",
      searchedPaths: [resolve(envPath)],
      workspaceRoot: null,
    };
  }

  if (path) {
    return {
      path: resolve(path),
      source: "argument",
      searchedPaths: [resolve(path)],
      workspaceRoot: null,
    };
  }

  const workspaceRoot = resolveCallerWorkspaceRoot({
    startPath: options.startPath ?? process.cwd(),
    explicitRoot: options.workspaceRootOverride ?? process.env[WORKSPACE_ROOT_ENV] ?? null,
  });

  const workingPath = join(workspaceRoot.path, DEFAULT_POLICY_PATH);
  const canonPath = join(workspaceRoot.path, CANON_POLICY_PATH);
  const examplePath = join(workspaceRoot.path, EXAMPLE_POLICY_PATH);
  const searchedPaths = [workingPath, canonPath, examplePath];

  if (existsSync(workingPath)) {
    return {
      path: workingPath,
      source: "workspace-working",
      searchedPaths,
      workspaceRoot,
    };
  }

  if (existsSync(canonPath)) {
    return {
      path: canonPath,
      source: "workspace-canon",
      searchedPaths,
      workspaceRoot,
    };
  }

  if (existsSync(examplePath)) {
    return {
      path: examplePath,
      source: "workspace-example",
      searchedPaths,
      workspaceRoot,
    };
  }

  return {
    path: null,
    source: "not-found",
    searchedPaths,
    workspaceRoot,
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

  const resolution = resolvePolicyPath(path);

  try {
    if (!resolution.path) {
      throw new AXErrorException(
        POLICY_ERROR_CODES.POLICY_NOT_FOUND,
        `Policy file not found`,
        [
          STANDARD_NEXT_ACTIONS.INIT_WORKSPACE,
          'Run "npm run setup-local" to initialize working files',
          "Set LEX_POLICY_PATH environment variable to custom path",
        ],
        {
          searchedPaths: resolution.searchedPaths,
        }
      );
    }

    if (resolution.source === "workspace-canon") {
      logger.warn("Using canonical policy (working file not found)", {
        operation: "loadPolicy",
        metadata: { path: resolution.path },
      });
    } else if (resolution.source === "workspace-example") {
      logger.warn("Using fallback policy path", {
        operation: "loadPolicy",
        metadata: { path: resolution.path },
      });
    }

    // Read and parse policy file
    const startTime = Date.now();
    const policyContent = readFileSync(resolution.path, "utf-8");
    const rawPolicy = JSON.parse(policyContent);

    // Cast to Policy type (no transformation needed - all policies use modules format)
    const policy = rawPolicy as Policy;

    // Validate basic structure
    if (!policy.modules || typeof policy.modules !== "object") {
      throw new AXErrorException(
        POLICY_ERROR_CODES.POLICY_INVALID,
        'Invalid policy structure: missing or invalid "modules" field',
        [
          "Check that policy file has a valid JSON structure",
          'Ensure "modules" field is an object',
          STANDARD_NEXT_ACTIONS.CHECK_POLICY,
        ],
        { path: resolution.path }
      );
    }

    const duration = Date.now() - startTime;
    logger.info("Policy loaded", {
      operation: "loadPolicy",
      duration_ms: duration,
      metadata: { path: resolution.path, moduleCount: Object.keys(policy.modules).length },
    });

    // Cache policy if using default path (not env var or custom path)
    if (resolution.source.startsWith("workspace-")) {
      cachedPolicy = policy;
    }

    return policy;
  } catch (error: unknown) {
    // Re-throw AXErrorException as-is
    if (error instanceof AXErrorException) {
      throw error;
    }

    interface NodeError extends Error {
      code?: string;
    }
    const err = error as NodeError;
    const policyPath = resolution.path || path || DEFAULT_POLICY_PATH;

    if (err.code === "ENOENT") {
      logger.error("Policy file not found", {
        operation: "loadPolicy",
        error: err,
        metadata: { path: policyPath },
      });
      throw new AXErrorException(
        POLICY_ERROR_CODES.POLICY_NOT_FOUND,
        `Policy file not found: ${policyPath}`,
        [
          STANDARD_NEXT_ACTIONS.INIT_WORKSPACE,
          'Run "npm run setup-local" to initialize working files',
          STANDARD_NEXT_ACTIONS.CHECK_FILE_PATH,
        ],
        { path: policyPath }
      );
    }

    // Check for JSON parse errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("JSON") || errorMessage.includes("Unexpected token")) {
      logger.error("Policy parse error", {
        operation: "loadPolicy",
        error: err instanceof Error ? err : new Error(String(error)),
        metadata: { path: policyPath },
      });
      throw new AXErrorException(
        POLICY_ERROR_CODES.POLICY_PARSE_ERROR,
        `Failed to parse policy JSON: ${errorMessage}`,
        [
          "Check policy file for valid JSON syntax",
          "Use a JSON validator to find syntax errors",
          STANDARD_NEXT_ACTIONS.CHECK_POLICY,
        ],
        { path: policyPath, parseError: errorMessage }
      );
    }

    logger.error("Failed to load policy", {
      operation: "loadPolicy",
      error: err instanceof Error ? err : new Error(String(error)),
      metadata: { path: policyPath },
    });
    throw new AXErrorException(
      POLICY_ERROR_CODES.POLICY_INVALID,
      `Failed to load policy from ${policyPath}: ${errorMessage}`,
      [STANDARD_NEXT_ACTIONS.CHECK_POLICY, STANDARD_NEXT_ACTIONS.CHECK_LOGS],
      { path: policyPath, originalError: errorMessage }
    );
  }
}

/**
 * Load policy if available, return null if not found (graceful mode)
 *
 * @param path - Optional custom policy path
 * @returns Policy object or null if not found
 *
 * This is used by CLI commands that should work without a policy file,
 * emitting a warning instead of failing.
 *
 * @example
 * ```typescript
 * const policy = loadPolicyIfAvailable();
 * if (!policy) {
 *   console.warn('No policy file found, skipping validation');
 * }
 * ```
 */
export function loadPolicyIfAvailable(path?: string): Policy | null {
  try {
    return loadPolicy(path);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Only return null for "not found" errors, re-throw other errors
    if (
      errorMessage.includes("Policy file not found") ||
      errorMessage.includes("Could not find repository root")
    ) {
      return null;
    }
    // Re-throw other errors (e.g., invalid JSON, invalid structure)
    throw error;
  }
}

/**
 * Clear cached policy (useful for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
}
