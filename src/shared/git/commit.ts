/**
 * Git commit detection utility
 *
 * Provides auto-detection of current git commit SHA with fallback handling
 * for edge cases like non-git repositories.
 *
 * IMPORTANT: Uses spawnSync instead of execSync to avoid WSL2 TTY/GPG hangs.
 * execSync spawns a shell which can get into weird states on WSL2.
 */

import { spawnSync } from "child_process";

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
 * - Respects LEX_DEFAULT_COMMIT environment variable as override
 * - Respects LEX_GIT_MODE=off to skip git calls entirely
 * - Caches result for performance
 *
 * @example
 * ```ts
 * const commit = getCurrentCommit();
 * console.log(`Current commit: ${commit}`);
 * ```
 */
export function getCurrentCommit(): string {
  // Check for environment variable override first
  if (process.env.LEX_DEFAULT_COMMIT) {
    return process.env.LEX_DEFAULT_COMMIT;
  }

  // Skip git calls entirely if LEX_GIT_MODE=off
  if (process.env.LEX_GIT_MODE === "off") {
    return "unknown";
  }

  // Return cached value if available
  if (commitCache !== null) {
    return commitCache;
  }

  try {
    // Use spawnSync to avoid shell - prevents WSL2 TTY/GPG hangs
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.error || result.status !== 0) {
      commitCache = "unknown";
      return commitCache;
    }

    // Cache and return the commit SHA
    commitCache = (result.stdout || "").trim();
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
