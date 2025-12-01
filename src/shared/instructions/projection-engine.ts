/**
 * Projection Engine for Lex Instructions
 *
 * Transforms canonical instruction content into host-specific files.
 * Pure transformation - no file I/O operations.
 */

import * as fs from "node:fs";
import { CanonicalResult } from "./canonical-loader.js";
import { HostDetectionResult } from "./host-detection.js";
import { wrapWithMarkers, replaceMarkedContent } from "./markers.js";
import { LexYaml } from "../config/lex-yaml-schema.js";

/**
 * Supported host types for projection
 */
export type HostType = "copilot" | "cursor";

/**
 * Configuration input for the projection engine
 */
export interface ProjectionConfig {
  /** Loaded canonical instruction content */
  canonical: CanonicalResult;
  /** Detected host targets in the repository */
  hosts: HostDetectionResult;
  /** Lex configuration with projection settings */
  config: LexYaml;
  /** Function to read existing file content (for determining action). If not provided, assumes files don't exist. */
  readFile?: (path: string) => string | null;
}

/**
 * Action to take for a projection
 * - create: File doesn't exist, will be created
 * - update: File exists, will be updated with new content
 * - skip: No action needed (content unchanged or host disabled)
 */
export type ProjectionAction = "create" | "update" | "skip";

/**
 * Result of projecting to a specific host
 */
export interface ProjectionResult {
  /** Target host type */
  host: HostType;
  /** Absolute path to the target file */
  path: string;
  /** Generated content for the file */
  content: string;
  /** Action to take */
  action: ProjectionAction;
}

/**
 * Generate projections for all enabled and available hosts
 *
 * This is a pure transformation function - it does not perform file I/O.
 * The caller is responsible for writing the generated content to files.
 *
 * @param config - Projection configuration with canonical content, hosts, and settings
 * @returns Array of projection results for each applicable host
 *
 * @example
 * ```ts
 * const projections = generateProjections({
 *   canonical: loadCanonicalInstructions(repoRoot),
 *   hosts: detectAvailableHosts(repoRoot),
 *   config: { version: 1 },
 *   readFile: (path) => fs.existsSync(path) ? fs.readFileSync(path, 'utf-8') : null
 * });
 *
 * for (const proj of projections) {
 *   if (proj.action !== 'skip') {
 *     fs.writeFileSync(proj.path, proj.content);
 *   }
 * }
 * ```
 */
export function generateProjections(config: ProjectionConfig): ProjectionResult[] {
  const { canonical, hosts, config: lexConfig, readFile } = config;
  const results: ProjectionResult[] = [];

  // If no canonical content exists, skip all projections
  if (!canonical.exists || !canonical.content) {
    return results;
  }

  // Get projection settings from config (defaults: both enabled)
  const projectionSettings = lexConfig.instructions?.projections ?? {
    copilot: true,
    cursor: true,
  };

  // Process Copilot projection
  if (hosts.copilot.available && projectionSettings.copilot && hosts.copilot.path) {
    const projection = createProjection(
      "copilot",
      hosts.copilot.path,
      canonical.content,
      readFile
    );
    results.push(projection);
  }

  // Process Cursor projection
  if (hosts.cursor.available && projectionSettings.cursor && hosts.cursor.path) {
    const projection = createProjection("cursor", hosts.cursor.path, canonical.content, readFile);
    results.push(projection);
  }

  return results;
}

/**
 * Create a single projection result for a host
 *
 * @param host - Target host type
 * @param targetPath - Path to the target file
 * @param canonicalContent - Raw canonical instruction content
 * @param readFile - Function to read existing file content
 * @returns ProjectionResult with appropriate action
 */
function createProjection(
  host: HostType,
  targetPath: string,
  canonicalContent: string,
  readFile?: (path: string) => string | null
): ProjectionResult {
  // Read existing file content if reader is provided
  const existingContent = readFile ? readFile(targetPath) : null;

  // If file doesn't exist, create it with wrapped content
  if (existingContent === null) {
    return {
      host,
      path: targetPath,
      content: wrapWithMarkers(canonicalContent) + "\n",
      action: "create",
    };
  }

  // File exists - check if update is needed
  const newContent = replaceMarkedContent(existingContent, canonicalContent);

  // Check if content would actually change (idempotency)
  if (normalizeForComparison(newContent) === normalizeForComparison(existingContent)) {
    return {
      host,
      path: targetPath,
      content: existingContent,
      action: "skip",
    };
  }

  return {
    host,
    path: targetPath,
    content: newContent,
    action: "update",
  };
}

/**
 * Normalize content for comparison to determine if update is needed
 * Trims trailing whitespace and normalizes line endings
 */
function normalizeForComparison(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

/**
 * Default file reader implementation using Node.js fs
 *
 * @param path - Path to read
 * @returns File content or null if file doesn't exist or can't be read
 */
export function defaultFileReader(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}
