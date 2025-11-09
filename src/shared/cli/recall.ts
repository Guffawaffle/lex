/**
 * CLI Command: lex recall
 *
 * Searches Frames via query, returns Frame + Atlas Frame with pretty output.
 */

import type { Frame } from "../types/frame.js";
import { getDb, searchFrames, getFramesByJira, getFrameById } from "../../memory/store/index.js";
import { loadPolicy } from "../policy/loader.js";
import {
  generateAtlasFrame,
  computeFoldRadius,
  autoTuneRadius,
  estimateTokens,
  getCacheStats,
} from "../atlas/index.js";
import * as output from "./output.js";

export interface RecallOptions {
  json?: boolean;
  foldRadius?: number;
  autoRadius?: boolean;
  maxTokens?: number;
  showCacheStats?: boolean;
}

/**
 * Execute the 'lex recall' command
 * Searches for Frames and displays results with Atlas Frame context
 */
export async function recall(query: string, options: RecallOptions = {}): Promise<void> {
  try {
    const db = getDb();
    let frames: Frame[] = [];
    let searchHint: string | undefined;

    // Try different search strategies
    // 1. Try as Frame ID (exact match)
    const frameById = getFrameById(db, query);
    if (frameById) {
      frames = [frameById];
    } else {
      // 2. Try as Jira ticket (exact match)
      const framesByJira = getFramesByJira(db, query);
      if (framesByJira.length > 0) {
        frames = framesByJira;
      } else {
        // 3. Try as reference point (fuzzy search)
        const searchResult = searchFrames(db, query);
        frames = searchResult.frames;
        searchHint = searchResult.hint;
      }
    }

    if (frames.length === 0) {
      // Print hint to stderr if FTS5 syntax error occurred
      if (searchHint) {
        output.error(`\n⚠️  ${searchHint}\n`);
      }
      output.info(`\n❌ No frames found matching: "${query}"\n`);
      process.exit(1);
    }

    // Output results
    if (options.json) {
      // JSON output includes frames and their Atlas Frames
      const results = [];
      for (const frame of frames) {
        const atlasResult = await generateAtlasFrameWithAutoTune(frame, options);
        results.push({
          frame,
          atlasFrame: atlasResult.atlasFrame,
          foldRadius: atlasResult.actualRadius,
          autoTuned: atlasResult.autoTuned,
          tokens: atlasResult.tokens,
        });
      }
      output.json(results);
    } else {
      // Pretty print results
      for (let i = 0; i < frames.length; i++) {
        if (i > 0) {
          output.info("\n" + "─".repeat(80) + "\n");
        }
        await displayFrame(frames[i], options);
      }

      // Show cache stats if requested
      if (options.showCacheStats) {
        const stats = getCacheStats();
        const total = stats.hits + stats.misses;
        const hitRate = total === 0 ? 0 : (stats.hits / total) * 100;

        output.info(`\n📊 Cache Statistics:`);
        output.info(`   Hits: ${stats.hits}`);
        output.info(`   Misses: ${stats.misses}`);
        output.info(`   Hit Rate: ${hitRate.toFixed(1)}%`);
        output.info(`   Cache Size: ${stats.size} entries`);
        output.info(`   Evictions: ${stats.evictions}`);
      }
    }
  } catch (error: any) {
    output.error(`\n❌ Error: ${error.message}\n`);
    process.exit(2);
  }
}

/**
 * Display a Frame with Atlas Frame context
 */
