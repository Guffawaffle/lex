/**
 * Wave Completion Frame Type Definition
 *
 * Specialized frame type for capturing wave completion metadata.
 * A wave is a set of related issues that are worked on together (fanout pattern).
 */

import { z } from "zod";

/**
 * Wave issue metadata
 */
export const WaveIssue = z.object({
  ref: z.string().describe("Issue reference (e.g., 'lexsona#111')"),
  title: z.string().describe("Issue title"),
  closedAt: z.string().describe("ISO 8601 timestamp when issue was closed"),
  pr: z.string().optional().describe("Pull request reference (e.g., 'lexsona#115')"),
});

export type WaveIssue = z.infer<typeof WaveIssue>;

/**
 * Wave duration metadata
 */
export const WaveDuration = z.object({
  started: z.string().describe("ISO 8601 timestamp of first issue assignment"),
  completed: z.string().describe("ISO 8601 timestamp of last issue closure"),
  elapsed: z.string().describe("Human-readable duration (e.g., '3h 45m')"),
});

export type WaveDuration = z.infer<typeof WaveDuration>;

/**
 * Wave metrics
 */
export const WaveMetrics = z.object({
  issueCount: z.number().describe("Number of issues in the wave"),
  prCount: z.number().describe("Number of pull requests"),
  linesAdded: z.number().describe("Total lines added across all PRs"),
  linesRemoved: z.number().describe("Total lines removed across all PRs"),
  testsAdded: z.number().describe("Number of tests added"),
});

export type WaveMetrics = z.infer<typeof WaveMetrics>;

/**
 * Next wave suggestion
 */
export const NextWave = z.object({
  suggested: z.array(z.string()).describe("Suggested issue references for next wave"),
  rationale: z.string().describe("Rationale for the suggestion"),
});

export type NextWave = z.infer<typeof NextWave>;

/**
 * Wave completion structured content
 */
export const WaveCompleteContent = z.object({
  waveId: z.string().describe("Wave identifier (e.g., 'wave-2')"),
  epicRef: z.string().describe("Epic issue reference (e.g., 'lexrunner#653')"),
  issues: z.array(WaveIssue).describe("Issues included in the wave"),
  duration: WaveDuration.describe("Wave duration information"),
  metrics: WaveMetrics.describe("Wave completion metrics"),
  nextWave: NextWave.optional().describe("Suggested next wave"),
});

export type WaveCompleteContent = z.infer<typeof WaveCompleteContent>;

/**
 * Wave completion frame
 *
 * This extends the base Frame type with wave-specific metadata.
 * The structured content is stored in a custom field for backward compatibility.
 */
export const WaveCompleteFrame = z.object({
  type: z.literal("wave-complete"),
  summary_caption: z.string().describe("Human-readable summary of wave completion"),
  structured_content: WaveCompleteContent,
  keywords: z
    .array(z.string())
    .describe("Keywords for searchability (includes 'wave', 'fanout', 'complete', epic labels)"),
});

export type WaveCompleteFrame = z.infer<typeof WaveCompleteFrame>;

/**
 * Format elapsed time in human-readable format
 *
 * @param startTime - Start time ISO string
 * @param endTime - End time ISO string
 * @returns Human-readable duration (e.g., "3h 45m", "2d 5h")
 */
export function formatElapsedTime(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) {
    return "0m";
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

/**
 * Generate wave completion summary caption
 *
 * @param content - Wave completion content
 * @returns Summary caption string
 */
export function generateSummaryCaption(content: WaveCompleteContent): string {
  const { waveId, metrics, duration } = content;
  const netLines = metrics.linesAdded - metrics.linesRemoved;
  const lineChange = netLines >= 0 ? `+${netLines}` : `${netLines}`;

  return `${waveId} complete: ${metrics.issueCount} issues closed, ${lineChange} lines, ${metrics.testsAdded} tests added (${duration.elapsed})`;
}

/**
 * Generate keywords for wave completion frame
 *
 * @param content - Wave completion content
 * @param epicLabels - Additional labels from the epic
 * @returns Array of keywords for searchability
 */
export function generateWaveKeywords(
  content: WaveCompleteContent,
  epicLabels: string[] = []
): string[] {
  return ["wave", "fanout", "complete", content.waveId, ...epicLabels];
}
