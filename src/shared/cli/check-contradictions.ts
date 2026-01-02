/**
 * CLI Command: lex check contradictions
 *
 * Scans all frames for contradictions and reports them with confidence scores.
 */

import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { scanForContradictions } from "../../memory/contradictions.js";
import { formatContradiction } from "../../memory/resolution.js";
import { createOutput } from "./output.js";

export interface CheckContradictionsOptions {
  /** Filter by module ID */
  module?: string;
  /** Output in JSON format */
  json?: boolean;
}

/**
 * Execute the 'lex check contradictions' command
 * Scans all frames for contradictions
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection
 */
export async function checkContradictions(
  options: CheckContradictionsOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  const out = createOutput({
    scope: "cli:check:contradictions",
    mode: options.json ? "jsonl" : "plain",
  });

  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    // Retrieve all frames
    const result = await store.listFrames({ limit: 10000 });
    const frames = result.frames;

    if (frames.length === 0) {
      if (options.json) {
        out.json({
          level: "info",
          data: { contradictions: [], totalFrames: 0, moduleFilter: options.module },
        });
      } else {
        out.info("\nNo frames found in database\n");
      }
      return;
    }

    // Scan for contradictions
    const contradictions = scanForContradictions(frames, options.module);

    if (options.json) {
      out.json({
        level: "info",
        data: {
          totalFrames: frames.length,
          contradictions: contradictions.map((c) => {
            const frameA = frames.find((f) => f.id === c.frameA);
            const frameB = frames.find((f) => f.id === c.frameB);
            return {
              frameA: {
                id: frameA?.id,
                timestamp: frameA?.timestamp,
                summary: frameA?.summary_caption,
                modules: frameA?.module_scope,
              },
              frameB: {
                id: frameB?.id,
                timestamp: frameB?.timestamp,
                summary: frameB?.summary_caption,
                modules: frameB?.module_scope,
              },
              signal: c.signal,
              moduleOverlap: c.moduleOverlap,
            };
          }),
          moduleFilter: options.module,
        },
      });
      return;
    }

    // Display results in plain text
    out.info(
      `\n🔍 Checking for contradictions in ${frames.length} frame${frames.length === 1 ? "" : "s"}...`
    );
    if (options.module) {
      out.info(`   Module filter: ${options.module}`);
    }
    out.info("");

    if (contradictions.length === 0) {
      out.success("✅ No contradictions found\n");
      return;
    }

    out.warn(
      `Found ${contradictions.length} potential contradiction${contradictions.length === 1 ? "" : "s"}:\n`
    );

    // Display each contradiction
    for (let i = 0; i < contradictions.length; i++) {
      const contradiction = contradictions[i];
      const frameA = frames.find((f) => f.id === contradiction.frameA);
      const frameB = frames.find((f) => f.id === contradiction.frameB);

      if (!frameA || !frameB) continue;

      out.info(`${"=".repeat(70)}`);
      out.info(
        `CONTRADICTION ${i + 1} (confidence: ${(contradiction.signal!.confidence * 100).toFixed(0)}%)`
      );
      out.info(`${"=".repeat(70)}`);
      out.info("");

      // Determine which is older
      const dateA = new Date(frameA.timestamp);
      const dateB = new Date(frameB.timestamp);
      const [olderFrame, newerFrame] = dateA < dateB ? [frameA, frameB] : [frameB, frameA];

      out.info(`Frame A (older): ${olderFrame.id}`);
      out.info(`  Date: ${olderFrame.timestamp}`);
      out.info(`  Summary: "${olderFrame.summary_caption}"`);
      out.info(`  Module: ${contradiction.moduleOverlap.join(", ")}`);
      if (olderFrame.keywords?.length) {
        out.info(`  Keywords: [${olderFrame.keywords.join(", ")}]`);
      }
      out.info("");

      out.info(`Frame B (newer): ${newerFrame.id}`);
      out.info(`  Date: ${newerFrame.timestamp}`);
      out.info(`  Summary: "${newerFrame.summary_caption}"`);
      out.info(`  Module: ${contradiction.moduleOverlap.join(", ")}`);
      if (newerFrame.keywords?.length) {
        out.info(`  Keywords: [${newerFrame.keywords.join(", ")}]`);
      }
      out.info("");

      out.warn(`⚠️  Conflict: ${contradiction.signal!.explanation}`);
      out.info(`   Type: ${contradiction.signal!.type}`);
      out.info("");
    }

    out.info(`${"=".repeat(70)}\n`);
    out.info(
      "💡 To resolve contradictions, you can manually update or supersede frames using 'lex remember'\n"
    );
  } finally {
    if (ownsStore) {
      await store.close();
    }
  }
}
