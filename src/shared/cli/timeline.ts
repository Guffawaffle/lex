/**
 * CLI Command: lex timeline
 *
 * Display a visual timeline showing Frame evolution for a ticket or branch.
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
import * as output from "./output.js";

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
 * @param ticketOrBranch - Jira ticket ID or branch name
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection (defaults to SqliteFrameStore)
 */
export async function timeline(
  ticketOrBranch: string,
  options: TimelineCommandOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    let frames: Frame[] = [];
    let title: string;

    // Get all frames and filter by Jira ticket or branch
    // First, try to match by Jira ticket ID
    const allFrames = await store.listFrames();
    
    // Try to find frames by Jira ticket first
    const framesByJira = allFrames.filter(f => f.jira === ticketOrBranch);
    if (framesByJira.length > 0) {
      frames = framesByJira;
      title = `${ticketOrBranch}: Timeline`;
    } else {
      // Try by branch name
      const framesByBranch = allFrames.filter(f => f.branch === ticketOrBranch);
      if (framesByBranch.length > 0) {
        frames = framesByBranch;
        title = `Branch ${ticketOrBranch}: Timeline`;
      } else {
        // No frames found
        title = `${ticketOrBranch}: Timeline`;
      }
    }

    if (frames.length === 0) {
      output.error(`\n❌ No frames found for: "${ticketOrBranch}"\n`);
      output.info("Try using a Jira ticket ID (e.g., TICKET-123) or a branch name.\n");
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
        output.error(`\n❌ No frames found in the specified date range.\n`);
        process.exit(1);
      }
    }

    // Render timeline based on format
    const format = options.format || (options.json ? "json" : "text");
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
      output.success(`\n✅ Timeline written to: ${options.output}\n`);
    } else {
      output.raw(result);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    output.error(`\n❌ Error: ${errorMessage}\n`);
    process.exit(2);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
