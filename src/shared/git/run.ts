/**
 * Git command wrapper utility
 *
 * Provides a safe wrapper for executing git commands with automatic GPG signing
 * disabled by default to prevent interactive prompts that hang the test runner.
 */

import { spawnSync, type SpawnSyncOptions } from "child_process";

/**
 * Options for running git commands
 */
export interface GitRunOptions {
  /**
   * Working directory for the git command
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Whether to disable GPG signing for commits
   * @default true
   */
  disableGpg?: boolean;
}

/**
 * Execute a git command with safe defaults
 *
 * @param args - Git command arguments (e.g., ['--version'], ['status'])
 * @param opts - Options for command execution
 * @returns Trimmed stdout from the git command
 * @throws Error if the git command fails or returns non-zero exit code
 *
 * @security This function uses spawnSync with an array of arguments, which is safer
 * than shell execution. However, callers must validate any user-provided inputs
 * before passing them as arguments to prevent command injection via git subcommands.
 * Never pass unsanitized user input directly to this function.
 *
 * @example
 * ```ts
 * // Get git version
 * const version = runGit(['--version']);
 * console.log(version); // "git version 2.39.0"
 *
 * // Get current branch
 * const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
 * console.log(branch); // "main"
 *
 * // Run in specific directory
 * const status = runGit(['status', '--short'], { cwd: '/path/to/repo' });
 * ```
 */
export function runGit(args: string[], opts: GitRunOptions = {}): string {
  const { cwd, disableGpg = true } = opts;

  // Prepend GPG config to disable signing if requested
  const gpgArgs = disableGpg ? ["-c", "commit.gpgSign=false"] : [];

  const result = spawnSync("git", [...gpgArgs, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  } as SpawnSyncOptions);

  // Handle spawn errors (e.g., git not found)
  if (result.error) {
    throw result.error;
  }

  // Handle non-zero exit codes
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const commandName = args.length > 0 ? args[0] : "command";
    const errorMessage = stderr || `git ${commandName} failed with status ${result.status}`;
    throw new Error(errorMessage);
  }

  return String(result.stdout || "").trim();
}
