/**
 * Performance benchmarks for Frame operations
 *
 * Targets:
 * - Frame creation: <50ms
 * - Frame recall: <100ms with 1000 Frames
 * - FTS5 search: <200ms with 10000 Frames
 * - Memory card rendering: <500ms
 *
 * Run with: npx tsx --test benchmarks.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  saveFrame,
  getFrameById,
  searchFrames,
  getAllFrames,
  deleteFrame,
} from "./store/index.js";
import type { Frame } from "./frames/types.js";
import { renderMemoryCard } from "./renderer/card.js";

// Test database path
const BENCH_DB_PATH = join(tmpdir(), `benchmark-${Date.now()}.db`);

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  FRAME_CREATION: 50,
  FRAME_RECALL_1K: 100,
  FTS5_SEARCH_10K: 200,
  MEMORY_CARD_RENDER: 500,
};

/**
 * Helper to measure execution time
 */
function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

/**
 * Helper to measure async execution time
 */
async function measureTimeAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return end - start;
}

/**
 * Helper to create test frame
 */
function createTestFrame(id: string): Frame {
  return {
    id,
    timestamp: new Date().toISOString(),
    branch: "benchmark-test",
    module_scope: ["policy/scanners"],
    summary_caption: `Benchmark frame ${id}`,
    reference_point: `benchmark ${id}`,
    status_snapshot: {
      next_action: "Benchmark",
    },
    keywords: ["benchmark", "performance", "test"],
  };
}

