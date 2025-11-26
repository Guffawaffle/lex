/**
 * CLI Command: lex policy check
 *
 * Validates policy file syntax and optionally verifies modules match the codebase.
 *
 * Usage:
 *   lex policy check                 # Validate policy syntax
 *   lex policy check --match         # Also verify modules match codebase
 *   lex policy check --json          # Output results as JSON
 */

import { existsSync, readdirSync } from "fs";
import { join, relative } from "path";
import { loadPolicy } from "../policy/loader.js";
import { validatePolicySchema, type PolicyValidationResult } from "../policy/schema.js";
import type { Policy, PolicyModule } from "../types/policy.js";
import * as output from "./output.js";

export interface PolicyCheckOptions {
  /** Output results in JSON format */
  json?: boolean;
  /** Verify modules match codebase structure */
  match?: boolean;
  /** Custom policy file path */
  policyPath?: string;
  /** Custom source directory for --match (default: "src") */
  srcDir?: string;
}

export interface PolicyCheckResult {
  valid: boolean;
  moduleCount: number;
  errors: Array<{ path: string; message: string; code: string }>;
  warnings: Array<{ path: string; message: string; code: string }>;
  matchResults?: {
    orphanModules: string[];
    unmappedDirs: string[];
  };
}

/**
 * Directories to exclude from codebase scanning
 */
const EXCLUDED_DIRECTORIES = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "vendor",
  "coverage",
  "__pycache__",
  ".cache",
];

/**
 * Check if a directory should be excluded from scanning
 */
function isExcludedDirectory(name: string): boolean {
  return EXCLUDED_DIRECTORIES.includes(name) || name.startsWith(".");
}

/**
 * Check if a directory contains code files
 */
