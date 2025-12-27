/**
 * Turn Cost measurement command
 *
 * Aggregates governance metrics from Frame database:
 * - Frame count (coordination events)
 * - Token usage (from spend metadata)
 * - Time period analysis
 */

import { getDb } from "../../memory/store/index.js";
import { getTurnCostMetrics } from "../../memory/store/queries.js";
import * as output from "./output.js";
import { getNDJSONLogger } from "../logger/index.js";

const logger = getNDJSONLogger("cli/turncost");

export interface TurnCostOptions {
  json?: boolean;
  /**
   * Period for metrics calculation
   * Format: ISO 8601 timestamp or duration string (e.g., "24h", "7d", "30d")
   * Default: "24h"
   */
  period?: string;
}

/**
 * Parse period string to ISO timestamp for "since" query
 * Supports: "24h", "7d", "30d", or ISO 8601 timestamp
 */
function parsePeriod(period: string): string {
  // If it's already an ISO timestamp, return it
  if (period.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return period;
  }

  // Parse duration strings (e.g., "24h", "7d", "30d")
  const match = period.match(/^(\d+)(h|d|w|m)$/);
  if (!match) {
    throw new Error(
      `Invalid period format: ${period}. Use format like "24h", "7d", "30d" or ISO 8601 timestamp`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
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
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }

  return now.toISOString();
}

/**
 * Format period string for display
 */
function formatPeriod(period: string): string {
  // Check if it's a duration string
  const match = period.match(/^(\d+)(h|d|w|m)$/);
  if (match) {
    return period; // Return as-is for duration strings
  }

  // For ISO timestamps, return relative description
  const since = new Date(period);
  const now = new Date();
  const diffMs = now.getTime() - since.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 48) {
    return `${diffHours}h`;
  } else if (diffDays < 14) {
    return `${diffDays}d`;
  } else {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w`;
  }
}

/**
 * Execute turncost command
 */
export async function turncost(options: TurnCostOptions = {}): Promise<void> {
  const startTime = Date.now();

  try {
    const db = getDb();
    const periodStr = options.period || "24h";
    const sinceTimestamp = parsePeriod(periodStr);

    logger.info("Calculating Turn Cost metrics", {
      operation: "turncost",
      metadata: { period: periodStr, since: sinceTimestamp },
    });

    const metrics = getTurnCostMetrics(db, sinceTimestamp);

    const duration = Date.now() - startTime;

    logger.info("Turn Cost metrics calculated", {
      operation: "turncost",
      duration_ms: duration,
      metadata: { metrics },
    });

    if (options.json) {
      output.json({
        success: true,
        turnCost: {
          frames: metrics.frameCount,
          period: formatPeriod(periodStr),
          estimatedTokens: metrics.estimatedTokens,
          prompts: metrics.prompts,
        },
        metadata: {
          since: sinceTimestamp,
          duration_ms: duration,
        },
      });
    } else {
      output.info("📊 Turn Cost Metrics");
      output.info("");
      output.info(`Period: ${formatPeriod(periodStr)}`);
      output.info(`Frames: ${metrics.frameCount}`);
      output.info(`Estimated Tokens: ${metrics.estimatedTokens.toLocaleString()}`);
      output.info(`Prompts: ${metrics.prompts}`);
      output.info("");
      
      if (metrics.frameCount === 0) {
        output.info("💡 No frames found in the specified period.");
        output.info("   Use 'lex remember' to start tracking your work sessions.");
      } else {
        // Calculate average tokens per frame if data is available
        if (metrics.estimatedTokens > 0) {
          const avgTokens = Math.round(metrics.estimatedTokens / metrics.frameCount);
          output.info(`Average tokens per frame: ${avgTokens.toLocaleString()}`);
        }
        
        output.info("");
        output.info("💡 Use --period to adjust time window (e.g., --period 7d)");
      }
    }
  } catch (error) {
    logger.error("Turn Cost calculation failed", {
      operation: "turncost",
      error: error instanceof Error ? error.message : String(error),
    });

    if (options.json) {
      output.json({
        success: false,
        error: error instanceof Error ? error.message : "Turn Cost calculation failed",
      });
    } else {
      output.error(`Error: ${error instanceof Error ? error.message : "Turn Cost calculation failed"}`);
    }
    process.exit(1);
  }
}
