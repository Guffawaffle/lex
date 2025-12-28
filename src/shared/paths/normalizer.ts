/**
 * Path Normalization Utility
 *
 * Provides cross-platform path normalization with security features:
 * - Tilde (~) expansion
 * - Windows environment variable expansion
 * - WSL path conversion
 * - Canonical path resolution
 * - Path traversal validation
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

/**
 * Normalize a path with cross-platform support
 *
 * @param input - Path to normalize (can contain ~, env vars, WSL paths)
 * @param options - Normalization options
 * @returns Absolute, canonical path
 * @throws Error if path traversal is detected outside allowed boundaries
 *
 * Features:
 * - Expands ~ to user home directory
 * - Expands Windows environment variables (%VAR%)
 * - Converts WSL paths (/mnt/c/...) to Windows paths (C:\...)
 * - Resolves relative paths (., ..)
 * - Resolves symlinks to canonical paths
 * - Validates against path traversal attacks
 *
 * @example
 * ```ts
 * const home = normalizePath('~/documents');
 * // => '/home/user/documents'
 *
 * const abs = normalizePath('../parent');
 * // => '/absolute/path/to/parent'
 *
 * const wsl = normalizePath('/mnt/c/Users/name');
 * // => 'C:\\Users\\name' (on WSL)
 * ```
 */
export function normalizePath(
  input: string,
  options: {
    /** Base path for relative path resolution. Defaults to process.cwd() */
    basePath?: string;
    /** Whether to validate against path traversal. Defaults to true */
    validateTraversal?: boolean;
    /** Allowed root path for traversal validation. Defaults to repo root or workspace root */
    allowedRoot?: string;
    /** Whether to resolve symlinks. Defaults to true */
    resolveSymlinks?: boolean;
  } = {}
): string {
  const {
    basePath = process.cwd(),
    validateTraversal = true,
    allowedRoot,
    resolveSymlinks = true,
  } = options;

  let normalized = input;

  // Step 1: Expand tilde to home directory
  if (normalized.startsWith("~/") || normalized === "~") {
    normalized = path.join(os.homedir(), normalized.slice(1));
  }

  // Step 2: Expand Windows environment variables (%VAR%)
  if (process.platform === "win32") {
    normalized = normalized.replace(/%([^%]+)%/g, (_, varName: string) => {
      return process.env[varName] || `%${varName}%`;
    });
  }

  // Step 3: Handle WSL path conversions (/mnt/X/... -> X:\...)
  // Only convert if we're on Linux and the path looks like a WSL mount
  // Note: This conversion should NOT be resolved against basePath
  // as it represents an absolute Windows path
  if (process.platform === "linux" && normalized.startsWith("/mnt/")) {
    const wslMatch = normalized.match(/^\/mnt\/([a-z])(\/.*)?$/);
    if (wslMatch) {
      const driveLetter = wslMatch[1].toUpperCase();
      const pathAfterDrive = wslMatch[2] || "";
      // Convert to Windows path format
      // Return early to avoid further resolution which would make it relative
      const windowsPath = `${driveLetter}:${pathAfterDrive.replace(/\//g, "\\")}`;

      // For WSL paths, we can't validate traversal or resolve symlinks
      // since we're representing Windows paths that may not exist on Linux
      return windowsPath;
    }
  }

  // Step 4: Resolve to absolute path
  let resolved: string;
  if (path.isAbsolute(normalized)) {
    resolved = path.resolve(normalized);
  } else {
    resolved = path.resolve(basePath, normalized);
  }

  // Step 5: Resolve symlinks to canonical path
  if (resolveSymlinks && fs.existsSync(resolved)) {
    try {
      resolved = fs.realpathSync(resolved);
    } catch {
      // If realpath fails, continue with the resolved path
    }
  }

  // Step 6: Validate against path traversal
  if (validateTraversal) {
    const rootToValidate =
      allowedRoot || findRepoRoot() || process.env.LEX_WORKSPACE_ROOT || basePath;
    const normalizedRoot = path.resolve(rootToValidate);

    // Check if resolved path is within the allowed root
    if (!isPathWithin(resolved, normalizedRoot)) {
      throw new Error(
        `Path traversal detected: "${resolved}" is outside allowed root "${normalizedRoot}". ` +
          `To bypass this check, set LEX_APP_ROOT or use validateTraversal: false option.`
      );
    }
  }

  return resolved;
}

/**
 * Check if a path is within an allowed root directory
 *
 * @param targetPath - Path to check
 * @param rootPath - Allowed root path
 * @returns true if targetPath is within rootPath
 */
function isPathWithin(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  // If relative path starts with '..' or is absolute, it's outside the root
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Find the repository root by walking up the directory tree
 *
 * @param startPath - Starting path for the search. Defaults to process.cwd()
 * @returns Repository root path, or null if not found
 *
 * Looks for .git directory as indicator of repository root.
 */
export function findRepoRoot(startPath: string = process.cwd()): string | null {
  let current = path.resolve(startPath);

  while (true) {
    const gitDir = path.join(current, ".git");
    if (fs.existsSync(gitDir)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding .git
      return null;
    }
    current = parent;
  }
}

/**
 * Find the repository root with error handling
 *
 * @param startPath - Starting path for the search. Defaults to process.cwd()
 * @returns Repository root path
 * @throws Error if repository root is not found
 *
 * @example
 * ```ts
 * try {
 *   const root = getRepoRoot();
 *   console.log(`Repository root: ${root}`);
 * } catch (error) {
 *   console.error('Not in a git repository');
 * }
 * ```
 */
export function getRepoRoot(startPath: string = process.cwd()): string {
  const root = findRepoRoot(startPath);

  if (!root) {
    throw new Error(
      "Repository root not found. " +
        "Ensure you are inside a git repository. " +
        "If you need to work outside a repo, set LEX_APP_ROOT explicitly."
    );
  }

  return root;
}

/**
 * Get workspace root from environment or detect from repository
 *
 * @returns Workspace root path
 *
 * Priority:
 * 1. LEX_WORKSPACE_ROOT environment variable
 * 2. Repository root (from .git detection)
 * 3. Current working directory
 */
export function getWorkspaceRoot(): string {
  // Check environment variable first
  if (process.env.LEX_WORKSPACE_ROOT) {
    return path.resolve(process.env.LEX_WORKSPACE_ROOT);
  }

  // Try to find repository root
  const repoRoot = findRepoRoot();
  if (repoRoot) {
    return repoRoot;
  }

  // Fallback to current working directory
  return process.cwd();
}

/**
 * Expand a path that may contain tokens and normalize it
 *
 * This is a convenience function that combines token expansion
 * with path normalization. For full token expansion including
 * date/time tokens, use the expandTokens function from the tokens module.
 *
 * @param input - Path that may contain path-specific tokens like ~
 * @param options - Normalization options
 * @returns Normalized absolute path
 */
export function expandPath(input: string, options?: Parameters<typeof normalizePath>[1]): string {
  return normalizePath(input, options);
}
