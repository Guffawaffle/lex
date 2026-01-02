/**
 * CLI Command: lex dedupe
 *
 * Detects and consolidates duplicate frames based on similarity scoring.
 * Supports dry-run mode to preview duplicates without modifying the database.
 */

import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { detectDuplicateFrames } from "../../memory/deduplication.js";
import { consolidateViaSupersede, consolidateViaMerge } from "../../memory/store/consolidate.js";
import { createOutput } from "./output.js";

export interface DedupeOptions {
  /** Show what would be consolidated without making changes */
  dryRun?: boolean;
  /** Similarity threshold (0.0 - 1.0) */
  threshold?: number;
  /** Automatically consolidate without prompting */
  auto?: boolean;
  /** Show duplicate candidates */
  showCandidates?: boolean;
  /** Output in JSON format */
  json?: boolean;
}

/**
 * Execute the 'lex dedupe' command
 * Detects and consolidates duplicate frames
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection
 */
export async function dedupe(options: DedupeOptions = {}, frameStore?: FrameStore): Promise<void> {
  const out = createOutput({
    scope: "cli:dedupe",
    mode: options.json ? "jsonl" : "plain",
  });

  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    const threshold = options.threshold ?? 0.85;

    // Retrieve all frames
    const result = await store.listFrames({ limit: 10000 });
    const frames = result.frames;

    if (frames.length === 0) {
      if (options.json) {
        out.json({
          level: "info",
          data: { duplicateGroups: 0, totalFrames: 0, duplicates: [] },
        });
      } else {
        out.info("\nNo frames found in database\n");
      }
      return;
    }

    // Detect duplicates
    const dedupeResult = detectDuplicateFrames(frames, {
      threshold,
      dryRun: options.dryRun,
      auto: options.auto,
    });

    if (options.json) {
      out.json({
        level: "info",
        data: {
          totalFrames: dedupeResult.totalFrames,
          duplicateGroups: dedupeResult.duplicateGroups,
          threshold,
          duplicates: dedupeResult.duplicates.map((dup, idx) => ({
            frameA: dup.frameA,
            frameB: dup.frameB,
            similarity: dup.overall,
            dimensions: dup.dimensions,
            strategy: dedupeResult.strategies[idx],
          })),
          dryRun: options.dryRun ?? false,
        },
      });
      return;
    }

    // Display results
    out.info(`\n🔍 Analyzing ${dedupeResult.totalFrames} frames...`);
    out.info(`📊 Threshold: ${(threshold * 100).toFixed(0)}%\n`);

    if (dedupeResult.duplicateGroups === 0) {
      out.success("✅ No duplicate frames found\n");
      return;
    }

    out.info(`Found ${dedupeResult.duplicateGroups} duplicate pair(s):\n`);

    // Display each duplicate pair
    for (let i = 0; i < dedupeResult.duplicates.length; i++) {
      const dup = dedupeResult.duplicates[i];
      const strategy = dedupeResult.strategies[i];

      const frameA = frames.find((f) => f.id === dup.frameA);
      const frameB = frames.find((f) => f.id === dup.frameB);

      if (!frameA || !frameB) continue;

      out.info(`\n${"=".repeat(60)}`);
      out.info(`Duplicate ${i + 1}: ${(dup.overall * 100).toFixed(1)}% similar`);
      out.info(`${"=".repeat(60)}`);
      out.info(`\nFrame A: ${frameA.id}`);
      out.info(`  Time: ${frameA.timestamp}`);
      out.info(`  Summary: ${frameA.summary_caption}`);
      out.info(`  Reference: ${frameA.reference_point}`);
      out.info(`  Modules: ${frameA.module_scope.join(", ")}`);
      if (frameA.keywords?.length) {
        out.info(`  Keywords: ${frameA.keywords.join(", ")}`);
      }

      out.info(`\nFrame B: ${frameB.id}`);
      out.info(`  Time: ${frameB.timestamp}`);
      out.info(`  Summary: ${frameB.summary_caption}`);
      out.info(`  Reference: ${frameB.reference_point}`);
      out.info(`  Modules: ${frameB.module_scope.join(", ")}`);
      if (frameB.keywords?.length) {
        out.info(`  Keywords: ${frameB.keywords.join(", ")}`);
      }

      out.info(`\nSimilarity Breakdown:`);
      out.info(`  Semantic (keywords): ${(dup.dimensions.semantic * 100).toFixed(1)}%`);
      out.info(`  Structural (modules): ${(dup.dimensions.structural * 100).toFixed(1)}%`);
      out.info(`  Temporal (time): ${(dup.dimensions.temporal * 100).toFixed(1)}%`);

      out.info(`\n📋 Strategy: ${strategy.mode.toUpperCase()}`);
      out.info(`   Rationale: ${strategy.rationale}`);

      if (strategy.mergedFrame && (strategy.mode === "merge" || strategy.mode === "supersede")) {
        out.info(`\nConsolidated Frame:`);
        out.info(`  Summary: ${strategy.mergedFrame.summary_caption}`);
        out.info(`  Reference: ${strategy.mergedFrame.reference_point}`);
        out.info(`  Modules: ${strategy.mergedFrame.module_scope.join(", ")}`);
      }
    }

    out.info(`\n${"=".repeat(60)}\n`);

    if (options.dryRun) {
      out.info("🔍 Dry run complete. Use `lex dedupe --auto` to consolidate these duplicates.\n");
      return;
    }

    if (!options.auto) {
      out.info("ℹ️  Use `lex dedupe --auto` to consolidate duplicates automatically.\n");
      return;
    }

    // Perform consolidation
    out.info("🔄 Consolidating duplicates...\n");

    let consolidated = 0;
    for (let i = 0; i < dedupeResult.duplicates.length; i++) {
      const dup = dedupeResult.duplicates[i];
      const strategy = dedupeResult.strategies[i];

      const frameA = frames.find((f) => f.id === dup.frameA);
      const frameB = frames.find((f) => f.id === dup.frameB);

      if (!frameA || !frameB) continue;

      try {
        if (strategy.mode === "supersede" && strategy.mergedFrame) {
          const supersededFrame = strategy.mergedFrame.id === frameA.id ? frameB : frameA;
          await consolidateViaSupersede(store, strategy.mergedFrame, supersededFrame);
          out.success(`✅ Superseded ${supersededFrame.id}`);
          consolidated++;
        } else if (strategy.mode === "merge" && strategy.mergedFrame) {
          await consolidateViaMerge(store, strategy.mergedFrame, frameA, frameB);
          out.success(`✅ Merged ${frameA.id} and ${frameB.id}`);
          consolidated++;
        } else if (strategy.mode === "keep-both") {
          out.info(`ℹ️  Kept both ${frameA.id} and ${frameB.id}`);
        }
      } catch (error) {
        out.error(
          `❌ Failed to consolidate ${frameA.id} and ${frameB.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    out.success(`\n✅ Consolidated ${consolidated} duplicate pair(s)\n`);
  } finally {
    if (ownsStore) {
      await store.close();
    }
  }
}
