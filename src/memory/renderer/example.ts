#!/usr/bin/env node
/**
 * Example: Memory card rendering
 * Demonstrates how to generate a visual memory card from Frame metadata
 */

import { renderMemoryCard } from "./card.js";
import type { Frame } from "./types.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Create example Frame
const exampleFrame: Frame = {
  id: "frame-example-" + Date.now(),
  timestamp: new Date().toISOString(),
  branch: "feature/memory-card-rendering",
  jira: "LEX-1",
  module_scope: ["memory/renderer", "memory/frames"],
  summary_caption: "Implementing memory card visual rendering for Frame snapshots",
  reference_point: "Visual compression for LLM vision models",
  status_snapshot: {
    next_action: "Complete implementation, add tests, and create documentation",
    blockers: ["Need to verify canvas rendering on different platforms"],
    merge_blockers: [],
    tests_failing: [],
  },
  keywords: ["memory", "rendering", "canvas", "visual", "llm"],
  atlas_frame_id: "atlas-frame-example",
};

// Example with raw context
const rawContext = `
Recent activity:
[2024-11-02 17:00] Created renderer directory structure
[2024-11-02 17:05] Implemented templates.ts with layout functions
[2024-11-02 17:10] Implemented card.ts with rendering logic
[2024-11-02 17:15] Added comprehensive test suite
[2024-11-02 17:18] All tests passing ✓

Recent changes:
+ Created memory/renderer/card.ts with image rendering
+ Added templates.ts for layout configuration
+ Implemented comprehensive test suite
+ All 5+ test cases passing successfully
`;

async function main() {
  console.log("🎨 Memory Card Rendering Example\n");

  // Create output directory
  const outputDir = "/tmp/memory-card-example";
  mkdirSync(outputDir, { recursive: true });

  // Render without raw context
  console.log("Rendering basic memory card...");
  const basicBuffer = await renderMemoryCard(exampleFrame);
  const basicPath = join(outputDir, "example-basic.png");
  writeFileSync(basicPath, basicBuffer);
  console.log(`✓ Saved: ${basicPath} (${basicBuffer.length} bytes)\n`);

  // Render with raw context
  console.log("Rendering memory card with raw context...");
  const contextBuffer = await renderMemoryCard(exampleFrame, rawContext);
  const contextPath = join(outputDir, "example-with-context.png");
  writeFileSync(contextPath, contextBuffer);
  console.log(`✓ Saved: ${contextPath} (${contextBuffer.length} bytes)\n`);

  console.log("✨ Example complete!");
  console.log(`\nOpen the generated PNG files to see the results:`);
  console.log(`  ${basicPath}`);
  console.log(`  ${contextPath}`);
}

main().catch(console.error);
