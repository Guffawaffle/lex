/**
 * Layout templates and styling for memory card rendering
 * Optimized for LLM vision input with high-contrast, readable design
 */

export interface CardDimensions {
  width: number;
  height: number;
  padding: number;
  lineHeight: number;
}

export interface ColorScheme {
  background: string;
  text: string;
  heading: string;
  accent: string;
  muted: string;
  warning: string;
  error: string;
}

export interface FontConfig {
  family: string;
  sizeTitle: number;
  sizeHeading: number;
  sizeBody: number;
  sizeSmall: number;
}

/**
 * Default card dimensions optimized for vision models
 * Based on research: ~800px wide for good token compression
 */
export const DEFAULT_DIMENSIONS: CardDimensions = {
  width: 800,
  height: 1000,
  padding: 40,
  lineHeight: 24,
};

/**
 * High-contrast dark theme color scheme
 * Optimized for readability in vision models
 */
export const DARK_COLOR_SCHEME: ColorScheme = {
  background: '#1a1a1a',
  text: '#e0e0e0',
  heading: '#ffffff',
  accent: '#4a9eff',
  muted: '#888888',
  warning: '#ffaa00',
  error: '#ff4444',
};

/**
 * Monospace font configuration for technical content
 */
export const MONOSPACE_FONT: FontConfig = {
  family: 'monospace',
  sizeTitle: 28,
  sizeHeading: 20,
  sizeBody: 16,
  sizeSmall: 14,
};

/**
 * Maximum text lengths to prevent overflow
 */
export const TEXT_LIMITS = {
  summaryCaption: 120,
  referencePoint: 80,
  nextAction: 200,
  blockerItem: 100,
  maxBlockers: 5,
  maxKeywords: 8,
};

/**
 * Truncate text with ellipsis if it exceeds max length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Wrap text to fit within a given width
 * Returns array of lines
 */
export function wrapText(
  text: string,
  maxWidth: number,
  charWidth: number
): string[] {
  const maxCharsPerLine = Math.floor(maxWidth / charWidth);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Calculate dynamic card height based on content
 */
export function calculateCardHeight(
  frame: any,
  dimensions: CardDimensions
): number {
  let lines = 0;

  // Title + timestamp + branch + divider
  lines += 5;

  // Summary caption (wrapped)
  const summaryLines = Math.ceil(
    truncateText(frame.summary_caption, TEXT_LIMITS.summaryCaption).length / 60
  );
  lines += summaryLines + 1;

  // Reference point
  lines += 2;

  // Status snapshot
  lines += 2; // heading + next action
  const nextActionLines = Math.ceil(
    truncateText(frame.status_snapshot.next_action, TEXT_LIMITS.nextAction)
      .length / 60
  );
  lines += nextActionLines;

  // Blockers
  if (frame.status_snapshot.blockers?.length > 0) {
    lines += 1; // heading
    const blockerCount = Math.min(
      frame.status_snapshot.blockers.length,
      TEXT_LIMITS.maxBlockers
    );
    lines += blockerCount;
  }

  // Merge blockers
  if (frame.status_snapshot.merge_blockers?.length > 0) {
    lines += 1; // heading
    const mergeBlockerCount = Math.min(
      frame.status_snapshot.merge_blockers.length,
      TEXT_LIMITS.maxBlockers
    );
    lines += mergeBlockerCount;
  }

  // Tests failing
  if (frame.status_snapshot.tests_failing?.length > 0) {
    lines += 1; // heading
    const testCount = Math.min(
      frame.status_snapshot.tests_failing.length,
      TEXT_LIMITS.maxBlockers
    );
    lines += testCount;
  }

  // Module scope
  lines += 2;

  // Keywords
  if (frame.keywords?.length > 0) {
    lines += 2;
  }

  // Optional fields
  if (frame.jira) lines += 1;
  if (frame.atlas_frame_id) lines += 1;

  // Raw context section
  lines += 4; // spacing and potential context

  const calculatedHeight = dimensions.padding * 2 + lines * dimensions.lineHeight;
  return Math.max(calculatedHeight, dimensions.height);
}
