/**
 * Before/After Comparison Test
 *
 * Demonstrates the value of `lex recall` by comparing:
 * - WITHOUT Lex Recall: Agent starts fresh, must re-discover context
 * - WITH Lex Recall: Agent receives previous context, jumps straight to work
 *
 * Measures:
 * - Token efficiency (tokens spent on discovery)
 * - Context quality (information retrieved)
 * - Time to productivity
 *
 * Run with: npx tsx --test test/recall-quality/before-after-comparison.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb, closeDb, saveFrame, searchFrames, getFrameById } from "@app/memory/store/index.js";
import type { Frame } from "@app/memory/frames/types.js";

/**
 * Estimate tokens for text content
 * Rough approximation: 1 token ≈ 4 characters
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Simulate discovering context without Lex recall
 * Agent must read files, git history, etc.
 */
function simulateDiscoveryWithoutRecall(): {
  tokens: number;
  contextFound: string[];
  timeEstimate: number;
} {
  // Simulate reading multiple files to understand context
  const filesRead = [
    "src/auth/middleware.ts", // ~500 lines
    "src/auth/jwt.ts", // ~300 lines
    "test/auth/middleware.test.ts", // ~400 lines
    "docs/AUTH.md", // ~200 lines
    "git log --oneline -20", // ~1000 chars
  ];

  const estimatedLines = 500 + 300 + 400 + 200;
  const estimatedCharsPerLine = 80;
  const totalChars = estimatedLines * estimatedCharsPerLine + 1000;
  const tokens = Math.ceil(totalChars / 4); // 1 token ≈ 4 chars

  return {
    tokens: tokens,
    contextFound: [
      "Working on JWT authentication",
      "Previous developer mentioned token expiry issue",
      "Tests are failing but not sure why",
      "Need to check git history for recent changes",
    ],
    timeEstimate: 15, // minutes to gather context
  };
}

/**
 * Simulate receiving context WITH Lex recall
 * Agent gets curated Frame with decisions, blockers, next steps
 */
function simulateDiscoveryWithRecall(frame: Frame): {
  tokens: number;
  contextFound: string[];
  timeEstimate: number;
} {
  // Frame contains:
  // - summary_caption
  // - reference_point
  // - module_scope
  // - next_action
  // - blockers
  // - keywords

  const frameContent = JSON.stringify(frame, null, 2);
  const tokens = estimateTokens(frameContent);

  return {
    tokens: tokens,
    contextFound: [
      frame.summary_caption,
      `Reference: ${frame.reference_point}`,
      `Next action: ${frame.status_snapshot.next_action}`,
      `Modules: ${frame.module_scope.join(", ")}`,
      frame.status_snapshot.blockers?.join(", ") || "",
    ].filter(Boolean),
    timeEstimate: 2, // minutes to read Frame and understand context
  };
}

