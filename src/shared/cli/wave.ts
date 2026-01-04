/**
 * CLI Command: lex wave complete
 *
 * Emit wave completion frame with aggregated metrics from all wave issues/PRs.
 */

import { v4 as uuidv4 } from "uuid";
import type { Frame } from "../types/frame.js";
import {
  type WaveCompleteContent,
  type WaveIssue,
  formatElapsedTime,
  generateSummaryCaption,
  generateWaveKeywords,
} from "../../memory/frames/wave-complete.js";
import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { getCurrentBranch } from "../git/branch.js";
import { createOutput } from "./output.js";
import { createAXError } from "../errors/ax-error.js";
import {
  aggregateWaveMetrics,
  fetchWaveIssues,
  suggestNextWave,
} from "../../github/wave-metrics.js";

export interface WaveCompleteOptions {
  epic: string; // Epic reference (e.g., 'lexrunner#653')
  wave: string; // Wave identifier (e.g., 'wave-2' or just '2')
  issues?: WaveIssue[]; // Manually provided issues (optional)
  epicLabels?: string[]; // Epic labels for keywords (optional)
  json?: boolean;
}

/**
 * Execute the 'lex wave complete' command
 * Emits a wave completion frame with aggregated metrics
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection
 */
export async function waveComplete(
  options: WaveCompleteOptions,
  frameStore?: FrameStore
): Promise<void> {
  const out = createOutput({
    scope: "cli:wave",
    mode: options.json ? "jsonl" : "plain",
  });

  // Validate required options
  if (options.json) {
    const missingRequired: string[] = [];
    if (!options.epic) missingRequired.push("--epic");
    if (!options.wave) missingRequired.push("--wave");

    if (missingRequired.length > 0) {
      const axError = createAXError(
        "MISSING_REQUIRED_PARAMS",
        `Missing required parameters: ${missingRequired.join(", ")}`,
        [
          ...missingRequired.map((p) => `Add ${p} parameter`),
          "Example: lex wave complete --epic lexrunner#653 --wave 2",
        ],
        { missingParams: missingRequired }
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
      process.exit(1);
    }
  }

  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    // Normalize wave ID
    const waveId = options.wave.startsWith("wave-") ? options.wave : `wave-${options.wave}`;

    // Fetch or use provided issues
    const issues = options.issues ?? (await fetchWaveIssues(options.epic, waveId));

    if (issues.length === 0) {
      if (!options.json) {
        out.error(`\n❌ No issues found for ${waveId} in epic ${options.epic}\n`);
        out.info("Tip: Provide issues manually with --issues option or check GitHub labels\n");
      } else {
        const axError = createAXError(
          "NO_WAVE_ISSUES",
          `No issues found for ${waveId} in epic ${options.epic}`,
          [
            "Check that the wave label exists on issues",
            "Provide issues manually with --issues option",
            `Verify epic reference: ${options.epic}`,
          ],
          { waveId, epicRef: options.epic }
        );
        out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
      }
      process.exit(1);
    }

    // Aggregate metrics
    const metrics = await aggregateWaveMetrics(options.epic, waveId);

    // Calculate duration
    const sortedIssues = [...issues].sort(
      (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime()
    );
    const started = sortedIssues[0]?.closedAt ?? new Date().toISOString();
    const completed = sortedIssues[sortedIssues.length - 1]?.closedAt ?? new Date().toISOString();
    const elapsed = formatElapsedTime(started, completed);

    // Suggest next wave
    const suggestedIssues = await suggestNextWave(options.epic);
    const nextWave =
      suggestedIssues.length > 0
        ? {
            suggested: suggestedIssues,
            rationale: `Based on remaining issues in ${options.epic}`,
          }
        : undefined;

    // Build wave completion content
    const waveContent: WaveCompleteContent = {
      waveId,
      epicRef: options.epic,
      issues,
      duration: {
        started,
        completed,
        elapsed,
      },
      metrics,
      nextWave,
    };

    // Generate frame metadata
    const summaryCaption = generateSummaryCaption(waveContent);
    const keywords = generateWaveKeywords(waveContent, options.epicLabels);
    const branch = await getCurrentBranch();

    // Create frame with wave completion data
    // Store wave-specific data in keywords and reference_point for searchability
    const frame: Frame = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      branch,
      jira: options.epic,
      module_scope: ["memory/frames"], // Wave frames relate to memory/frames module
      summary_caption: summaryCaption,
      reference_point: `${waveId} ${options.epic} complete`,
      status_snapshot: {
        next_action: nextWave
          ? `Start next wave with issues: ${nextWave.suggested.join(", ")}`
          : "Wave complete, no next wave suggested",
      },
      keywords,
    };

    // Save frame
    await store.saveFrame(frame);

    // Output success
    if (!options.json) {
      out.success(`\n✓ Frame created: wave-complete-${waveId}`);
      out.info(`  ${metrics.issueCount} issues, ${elapsed} elapsed`);
      out.info(
        `  ${metrics.linesAdded > 0 ? "+" : ""}${metrics.linesAdded} lines, ${metrics.testsAdded} tests added\n`
      );

      if (nextWave) {
        out.info(`\n💡 Suggested next wave:`);
        nextWave.suggested.forEach((issue) => out.info(`  - ${issue}`));
        out.info(`\n${nextWave.rationale}\n`);
      }
    } else {
      out.json({
        level: "info",
        message: "Wave completion frame created",
        data: {
          frameId: frame.id,
          waveId,
          epicRef: options.epic,
          summary: summaryCaption,
          metrics,
          duration: waveContent.duration,
          nextWave,
        },
      });
    }
  } catch (error) {
    if (!options.json) {
      out.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    } else {
      const axError = createAXError(
        "WAVE_COMPLETE_FAILED",
        error instanceof Error ? error.message : String(error),
        ["Check error details", "Verify GitHub API access if using live data"],
        { error: String(error) }
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
    }
    process.exit(1);
  } finally {
    if (ownsStore) {
      store.close();
    }
  }
}