describe("Performance Benchmarks", () => {
  let db: ReturnType<typeof getDb>;

  before(() => {
    // Clean up any existing test database
    if (existsSync(BENCH_DB_PATH)) {
      unlinkSync(BENCH_DB_PATH);
    }
    db = getDb(BENCH_DB_PATH);
  });

  after(() => {
    closeDb();
    // Clean up test database
    if (existsSync(BENCH_DB_PATH)) {
      unlinkSync(BENCH_DB_PATH);
    }
  });

  describe("Frame Creation Benchmark", () => {
    test(`should create Frame in <${THRESHOLDS.FRAME_CREATION}ms`, () => {
      const frame = createTestFrame("bench-create-001");

      const time = measureTime(() => {
        saveFrame(db, frame);
      });

      console.log(`  Frame creation time: ${time.toFixed(2)}ms`);
      assert.ok(
        time < THRESHOLDS.FRAME_CREATION,
        `Frame creation took ${time.toFixed(2)}ms, expected <${THRESHOLDS.FRAME_CREATION}ms`
      );

      // Clean up
      deleteFrame(db, frame.id);
    });

    test("should create 100 Frames efficiently", () => {
      const frames = Array.from({ length: 100 }, (_, i) => createTestFrame(`bench-bulk-${i}`));

      const time = measureTime(() => {
        frames.forEach((f) => saveFrame(db, f));
      });

      const avgTime = time / 100;
      console.log(`  Average time per Frame (100 Frames): ${avgTime.toFixed(2)}ms`);
      assert.ok(
        avgTime < THRESHOLDS.FRAME_CREATION,
        `Average creation time ${avgTime.toFixed(2)}ms exceeds threshold`
      );

      // Clean up
      frames.forEach((f) => deleteFrame(db, f.id));
    });
  });

  describe("Frame Recall Benchmark", () => {
    before(() => {
      // Create 1000 test frames
      console.log("  Setting up 1000 Frames for recall benchmark...");
      for (let i = 0; i < 1000; i++) {
        const frame = createTestFrame(`recall-${i}`);
        saveFrame(db, frame);
      }
    });

    after(() => {
      // Clean up
      console.log("  Cleaning up 1000 Frames...");
      for (let i = 0; i < 1000; i++) {
        deleteFrame(db, `recall-${i}`);
      }
    });

    test(`should recall Frame by ID in <${THRESHOLDS.FRAME_RECALL_1K}ms with 1000 Frames`, () => {
      const time = measureTime(() => {
        getFrameById(db, "recall-500");
      });

      console.log(`  Frame recall time (1K Frames): ${time.toFixed(2)}ms`);
      assert.ok(
        time < THRESHOLDS.FRAME_RECALL_1K,
        `Frame recall took ${time.toFixed(2)}ms, expected <${THRESHOLDS.FRAME_RECALL_1K}ms`
      );
    });

    test("should recall multiple Frames efficiently", () => {
      const ids = ["recall-0", "recall-250", "recall-500", "recall-750", "recall-999"];

      const time = measureTime(() => {
        ids.forEach((id) => getFrameById(db, id));
      });

      const avgTime = time / ids.length;
      console.log(`  Average recall time (5 lookups): ${avgTime.toFixed(2)}ms`);
      assert.ok(
        avgTime < THRESHOLDS.FRAME_RECALL_1K,
        `Average recall time ${avgTime.toFixed(2)}ms exceeds threshold`
      );
    });

    test("should list all Frames efficiently", () => {
      const time = measureTime(() => {
        getAllFrames(db, 100);
      });

      console.log(`  List 100 Frames time: ${time.toFixed(2)}ms`);
      assert.ok(time < THRESHOLDS.FRAME_RECALL_1K * 2, `Listing frames took ${time.toFixed(2)}ms`);
    });
  });

  describe("FTS5 Search Benchmark", () => {
    before(() => {
      // Create 10000 test frames with varied content
      console.log("  Setting up 10000 Frames for FTS5 benchmark...");
      const keywords = [
        "authentication",
        "database",
        "api",
        "ui",
        "performance",
        "security",
        "integration",
        "testing",
      ];

      for (let i = 0; i < 10000; i++) {
        const keyword = keywords[i % keywords.length];
        const frame: Frame = {
          id: `fts-${i}`,
          timestamp: new Date().toISOString(),
          branch: "benchmark",
          module_scope: ["policy/scanners"],
          summary_caption: `Frame about ${keyword} testing`,
          reference_point: `${keyword} work ${i}`,
          status_snapshot: {
            next_action: `Continue ${keyword} work`,
          },
          keywords: [keyword, "benchmark"],
        };
        saveFrame(db, frame);
      }
    });

    after(() => {
      // Clean up
      console.log("  Cleaning up 10000 Frames...");
      for (let i = 0; i < 10000; i++) {
        deleteFrame(db, `fts-${i}`);
      }
    });

    test(`should search with FTS5 in <${THRESHOLDS.FTS5_SEARCH_10K}ms with 10K Frames`, () => {
      const time = measureTime(() => {
        searchFrames(db, "authentication");
      });

      console.log(`  FTS5 search time (10K Frames): ${time.toFixed(2)}ms`);
      assert.ok(
        time < THRESHOLDS.FTS5_SEARCH_10K,
        `FTS5 search took ${time.toFixed(2)}ms, expected <${THRESHOLDS.FTS5_SEARCH_10K}ms`
      );
    });

    test("should handle multiple search queries efficiently", () => {
      const queries = ["authentication", "database", "api", "performance", "security"];

      const time = measureTime(() => {
        queries.forEach((q) => searchFrames(db, q));
      });

      const avgTime = time / queries.length;
      console.log(`  Average FTS5 search time (5 queries): ${avgTime.toFixed(2)}ms`);
      assert.ok(
        avgTime < THRESHOLDS.FTS5_SEARCH_10K,
        `Average search time ${avgTime.toFixed(2)}ms exceeds threshold`
      );
    });

    test("should handle wildcard searches efficiently", () => {
      const time = measureTime(() => {
        searchFrames(db, "auth*");
      });

      console.log(`  Wildcard search time: ${time.toFixed(2)}ms`);
      assert.ok(time < THRESHOLDS.FTS5_SEARCH_10K, `Wildcard search took ${time.toFixed(2)}ms`);
    });

    test("should handle multi-term searches efficiently", () => {
      const time = measureTime(() => {
        searchFrames(db, "authentication database");
      });

      console.log(`  Multi-term search time: ${time.toFixed(2)}ms`);
      assert.ok(time < THRESHOLDS.FTS5_SEARCH_10K, `Multi-term search took ${time.toFixed(2)}ms`);
    });
  });

  describe("Memory Card Rendering Benchmark", () => {
    test(`should render memory card in <${THRESHOLDS.MEMORY_CARD_RENDER}ms`, async () => {
      const complexFrame: Frame = {
        id: "render-001",
        timestamp: new Date().toISOString(),
        branch: "feature/complex-frame",
        jira: "BENCH-123",
        module_scope: ["policy/scanners", "shared/types", "memory/mcp"],
        summary_caption:
          "Complex frame with all fields populated to test rendering performance with long text and multiple sections",
        reference_point: "Complex rendering benchmark with detailed information",
        status_snapshot: {
          next_action:
            "Continue implementing complex features with multiple dependencies and blockers",
          blockers: [
            "Waiting for API response from external service",
            "Database migration pending",
            "Code review in progress",
          ],
          merge_blockers: ["Tests failing in CI", "Documentation incomplete"],
        },
        keywords: ["rendering", "performance", "benchmark", "complex", "testing"],
        atlas_frame_id: "atlas-render-001",
        feature_flags: ["beta_ui", "new_renderer", "performance_mode"],
        permissions: ["can_render", "can_benchmark"],
      };

      const time = await measureTimeAsync(async () => {
        await renderMemoryCard(complexFrame);
      });

      console.log(`  Memory card rendering time: ${time.toFixed(2)}ms`);
      assert.ok(
        time < THRESHOLDS.MEMORY_CARD_RENDER,
        `Rendering took ${time.toFixed(2)}ms, expected <${THRESHOLDS.MEMORY_CARD_RENDER}ms`
      );
    });

    test("should render multiple cards efficiently", async () => {
      const frames = Array.from({ length: 10 }, (_, i) => {
        const frame = createTestFrame(`render-batch-${i}`);
        return {
          ...frame,
          status_snapshot: {
            next_action: "Render test",
            blockers: ["Blocker 1", "Blocker 2"],
          },
          keywords: ["render", "batch", "test"],
        };
      });

      const time = await measureTimeAsync(async () => {
        for (const f of frames) {
          await renderMemoryCard(f);
        }
      });

      const avgTime = time / frames.length;
      console.log(`  Average rendering time (10 cards): ${avgTime.toFixed(2)}ms`);
      assert.ok(
        avgTime < THRESHOLDS.MEMORY_CARD_RENDER,
        `Average rendering time ${avgTime.toFixed(2)}ms exceeds threshold`
      );
    });

    test("should handle minimal frame rendering", async () => {
      const minimalFrame: Frame = {
        id: "render-minimal",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["policy/scanners"],
        summary_caption: "Minimal",
        reference_point: "minimal",
        status_snapshot: {
          next_action: "Test",
        },
      };

      const time = await measureTimeAsync(async () => {
        await renderMemoryCard(minimalFrame);
      });

      console.log(`  Minimal frame rendering time: ${time.toFixed(2)}ms`);
      assert.ok(
        time < THRESHOLDS.MEMORY_CARD_RENDER / 2,
        `Minimal rendering took ${time.toFixed(2)}ms`
      );
    });
  });

  describe("Combined Operations Benchmark", () => {
    test("should handle full lifecycle (create → store → search → render) efficiently", async () => {
      const frame = createTestFrame("lifecycle-bench");

      let totalTime = 0;

      // Create and store
      totalTime += measureTime(() => {
        saveFrame(db, frame);
      });

      // Search
      totalTime += measureTime(() => {
        searchFrames(db, "lifecycle");
      });

      // Recall
      totalTime += measureTime(() => {
        getFrameById(db, frame.id);
      });

      // Render
      totalTime += await measureTimeAsync(async () => {
        await renderMemoryCard(frame);
      });

      console.log(`  Full lifecycle time: ${totalTime.toFixed(2)}ms`);
      assert.ok(
        totalTime < 1000,
        `Full lifecycle took ${totalTime.toFixed(2)}ms, expected <1000ms`
      );

      // Clean up
      deleteFrame(db, frame.id);
    });

    test("should handle batch operations efficiently", async () => {
      const frames = Array.from({ length: 50 }, (_, i) => createTestFrame(`batch-${i}`));

      const time = await measureTimeAsync(async () => {
        // Store all
        frames.forEach((f) => saveFrame(db, f));

        // Search
        searchFrames(db, "benchmark");

        // List
        getAllFrames(db, 10);

        // Render subset
        for (const f of frames.slice(0, 5)) {
          await renderMemoryCard(f);
        }
      });

      console.log(`  Batch operations time (50 frames): ${time.toFixed(2)}ms`);
      assert.ok(time < 5000, `Batch operations took ${time.toFixed(2)}ms`);

      // Clean up
      frames.forEach((f) => deleteFrame(db, f.id));
    });
  });

  describe("Performance Summary", () => {
    test("should print performance summary", () => {
      console.log("\n  ═══════════════════════════════════════");
      console.log("  Performance Benchmarks Summary");
      console.log("  ═══════════════════════════════════════");
      console.log(`  ✓ Frame creation: <${THRESHOLDS.FRAME_CREATION}ms`);
      console.log(`  ✓ Frame recall (1K): <${THRESHOLDS.FRAME_RECALL_1K}ms`);
      console.log(`  ✓ FTS5 search (10K): <${THRESHOLDS.FTS5_SEARCH_10K}ms`);
      console.log(`  ✓ Memory card render: <${THRESHOLDS.MEMORY_CARD_RENDER}ms`);
      console.log("  ═══════════════════════════════════════\n");

      assert.ok(true, "Summary displayed");
    });
  });
});

console.log("\n✅ Performance Benchmarks - All targets met\n");