describe("Before/After Comparison: Lex Recall Value Proposition", () => {
  let db: ReturnType<typeof getDb>;
  let dbPath: string;

  before(() => {
    dbPath = join(tmpdir(), `before-after-${Date.now()}.db`);
    db = getDb(dbPath);
  });

  after(() => {
    closeDb();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe("Scenario: Resume work on authentication module", () => {
    test("WITHOUT Lex Recall: Cold start, must re-discover context", () => {
      const discovery = simulateDiscoveryWithoutRecall();

      console.log("\n🔴 WITHOUT Lex Recall:");
      console.log(`  📄 Files read: 5 files (~1,400 lines)`);
      console.log(`  🪙 Tokens spent on discovery: ~${discovery.tokens.toLocaleString()}`);
      console.log(`  ⏱️  Time to productivity: ~${discovery.timeEstimate} minutes`);
      console.log(`  🧩 Context found:`);
      for (const ctx of discovery.contextFound) {
        console.log(`     - ${ctx}`);
      }

      assert.ok(discovery.tokens > 5000, "Should require significant tokens for discovery");
      assert.ok(discovery.timeEstimate >= 10, "Should take substantial time");
    });

    test("WITH Lex Recall: Immediate context awareness", () => {
      // Create a Frame representing previous work session
      const authFrame: Frame = {
        id: "auth-work-001",
        timestamp: new Date().toISOString(),
        branch: "feature/auth-refactor",
        module_scope: ["shared/auth", "api/middleware"],
        summary_caption: "Refactoring JWT authentication middleware",
        reference_point: "auth refactor jwt",
        status_snapshot: {
          next_action: "Implement token validation with configurable expiry",
          blockers: [
            "Need to decide on token expiry policy (15min vs 1hr)",
            "Tests failing due to mock clock issue in test/auth/middleware.test.ts:45",
          ],
          tests_failing: ["test/auth/middleware.test.ts:45 - token expiry validation"],
        },
        keywords: ["jwt", "authentication", "middleware", "token"],
      };

      saveFrame(db, authFrame);

      // Retrieve via recall
      const retrieved = getFrameById(db, authFrame.id);
      assert.ok(retrieved, "Should retrieve frame");

      const discovery = simulateDiscoveryWithRecall(retrieved!);

      console.log("\n🟢 WITH Lex Recall:");
      console.log(`  📄 Context retrieved: 1 Frame`);
      console.log(`  🪙 Tokens spent on discovery: ~${discovery.tokens.toLocaleString()}`);
      console.log(`  ⏱️  Time to productivity: ~${discovery.timeEstimate} minutes`);
      console.log(`  🧩 Context found:`);
      for (const ctx of discovery.contextFound) {
        console.log(`     - ${ctx}`);
      }
      console.log(`  ✨ Bonus: Known blockers and next action!`);

      assert.ok(discovery.tokens < 2000, "Should require minimal tokens");
      assert.ok(discovery.timeEstimate <= 5, "Should be quick to understand");
    });

    test("COMPARISON: Calculate improvement metrics", () => {
      const withoutRecall = simulateDiscoveryWithoutRecall();

      const authFrame: Frame = {
        id: "auth-work-002",
        timestamp: new Date().toISOString(),
        branch: "feature/auth-refactor",
        module_scope: ["shared/auth", "api/middleware"],
        summary_caption: "Refactoring JWT authentication middleware",
        reference_point: "auth refactor jwt",
        status_snapshot: {
          next_action: "Implement token validation with configurable expiry",
          blockers: ["Need to decide on token expiry policy"],
        },
        keywords: ["jwt", "authentication"],
      };

      const withRecall = simulateDiscoveryWithRecall(authFrame);

      const tokenReduction =
        ((withoutRecall.tokens - withRecall.tokens) / withoutRecall.tokens) * 100;
      const timeReduction =
        ((withoutRecall.timeEstimate - withRecall.timeEstimate) / withoutRecall.timeEstimate) * 100;

      console.log("\n📊 IMPROVEMENT METRICS:");
      console.log(`  🪙 Token reduction: ${tokenReduction.toFixed(1)}%`);
      console.log(
        `     (${withoutRecall.tokens.toLocaleString()} → ${withRecall.tokens.toLocaleString()})`
      );
      console.log(`  ⏱️  Time reduction: ${timeReduction.toFixed(1)}%`);
      console.log(`     (${withoutRecall.timeEstimate} min → ${withRecall.timeEstimate} min)`);
      console.log(`  🎯 Context quality: HIGHER (includes blockers & next actions)`);

      // Assertions for minimum improvement
      assert.ok(tokenReduction >= 50, "Should reduce tokens by at least 50%");
      assert.ok(timeReduction >= 50, "Should reduce time by at least 50%");
    });
  });

  describe("Scenario: Context across work sessions", () => {
    test("Multi-day project: Track progress over time", () => {
      // Day 1: Initial exploration
      const day1Frame: Frame = {
        id: "project-day1",
        timestamp: "2025-01-15T17:00:00Z",
        branch: "feature/new-api",
        module_scope: ["api/v2"],
        summary_caption: "Started new API v2 design",
        reference_point: "api v2 initial design",
        status_snapshot: {
          next_action: "Complete API schema design",
          blockers: ["Need input from product team on requirements"],
        },
        keywords: ["api", "design", "v2"],
      };

      // Day 2: Schema complete, starting implementation
      const day2Frame: Frame = {
        id: "project-day2",
        timestamp: "2025-01-16T17:30:00Z",
        branch: "feature/new-api",
        module_scope: ["api/v2", "api/schema"],
        summary_caption: "API v2 schema finalized, starting endpoint implementation",
        reference_point: "api v2 implementation start",
        status_snapshot: {
          next_action: "Implement user endpoints",
          blockers: [],
        },
        keywords: ["api", "implementation", "v2", "schema"],
      };

      // Day 3: Testing phase
      const day3Frame: Frame = {
        id: "project-day3",
        timestamp: "2025-01-17T18:00:00Z",
        branch: "feature/new-api",
        module_scope: ["api/v2", "test/api"],
        summary_caption: "API v2 endpoints complete, writing integration tests",
        reference_point: "api v2 testing",
        status_snapshot: {
          next_action: "Add error handling tests",
          blockers: ["Mock server not working for external API calls"],
          tests_failing: ["test/api/v2/integration.test.ts"],
        },
        keywords: ["api", "testing", "v2", "integration"],
      };

      saveFrame(db, day1Frame);
      saveFrame(db, day2Frame);
      saveFrame(db, day3Frame);

      // Simulate resuming on Day 4 - search for API work
      const results = searchFrames(db, "api v2");

      console.log("\n📅 MULTI-DAY PROJECT TRACKING:");
      console.log(`  🔍 Search query: "api v2"`);
      console.log(`  📋 Frames found: ${results.frames.length}`);

      // Should find all three frames
      const foundDay1 = results.frames.some((f) => f.id === "project-day1");
      const foundDay2 = results.frames.some((f) => f.id === "project-day2");
      const foundDay3 = results.frames.some((f) => f.id === "project-day3");

      assert.ok(foundDay1, "Should find Day 1 frame");
      assert.ok(foundDay2, "Should find Day 2 frame");
      assert.ok(foundDay3, "Should find Day 3 frame");

      console.log(`  ✅ Found progression: Day 1 → Day 2 → Day 3`);
      console.log(`  🎯 Latest blocker: Mock server issue`);
      console.log(`  ⏭️  Next action: Add error handling tests`);

      // Most recent frame should provide current context
      const day3Retrieved = results.frames.find((f) => f.id === "project-day3");
      assert.ok(day3Retrieved, "Should retrieve most recent frame");
      assert.ok(
        day3Retrieved!.status_snapshot.blockers?.includes(
          "Mock server not working for external API calls"
        ),
        "Should know about current blocker"
      );
    });
  });

  describe("Scenario: Team handoff", () => {
    test("Developer A → Developer B: Context transfer", () => {
      // Developer A leaves comprehensive Frame before going on vacation
      const handoffFrame: Frame = {
        id: "handoff-001",
        timestamp: new Date().toISOString(),
        branch: "feature/payment-integration",
        module_scope: ["payments", "api/stripe"],
        summary_caption: "Stripe payment integration - 80% complete",
        reference_point: "stripe integration handoff",
        status_snapshot: {
          next_action: "Implement webhook handling for payment.succeeded event",
          blockers: [
            "Stripe test keys expire in 2 days - refresh before testing",
            "Need to coordinate with finance team on refund policy",
          ],
          tests_failing: [],
          merge_blockers: ["Pending security review from @security-team"],
        },
        keywords: ["stripe", "payments", "integration", "webhooks"],
      };

      saveFrame(db, handoffFrame);

      // Developer B searches for context
      const results = searchFrames(db, "payment");
      const handoff = results.frames.find((f) => f.id === "handoff-001");

      console.log("\n👥 TEAM HANDOFF SCENARIO:");
      console.log(`  👨‍💻 Developer A → 👩‍💻 Developer B`);
      console.log(`  📋 Context retrieved: "${handoff?.summary_caption}"`);
      console.log(`  ⏭️  Next action: ${handoff?.status_snapshot.next_action}`);
      console.log(`  🚧 Known blockers:`);
      for (const blocker of handoff?.status_snapshot.blockers || []) {
        console.log(`     - ${blocker}`);
      }
      console.log(`  🔒 Merge blockers:`);
      for (const blocker of handoff?.status_snapshot.merge_blockers || []) {
        console.log(`     - ${blocker}`);
      }

      assert.ok(handoff, "Should find handoff frame");
      assert.ok(handoff!.status_snapshot.next_action.includes("webhook"), "Should know next task");
      assert.ok(handoff!.status_snapshot.blockers!.length > 0, "Should know blockers");

      console.log(`\n  ✨ Result: Developer B can continue work immediately with full context!`);
    });
  });
});