async function displayFrame(frame: Frame, options: RecallOptions): Promise<void> {
  output.info(`\n📋 Frame: ${frame.jira || frame.id}`);
  output.info(`   Timestamp: ${new Date(frame.timestamp).toLocaleString()}`);
  output.info(`   Branch: ${frame.branch}`);
  output.info(`\n   Reference: "${frame.reference_point}"`);
  output.info(`\n   Summary: ${frame.summary_caption}`);

  output.info(`\n   Next action: ${frame.status_snapshot.next_action}`);

  if (frame.status_snapshot.blockers && frame.status_snapshot.blockers.length > 0) {
    output.info(`\n   Blockers:`);
    for (const blocker of frame.status_snapshot.blockers) {
      output.info(`     • ${blocker}`);
    }
  }

  if (frame.status_snapshot.merge_blockers && frame.status_snapshot.merge_blockers.length > 0) {
    output.info(`\n   Merge blockers:`);
    for (const blocker of frame.status_snapshot.merge_blockers) {
      output.info(`     • ${blocker}`);
    }
  }

  if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
    output.info(`\n   Tests failing:`);
    for (const test of frame.status_snapshot.tests_failing) {
      output.info(`     • ${test}`);
    }
  }

  if (frame.keywords && frame.keywords.length > 0) {
    output.info(`\n   Keywords: ${frame.keywords.join(", ")}`);
  }

  // Generate Atlas Frame with auto-tuning if enabled
  const atlasResult = await generateAtlasFrameWithAutoTune(frame, options);

  if (atlasResult.autoTuned) {
    output.info(
      `\n⚙️  Auto-tuned radius: ${atlasResult.requestedRadius} → ${atlasResult.actualRadius} (${atlasResult.tokens} tokens)`
    );
  }

  const atlasFrame = atlasResult.atlasFrame;
  const foldRadius = atlasResult.actualRadius;

  output.info(`\n🗺️  Atlas Frame (fold radius ${foldRadius}):`);
  output.info(`\n   Modules in scope:`);
  for (const module of frame.module_scope) {
    output.info(`     • ${module}`);
  }

  if (atlasFrame) {
    output.info(`\n   Neighborhood (${atlasFrame.modules.length} modules within radius):`);

    // Just list all modules in the atlas
    for (const module of atlasFrame.modules) {
      output.info(`     • ${module.id}`);
    }

    // Show edges if any
    if (atlasFrame.edges && atlasFrame.edges.length > 0) {
      output.info(`\n   Edges (${atlasFrame.edges.length}):`);
      for (const edge of atlasFrame.edges.slice(0, 5)) {
        // Show max 5 edges
        const symbol = edge.reason === "allowed" ? "✓" : "✗";
        output.info(`     ${symbol} ${edge.from} → ${edge.to} (${edge.reason})`);
      }
      if (atlasFrame.edges.length > 5) {
        output.info(`     ... and ${atlasFrame.edges.length - 5} more`);
      }
    }

    // Show token estimate
    if (options.autoRadius || options.maxTokens) {
      output.info(`\n   Token estimate: ${atlasResult.tokens} tokens`);
    }
  }

  output.info("");
}

/**
 * Generate Atlas Frame with auto-tuning support
 */
async function generateAtlasFrameWithAutoTune(
  frame: Frame,
  options: RecallOptions
): Promise<{
  atlasFrame: any;
  actualRadius: number;
  requestedRadius: number;
  tokens: number;
  autoTuned: boolean;
}> {
  try {
    const policy = loadPolicy();

    // For now, use all modules in scope as seeds
    if (frame.module_scope.length === 0) {
      return {
        atlasFrame: null,
        actualRadius: 0,
        requestedRadius: options.foldRadius || 1,
        tokens: 0,
        autoTuned: false,
      };
    }

    const requestedRadius = options.foldRadius || 1;

    // Auto-tune radius if enabled
    if (options.autoRadius && options.maxTokens) {
      const result = autoTuneRadius(
        (radius) => computeFoldRadius(frame.module_scope, radius, policy),
        requestedRadius,
        options.maxTokens,
        (oldRadius, newRadius, tokens, limit) => {
          // Only log adjustments when not in JSON mode
          if (!options.json) {
            output.info(
              `\n⚙️  Auto-tuning: radius ${oldRadius} → ${newRadius} (${tokens} tokens exceeded ${limit} limit)`
            );
          }
        }
      );

      return {
        atlasFrame: result.atlasFrame,
        actualRadius: result.radiusUsed,
        requestedRadius,
        tokens: result.tokensUsed,
        autoTuned: result.radiusUsed !== requestedRadius,
      };
    }

    // Normal generation without auto-tuning
    const atlasFrame = computeFoldRadius(frame.module_scope, requestedRadius, policy);
    const tokens = estimateTokens(atlasFrame);

    return {
      atlasFrame,
      actualRadius: requestedRadius,
      requestedRadius,
      tokens,
      autoTuned: false,
    };
  } catch (error) {
    // If Atlas Frame generation fails, continue without it
    console.warn(`   Warning: Could not generate Atlas Frame: ${error}`);
    return {
      atlasFrame: null,
      actualRadius: 0,
      requestedRadius: options.foldRadius || 1,
      tokens: 0,
      autoTuned: false,
    };
  }
}
