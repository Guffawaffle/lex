/**
 * lex.yaml Discovery Module
 *
 * Finds lex.yaml in the filesystem by walking up from a starting directory.
 * Graceful degradation: returns null when not found, not an error.
 *
 * @module lex-yaml/discovery
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Default filename to search for */
export const LEX_YAML_FILENAME = "lex.yaml";

/** Alternative filename (future-proof) */
export const LEX_YAML_ALT_FILENAME = ".lex.yaml";

/**
 * Check if lex.yaml exists in a directory.
 * @param dir - Directory to check (absolute path)
 * @returns true if lex.yaml exists
 */
export function hasLexYaml(dir: string): boolean {
  const primary = path.join(dir, LEX_YAML_FILENAME);
  const alt = path.join(dir, LEX_YAML_ALT_FILENAME);
  return fs.existsSync(primary) || fs.existsSync(alt);
}

/**
 * Get the path to lex.yaml in a directory if it exists.
 * @param dir - Directory to check (absolute path)
 * @returns Path to lex.yaml, or null if not found
 */
export function getLexYamlPath(dir: string): string | null {
  const primary = path.join(dir, LEX_YAML_FILENAME);
  if (fs.existsSync(primary)) {
    return primary;
  }
  const alt = path.join(dir, LEX_YAML_ALT_FILENAME);
  if (fs.existsSync(alt)) {
    return alt;
  }
  return null;
}

/**
 * Find lex.yaml by walking up from a starting directory.
 *
 * @param startDir - Directory to start from (defaults to process.cwd())
 * @param maxDepth - Maximum parent directories to traverse (default: 10)
 * @returns Absolute path to lex.yaml, or null if not found
 *
 * @example
 * ```ts
 * const configPath = findLexYaml();
 * if (configPath) {
 *   console.log(`Found lex.yaml at ${configPath}`);
 * } else {
 *   console.log("No lex.yaml found - using defaults");
 * }
 * ```
 */
export function findLexYaml(startDir?: string, maxDepth = 10): string | null {
  let currentDir = path.resolve(startDir ?? process.cwd());
  let depth = 0;

  while (depth < maxDepth) {
    const lexYamlPath = getLexYamlPath(currentDir);
    if (lexYamlPath) {
      return lexYamlPath;
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    // Check if we've reached the root
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
    depth++;
  }

  return null;
}

/**
 * Find the repo root by looking for common markers.
 * Useful for determining where lex.yaml should be placed.
 *
 * @param startDir - Directory to start from
 * @returns Absolute path to repo root, or null if not found
 */
export function findRepoRoot(startDir?: string): string | null {
  const markers = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"];
  let currentDir = path.resolve(startDir ?? process.cwd());
  let depth = 0;
  const maxDepth = 10;

  while (depth < maxDepth) {
    for (const marker of markers) {
      const markerPath = path.join(currentDir, marker);
      if (fs.existsSync(markerPath)) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
    depth++;
  }

  return null;
}

/**
 * Result of discovery operation with metadata.
 */
export interface DiscoveryResult {
  /** Absolute path to lex.yaml, or null if not found */
  path: string | null;
  /** Directory containing lex.yaml (repo root) */
  rootDir: string | null;
  /** Whether lex.yaml was found */
  found: boolean;
}

/**
 * Discover lex.yaml with full metadata.
 *
 * @param startDir - Directory to start from
 * @returns Discovery result with path and metadata
 */
export function discoverLexYaml(startDir?: string): DiscoveryResult {
  const lexYamlPath = findLexYaml(startDir);

  if (lexYamlPath) {
    return {
      path: lexYamlPath,
      rootDir: path.dirname(lexYamlPath),
      found: true,
    };
  }

  return {
    path: null,
    rootDir: findRepoRoot(startDir),
    found: false,
  };
}
