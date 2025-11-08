/**
 * Diff formatting and truncation logic
 * Provides intelligent diff rendering with context and truncation
 */

export interface DiffLine {
  type: "addition" | "deletion" | "unchanged" | "context";
  content: string;
  lineNumber?: number;
}

export interface DiffBlock {
  lines: DiffLine[];
  startLine: number;
  endLine: number;
}

export interface TruncationOptions {
  maxLines?: number; // Maximum total lines to show (default: 50)
  contextLines?: number; // Lines of context around changes (default: 3)
  collapseThreshold?: number; // Minimum unchanged lines to collapse (default: 10)
}

const DEFAULT_TRUNCATION_OPTIONS: Required<TruncationOptions> = {
  maxLines: 50,
  contextLines: 3,
  collapseThreshold: 10,
};

/**
 * Parse a unified diff string into structured diff lines
 */
export function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const parsedLines: DiffLine[] = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const firstChar = line[0];

    if (firstChar === "+") {
      parsedLines.push({
        type: "addition",
        content: line.substring(1),
      });
    } else if (firstChar === "-") {
      parsedLines.push({
        type: "deletion",
        content: line.substring(1),
      });
    } else if (firstChar === " ") {
      parsedLines.push({
        type: "unchanged",
        content: line.substring(1),
      });
    } else {
      // Context lines (headers, etc.)
      parsedLines.push({
        type: "context",
        content: line,
      });
    }
  }

  return parsedLines;
}

/**
 * Apply intelligent truncation to a diff
 * Shows changed lines + context, collapses large unchanged sections
 */
export function truncateDiff(lines: DiffLine[], options: TruncationOptions = {}): DiffLine[] {
  const opts = { ...DEFAULT_TRUNCATION_OPTIONS, ...options };

  // Find all changed line indices
  const changedIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (line.type === "addition" || line.type === "deletion") {
      changedIndices.add(idx);
    }
  });

  // Build set of lines to include (changed + context)
  const includedIndices = new Set<number>();

  changedIndices.forEach((idx) => {
    // Include the changed line and context around it
    for (
      let i = Math.max(0, idx - opts.contextLines);
      i <= Math.min(lines.length - 1, idx + opts.contextLines);
      i++
    ) {
      includedIndices.add(i);
    }
  });

  // Build output with collapse markers
  const result: DiffLine[] = [];
  let i = 0;

  while (i < lines.length) {
    if (includedIndices.has(i)) {
      // Include this line
      result.push(lines[i]);
      i++;
    } else {
      // Start of excluded section - find the end
      let excludeStart = i;
      while (i < lines.length && !includedIndices.has(i)) {
        i++;
      }
      const excludedCount = i - excludeStart;

      // Only collapse if section is large enough
      if (excludedCount >= opts.collapseThreshold) {
        result.push({
          type: "context",
          content: `... ${excludedCount} lines omitted ...`,
        });
      } else {
        // Include all lines if section is small
        for (let j = excludeStart; j < i; j++) {
          result.push(lines[j]);
        }
      }
    }
  }

  // If still too long, truncate from the end
  if (result.length > opts.maxLines) {
    const truncated = result.slice(0, opts.maxLines);
    truncated.push({
      type: "context",
      content: `... ${result.length - opts.maxLines} more lines ...`,
    });
    return truncated;
  }

  return result;
}

/**
 * Format diff lines back to a unified diff string
 */
export function formatDiff(lines: DiffLine[]): string {
  return lines
    .map((line) => {
      switch (line.type) {
        case "addition":
          return `+${line.content}`;
        case "deletion":
          return `-${line.content}`;
        case "unchanged":
          return ` ${line.content}`;
        case "context":
          return line.content;
        default:
          return line.content;
      }
    })
    .join("\n");
}

/**
 * Smart diff rendering: parse, truncate, and format
 */
export function renderDiff(diff: string, options: TruncationOptions = {}): string {
  const parsed = parseDiff(diff);
  const truncated = truncateDiff(parsed, options);
  return formatDiff(truncated);
}

/**
 * Extract diff statistics (additions, deletions, unchanged)
 */
export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
  total: number;
}

export function getDiffStats(diff: string): DiffStats {
  const lines = parseDiff(diff);

  const stats: DiffStats = {
    additions: 0,
    deletions: 0,
    unchanged: 0,
    total: lines.length,
  };

  lines.forEach((line) => {
    if (line.type === "addition") stats.additions++;
    else if (line.type === "deletion") stats.deletions++;
    else if (line.type === "unchanged") stats.unchanged++;
  });

  return stats;
}
