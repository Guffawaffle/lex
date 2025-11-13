/**
 * Path normalization and validation utilities
 *
 * Provides cross-platform path handling with security validation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findRepoRoot } from "../git/repo.js";

/**
 * Options for path normalization
 */
export interface NormalizePathOptions {
  /**
   * Whether to validate that the path stays within the workspace
   * @default true
   */
  validateTraversal?: boolean;

  /**
   * Base path for traversal validation (defaults to repo root)
   */
  basePath?: string;
}

/**
 * Normalize a path with cross-platform support and security validation
 *
 * @param input - Path to normalize (may contain `~`, env vars, WSL paths)
 * @param options - Normalization options
 * @returns Absolute, canonicalized path
 * @throws Error if path traversal is detected (when validateTraversal is true)
 *
 * Features:
 * - Expands `~` to user home directory
 * - Expands Windows environment variables (e.g., `%LOCALAPPDATA%`)
 * - Handles WSL paths (`/mnt/c/...`) as valid Unix paths
 * - Resolves `.`, `..`, and symlinks to canonical absolute path
 * - Validates against path traversal outside workspace
 *
 * @example
 * ```ts
 * // Expand tilde
 * normalizePath('~/documents/file.txt')
 * // Returns: '/home/user/documents/file.txt'
 *
 * // Windows env var (on Windows)
 * normalizePath('%LOCALAPPDATA%\\MyApp\\config.json')
 * // Returns: 'C:\\Users\\user\\AppData\\Local\\MyApp\\config.json'
 *
 * // WSL path (on Linux - treated as valid Unix path)
 * normalizePath('/mnt/c/Users/user/file.txt')
 * // Returns: '/mnt/c/Users/user/file.txt'
 *
 * // Resolve relative paths
 * normalizePath('../sibling/file.txt')
 * // Returns: absolute path to sibling directory
 * ```
 */
export function normalizePath(input: string, options: NormalizePathOptions = {}): string {
  const { validateTraversal = true, basePath } = options;

  let result = input;

  // 1. Expand tilde
  if (result.startsWith("~")) {
    result = path.join(os.homedir(), result.slice(1));
  }

  // 2. Expand Windows environment variables
  if (process.platform === "win32") {
    result = result.replace(/%([^%]+)%/g, (_, name) => process.env[name] || "");
  }

  // 3. Handle WSL paths (keep as Unix paths on Linux, they're valid)
  // Note: WSL path conversion to Windows format is only useful when running
  // on WSL and the path needs to be used by Windows tools. For now, we keep
  // them as-is since they're valid Unix paths.
  // Future: Add explicit WSL-to-Windows conversion via option flag if needed

  // 4. Resolve to absolute, canonical path
  let resolved: string;
  try {
    // Try to get real path (resolves symlinks)
    resolved = fs.realpathSync(result);
  } catch (error) {
    // If file doesn't exist yet, just resolve relative paths
    resolved = path.resolve(result);
  }

  // 5. Validate against path traversal
  if (validateTraversal) {
    const base = basePath || findRepoRoot();
    const normalizedBase = path.resolve(base);

    if (!resolved.startsWith(normalizedBase)) {
      throw new Error(
        `Path traversal detected: ${resolved} is outside workspace ${normalizedBase}`,
      );
    }
  }

  return resolved;
}

/**
 * Normalize multiple paths
 *
 * @param paths - Array of paths to normalize
 * @param options - Normalization options applied to all paths
 * @returns Array of normalized paths
 *
 * @example
 * ```ts
 * normalizePaths(['~/config.json', './data.db'])
 * // Returns: ['/home/user/config.json', '/abs/path/to/data.db']
 * ```
 */
export function normalizePaths(
  paths: string[],
  options: NormalizePathOptions = {},
): string[] {
  return paths.map((p) => normalizePath(p, options));
}

/**
 * Check if a path is within a base directory (no path traversal)
 *
 * @param targetPath - Path to check
 * @param basePath - Base directory path
 * @returns True if target is within base directory
 *
 * @example
 * ```ts
 * isWithinBase('/home/user/project/src/file.ts', '/home/user/project')
 * // Returns: true
 *
 * isWithinBase('/etc/passwd', '/home/user/project')
 * // Returns: false
 * ```
 */
export function isWithinBase(targetPath: string, basePath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(basePath);

  return normalizedTarget.startsWith(normalizedBase);
}
