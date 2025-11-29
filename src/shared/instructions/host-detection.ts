/**
 * Host Detection Module
 *
 * Determines which IDE/host targets are available in a repository
 * based on the presence of specific configuration files or directories.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Information about a detected host target
 */
export interface HostTarget {
  /** Whether this host target is available in the repository */
  available: boolean;
  /** Path to the instructions file if available, null otherwise */
  path: string | null;
}

/**
 * Result of host detection containing information about all supported hosts
 */
export interface HostDetectionResult {
  /** GitHub Copilot host detection result */
  copilot: HostTarget;
  /** Cursor IDE host detection result */
  cursor: HostTarget;
}

/**
 * Detect available IDE/host targets in a repository
 *
 * Detection rules per contract:
 * - **Copilot**: `.github/` directory exists → target `.github/copilot-instructions.md`
 * - **Cursor**: `.cursorrules` file exists → target `.cursorrules`
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Detection result for all supported hosts
 *
 * @example
 * ```ts
 * const result = detectAvailableHosts('/path/to/repo');
 * if (result.copilot.available) {
 *   console.log(`Copilot instructions at: ${result.copilot.path}`);
 * }
 * ```
 */
export function detectAvailableHosts(repoRoot: string): HostDetectionResult {
  // Detect Copilot: .github/ directory must exist
  const githubDir = path.join(repoRoot, ".github");
  const copilotInstructionsPath = path.join(githubDir, "copilot-instructions.md");
  const copilotAvailable = isDirectory(githubDir);

  // Detect Cursor: .cursorrules file must exist
  const cursorRulesPath = path.join(repoRoot, ".cursorrules");
  const cursorAvailable = isFile(cursorRulesPath);

  return {
    copilot: {
      available: copilotAvailable,
      path: copilotAvailable ? copilotInstructionsPath : null,
    },
    cursor: {
      available: cursorAvailable,
      path: cursorAvailable ? cursorRulesPath : null,
    },
  };
}

/**
 * Check if a path exists and is a directory
 * Handles race conditions by catching errors from statSync
 */
function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a file
 * Handles race conditions by catching errors from statSync
 */
function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
