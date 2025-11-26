/**
 * Git runtime mode control
 *
 * Provides centralized feature flag for controlling git command execution.
 * This module manages whether git operations should be executed (live mode)
 * or skipped (off mode).
 */

/**
 * Git execution mode
 * - 'off': Git commands are not executed (default, safe for non-git environments)
 * - 'live': Git commands are executed normally
 */
export type GitMode = "off" | "live";

/**
 * Current git execution mode
 * Initialized from LEX_GIT_MODE environment variable, defaults to 'off'
 */
let currentMode: GitMode = (process.env.LEX_GIT_MODE as GitMode) || "off";

/**
 * Get the current git execution mode
 *
 * @returns Current git mode ('off' or 'live')
 *
 * @example
 * ```ts
 * const mode = getGitMode();
 * console.log(`Git mode: ${mode}`); // 'off' or 'live'
 * ```
 */
export function getGitMode(): GitMode {
  return currentMode;
}

/**
 * Set the git execution mode
 *
 * Allows runtime modification of git behavior.
 * Useful for testing or dynamic environment configuration.
 *
 * @param mode - The git mode to set ('off' or 'live')
 *
 * @example
 * ```ts
 * setGitMode('live'); // Enable git commands
 * setGitMode('off');  // Disable git commands
 * ```
 */
export function setGitMode(mode: GitMode): void {
  currentMode = mode;
}

/**
 * Check if git commands are enabled
 *
 * Convenience function for checking if git operations should be executed.
 *
 * @returns true if git mode is 'live', false otherwise
 *
 * @example
 * ```ts
 * if (gitIsEnabled()) {
 *   // Execute git commands
 *   execSync('git status');
 * } else {
 *   // Skip git operations
 *   console.log('Git is disabled');
 * }
 * ```
 */
export function gitIsEnabled(): boolean {
  return currentMode === "live";
}

/**
 * Get the default git branch from environment variables
 *
 * Checks LEX_DEFAULT_BRANCH first, then falls back to LEX_BRANCH.
 * Returns undefined if neither is set.
 *
 * @returns The branch name from environment, or undefined
 *
 * @example
 * ```ts
 * const branch = getEnvBranch();
 * if (branch) {
 *   console.log(`Using branch: ${branch}`);
 * }
 * ```
 */
export function getEnvBranch(): string | undefined {
  return process.env.LEX_DEFAULT_BRANCH || process.env.LEX_BRANCH || undefined;
}

/**
 * Get the default git commit from environment variables
 *
 * Checks LEX_DEFAULT_COMMIT first, then falls back to LEX_COMMIT.
 * Returns undefined if neither is set.
 *
 * @returns The commit SHA from environment, or undefined
 *
 * @example
 * ```ts
 * const commit = getEnvCommit();
 * if (commit) {
 *   console.log(`Using commit: ${commit}`);
 * }
 * ```
 */
export function getEnvCommit(): string | undefined {
  return process.env.LEX_DEFAULT_COMMIT || process.env.LEX_COMMIT || undefined;
}
