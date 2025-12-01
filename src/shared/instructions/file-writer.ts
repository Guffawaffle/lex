/**
 * File Writer with Atomic Writes
 *
 * Writes projection results to disk with atomic operations,
 * backup support, and directory creation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Result of a projection operation
 * Represents content to be written to a target file
 */
export interface ProjectionResult {
  /** Target file path (absolute or relative) */
  path: string;
  /** Content to write */
  content: string;
}

/**
 * Options for writing projections
 */
export interface WriteOptions {
  /** When true, report what would be done without making changes */
  dryRun: boolean;
  /** When true, create .bak file before overwriting existing files */
  backup: boolean;
}

/**
 * Error information for a failed write operation
 */
export interface WriteError {
  /** Path that failed to write */
  path: string;
  /** Human-readable error message */
  error: string;
}

/**
 * Result of a write operation
 */
export interface WriteResult {
  /** Whether all write operations completed successfully */
  success: boolean;
  /** Paths that were successfully written */
  written: string[];
  /** Paths that were skipped (e.g., content unchanged) */
  skipped: string[];
  /** Errors encountered during write operations */
  errors: WriteError[];
}

/**
 * Write projection results to disk with atomic operations
 *
 * Features:
 * - Atomic writes: content is written to a temp file first, then renamed
 * - Backup support: creates .bak files before overwriting
 * - Directory creation: creates parent directories as needed
 * - Dry-run mode: reports what would be done without making changes
 * - Content comparison: skips unchanged files
 *
 * @param projections - Array of projection results to write
 * @param options - Write options (dryRun, backup)
 * @returns WriteResult with success status, written paths, skipped paths, and errors
 *
 * @example
 * ```ts
 * const projections = [
 *   { path: '/path/to/file.md', content: '# Header\nContent here' }
 * ];
 *
 * // Normal write with backup
 * const result = writeProjections(projections, { dryRun: false, backup: true });
 *
 * // Dry-run to preview changes
 * const preview = writeProjections(projections, { dryRun: true, backup: false });
 * ```
 */
export function writeProjections(
  projections: ProjectionResult[],
  options: WriteOptions
): WriteResult {
  const result: WriteResult = {
    success: true,
    written: [],
    skipped: [],
    errors: [],
  };

  for (const projection of projections) {
    try {
      const writeStatus = writeSingleProjection(projection, options);

      if (writeStatus === "written") {
        result.written.push(projection.path);
      } else if (writeStatus === "skipped") {
        result.skipped.push(projection.path);
      }
    } catch (err) {
      result.success = false;
      result.errors.push({
        path: projection.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Status of a single projection write
 */
type WriteStatus = "written" | "skipped";

/**
 * Write a single projection to disk
 *
 * @param projection - The projection to write
 * @param options - Write options
 * @returns Status indicating whether the file was written or skipped
 * @throws Error if write operation fails
 */
function writeSingleProjection(
  projection: ProjectionResult,
  options: WriteOptions
): WriteStatus {
  const { path: targetPath, content } = projection;

  // Check if file already exists and has same content
  if (fileExists(targetPath)) {
    const existingContent = fs.readFileSync(targetPath, "utf-8");
    if (existingContent === content) {
      return "skipped";
    }
  }

  // Dry-run mode: don't make changes
  if (options.dryRun) {
    // Report as "written" since we would write it
    return "written";
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!directoryExists(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Create backup if requested and file exists
  if (options.backup && fileExists(targetPath)) {
    const backupPath = `${targetPath}.bak`;
    fs.copyFileSync(targetPath, backupPath);
  }

  // Atomic write: write to temp file, then rename
  const tempPath = generateTempPath(targetPath);

  try {
    // Write content to temp file
    fs.writeFileSync(tempPath, content, "utf-8");

    // Atomically replace target with temp
    fs.renameSync(tempPath, targetPath);

    return "written";
  } catch (err) {
    // Clean up temp file on failure
    cleanupTempFile(tempPath);
    throw err;
  }
}

/**
 * Generate a unique temp file path for atomic writes
 *
 * The temp file is created in the same directory as the target
 * to ensure rename() is atomic (same filesystem).
 *
 * @param targetPath - The target file path
 * @returns Path for the temp file
 */
function generateTempPath(targetPath: string): string {
  const dir = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  return path.join(dir, `.${baseName}.${randomSuffix}.tmp`);
}

/**
 * Clean up a temp file if it exists
 *
 * @param tempPath - Path to the temp file
 */
function cleanupTempFile(tempPath: string): void {
  try {
    if (fileExists(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if a path exists and is a file
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a directory
 */
function directoryExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
