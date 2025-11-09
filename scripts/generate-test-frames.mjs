#!/usr/bin/env node
/**
 * Generate synthetic test Frames for Atlas rebuild performance testing
 *
 * Usage:
 *   node scripts/generate-test-frames.mjs <count> [output-file]
 *
 * Examples:
 *   node scripts/generate-test-frames.mjs 1000 test-frames-1k.json
 *   node scripts/generate-test-frames.mjs 10000 test-frames-10k.json
 */

import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

// Sample module names for generating realistic test data
const MODULES = [
  // UI modules
  "ui/admin-panel",
  "ui/dashboard",
  "ui/settings",
  "ui/user-profile",
  "ui/components/button",
  "ui/components/modal",
  "ui/components/table",
  "ui/layouts/main",
  "ui/layouts/sidebar",
  
  // API modules
  "api/users",
  "api/auth",
  "api/posts",
  "api/comments",
  "api/notifications",
  "api/search",
  "api/analytics",
  "api/admin",
  
  // Backend modules
  "backend/database",
  "backend/cache",
  "backend/queue",
  "backend/storage",
  "backend/email",
  "backend/logging",
  
  // Services
  "services/payment",
  "services/notification",
  "services/email",
  "services/sms",
  "services/analytics",
  "services/search",
  "services/ml",
  
  // Infrastructure
  "infra/monitoring",
  "infra/deployment",
  "infra/security",
  "infra/networking",
];

// Sample branch names
const BRANCHES = [
  "main",
  "develop",
  "feature/user-auth",
  "feature/dashboard-redesign",
  "feature/api-v2",
  "bugfix/login-issue",
  "bugfix/performance",
  "release/v1.0",
  "release/v2.0",
];

// Sample actions for reference points
const ACTIONS = [
  "Implement",
  "Fix",
  "Refactor",
  "Add",
  "Update",
  "Remove",
  "Optimize",
  "Debug",
  "Test",
  "Document",
];

/**
 * Generate a random Frame
 */
function generateFrame(index, baseTimestamp) {
  // Random module selection (1-4 modules per frame)
  const moduleCount = 1 + Math.floor(Math.random() * 4);
  const moduleScope = [];
  for (let i = 0; i < moduleCount; i++) {
    const module = MODULES[Math.floor(Math.random() * MODULES.length)];
    if (!moduleScope.includes(module)) {
      moduleScope.push(module);
    }
  }

  // Random branch
  const branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)];

  // Random action
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];

  // Timestamp spread over 90 days
  const timestamp = new Date(baseTimestamp + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `frame-${String(index).padStart(8, "0")}-${randomUUID().split("-")[0]}`,
    timestamp,
    branch,
    module_scope: moduleScope.sort(), // Sort for consistency
    summary_caption: `${action} ${moduleScope[0]}`,
    reference_point: `${action} ${moduleScope.join(", ")}`,
    status_snapshot: {
      next_action: `Continue work on ${moduleScope[0]}`,
    },
  };
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: node scripts/generate-test-frames.mjs <count> [output-file]");
    console.log("\nExamples:");
    console.log("  node scripts/generate-test-frames.mjs 1000 test-frames-1k.json");
    console.log("  node scripts/generate-test-frames.mjs 10000 test-frames-10k.json");
    process.exit(args[0] === "--help" || args[0] === "-h" ? 0 : 1);
  }

  const count = parseInt(args[0], 10);
  const outputFile = args[1] || `test-frames-${count}.json`;

  if (isNaN(count) || count < 1) {
    console.error("Error: count must be a positive integer");
    process.exit(1);
  }

  console.log(`Generating ${count} test frames...`);

  const baseTimestamp = new Date("2024-01-01T00:00:00Z").getTime();
  const frames = [];

  for (let i = 0; i < count; i++) {
    frames.push(generateFrame(i, baseTimestamp));

    // Progress indicator for large datasets
    if ((i + 1) % 1000 === 0) {
      console.log(`  Generated ${i + 1} / ${count} frames...`);
    }
  }

  console.log(`Writing to ${outputFile}...`);
  writeFileSync(outputFile, JSON.stringify(frames, null, 2));

  console.log(`✅ Successfully generated ${count} frames`);
  console.log(`   Output: ${outputFile}`);
  console.log(`   Size: ${(Buffer.byteLength(JSON.stringify(frames)) / 1024 / 1024).toFixed(2)} MB`);
}

main();
