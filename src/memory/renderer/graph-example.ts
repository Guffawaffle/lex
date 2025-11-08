#!/usr/bin/env node
/**
 * Example script demonstrating graph rendering
 * Run with: npx tsx memory/renderer/graph-example.ts
 */

import { renderAtlasFrameGraph, exportGraphAsPNG, type AtlasFrame } from "./graph.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Create example Atlas Frame based on the test policy
const exampleAtlasFrame: AtlasFrame = {
  atlas_timestamp: new Date().toISOString(),
  seed_modules: ["ui/admin-panel"],
  fold_radius: 1,
  modules: [
    {
      id: "ui/admin-panel",
      coords: [400, 300],
      owns_paths: ["ui/admin/**"],
      forbidden_callers: ["backend/auth"],
      feature_flags: ["admin_ui"],
      requires_permissions: ["admin_access"],
      notes: "Admin UI module",
    },
    {
      id: "api/user-service",
      coords: [200, 200],
      owns_paths: ["api/users/**"],
      allowed_callers: ["ui/admin-panel", "api/admin-service"],
      notes: "User management API",
    },
    {
      id: "api/admin-service",
      coords: [600, 200],
      owns_paths: ["api/admin/**"],
      allowed_callers: ["ui/admin-panel"],
      requires_permissions: ["admin_access"],
      notes: "Admin operations API",
    },
    {
      id: "backend/auth",
      coords: [400, 100],
      owns_paths: ["backend/auth/**"],
      allowed_callers: ["api/user-service", "api/admin-service"],
      forbidden_callers: ["ui/admin-panel"],
      notes: "Authentication backend",
    },
  ],
  edges: [
    {
      from: "ui/admin-panel",
      to: "api/user-service",
      allowed: true,
    },
    {
      from: "ui/admin-panel",
      to: "api/admin-service",
      allowed: true,
    },
    {
      from: "ui/admin-panel",
      to: "backend/auth",
      allowed: false,
      reason: "forbidden_caller",
    },
    {
      from: "api/user-service",
      to: "backend/auth",
      allowed: true,
    },
    {
      from: "api/admin-service",
      to: "backend/auth",
      allowed: true,
    },
  ],
  critical_rule: "Every module name MUST match the IDs in lexmap.policy.json",
};

async function main() {
  console.log("🎨 Atlas Frame Graph Rendering Example\n");

  // Create output directory
  const outputDir = "/tmp/atlas-graph-examples";
  mkdirSync(outputDir, { recursive: true });

  // Example 1: Basic force-directed layout
  console.log("Rendering force-directed layout...");
  const forceDirectedSVG = renderAtlasFrameGraph(exampleAtlasFrame, {
    layout: "force-directed",
    width: 800,
    height: 600,
  });
  const forceDirectedPath = join(outputDir, "force-directed.svg");
  writeFileSync(forceDirectedPath, forceDirectedSVG);
  console.log(`✓ Saved: ${forceDirectedPath}\n`);

  // Example 2: Hierarchical layout
  console.log("Rendering hierarchical layout...");
  const hierarchicalSVG = renderAtlasFrameGraph(exampleAtlasFrame, {
    layout: "hierarchical",
    width: 800,
    height: 600,
  });
  const hierarchicalPath = join(outputDir, "hierarchical.svg");
  writeFileSync(hierarchicalPath, hierarchicalSVG);
  console.log(`✓ Saved: ${hierarchicalPath}\n`);

  // Example 3: Custom colors
  console.log("Rendering with custom colors...");
  const customColorsSVG = renderAtlasFrameGraph(exampleAtlasFrame, {
    nodeColors: {
      "ui/admin-panel": "#FF6B6B",
      "api/user-service": "#4ECDC4",
      "api/admin-service": "#45B7D1",
      "backend/auth": "#96CEB4",
    },
  });
  const customColorsPath = join(outputDir, "custom-colors.svg");
  writeFileSync(customColorsPath, customColorsSVG);
  console.log(`✓ Saved: ${customColorsPath}\n`);

  // Example 4: Export as PNG
  console.log("Exporting as PNG...");
  const svg = renderAtlasFrameGraph(exampleAtlasFrame);
  const png = await exportGraphAsPNG(svg, { width: 800, height: 600 });
  const pngPath = join(outputDir, "graph.png");
  writeFileSync(pngPath, png);
  console.log(`✓ Saved: ${pngPath} (${png.length} bytes)\n`);

  console.log("✨ Example complete!");
  console.log(`\nGenerated files:`);
  console.log(`  ${forceDirectedPath}`);
  console.log(`  ${hierarchicalPath}`);
  console.log(`  ${customColorsPath}`);
  console.log(`  ${pngPath}`);
  console.log(`\nVisualization features:`);
  console.log(`  ✓ Seed modules highlighted with bold borders`);
  console.log(`  ✓ Green arrows for allowed dependencies`);
  console.log(`  ✓ Red dashed arrows with ⚠️ for forbidden dependencies`);
  console.log(`  ✓ Node size based on number of dependencies`);
  console.log(`  ✓ Color coding by module type`);
  console.log(`  ✓ Interactive hover tooltips (in SVG)`);
}

main().catch(console.error);
