/**
 * Git branch detection utility
 *
 * Provides auto-detection of current git branch with fallback handling
 * for edge cases like detached HEAD and non-git repositories.
 *
 * IMPORTANT: Uses spawnSync instead of execSync to avoid WSL2 TTY/GPG hangs.
 * execSync spawns a shell which can get into weird states on WSL2.
 */

import { spawnSync } from "child_process";

/**
 * Cache for the current branch to avoid repeated git calls
 */
let branchCache: string | null = null;

/**
 * Get the current git branch name
 *
 * @returns Current git branch name, or fallback value for edge cases
 *
 * Behavior:
 * - Returns current branch name in normal git repository
 * - Returns "detached" when HEAD is detached
 * - Returns "unknown" when not in a git repository
 * - Respects LEX_DEFAULT_BRANCH environment variable as override
 * - Respects LEX_GIT_MODE=off to skip git calls entirely
 * - Caches result for performance
 *
 * @example
 * ```ts
 * const branch = getCurrentBranch();
 * console.log(`Current branch: ${branch}`);
 * ```
 */
export function getCurrentBranch(): string {
  // Check for environment variable override first
  if (process.env.LEX_DEFAULT_BRANCH) {
    return process.env.LEX_DEFAULT_BRANCH;
  }

  // Skip git calls entirely if LEX_GIT_MODE=off
  if (process.env.LEX_GIT_MODE === "off") {
    return "unknown";
  }

  // Return cached value if available
  if (branchCache !== null) {
    return branchCache;
  }

  try {
    // Use spawnSync to avoid shell - prevents WSL2 TTY/GPG hangs
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.error || result.status !== 0) {
      branchCache = "unknown";
      return branchCache;
    }

    const branch = (result.stdout || "").trim();

    // Check for detached HEAD state
    if (branch === "HEAD") {
      branchCache = "detached";
      return branchCache;
    }

    // Cache and return the branch name
    branchCache = branch;
    return branchCache;
  } catch {
    // Not a git repository or git command failed
    branchCache = "unknown";
    return branchCache;
  }
}

/**
 * Clear the branch cache
 *
 * Useful for testing or when the branch might have changed
 * (e.g., after a checkout operation)
 */
export function clearBranchCache(): void {
  branchCache = null;
}