function hasCodeFiles(dirPath: string): boolean {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries.some((entry) => {
      if (entry.isFile()) {
        const ext = entry.name.toLowerCase();
        return (
          ext.endsWith(".ts") ||
          ext.endsWith(".js") ||
          ext.endsWith(".tsx") ||
          ext.endsWith(".jsx") ||
          ext.endsWith(".py") ||
          ext.endsWith(".php") ||
          ext.endsWith(".go") ||
          ext.endsWith(".rs") ||
          ext.endsWith(".java")
        );
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Recursively scan directory for code directories
 */
function scanCodeDirs(dirPath: string, rootDir: string, results: string[]): void {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (isExcludedDirectory(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);

      // Check if this directory has code files
      if (hasCodeFiles(fullPath)) {
        results.push(relative(rootDir, fullPath));
      }

      // Recursively scan subdirectories
      scanCodeDirs(fullPath, rootDir, results);
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * Match a path against a glob pattern
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  // Remove trailing slash or /** for comparison
  const normalizedPattern = regexPattern.replace(/\/\.\*$/, "(/.*)?").replace(/\/$/, "(/.*)?");

  const regex = new RegExp(`^${normalizedPattern}$`);
  return regex.test(path) || regex.test(path + "/");
}

/**
 * Module interface for codebase matching
 */
interface MatchableModule extends PolicyModule {
  match?: string[];
}

/**
 * Verify modules match the codebase structure
 */
function verifyCodebaseMatch(
  modules: Record<string, MatchableModule>,
  srcDir: string
): { orphanModules: string[]; unmappedDirs: string[] } {
  const orphanModules: string[] = [];
  const unmappedDirs: string[] = [];

  // Get all code directories
  const codeDirs: string[] = [];
  const srcPath = join(process.cwd(), srcDir);

  if (existsSync(srcPath)) {
    // Add src dir itself if it has code files
    if (hasCodeFiles(srcPath)) {
      codeDirs.push(srcDir);
    }
    scanCodeDirs(srcPath, process.cwd(), codeDirs);
  }

  // Track which directories are covered by modules
  const coveredDirs = new Set<string>();

  // Check each module's paths
  for (const [moduleId, module] of Object.entries(modules)) {
    const paths = module.owns_paths || module.match || [];
    let hasMatch = false;

    for (const pattern of paths) {
      // Check if pattern matches any code directory
      for (const dir of codeDirs) {
        if (matchesGlob(dir, pattern) || matchesGlob(dir + "/", pattern)) {
          hasMatch = true;
          coveredDirs.add(dir);
        }
      }

      // Also check if the pattern's base path exists directly
      const basePath = pattern
        .replace(/\/\*\*$/, "")
        .replace(/\/\*$/, "")
        .replace(/\*\*$/, "")
        .replace(/\*$/, "");

      if (basePath && existsSync(join(process.cwd(), basePath))) {
        hasMatch = true;
      }
    }

    // Modules with owns_namespaces but no owns_paths are valid (e.g., PHP modules)
    // Only flag as orphan if paths are specified but don't match
    const hasNamespaces = (module.owns_namespaces || []).length > 0;
    if (paths.length > 0 && !hasMatch && !hasNamespaces) {
      orphanModules.push(moduleId);
    }
  }

  // Find unmapped directories (not covered by any module)
  for (const dir of codeDirs) {
    if (!coveredDirs.has(dir)) {
      // Check if parent is covered (nested directories are OK)
      const parts = dir.split("/");
      let parentCovered = false;
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = parts.slice(0, i).join("/");
        if (coveredDirs.has(parentPath)) {
          parentCovered = true;
          break;
        }
      }
      if (!parentCovered) {
        unmappedDirs.push(dir);
      }
    }
  }

  return { orphanModules, unmappedDirs };
}

/**
 * Execute the 'lex policy check' command
 */
export async function policyCheck(options: PolicyCheckOptions = {}): Promise<PolicyCheckResult> {
  try {
    // Load policy file
    const policy: Policy = loadPolicy(options.policyPath);

    // Validate schema
    const validation: PolicyValidationResult = validatePolicySchema(policy);

    // Prepare result
    const result: PolicyCheckResult = {
      valid: validation.valid,
      moduleCount: validation.moduleCount,
      errors: validation.errors,
      warnings: validation.warnings,
    };

    // Optionally verify codebase match
    if (options.match && validation.valid) {
      const srcDir = options.srcDir || "src";
      // Cast is safe here because PolicyModule is compatible with MatchableModule
      const matchResults = verifyCodebaseMatch(
        policy.modules as Record<string, MatchableModule>,
        srcDir
      );
      result.matchResults = matchResults;

      // Add warnings for orphan modules
      for (const moduleId of matchResults.orphanModules) {
        result.warnings.push({
          path: `modules.${moduleId}`,
          message: `Module '${moduleId}' has no matching files in ${srcDir}/`,
          code: "no_matching_files",
        });
      }

      // Add warnings for unmapped directories
      for (const dir of matchResults.unmappedDirs) {
        result.warnings.push({
          path: dir,
          message: `Directory '${dir}/' has no corresponding module`,
          code: "no_corresponding_module",
        });
      }
    }

    // Output results
    if (options.json) {
      output.json(result);
    } else {
      displayResults(result, options.match || false);
    }

    // Exit with appropriate code - this function never returns normally
    process.exit(result.valid ? 0 : 1);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const result: PolicyCheckResult = {
      valid: false,
      moduleCount: 0,
      errors: [{ path: "policy", message: errorMessage, code: "load_error" }],
      warnings: [],
    };

    if (options.json) {
      output.json(result);
    } else {
      output.error(`Failed to load policy: ${errorMessage}`);
    }

    process.exit(1);
  }
}

/**
 * Display validation results in human-readable format
 */
function displayResults(result: PolicyCheckResult, matchMode: boolean): void {
  if (result.valid) {
    output.success(`Policy valid: ${result.moduleCount} modules defined`);

    if (result.warnings.length > 0) {
      output.info("");
      for (const warning of result.warnings) {
        output.warn(warning.message);
      }
    }

    if (matchMode && result.matchResults) {
      const { orphanModules, unmappedDirs } = result.matchResults;
      if (orphanModules.length === 0 && unmappedDirs.length === 0) {
        output.success("All modules match codebase structure");
      }
    }
  } else {
    output.error(`Policy invalid: ${result.errors.length} error(s) found`);
    output.info("");

    for (const error of result.errors) {
      output.error(`  ${error.path}: ${error.message}`);
    }

    if (result.warnings.length > 0) {
      output.info("");
      for (const warning of result.warnings) {
        output.warn(`  ${warning.path}: ${warning.message}`);
      }
    }
  }
}
