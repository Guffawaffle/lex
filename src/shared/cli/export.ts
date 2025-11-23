/**
 * CLI Command: lex frames export
 *
 * Export frames from database to JSON files for backup, sharing, and archival.
 */

import { getDb, getFramesForExport, type ExportFramesOptions } from "../../memory/store/index.js";
import type { Frame } from "../types/frame.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as output from "./output.js";

export interface ExportCommandOptions {
  out?: string;
  since?: string;
  jira?: string;
  branch?: string;
  format?: "json" | "ndjson";
  json?: boolean;
}

/**
 * Parse duration string (e.g., "7d", "30d", "1h") to ISO timestamp
 */
function parseDurationToTimestamp(duration: string): string {
  const now = new Date();
  const match = duration.match(/^(\d+)([hdwmy])$/);

  if (!match) {
    // Not a duration, assume it's an ISO date
    return duration;
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

  return now.toISOString();
}

/**
 * Get default export directory path
 */
function getDefaultExportDir(): string {
  const workspaceRoot = process.env.LEX_WORKSPACE_ROOT || process.cwd();
  return join(workspaceRoot, ".smartergpt.local", "lex", "frames.export");
}

/**
 * Execute the 'lex frames export' command
 */
export async function exportFrames(options: ExportCommandOptions = {}): Promise<void> {
  try {
    const db = getDb();

    // Build query options
    const queryOptions: ExportFramesOptions = {};

    if (options.since) {
      queryOptions.since = parseDurationToTimestamp(options.since);
    }

    if (options.jira) {
      queryOptions.jira = options.jira;
    }

    if (options.branch) {
      queryOptions.branch = options.branch;
    }

    // Determine output directory
    const outputDir = options.out || getDefaultExportDir();
    const dateDir = join(outputDir, new Date().toISOString().split("T")[0]);

    // Create output directory
    mkdirSync(dateDir, { recursive: true });

    // Get frames iterator for streaming
    const frames = getFramesForExport(db, queryOptions);
    const format = options.format || "json";

    let count = 0;
    const startTime = Date.now();

    if (format === "json") {
      // Export each frame as a separate JSON file
      for (const frame of frames) {
        const filename = `frame-${frame.id}.json`;
        const filepath = join(dateDir, filename);

        // Prepare frame for export (remove internal fields if needed)
        const exportFrame: Frame = {
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
        // Prepare frame for export
        const exportFrame: Frame = {
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
  }
}
