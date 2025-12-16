/**
 * CLI Command: lex policy add-module
 *
 * Adds a new module to the lexmap.policy.json file.
 * Creates a minimal module structure with empty owns_paths array.
 *
 * Usage:
 *   lex policy add-module <moduleId>              # Add to default policy
 *   lex policy add-module <moduleId> --policy <path>  # Add to custom policy
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { loadPolicy } from "../policy/loader.js";
import { validatePolicySchema } from "../policy/schema.js";
import type { Policy } from "../types/policy.js";
import * as output from "./output.js";
import { AXErrorException } from "../errors/ax-error.js";
import {
  POLICY_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  STANDARD_NEXT_ACTIONS,
} from "../errors/error-codes.js";

export interface PolicyAddModuleOptions {
  /** Custom policy file path */
  policyPath?: string;
  /** Output results in JSON format */
  json?: boolean;
}

export interface PolicyAddModuleResult {
  success: boolean;
  moduleId: string;
  policyPath: string;
  message: string;
  alreadyExists?: boolean;
}

/**
 * Module ID pattern: lowercase letters, numbers, underscores, hyphens, and forward slashes
 */
const MODULE_ID_PATTERN = /^[a-z0-9/_-]+$/;

/**
 * Default working policy path (from repository root)
 */
const DEFAULT_POLICY_PATH = ".smartergpt/lex/lexmap.policy.json";

/**
 * Canonical policy path (from repository root)
 */
const CANON_POLICY_PATH = "canon/policy/lexmap.policy.json";

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
 * Resolve the policy file path
 */
function resolvePolicyPath(customPath?: string): string {
  const envPath = process.env.LEX_POLICY_PATH;

  if (envPath) {
    return envPath;
  }

  if (customPath) {
    return customPath;
  }

  // Check for workspace root override from environment
  const repoRoot = process.env.LEX_WORKSPACE_ROOT
    ? process.env.LEX_WORKSPACE_ROOT
    : findRepoRoot(process.cwd());

  // Try working file first
  const workingPath = join(repoRoot, DEFAULT_POLICY_PATH);
  if (existsSync(workingPath)) {
    return workingPath;
  }

  // Fallback to canonical policy file
  const canonPath = join(repoRoot, CANON_POLICY_PATH);
  if (existsSync(canonPath)) {
    return canonPath;
  }

  throw new AXErrorException(
    POLICY_ERROR_CODES.POLICY_NOT_FOUND,
    `Policy file not found`,
    [
      STANDARD_NEXT_ACTIONS.INIT_WORKSPACE,
      'Run "lex init" to initialize workspace with policy file',
      "Set LEX_POLICY_PATH environment variable to custom path",
    ],
    {
      searchedPaths: [workingPath, canonPath],
    }
  );
}

/**
 * Execute the 'lex policy add-module' command
 */
export async function policyAddModule(
  moduleId: string,
  options: PolicyAddModuleOptions = {}
): Promise<PolicyAddModuleResult> {
  try {
    // Validate moduleId format
    if (!moduleId || moduleId.trim() === "") {
      throw new AXErrorException(
        VALIDATION_ERROR_CODES.VALIDATION_REQUIRED_FIELD,
        "Module ID cannot be empty",
        ["Provide a valid module ID (e.g., cli/new-feature)"],
        { field: "moduleId" }
      );
    }

    const trimmedModuleId = moduleId.trim();

    if (!MODULE_ID_PATTERN.test(trimmedModuleId)) {
      throw new AXErrorException(
        VALIDATION_ERROR_CODES.VALIDATION_INVALID_MODULE_ID,
        `Invalid module ID format: "${trimmedModuleId}"`,
        [
          `Module IDs must match pattern: ${MODULE_ID_PATTERN}`,
          "Use lowercase letters, numbers, underscores, hyphens, and forward slashes",
          "Example: cli/new-feature, services/auth-core, ui/dashboard",
        ],
        { moduleId: trimmedModuleId }
      );
    }

    // Resolve policy file path
    const policyPath = resolvePolicyPath(options.policyPath);

    // Load existing policy to validate it
    const policy: Policy = loadPolicy(policyPath);

    // Check if module already exists
    if (policy.modules[trimmedModuleId]) {
      const result: PolicyAddModuleResult = {
        success: true,
        moduleId: trimmedModuleId,
        policyPath,
        message: `Module '${trimmedModuleId}' already exists in policy`,
        alreadyExists: true,
      };

      if (options.json) {
        output.json(result);
      } else {
        output.info(`Module '${trimmedModuleId}' already exists in policy`);
      }

      return result;
    }

    // Read the raw policy file content to preserve formatting
    const policyContent = readFileSync(policyPath, "utf-8");
    const rawPolicy = JSON.parse(policyContent);

    // Add new module with default structure
    rawPolicy.modules[trimmedModuleId] = {
      owns_paths: [],
    };

    // Validate the updated policy
    const validation = validatePolicySchema(rawPolicy);
    if (!validation.valid) {
      throw new AXErrorException(
        POLICY_ERROR_CODES.POLICY_INVALID,
        "Updated policy failed validation",
        ["Check policy file for errors", STANDARD_NEXT_ACTIONS.CHECK_POLICY],
        { errors: validation.errors }
      );
    }

    // Write updated policy back to file
    writeFileSync(policyPath, JSON.stringify(rawPolicy, null, 2) + "\n", "utf-8");

    const result: PolicyAddModuleResult = {
      success: true,
      moduleId: trimmedModuleId,
      policyPath,
      message: `Successfully added module '${trimmedModuleId}' to ${policyPath}`,
      alreadyExists: false,
    };

    if (options.json) {
      output.json(result);
    } else {
      output.success(`✓ Added module '${trimmedModuleId}'`);
      output.info(`  Policy file: ${policyPath}`);
      output.info(`  Module structure: { "owns_paths": [] }`);
      output.info("");
      output.info("Next steps:");
      output.info(`  • Edit ${policyPath} to add owns_paths for this module`);
      output.info(`  • Run 'lex policy check' to validate your changes`);
    }

    return result;
  } catch (error: unknown) {
    // Re-throw AXErrorException as-is (it has proper error codes and next actions)
    if (error instanceof AXErrorException) {
      throw error;
    }

    // Generic error fallback for unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result: PolicyAddModuleResult = {
      success: false,
      moduleId: moduleId || "",
      policyPath: options.policyPath || "",
      message: errorMessage,
    };

    if (options.json) {
      output.json(result);
    } else {
      output.error(`Failed to add module: ${errorMessage}`);
    }

    process.exit(1);
  }
}
