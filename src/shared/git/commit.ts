/**
 * Git commit detection utility
 *
 * Provides auto-detection of current git commit SHA with fallback handling
 * for edge cases like non-git repositories.
 */

import { execSync } from "child_process";

/**
 * Cache for the current commit to avoid repeated git calls
 */
let commitCache: string | null = null;

/**
 * Get the current git commit SHA (short form)
 *
 * @returns Current git commit SHA (short form, 7 characters), or "unknown" for non-git repos
 *
 * Behavior:
 * - Returns short commit SHA (7 chars) in normal git repository
 * - Returns "unknown" when not in a git repository
 * - Caches result for performance
 *
 * @example
 * ```ts
 * const commit = getCurrentCommit();
 * console.log(`Current commit: ${commit}`);
 * ```
 */
export function getCurrentCommit(): string {
  // Return cached value if available
  if (commitCache !== null) {
    return commitCache;
  }

  try {
    // Execute git command to get short commit hash
    const result = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Cache and return the commit SHA
    commitCache = result;
    return commitCache;
  } catch {
    // Not a git repository or git command failed
    commitCache = "unknown";
    return commitCache;
  }
}

/**
 * Clear the commit cache
 *
 * Useful for testing or when the commit might have changed
 * (e.g., after a new commit)
 */
export function clearCommitCache(): void {
  commitCache = null;
}
