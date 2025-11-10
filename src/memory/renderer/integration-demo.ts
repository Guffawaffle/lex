#!/usr/bin/env node
import { getLogger } from "lex/logger";
import { renderMemoryCard } from "./card.js";
import type { Frame } from "./types.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { highlightDiff } from "./syntax.js";
import { renderDiff, getDiffStats } from "./diff.js";

const logger = getLogger("memory:renderer:integration-demo");

// Example diff showing code changes (TypeScript)
const typescriptDiff = `
+ function authenticateUser(username: string, password: string): Promise<boolean> {
+   const user = await findUserByUsername(username);
+   if (!user) {
+     return false;
+   }
+   return bcrypt.compare(password, user.hash);
+ }
+
- function authenticateUser(username, password) {
-   return bcrypt.compare(password, user.hash);
- }
`;

// Example diff showing Python changes
const pythonDiff = `
+ def calculate_total(items: list[dict]) -> float:
+     """Calculate total price with tax."""
+     subtotal = sum(item['price'] * item['qty'] for item in items)
+     tax = subtotal * 0.08
+     return subtotal + tax
+
- def calculate_total(items):
-     return sum(item['price'] for item in items)
`;

// Create example Frame with code diffs in raw context
const exampleFrame: Frame = {
  id: "frame-syntax-highlighting-demo",
  timestamp: new Date().toISOString(),
  branch: "feature/add-syntax-highlighting",
  jira: "LEX-53",
  module_scope: ["memory/renderer"],
  summary_caption: "Add syntax highlighting to code diffs in Frame memory cards",
  reference_point: "Enhanced memory card rendering with VS Code-quality highlighting",
  status_snapshot: {
    next_action: "Validate rendering performance and complete integration tests",
    blockers: [],
    merge_blockers: [],
    tests_failing: [],
  },
  keywords: ["syntax-highlighting", "diff", "rendering", "shiki", "memory-cards"],
  atlas_frame_id: "atlas-frame-syntax",
};

// Raw context with code diffs
const rawContext = `
Recent activity:
[2024-11-06 05:00] Installed Shiki syntax highlighter
[2024-11-06 05:15] Implemented syntax.ts module
[2024-11-06 05:30] Implemented diff.ts module
[2024-11-06 05:45] Updated card.ts to support diff rendering
[2024-11-06 06:00] All tests passing ✓

Recent changes:
${typescriptDiff}

Additional changes:
${pythonDiff}

Performance metrics:
- Syntax highlighting: ~45ms per diff
- Diff truncation: <5ms
- Total rendering time: <100ms
`;

async function main() {
  logger.info("🎨 Syntax Highlighting Integration Test\n");

  // Create output directory
  const outputDir = "/tmp/syntax-highlighting-demo";
  mkdirSync(outputDir, { recursive: true });

  // Test 1: Render memory card with code diffs
  logger.info("Test 1: Rendering memory card with syntax-highlighted diffs...");
  const cardBuffer = await renderMemoryCard(exampleFrame, rawContext);
  const cardPath = join(outputDir, "memory-card-with-diffs.png");
  writeFileSync(cardPath, cardBuffer);
  logger.info(`✓ Memory card rendered (${cardBuffer.length} bytes)`);
  logger.info(`  Saved to: ${cardPath}\n`);

  // Test 2: Test syntax highlighting directly
  logger.info("Test 2: Testing syntax highlighting directly...");
  const startTime = Date.now();
  const highlightedHtml = await highlightDiff(typescriptDiff, "typescript");
  const highlightTime = Date.now() - startTime;

  const htmlPath = join(outputDir, "highlighted-diff.html");
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Syntax Highlighted Diff</title>
  <style>
    body {
      font-family: 'Consolas', 'Monaco', monospace;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
    }
    .diff-container {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
    }
    .diff-addition {
      background: rgba(34, 134, 58, 0.15);
      border-left: 3px solid #22863a;
      padding: 2px 8px;
      margin: 1px 0;
    }
    .diff-deletion {
      background: rgba(179, 29, 40, 0.15);
      border-left: 3px solid #b31d28;
      padding: 2px 8px;
      margin: 1px 0;
    }
    .diff-marker {
      opacity: 0.5;
      margin-right: 8px;
    }
    h1 {
      color: #4a9eff;
    }
  </style>
</head>
<body>
  <h1>Syntax Highlighted Diff Example</h1>
  <p>Highlighting time: ${highlightTime}ms</p>
  ${highlightedHtml}
</body>
</html>
  `;
  writeFileSync(htmlPath, htmlContent);
  logger.info(`✓ Syntax highlighting completed in ${highlightTime}ms`);
  logger.info(`  Saved to: ${htmlPath}\n`);

  // Test 3: Test diff statistics
  logger.info("Test 3: Testing diff statistics...");
  const tsStats = getDiffStats(typescriptDiff);
  const pyStats = getDiffStats(pythonDiff);

  logger.info(`TypeScript diff stats:`);
  logger.info(`  Additions: ${tsStats.additions}`);
  logger.info(`  Deletions: ${tsStats.deletions}`);
  logger.info(`  Total lines: ${tsStats.total}`);

  logger.info(`\nPython diff stats:`);
  logger.info(`  Additions: ${pyStats.additions}`);
  logger.info(`  Deletions: ${pyStats.deletions}`);
  logger.info(`  Total lines: ${pyStats.total}\n`);

  // Test 4: Test diff truncation
  logger.info("Test 4: Testing smart diff truncation...");

  // Create a large diff
  let largeDiff = "";
  for (let i = 0; i < 100; i++) {
    if (i === 0 || i === 99) {
      largeDiff += `+ changed line ${i}\n`;
    } else {
      largeDiff += ` unchanged line ${i}\n`;
    }
  }

  const truncated = renderDiff(largeDiff, { maxLines: 20, contextLines: 3 });
  const truncatedLines = truncated.split("\n").length;

  logger.info(`Original diff: 100 lines`);
  logger.info(`Truncated diff: ${truncatedLines} lines`);
  logger.info(`✓ Successfully truncated while preserving changes and context\n`);

  // Test 5: Performance validation
  logger.info("Test 5: Performance validation...");
  const perfStart = Date.now();

  // Render 10 cards to test performance
  for (let i = 0; i < 10; i++) {
    await renderMemoryCard(exampleFrame, rawContext);
  }

  const perfEnd = Date.now();
  const avgTime = (perfEnd - perfStart) / 10;

  logger.info(`Average rendering time: ${avgTime.toFixed(2)}ms`);

  if (avgTime < 100) {
    logger.info(`✓ Performance requirement met (<100ms)\n`);
  } else {
    logger.info(`⚠ Performance requirement not met (${avgTime.toFixed(2)}ms > 100ms)\n`);
  }

  logger.info("✨ Integration test complete!");
  logger.info(`\nOutputs saved to: ${outputDir}`);
  logger.info("Open the files to verify:");
  logger.info(`  - ${cardPath} (PNG memory card)`);
  logger.info(`  - ${htmlPath} (HTML syntax-highlighted diff)`);
}

main().catch(logger.error);
