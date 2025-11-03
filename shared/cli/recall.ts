/**
 * CLI Command: lex recall
 * 
 * Searches Frames via query, returns Frame + Atlas Frame with pretty output.
 */

import type { Frame } from '../types/frame.js';
import { getDb, searchFrames, getFramesByJira, getFrameById } from '../../memory/store/index.js';
import { loadPolicy } from '../policy/loader.js';
import { computeFoldRadius } from '../atlas/index.js';

export interface RecallOptions {
  json?: boolean;
  foldRadius?: number;
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
        await displayFrame(frames[i], options.foldRadius || 1);
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
async function displayFrame(frame: Frame, foldRadius: number): Promise<void> {
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

  // Generate and display Atlas Frame
  const atlasFrame = await generateAtlasFrame(frame, foldRadius);
  
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
  }
  
  console.log('');
}

/**
 * Generate Atlas Frame for a given Frame
 */
async function generateAtlasFrame(frame: Frame, foldRadius: number): Promise<any> {
  try {
    const policy = loadPolicy();
    
    // For now, use all modules in scope as seeds
    if (frame.module_scope.length === 0) {
      return null;
    }
    
    const atlasFrame = computeFoldRadius(frame.module_scope, foldRadius, policy);
    
    return atlasFrame;
  } catch (error) {
    // If Atlas Frame generation fails, continue without it
    console.warn(`   Warning: Could not generate Atlas Frame: ${error}`);
    return null;
  }
}
