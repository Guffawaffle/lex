/**
 * Canonical Instruction Loader
 *
 * Reads the canonical instruction source from `.smartergpt/instructions/lex.md`
 * or a custom path specified in the LexYaml configuration.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { LexYaml } from "../config/lex-yaml-schema.js";

/**
 * Default path to the canonical instructions file
 */
export const DEFAULT_CANONICAL_PATH = ".smartergpt/instructions/lex.md";

/**
 * Result of loading canonical instructions
 */
export interface CanonicalResult {
  /** The content of the canonical instructions file */
  content: string;
  /** Absolute path to the canonical instructions file */
  path: string;
  /** Whether the file exists */
  exists: boolean;
  /** SHA-256 hash of the content (empty string if file doesn't exist) */
  hash: string;
}

/**
 * Load canonical instructions from the repository
 *
 * This is a pure function that reads the canonical instruction file and returns
 * its content along with metadata. If the file doesn't exist, returns an empty
 * result with exists: false.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param config - Optional LexYaml configuration (uses default path if not provided)
 * @returns CanonicalResult containing content, path, exists flag, and content hash
 *
 * @example
 * ```ts
 * // Using default path
 * const result = loadCanonicalInstructions('/path/to/repo');
 * if (result.exists) {
 *   console.log(`Content hash: ${result.hash}`);
 * }
 *
 * // Using custom path from config
 * const config = { version: 1, instructions: { canonical: 'custom/path.md' } };
 * const result = loadCanonicalInstructions('/path/to/repo', config);
 * ```
 */
export function loadCanonicalInstructions(repoRoot: string, config?: LexYaml): CanonicalResult {
  // Determine the canonical path from config or use default
  const canonicalPath = config?.instructions?.canonical ?? DEFAULT_CANONICAL_PATH;

  // Resolve to absolute path
  const absolutePath = path.isAbsolute(canonicalPath)
    ? canonicalPath
    : path.join(repoRoot, canonicalPath);

  // Try to read the file
  try {
    const content = fs.readFileSync(absolutePath, "utf-8");
    const hash = computeHash(content);

    return {
      content,
      path: absolutePath,
      exists: true,
      hash,
    };
  } catch (error) {
    // File doesn't exist or can't be read
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        content: "",
        path: absolutePath,
        exists: false,
        hash: "",
      };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Compute SHA-256 hash of content
 *
 * @param content - String content to hash
 * @returns Hexadecimal SHA-256 hash
 */
function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Type guard for Node.js errors with code property
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
