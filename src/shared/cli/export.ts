/**
 * CLI Command: lex frames export
 *
 * Export frames from database to JSON files for backup, sharing, and archival.
 */

import { createFrameStore, type FrameStore, type FrameSearchCriteria } from "../../memory/store/index.js";
import type { Frame } from "../types/frame.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as output from "./output.js";
import { AXErrorException } from "../errors/ax-error.js";

export interface ExportCommandOptions {
  out?: string;
  since?: string;
  jira?: string;
  branch?: string;
  format?: "json" | "ndjson";
  json?: boolean;
}

/**
 * Parse duration string (e.g., "7d", "30d", "1h") to Date
 * @throws Error if the date string is invalid
 */
function parseDurationToDate(duration: string): Date {
  const now = new Date();
  const match = duration.match(/^(\d+)([hdwmy])$/);

  if (!match) {
    // Not a duration, assume it's an ISO date
    const parsed = new Date(duration);
    if (isNaN(parsed.getTime())) {
      throw new AXErrorException(
        "INVALID_DATE_FORMAT",
        `Invalid date format: "${duration}". Use ISO date or duration (e.g., "7d", "1h")`,
        [
          "Use ISO date format (e.g., \"2024-01-01T00:00:00Z\")",
          "Use duration format (e.g., \"7d\" for 7 days, \"1h\" for 1 hour)",
          "Valid duration units: h (hours), d (days), w (weeks), m (months), y (years)"
        ],
        { duration, operation: "export" }
      );
    }
    return parsed;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "h":
      now.setHours(now.getHours() - value);
      break;
    case "d":
      now.setDate(now.getDate() - value);
      break;
    case "w":
      now.setDate(now.getDate() - value * 7);
      break;
    case "m":
      now.setMonth(now.getMonth() - value);
      break;
    case "y":
      now.setFullYear(now.getFullYear() - value);
      break;
  }

  return now;
}

/**
 * Get default export directory path
 */
function getDefaultOutputDir(): string {
  const workspaceRoot = process.env.LEX_WORKSPACE_ROOT || process.cwd();
  return join(workspaceRoot, ".smartergpt", "lex", "frames.export");
}

/**
 * Prepare frame for export by including only defined fields
 */
function prepareFrameForExport(frame: Frame): Frame {
  return {
    id: frame.id,
    reference_point: frame.reference_point,
    summary_caption: frame.summary_caption,
    status_snapshot: frame.status_snapshot,
    module_scope: frame.module_scope,
    branch: frame.branch,
    timestamp: frame.timestamp,
    ...(frame.jira && { jira: frame.jira }),
    ...(frame.keywords && { keywords: frame.keywords }),
    ...(frame.atlas_frame_id && { atlas_frame_id: frame.atlas_frame_id }),
    ...(frame.feature_flags && { feature_flags: frame.feature_flags }),
    ...(frame.permissions && { permissions: frame.permissions }),
    ...(frame.runId && { runId: frame.runId }),
    ...(frame.planHash && { planHash: frame.planHash }),
    ...(frame.spend && { spend: frame.spend }),
  };
}

/**
 * Execute the 'lex frames export' command
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection (defaults to SqliteFrameStore)
 */
export async function exportFrames(
  options: ExportCommandOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    // Build search criteria for filtering
    const searchCriteria: FrameSearchCriteria = {};

    if (options.since) {
      searchCriteria.since = parseDurationToDate(options.since);
    }

    // Get frames with optional time filtering via searchFrames or listFrames
    let frames: Frame[];
    
    if (searchCriteria.since) {
      // Use searchFrames for time-based filtering
      frames = await store.searchFrames(searchCriteria);
    } else {
      // Get all frames
      frames = await store.listFrames();
    }

    // Apply additional filters (jira, branch) in memory
    if (options.jira) {
      frames = frames.filter(f => f.jira === options.jira);
    }

    if (options.branch) {
      frames = frames.filter(f => f.branch === options.branch);
    }

    // Determine output directory
    const outputDir = options.out || getDefaultOutputDir();
    const dateDir = join(outputDir, new Date().toISOString().split("T")[0]);

    // Create output directory
    mkdirSync(dateDir, { recursive: true });

    const format = options.format || "json";

    let count = 0;
    const startTime = Date.now();

    if (format === "json") {
      // Export each frame as a separate JSON file
      for (const frame of frames) {
        const filename = `frame-${frame.id}.json`;
        const filepath = join(dateDir, filename);

        const exportFrame = prepareFrameForExport(frame);
        writeFileSync(filepath, JSON.stringify(exportFrame, null, 2));
        count++;

        // Progress indicator for large exports
        if (count % 100 === 0) {
          output.info(`Exported ${count} frames...`);
        }
      }
    } else if (format === "ndjson") {
      // Export all frames as newline-delimited JSON in a single file
      const filename = "frames.ndjson";
      const filepath = join(dateDir, filename);
      let ndjsonContent = "";

      for (const frame of frames) {
        const exportFrame = prepareFrameForExport(frame);
        ndjsonContent += JSON.stringify(exportFrame) + "\n";
        count++;

        // Progress indicator for large exports
        if (count % 100 === 0) {
          output.info(`Exported ${count} frames...`);
        }
      }

      writeFileSync(filepath, ndjsonContent);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Output results
    if (options.json) {
      const result = {
        success: true,
        count,
        outputDir: dateDir,
        format,
        durationSeconds: parseFloat(duration),
      };
      output.json(result);
    } else {
      output.success(`\n✅ Exported ${count} frames to ${dateDir}`);
      output.info(`Format: ${format}`);
      output.info(`Duration: ${duration}s\n`);
    }
  } catch (error) {
    if (options.json) {
      output.json({
        success: false,
        error: String(error),
      });
    } else {
      output.error(`\n❌ Export failed: ${String(error)}\n`);
    }
    process.exit(1);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
