/**
 * CLI Command: lex timeline
 *
 * Display a visual timeline showing Frame evolution for a ticket or branch.
 *
 * Per AX v0.1 Contract:
 * - --json outputs structured CliEvent with timeline data
 * - --format=json outputs raw timeline JSON (legacy behavior)
 */

import type { Frame } from "../types/frame.js";
import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import {
  buildTimeline,
  filterTimeline,
  renderTimelineText,
  renderModuleScopeEvolution,
  renderBlockerTracking,
  renderTimelineJSON,
  renderTimelineHTML,
  type TimelineOptions,
} from "../../memory/renderer/timeline.js";
import { writeFileSync } from "fs";
import { createOutput, raw as rawOutput } from "./output.js";
import { createAXError, type AXError } from "../errors/ax-error.js";

export interface TimelineCommandOptions {
  since?: string;
  until?: string;
  format?: "text" | "json" | "html";
  output?: string;
  json?: boolean;
}

/**
 * Execute the 'lex timeline' command
 * Shows Frame evolution for a ticket or branch
 *
 * Per AX v0.1 Contract:
 * - --json outputs structured CliEvent with timeline data
 * - --format=json outputs raw timeline JSON (legacy behavior)
 * - Errors use AXError shape with nextActions
 *
 * @param ticketOrBranch - Jira ticket ID or branch name
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection (defaults to SqliteFrameStore)
 */
export async function timeline(
  ticketOrBranch: string,
  options: TimelineCommandOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  // Create output writer for this command
  // When --json is set, use JSONL mode for structured output (AX v0.1 compliance)
  // Note: --format defaults to "text", so we only check if --json was explicitly passed
  const useStructuredJson = Boolean(options.json);
  const out = createOutput({
    scope: "cli:timeline",
    mode: useStructuredJson ? "jsonl" : "plain",
  }); // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    let frames: Frame[] = [];
    let title: string;

    // Get all frames and filter by Jira ticket or branch
    // First, try to match by Jira ticket ID
    const allFrames = await store.listFrames();

    // Try to find frames by Jira ticket first
    const framesByJira = allFrames.filter((f) => f.jira === ticketOrBranch);
    if (framesByJira.length > 0) {
      frames = framesByJira;
      title = `${ticketOrBranch}: Timeline`;
    } else {
      // Try by branch name
      const framesByBranch = allFrames.filter((f) => f.branch === ticketOrBranch);
      if (framesByBranch.length > 0) {
        frames = framesByBranch;
        title = `Branch ${ticketOrBranch}: Timeline`;
      } else {
        // No frames found
        title = `${ticketOrBranch}: Timeline`;
      }
    }

    if (frames.length === 0) {
      if (useStructuredJson) {
        const axError: AXError = createAXError(
          "TIMELINE_NO_FRAMES",
          `No frames found for: "${ticketOrBranch}"`,
          [
            "Try using a Jira ticket ID (e.g., TICKET-123)",
            "Try using a branch name",
            "Run 'lex remember' to create a frame first",
          ],
          { query: ticketOrBranch }
        );
        out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
      } else {
        out.error(`No frames found for: "${ticketOrBranch}"`);
        out.info("Try using a Jira ticket ID (e.g., TICKET-123) or a branch name.");
      }
      process.exit(1);
    }

    // Build timeline
    let timelineData = buildTimeline(frames);

    // Apply filters
    const timelineOptions: TimelineOptions = {
      format: options.format || "text",
    };

    if (options.since) {
      timelineOptions.since = new Date(options.since);
    }

    if (options.until) {
      timelineOptions.until = new Date(options.until);
    }

    if (timelineOptions.since || timelineOptions.until) {
      timelineData = filterTimeline(timelineData, timelineOptions);

      if (timelineData.length === 0) {
        if (useStructuredJson) {
          const axError: AXError = createAXError(
            "TIMELINE_NO_FRAMES_IN_RANGE",
            "No frames found in the specified date range",
            [
              "Try widening the date range",
              "Remove --since or --until filters",
              "Run 'lex timeline' without filters to see all frames",
            ],
            {
              query: ticketOrBranch,
              since: options.since,
              until: options.until,
            }
          );
          out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
        } else {
          out.error("No frames found in the specified date range.");
        }
        process.exit(1);
      }
    }

    // Determine output format
    // --json (global) = structured CliEvent output
    // --format=json = raw JSON array (legacy)
    const format = options.format || (options.json ? "json" : "text");

    // If using structured JSON (AX v0.1), output CliEvent format
    if (useStructuredJson) {
      // Extract essential frame data for structured output
      const frameData = timelineData.map((entry) => ({
        id: entry.frame.id,
        referencePoint: entry.frame.reference_point,
        createdAt: entry.frame.timestamp,
        summaryCaption: entry.frame.summary_caption,
        branch: entry.frame.branch,
        modules: entry.frame.module_scope,
        jira: entry.frame.jira,
      }));

      out.json({
        level: "success",
        message: `Found ${timelineData.length} frame(s)`,
        code: "TIMELINE_RETRIEVED",
        data: {
          query: ticketOrBranch,
          title,
          frameCount: timelineData.length,
          frames: frameData,
        },
      });
      return;
    }

    // Render timeline based on format (legacy behavior)
    let result: string;

    switch (format) {
      case "json":
        result = renderTimelineJSON(timelineData);
        break;
      case "html":
        result = renderTimelineHTML(timelineData, title);
        break;
      case "text":
      default:
        result = renderTimelineText(timelineData, title);
        result += renderModuleScopeEvolution(timelineData);
        result += renderBlockerTracking(timelineData);
        break;
    }

    // Write to file or stdout
    if (options.output) {
      writeFileSync(options.output, result, "utf-8");
      out.success(`Timeline written to: ${options.output}`);
    } else {
      // For raw output (text, legacy JSON, HTML), use raw output function
      rawOutput(result);
    }
  } catch (error: unknown) {
    if (useStructuredJson) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const axError: AXError = createAXError(
        "TIMELINE_ERROR",
        errorMessage,
        [
          "Check database connection",
          "Verify the query is valid",
          "Run 'lex check' to diagnose issues",
        ],
        error instanceof Error ? { stack: error.stack?.split("\n").slice(0, 5) } : undefined
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      out.error(`Error: ${errorMessage}`);
    }
    process.exit(2);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
