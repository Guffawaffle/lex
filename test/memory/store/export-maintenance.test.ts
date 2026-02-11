/**
 * Tests for export paths added in #706.
 * Verifies that dedup, similarity, consolidation, contradictions, and maintenance
 * barrel exports resolve correctly.
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";

describe("Export path: dedup", () => {
  test("exports detectDuplicateFrames", async () => {
    const mod = await import("@app/memory/deduplication.js");
    assert.strictEqual(typeof mod.detectDuplicateFrames, "function");
  });

  test("exports determineConsolidationStrategy", async () => {
    const mod = await import("@app/memory/deduplication.js");
    assert.strictEqual(typeof mod.determineConsolidationStrategy, "function");
  });
});

describe("Export path: similarity", () => {
  test("exports computeSimilarity", async () => {
    const mod = await import("@app/memory/similarity.js");
    assert.strictEqual(typeof mod.computeSimilarity, "function");
  });

  test("exports detectDuplicates", async () => {
    const mod = await import("@app/memory/similarity.js");
    assert.strictEqual(typeof mod.detectDuplicates, "function");
  });

  test("exports DEFAULT_WEIGHTS", async () => {
    const mod = await import("@app/memory/similarity.js");
    assert.ok(mod.DEFAULT_WEIGHTS);
    assert.strictEqual(typeof mod.DEFAULT_WEIGHTS.semantic, "number");
  });
});

describe("Export path: consolidation", () => {
  test("exports consolidateViaSupersede", async () => {
    const mod = await import("@app/memory/store/consolidate.js");
    assert.strictEqual(typeof mod.consolidateViaSupersede, "function");
  });

  test("exports consolidateViaMerge", async () => {
    const mod = await import("@app/memory/store/consolidate.js");
    assert.strictEqual(typeof mod.consolidateViaMerge, "function");
  });

  test("exports markFrameAsSuperseded", async () => {
    const mod = await import("@app/memory/store/consolidate.js");
    assert.strictEqual(typeof mod.markFrameAsSuperseded, "function");
  });
});

describe("Export path: contradictions", () => {
  test("exports detectContradiction", async () => {
    const mod = await import("@app/memory/contradictions.js");
    assert.strictEqual(typeof mod.detectContradiction, "function");
  });

  test("exports scanForContradictions", async () => {
    const mod = await import("@app/memory/contradictions.js");
    assert.strictEqual(typeof mod.scanForContradictions, "function");
  });

  test("exports OPPOSITE_KEYWORD_PAIRS", async () => {
    const mod = await import("@app/memory/contradictions.js");
    assert.ok(Array.isArray(mod.OPPOSITE_KEYWORD_PAIRS));
  });
});

describe("Export path: maintenance barrel", () => {
  test("re-exports dedup functions", async () => {
    const mod = await import("@app/memory/maintenance/index.js");
    assert.strictEqual(typeof mod.detectDuplicateFrames, "function");
    assert.strictEqual(typeof mod.determineConsolidationStrategy, "function");
  });

  test("re-exports similarity functions", async () => {
    const mod = await import("@app/memory/maintenance/index.js");
    assert.strictEqual(typeof mod.computeSimilarity, "function");
    assert.strictEqual(typeof mod.detectDuplicates, "function");
    assert.ok(mod.DEFAULT_WEIGHTS);
  });

  test("re-exports consolidation functions", async () => {
    const mod = await import("@app/memory/maintenance/index.js");
    assert.strictEqual(typeof mod.consolidateViaSupersede, "function");
    assert.strictEqual(typeof mod.consolidateViaMerge, "function");
    assert.strictEqual(typeof mod.markFrameAsSuperseded, "function");
  });

  test("re-exports contradiction functions", async () => {
    const mod = await import("@app/memory/maintenance/index.js");
    assert.strictEqual(typeof mod.detectContradiction, "function");
    assert.strictEqual(typeof mod.scanForContradictions, "function");
    assert.ok(Array.isArray(mod.OPPOSITE_KEYWORD_PAIRS));
  });
});
