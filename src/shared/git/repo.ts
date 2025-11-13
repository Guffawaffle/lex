/**
 * Git repository root detection utility
 *
 * Provides safe repository root detection with fallback to environment variable
 */

import { execSync } from "child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Cache for the repository root to avoid repeated filesystem checks
 */
let repoRootCache: string | null = null;

/**
 * Find the git repository root by walking up the directory tree
 *
 * @param startPath - Starting directory for search (defaults to current working directory)
 * @returns Absolute path to repository root
 * @throws Error if repository root cannot be found
 *
 * Behavior:
 * - Walks up directory tree looking for `.git/` directory
 * - Returns first parent directory containing `.git/`
 * - Throws helpful error if no `.git/` found
 * - Respects `LEX_APP_ROOT` environment variable as override
 * - Caches result for performance
 *
 * @example
 * ```ts
 * const repoRoot = findRepoRoot();
 * console.log(`Repository root: ${repoRoot}`);
 * ```
 *
 * @example
 * ```ts
 * // With custom start path
 * const repoRoot = findRepoRoot('/path/to/nested/dir');
 * ```
 *
 * @example
 * ```ts
 * // With environment override
 * process.env.LEX_APP_ROOT = '/custom/root';
 * const repoRoot = findRepoRoot(); // Returns '/custom/root'
 * ```
 */
export function findRepoRoot(startPath: string = process.cwd()): string {
  // Check for environment variable override first
  if (process.env.LEX_APP_ROOT) {
    return path.resolve(process.env.LEX_APP_ROOT);
  }

  // Return cached value if available and start path is cwd
  if (repoRootCache !== null && startPath === process.cwd()) {
    return repoRootCache;
  }

  let current = path.resolve(startPath);

  while (true) {
    const gitDir = path.join(current, ".git");

    if (fs.existsSync(gitDir)) {
      // Cache result if we started from cwd
      if (startPath === process.cwd()) {
        repoRootCache = current;
      }
      return current;
    }

    const parent = path.dirname(current);

    // Reached filesystem root without finding .git/
    if (parent === current) {
      throw new Error(
        "Repository root not found. " +
          "Ensure you are inside a git repository. " +
          "If you need to work outside a repo, set LEX_APP_ROOT explicitly.",
      );
    }

    current = parent;
  }
}

/**
 * Get the current git commit SHA (short form)
 *
 * @returns Short commit SHA (7 characters) or 'unknown' if not in a git repo
 *
 * @example
 * ```ts
 * const commit = getCurrentCommit();
 * console.log(`Current commit: ${commit}`); // e.g., "a1b2c3d"
 * ```
 */
export function getCurrentCommit(): string {
  try {
    const result = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result;
  } catch (error) {
    return "unknown";
  }
}

/**
 * Clear the repository root cache
 *
 * Useful for testing or when the repository structure might have changed
 */
export function clearRepoRootCache(): void {
  repoRootCache = null;
}
