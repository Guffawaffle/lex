/**
 * Narrative Response Formatting
 *
 * Formats Frame search results as natural language prose instead of JSON.
 */

import type { Frame } from "./frames/types.js";
import type { NaturalQuery } from "./natural-query.js";

export interface NarrativeItem {
  summary: string;
  date: string;
  frameId: string;
  keywords: string[];
}

export interface NarrativeGroup {
  timeGroup: string; // "December 2025", "November 2025", etc.
  items: NarrativeItem[];
}

export interface NarrativeResponse {
  summary: string; // Opening line
  groupedResults: NarrativeGroup[];
  followUp: string; // Suggested next question
}

// Month name constants to avoid duplication
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_NAMES_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Format a date as a short readable string (e.g., "Dec 15")
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Format a date as a month-year group (e.g., "December 2025")
 */
function formatMonthYear(timestamp: string): string {
  const date = new Date(timestamp);
  return `${MONTH_NAMES_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Group frames by month
 */
function groupByMonth(frames: Frame[]): Map<string, Frame[]> {
  const groups = new Map<string, Frame[]>();

  for (const frame of frames) {
    const monthYear = formatMonthYear(frame.timestamp);
    if (!groups.has(monthYear)) {
      groups.set(monthYear, []);
    }
    groups.get(monthYear)!.push(frame);
  }

  return groups;
}

/**
 * Generate opening summary line
 */
function generateSummary(query: NaturalQuery, frameCount: number): string {
  if (frameCount === 0) {
    return `I don't have any memories about "${query.extractedTopic}".`;
  }

  const topic = query.extractedTopic;
  const timeContext = query.timeHints ? ` from ${query.timeHints.description}` : "";

  if (frameCount === 1) {
    return `Here's what I remember about ${topic}${timeContext}:`;
  }

  return `Here's what I remember about ${topic}${timeContext}:`;
}

/**
 * Generate follow-up suggestion
 */
function generateFollowUp(frames: Frame[]): string {
  if (frames.length === 0) {
    return "Would you like to search for something else?";
  }

  const mostRecent = frames[0];

  // Get the most common keyword
  const allKeywords = frames.flatMap((f) => f.keywords || []);
  if (allKeywords.length > 0) {
    const keywordCounts = new Map<string, number>();
    for (const kw of allKeywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
    }
    const topKeyword = Array.from(keywordCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

    return `The most recent work focused on ${topKeyword}. Would you like more details on any of these?`;
  }

  return "Would you like more details on any of these?";
}

/**
 * Format frames as narrative prose
 */
export function formatAsNarrative(frames: Frame[], query: NaturalQuery): string {
  if (frames.length === 0) {
    const summary = generateSummary(query, 0);
    return `${summary}\n\nWould you like to search for something else?`;
  }

  const grouped = groupByMonth(frames);
  const summary = generateSummary(query, frames.length);

  let response = `${summary}\n\n`;

  // Sort groups by date (most recent first)
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const dateA = new Date(a[1][0].timestamp);
    const dateB = new Date(b[1][0].timestamp);
    return dateB.getTime() - dateA.getTime();
  });

  for (const [monthYear, items] of sortedGroups) {
    response += `📅 ${monthYear}\n`;

    // Sort items within group by date (most recent first)
    const sortedItems = items.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    for (const item of sortedItems) {
      const date = formatDate(item.timestamp);
      response += `• ${item.summary_caption} (${date})`;

      // Add Jira ticket if available
      if (item.jira) {
        response += ` [${item.jira}]`;
      }

      response += "\n";
    }
    response += "\n";
  }

  const followUp = generateFollowUp(frames);
  response += followUp;

  return response;
}

/**
 * Build a narrative response object
 */
export function buildNarrativeResponse(frames: Frame[], query: NaturalQuery): NarrativeResponse {
  const grouped = groupByMonth(frames);
  const groupedResults: NarrativeGroup[] = [];

  // Sort groups by date (most recent first)
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const dateA = new Date(a[1][0].timestamp);
    const dateB = new Date(b[1][0].timestamp);
    return dateB.getTime() - dateA.getTime();
  });

  for (const [monthYear, items] of sortedGroups) {
    const narrativeItems: NarrativeItem[] = items.map((frame) => ({
      summary: frame.summary_caption,
      date: formatDate(frame.timestamp),
      frameId: frame.id,
      keywords: frame.keywords || [],
    }));

    groupedResults.push({
      timeGroup: monthYear,
      items: narrativeItems,
    });
  }

  return {
    summary: generateSummary(query, frames.length),
    groupedResults,
    followUp: generateFollowUp(frames),
  };
}
