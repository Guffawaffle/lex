/**
 * Frames Export Command
 *
 * Export frames from database to JSON files for backup, sharing, and archival.
 */

import { getLogger } from "lex/logger";
import { createDatabase, getDefaultDbPath } from "../../memory/store/db.js";
import type { Frame } from "../../memory/frames/types.js";
import * as output from "./output.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import Database from "better-sqlite3";

const logger = getLogger("cli:frames-export");

export interface ExportOptions {
  out?: string; // Output directory
  since?: string; // Date or duration (e.g., "7d", "2025-01-01")
  jira?: string; // Filter by Jira ticket
  branch?: string; // Filter by branch
  format?: "json" | "ndjson"; // Output format
  json?: boolean; // Global JSON output flag
}

interface ExportStats {
  totalFrames: number;
  exportedFrames: number;
  outputDir: string;
  format: string;
}

/**
 * Parse "since" option to ISO timestamp
 * Supports:
 * - Duration: "7d", "30d", "1h", "2w"
 * - ISO date: "2025-01-01", "2025-11-09T12:34:56.789Z"
 */
function parseSinceOption(since: string): string {
  // Check if it's a duration (e.g., "7d", "30d", "1h", "2w")
  const durationMatch = since.match(/^(\d+)(d|h|w)$/);
  if (durationMatch) {
    const amount = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2];

    const now = new Date();
    switch (unit) {
      case "d":
        now.setDate(now.getDate() - amount);
        break;
      case "h":
        now.setHours(now.getHours() - amount);
        break;
      case "w":
        now.setDate(now.getDate() - amount * 7);
        break;
    }
    return now.toISOString();
  }

  // Try parsing as ISO date
  const date = new Date(since);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid --since value: "${since}". Use duration (e.g., "7d") or ISO date (e.g., "2025-01-01")`
    );
  }

  return date.toISOString();
}

/**
 * Build SQL query for frame export with filters
 */
function buildExportQuery(options: ExportOptions): { query: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  // Filter by since date/duration
  if (options.since) {
    const sinceTimestamp = parseSinceOption(options.since);
    conditions.push("timestamp >= ?");
    params.push(sinceTimestamp);
  }

  // Filter by Jira ticket
  if (options.jira) {
    conditions.push("jira = ?");
    params.push(options.jira);
  }

  // Filter by branch
  if (options.branch) {
    conditions.push("branch = ?");
    params.push(options.branch);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT * FROM frames
    ${whereClause}
    ORDER BY timestamp ASC
  `;

  return { query, params };
}

/**
 * Convert database row to Frame object
 */
function rowToFrame(row: any): Frame {
  return {
    id: row.id,
    timestamp: row.timestamp,
    branch: row.branch,
    jira: row.jira || undefined,
    module_scope: JSON.parse(row.module_scope),
    summary_caption: row.summary_caption,
    reference_point: row.reference_point,
    status_snapshot: JSON.parse(row.status_snapshot),
    keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
    atlas_frame_id: row.atlas_frame_id || undefined,
    feature_flags: row.feature_flags ? JSON.parse(row.feature_flags) : undefined,
    permissions: row.permissions ? JSON.parse(row.permissions) : undefined,
    runId: row.run_id || undefined,
    planHash: row.plan_hash || undefined,
    spend: row.spend ? JSON.parse(row.spend) : undefined,
  };
}

/**
 * Export frames to JSON files with streaming
 */
async function exportFramesToFiles(
  db: Database.Database,
  options: ExportOptions
): Promise<ExportStats> {
  const { query, params } = buildExportQuery(options);

  // Prepare output directory
  const appRoot = process.cwd();
  const defaultOutDir = join(appRoot, ".smartergpt.local", "lex", "frames.export");
  const outputDir = options.out ? resolve(options.out) : defaultOutDir;
  const dateStr = new Date().toISOString().split("T")[0];
  const dateDir = join(outputDir, dateStr);

  // Create directory structure
  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
    logger.info({ path: dateDir }, "Created export directory");
  }

  const format = options.format || "json";
  let exportedCount = 0;

  // Execute query with streaming
  const stmt = db.prepare(query);
  const rows = stmt.iterate(...params);

  if (format === "ndjson") {
    // NDJSON format: one frame per line in a single file
    const ndjsonPath = join(dateDir, "frames.ndjson");
    let ndjsonContent = "";

    for (const row of rows) {
      const frame = rowToFrame(row);
      ndjsonContent += JSON.stringify(frame) + "\n";
      exportedCount++;

      // Progress indicator every 100 frames (only in non-JSON mode)
      if (!options.json && exportedCount % 100 === 0) {
        output.info(`Exported ${exportedCount} frames...`);
      }
    }

    writeFileSync(ndjsonPath, ndjsonContent, "utf-8");
  } else {
    // JSON format: one file per frame
    for (const row of rows) {
      const frame = rowToFrame(row);
      const filename = `frame-${frame.id}.json`;
      const filepath = join(dateDir, filename);
      writeFileSync(filepath, JSON.stringify(frame, null, 2), "utf-8");
      exportedCount++;

      // Progress indicator every 100 frames (only in non-JSON mode)
      if (!options.json && exportedCount % 100 === 0) {
        output.info(`Exported ${exportedCount} frames...`);
      }
    }
  }

  return {
    totalFrames: exportedCount,
    exportedFrames: exportedCount,
    outputDir: dateDir,
    format,
  };
}

/**
 * Execute frames export command
 */
export async function framesExport(options: ExportOptions): Promise<void> {
  try {
    const dbPath = process.env.LEX_DB_PATH || getDefaultDbPath();
    const db = createDatabase(dbPath);

    if (!options.json) {
      output.info("Starting frames export...");
    }

    const stats = await exportFramesToFiles(db, options);

    db.close();

    // Output results
    if (options.json) {
      output.json({
        success: true,
        stats: {
          totalFrames: stats.totalFrames,
          exportedFrames: stats.exportedFrames,
          outputDir: stats.outputDir,
          format: stats.format,
        },
      });
    } else {
      output.success(
        `✅ Exported ${stats.exportedFrames} frame${stats.exportedFrames !== 1 ? "s" : ""} to ${stats.outputDir}`
      );
      output.info(`Format: ${stats.format}`);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to export frames");
    if (options.json) {
      output.json({
        success: false,
        error: String(error),
      });
    } else {
      output.error(`Failed to export frames: ${error}`);
    }
    process.exit(1);
  }
}
