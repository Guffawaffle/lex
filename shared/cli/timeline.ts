/**
 * CLI Command: lex timeline
 * 
 * Display a visual timeline showing Frame evolution for a ticket or branch.
 */

import type { Frame } from '../types/frame.js';
import { getDb, getFramesByJira, getFramesByBranch } from '../../memory/store/index.js';
import {
  buildTimeline,
  filterTimeline,
  renderTimelineText,
  renderModuleScopeEvolution,
  renderBlockerTracking,
  renderTimelineJSON,
  renderTimelineHTML,
  type TimelineOptions,
} from '../../memory/renderer/timeline.js';
import { writeFileSync } from 'fs';

export interface TimelineCommandOptions {
  since?: string;
  until?: string;
  format?: 'text' | 'json' | 'html';
  output?: string;
  json?: boolean;
}

/**
 * Execute the 'lex timeline' command
 * Shows Frame evolution for a ticket or branch
 */
export async function timeline(
  ticketOrBranch: string,
  options: TimelineCommandOptions = {}
): Promise<void> {
  try {
    const db = getDb();
    let frames: Frame[] = [];
    let title = `${ticketOrBranch}: Timeline`;

    // Try to find frames by Jira ticket first, then by branch
    const framesByJira = getFramesByJira(db, ticketOrBranch);
    if (framesByJira.length > 0) {
      frames = framesByJira;
      title = `${ticketOrBranch}: Timeline`;
    } else {
      const framesByBranch = getFramesByBranch(db, ticketOrBranch);
      if (framesByBranch.length > 0) {
        frames = framesByBranch;
        title = `Branch ${ticketOrBranch}: Timeline`;
      }
    }

    if (frames.length === 0) {
      console.log(`\n❌ No frames found for: "${ticketOrBranch}"\n`);
      console.log('Try using a Jira ticket ID (e.g., TICKET-123) or a branch name.\n');
      process.exit(1);
    }

    // Build timeline
    let timelineData = buildTimeline(frames);

    // Apply filters
    const timelineOptions: TimelineOptions = {
      format: options.format || 'text',
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
        console.log(`\n❌ No frames found in the specified date range.\n`);
        process.exit(1);
      }
    }

    // Render timeline based on format
    const format = options.format || (options.json ? 'json' : 'text');
    let output: string;

    switch (format) {
      case 'json':
        output = renderTimelineJSON(timelineData);
        break;
      case 'html':
        output = renderTimelineHTML(timelineData, title);
        break;
      case 'text':
      default:
        output = renderTimelineText(timelineData, title);
        output += renderModuleScopeEvolution(timelineData);
        output += renderBlockerTracking(timelineData);
        break;
    }

    // Write to file or stdout
    if (options.output) {
      writeFileSync(options.output, output, 'utf-8');
      console.log(`\n✅ Timeline written to: ${options.output}\n`);
    } else {
      console.log(output);
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(2);
  }
}
