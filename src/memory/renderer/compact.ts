/**
 * Compact formatting utilities for small-context AI agents
 *
 * Provides compact response formatting to minimize payload size
 * while preserving essential information.
 */

import type { Frame } from "../../shared/types/frame.js";

/**
 * Maximum length for truncated text fields
 */
const MAX_TEXT_LENGTH = 50;

/**
 * Compact frame representation for small-context agents
 */
export interface CompactFrame {
  id: string;
  ref: string; // Truncated reference_point
  cap?: string; // Truncated summary_caption (optional if same as ref)
  ts: number; // Unix epoch timestamp
  modules: string[];
  next: string; // next_action
  branch?: string;
  jira?: string;
  blockers?: string[];
  mergeBlockers?: string[];
  testsFailing?: string[];
  keywords?: string[];
  _truncated?: boolean; // Flag indicating content was shortened
}

/**
 * Convert Frame to compact format
 */
export function compactFrame(frame: Frame): CompactFrame {
  const compact: CompactFrame = {
    id: frame.id,
    ref: truncateText(frame.reference_point, MAX_TEXT_LENGTH),
    ts: dateToUnixEpoch(frame.timestamp),
    modules: frame.module_scope,
    next: truncateText(frame.status_snapshot.next_action, MAX_TEXT_LENGTH),
  };

  // Track if any truncation occurred
  let wasTruncated = false;

  // Check if reference_point was truncated
  if (frame.reference_point.length > MAX_TEXT_LENGTH) {
    wasTruncated = true;
  }

  // Check if next_action was truncated
  if (frame.status_snapshot.next_action.length > MAX_TEXT_LENGTH) {
    wasTruncated = true;
  }

  // Only include summary_caption if different from reference_point
  if (frame.summary_caption !== frame.reference_point) {
    compact.cap = truncateText(frame.summary_caption, MAX_TEXT_LENGTH);
    if (frame.summary_caption.length > MAX_TEXT_LENGTH) {
      wasTruncated = true;
    }
  }

  // Optional fields - only include if present
  if (frame.branch) {
    compact.branch = frame.branch;
  }

  if (frame.jira) {
    compact.jira = frame.jira;
  }

  // Only include non-empty arrays
  if (frame.status_snapshot.blockers && frame.status_snapshot.blockers.length > 0) {
    compact.blockers = frame.status_snapshot.blockers.map((b) =>
      truncateText(b, MAX_TEXT_LENGTH)
    );
    if (frame.status_snapshot.blockers.some((b) => b.length > MAX_TEXT_LENGTH)) {
      wasTruncated = true;
    }
  }

  if (frame.status_snapshot.merge_blockers && frame.status_snapshot.merge_blockers.length > 0) {
    compact.mergeBlockers = frame.status_snapshot.merge_blockers.map((b) =>
      truncateText(b, MAX_TEXT_LENGTH)
    );
    if (frame.status_snapshot.merge_blockers.some((b) => b.length > MAX_TEXT_LENGTH)) {
      wasTruncated = true;
    }
  }

  if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
    compact.testsFailing = frame.status_snapshot.tests_failing.map((t) =>
      truncateText(t, MAX_TEXT_LENGTH)
    );
    if (frame.status_snapshot.tests_failing.some((t) => t.length > MAX_TEXT_LENGTH)) {
      wasTruncated = true;
    }
  }

  if (frame.keywords && frame.keywords.length > 0) {
    compact.keywords = frame.keywords;
  }

  // Add truncation flag if any content was shortened
  if (wasTruncated) {
    compact._truncated = true;
  }

  return compact;
}

/**
 * Truncate text to maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Convert ISO 8601 timestamp to Unix epoch (seconds)
 */
function dateToUnixEpoch(isoTimestamp: string): number {
  return Math.floor(new Date(isoTimestamp).getTime() / 1000);
}

/**
 * Compact list response with count summary
 */
export interface CompactListResponse {
  frames: CompactFrame[];
  count: number;
  _truncated?: boolean;
}

/**
 * Create a compact list response
 */
export function compactFrameList(frames: Frame[]): CompactListResponse {
  const compactFrames = frames.map(compactFrame);
  const hasTruncation = compactFrames.some((f) => f._truncated);

  return {
    frames: compactFrames,
    count: frames.length,
    ...(hasTruncation && { _truncated: true }),
  };
}
