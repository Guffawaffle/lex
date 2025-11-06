/**
 * CLI Command: lex recall
 * 
 * Searches Frames via query, returns Frame + Atlas Frame with pretty output.
 */

import type { Frame } from '../types/frame.js';
import { getDb, searchFrames, getFramesByJira, getFrameById } from '../../memory/store/index.js';
import { loadPolicy } from '../policy/loader.js';
import { computeFoldRadius, autoTuneRadius, estimateTokens, getCacheStats } from '../atlas/index.js';

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
        frames = searchFrames(db, query);
      }
    }

    if (frames.length === 0) {
      console.log(`\n❌ No frames found matching: "${query}"\n`);
      process.exit(1);
    }

    // Output results
    if (options.json) {
      // JSON output includes frames and their Atlas Frames
      const results = [];
      for (const frame of frames) {
        const atlasFrame = await generateAtlasFrame(frame, options.foldRadius || 1);
        results.push({
          frame,
          atlasFrame,
        });
      }
      console.log(JSON.stringify(results, null, 2));
    } else {
      // Pretty print results
      for (let i = 0; i < frames.length; i++) {
        if (i > 0) {
          console.log('\n' + '─'.repeat(80) + '\n');
        }
        await displayFrame(frames[i], options);
      }
      
      // Show cache stats if requested
      if (options.showCacheStats) {
        const stats = getCacheStats();
        console.log(`\n📊 Cache Statistics:`);
        console.log(`   Hits: ${stats.hits}`);
        console.log(`   Misses: ${stats.misses}`);
        console.log(`   Hit Rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)}%`);
        console.log(`   Cache Size: ${stats.size} entries`);
        console.log(`   Evictions: ${stats.evictions}`);
      }
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(2);
  }
}

/**
 * Display a Frame with Atlas Frame context
 */
async function displayFrame(frame: Frame, options: RecallOptions): Promise<void> {
  console.log(`\n📋 Frame: ${frame.jira || frame.id}`);
  console.log(`   Timestamp: ${new Date(frame.timestamp).toLocaleString()}`);
  console.log(`   Branch: ${frame.branch}`);
  console.log(`\n   Reference: "${frame.reference_point}"`);
  console.log(`\n   Summary: ${frame.summary_caption}`);
  
  console.log(`\n   Next action: ${frame.status_snapshot.next_action}`);
  
  if (frame.status_snapshot.blockers && frame.status_snapshot.blockers.length > 0) {
    console.log(`\n   Blockers:`);
    for (const blocker of frame.status_snapshot.blockers) {
      console.log(`     • ${blocker}`);
    }
  }
  
  if (frame.status_snapshot.merge_blockers && frame.status_snapshot.merge_blockers.length > 0) {
    console.log(`\n   Merge blockers:`);
    for (const blocker of frame.status_snapshot.merge_blockers) {
      console.log(`     • ${blocker}`);
    }
  }
  
  if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
    console.log(`\n   Tests failing:`);
    for (const test of frame.status_snapshot.tests_failing) {
      console.log(`     • ${test}`);
    }
  }

  if (frame.keywords && frame.keywords.length > 0) {
    console.log(`\n   Keywords: ${frame.keywords.join(', ')}`);
  }

  // Generate Atlas Frame with auto-tuning if enabled
  const atlasResult = await generateAtlasFrame(frame, options);
  
  if (atlasResult.autoTuned) {
    console.log(`\n⚙️  Auto-tuned radius: ${atlasResult.requestedRadius} → ${atlasResult.actualRadius} (${atlasResult.tokens} tokens)`);
  }
  
  const atlasFrame = atlasResult.atlasFrame;
  const foldRadius = atlasResult.actualRadius;
  
  console.log(`\n🗺️  Atlas Frame (fold radius ${foldRadius}):`);
  console.log(`\n   Modules in scope:`);
  for (const module of frame.module_scope) {
    console.log(`     • ${module}`);
  }
  
  if (atlasFrame) {
    console.log(`\n   Neighborhood (${atlasFrame.modules.length} modules within radius):`);
    
    // Just list all modules in the atlas
    for (const module of atlasFrame.modules) {
      console.log(`     • ${module.id}`);
    }
    
    // Show edges if any
    if (atlasFrame.edges && atlasFrame.edges.length > 0) {
      console.log(`\n   Edges (${atlasFrame.edges.length}):`);
      for (const edge of atlasFrame.edges.slice(0, 5)) { // Show max 5 edges
        const symbol = edge.reason === 'allowed' ? '✓' : '✗';
        console.log(`     ${symbol} ${edge.from} → ${edge.to} (${edge.reason})`);
      }
      if (atlasFrame.edges.length > 5) {
        console.log(`     ... and ${atlasFrame.edges.length - 5} more`);
      }
    }
    
    // Show token estimate
    if (options.autoRadius || options.maxTokens) {
      console.log(`\n   Token estimate: ${atlasResult.tokens} tokens`);
    }
  }
  
  console.log('');
}

/**
 * Generate Atlas Frame for a given Frame
 */
async function generateAtlasFrame(
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
          if (!options.json) {
            console.log(`\n⚙️  Auto-tuning: radius ${oldRadius} → ${newRadius} (${tokens} tokens exceeded ${limit} limit)`);
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
