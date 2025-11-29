/**
 * Canonical Instruction Loader
 *
 * Reads the canonical instruction source file from `.smartergpt/instructions/lex.md`
 * (or a custom path from config) and prepares it for projection.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { LexYaml } from "../config/lex-yaml-schema.js";

/**
 * Default path for canonical instruction file (relative to repo root)
 */
const DEFAULT_CANONICAL_PATH = ".smartergpt/instructions/lex.md";

/**
 * Result of loading canonical instructions
 */
export interface CanonicalResult {
  /** Raw content of the canonical instruction file */
  content: string;
  /** Absolute path to the canonical file */
  path: string;
  /** Whether the file exists */
  exists: boolean;
  /** SHA-256 hash of the content for idempotency checking */
  hash: string;
}

/**
 * Load canonical instruction content from the repository
 *
 * @param repoRoot - Absolute path to the repository root
 * @param config - Optional LexYaml config to override default path
 * @returns CanonicalResult with content, path, existence, and hash
 *
 * @example
 * ```ts
 * const result = loadCanonicalInstructions('/path/to/repo');
 * if (result.exists) {
 *   console.log("Content hash:", result.hash);
 *   console.log("Content:", result.content);
 * } else {
 *   console.log("No canonical file at:", result.path);
 * }
 * ```
 */
export function loadCanonicalInstructions(repoRoot: string, config?: LexYaml): CanonicalResult {
  // Determine canonical path from config or use default
  const relativePath = config?.instructions?.canonical ?? DEFAULT_CANONICAL_PATH;
  const absolutePath = path.join(repoRoot, relativePath);

  // Check if file exists
  if (!isFile(absolutePath)) {
    return {
      content: "",
      path: absolutePath,
      exists: false,
      hash: computeHash(""),
    };
  }

  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    // File exists but can't be read - treat as non-existent
    return {
      content: "",
      path: absolutePath,
      exists: false,
      hash: computeHash(""),
    };
  }

  return {
    content,
    path: absolutePath,
    exists: true,
    hash: computeHash(content),
  };
}

/**
 * Compute SHA-256 hash of content for idempotency checking
 *
 * @param content - String content to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Check if a path exists and is a file
 */
function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Get the default canonical instruction path
 *
 * @returns The default relative path for canonical instructions
 */
export function getDefaultCanonicalPath(): string {
  return DEFAULT_CANONICAL_PATH;
}
