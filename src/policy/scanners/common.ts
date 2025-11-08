/**
 * Common utilities for LexMap scanners
 *
 * Shared path matching, module resolution, and glob pattern utilities
 * used by TypeScript, Python, and PHP scanners.
 */

import { minimatch } from "minimatch";
import * as path from "path";

/**
 * Policy module definition (subset needed for scanners)
 */
export interface PolicyModule {
  owns_paths?: string[];
  owns_namespaces?: string[];
  coords?: [number, number];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
  notes?: string;
}

/**
 * Policy file structure
 */
export interface Policy {
  modules: Record<string, PolicyModule>;
}

/**
 * Module call edge (represents cross-module dependency)
 */
export interface ModuleEdge {
  from_module: string;
  to_module: string;
  from_file: string;
  import_statement: string;
}

/**
 * Check if a file path matches any of the owns_paths glob patterns
 *
 * @param filePath - Relative file path to check
 * @param ownsPathsPatterns - Array of glob patterns from module's owns_paths
 * @returns true if the file matches any pattern
 */
export function matchesOwnsPaths(filePath: string, ownsPathsPatterns: string[]): boolean {
  if (!ownsPathsPatterns || ownsPathsPatterns.length === 0) {
    return false;
  }

  // Normalize the file path to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, "/");

  for (const pattern of ownsPathsPatterns) {
    // Normalize pattern to use forward slashes
    const normalizedPattern = pattern.replace(/\\/g, "/");

    if (minimatch(normalizedPath, normalizedPattern, { dot: true })) {
      return true;
    }
  }

  return false;
}

/**
 * Find which module owns a given file path
 *
 * @param filePath - Relative file path to resolve
 * @param policy - The loaded policy configuration
 * @returns Module ID if found, undefined otherwise
 */
export function resolveFileToModule(filePath: string, policy: Policy): string | undefined {
  for (const [moduleId, moduleConfig] of Object.entries(policy.modules)) {
    if (moduleConfig.owns_paths && matchesOwnsPaths(filePath, moduleConfig.owns_paths)) {
      return moduleId;
    }
  }
  return undefined;
}

/**
 * Resolve an import path to a module
 *
 * This is a simplified heuristic - scanners are "dumb" and just match imports
 * to file paths that might belong to modules.
 *
 * @param importPath - The import/require path (e.g., './other', '../services/auth')
 * @param currentFilePath - The file doing the importing
 * @param policy - The loaded policy configuration
 * @returns Module ID if the import can be resolved to a known module
 */
export function resolveImportToModule(
  importPath: string,
  currentFilePath: string,
  policy: Policy
): string | undefined {
  // Relative imports: resolve relative to current file
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const currentDir = path.dirname(currentFilePath);
    let resolvedPath = path.join(currentDir, importPath);

    // Normalize path separators
    resolvedPath = resolvedPath.replace(/\\/g, "/");

    // Try with common extensions
    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".py", ".php"];
    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext;
      const moduleId = resolveFileToModule(pathWithExt, policy);
      if (moduleId) {
        return moduleId;
      }

      // Try index files
      const indexPath = path.join(resolvedPath, "index" + ext).replace(/\\/g, "/");
      const indexModuleId = resolveFileToModule(indexPath, policy);
      if (indexModuleId) {
        return indexModuleId;
      }
    }
  }

  // Absolute/package imports: check if any module owns_paths matches
  // For example, import from '@/services/auth' or 'services/auth'
  const normalizedImport = importPath.replace(/^@\//, "");

  for (const [moduleId, moduleConfig] of Object.entries(policy.modules)) {
    if (moduleConfig.owns_paths) {
      for (const ownPath of moduleConfig.owns_paths) {
        // Check if import path starts with the module's path prefix
        const pathPrefix = ownPath.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
        if (normalizedImport.startsWith(pathPrefix)) {
          return moduleId;
        }
      }
    }
  }

  return undefined;
}

/**
 * Detect feature flag checks in code using common patterns
 *
 * Patterns detected (case-sensitive):
 * - flags.flag_name
 * - flags['flag_name']
 * - featureFlags.isEnabled('flag_name')
 * - FeatureFlags.enabled('flag_name')
 * - useFeatureFlag('flag_name')
 *
 * @param content - Source code content
 * @returns Array of detected flag names
 */
export function detectFeatureFlags(content: string): string[] {
  const flags = new Set<string>();

  // Pattern: flags.flag_name (property access)
  const pattern1 = /flags\.(\w+)/g;
  let match;
  while ((match = pattern1.exec(content)) !== null) {
    // Skip if it looks like a method call (e.g., flags.isEnabled)
    if (!content.substring(match.index + match[0].length).match(/^\s*\(/)) {
      flags.add(match[1]);
    }
  }

  // Pattern: flags['flag_name'] or flags["flag_name"]
  const pattern2 = /flags\[['"](\w+)['"]\]/g;
  while ((match = pattern2.exec(content)) !== null) {
    flags.add(match[1]);
  }

  // Pattern: featureFlags.isEnabled('flag_name')
  const pattern3 = /featureFlags\.isEnabled\(['"](\w+)['"]\)/g;
  while ((match = pattern3.exec(content)) !== null) {
    flags.add(match[1]);
  }

  // Pattern: FeatureFlags.enabled('flag_name')
  const pattern4 = /FeatureFlags\.enabled\(['"](\w+)['"]\)/g;
  while ((match = pattern4.exec(content)) !== null) {
    flags.add(match[1]);
  }

  // Pattern: useFeatureFlag('flag_name')
  const pattern5 = /useFeatureFlag\(['"](\w+)['"]\)/g;
  while ((match = pattern5.exec(content)) !== null) {
    flags.add(match[1]);
  }

  return Array.from(flags).sort();
}

/**
 * Detect permission checks in code using common patterns
 *
 * Patterns detected:
 * - user.can('permission_name')
 * - hasPermission('permission_name')
 * - usePermission('permission_name')
 * - checkPermission('permission_name')
 *
 * @param content - Source code content
 * @returns Array of detected permission names
 */
export function detectPermissions(content: string): string[] {
  const permissions = new Set<string>();

  // Pattern: user.can('permission_name') or $user->can('permission_name')
  const pattern1 = /(?:user|User|\$user)(?:\.|->)can\(['"](\w+)['"]\)/g;
  let match;
  while ((match = pattern1.exec(content)) !== null) {
    permissions.add(match[1]);
  }

  // Pattern: hasPermission('permission_name')
  const pattern2 = /hasPermission\(['"](\w+)['"]\)/g;
  while ((match = pattern2.exec(content)) !== null) {
    permissions.add(match[1]);
  }

  // Pattern: usePermission('permission_name')
  const pattern3 = /usePermission\(['"](\w+)['"]\)/g;
  while ((match = pattern3.exec(content)) !== null) {
    permissions.add(match[1]);
  }

  // Pattern: checkPermission('permission_name')
  const pattern4 = /checkPermission\(['"](\w+)['"]\)/g;
  while ((match = pattern4.exec(content)) !== null) {
    permissions.add(match[1]);
  }

  return Array.from(permissions).sort();
}
