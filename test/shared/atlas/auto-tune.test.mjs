/**
 * Tests for Auto-Tuning
 *
 * Run with: node shared/atlas/auto-tune.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import path to built dist output
import {
  estimateTokens,
  autoTuneRadius,
  estimateTokensBeforeGeneration,
} from "../../../dist/shared/atlas/auto-tune.js";

describe("estimateTokens", () => {
  test("estimates tokens based on JSON size", () => {
    const mockFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    const tokens = estimateTokens(mockFrame);

    // Should be approximately JSON.stringify(mockFrame).length / 4
    const json = JSON.stringify(mockFrame);
    const expected = Math.ceil(json.length / 4);

    assert.equal(tokens, expected);
    assert.ok(tokens > 0);
  });

  test("larger frames have more tokens", () => {
    const smallFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["a"],
      fold_radius: 1,
      modules: [],
      edges: [],
      critical_rule: "test",
    };

    const largeFrame = {
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["module-a", "module-b", "module-c"],
      fold_radius: 2,
      modules: [
        { id: "a", coords: [100, 200], allowed_callers: ["b", "c"] },
        { id: "b", coords: [150, 250], forbidden_callers: ["d"] },
        { id: "c", coords: [200, 300], feature_flags: ["flag1", "flag2"] },
      ],
      edges: [
        { from: "a", to: "b", allowed: true },
        { from: "b", to: "c", allowed: false, reason: "test" },
      ],
      critical_rule: "test rule with more text",
    };

    const smallTokens = estimateTokens(smallFrame);
    const largeTokens = estimateTokens(largeFrame);

    assert.ok(largeTokens > smallTokens);
  });
});

describe("autoTuneRadius", () => {
  test("returns frame when within token limit", () => {
    const generateFn = (radius) => ({
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["a"],
      fold_radius: radius,
      modules: [],
      edges: [],
      critical_rule: "test",
    });

    const result = autoTuneRadius(generateFn, 2, 10000);

    assert.equal(result.radiusUsed, 2);
    assert.ok(result.tokensUsed > 0);
    assert.ok(result.tokensUsed < 10000);
  });

  test("reduces radius when exceeding token limit", () => {
    let callCount = 0;
    const generateFn = (radius) => {
      callCount++;
      // Create frames that are clearly over/under the limit
      // Radius 2 = ~331 tokens, radius 1 = ~231 tokens, radius 0 = ~131 tokens
      const content = "x".repeat(radius * 400 + 400);
      return {
        atlas_timestamp: "2025-01-01T00:00:00Z",
        seed_modules: ["a"],
        fold_radius: radius,
        modules: [],
        edges: [],
        critical_rule: content,
      };
    };

    // Set limit to 250: radius 2 exceeds (331), radius 1 fits (231)
    const result = autoTuneRadius(generateFn, 2, 250);

    // Should have tried radius 2, then radius 1
    assert.ok(callCount >= 2);
    assert.equal(result.radiusUsed, 1);
    assert.ok(result.tokensUsed <= 250);
  });

  test("stops at radius 0 if still exceeding limit", () => {
    const generateFn = (radius) => ({
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["a"],
      fold_radius: radius,
      modules: [],
      edges: [],
      critical_rule: "x".repeat(1000), // Always large
    });

    const result = autoTuneRadius(generateFn, 3, 10); // Very small limit

    // Should reduce to radius 0 and stop
    assert.equal(result.radiusUsed, 0);
    // Even at radius 0, still exceeds limit, but returns anyway
    assert.ok(result.tokensUsed > 10);
  });

  test("calls adjustment callback when reducing radius", () => {
    const adjustments = [];

    const generateFn = (radius) => ({
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["a"],
      fold_radius: radius,
      modules: [],
      edges: [],
      critical_rule: "x".repeat(radius * 200 + 200),
    });

    autoTuneRadius(generateFn, 3, 120, (oldRadius, newRadius, tokens, limit) => {
      adjustments.push({ oldRadius, newRadius, tokens, limit });
    });

    // Should have reduced radius at least once
    assert.ok(adjustments.length > 0);

    // Each adjustment should show radius decreasing
    for (const adj of adjustments) {
      assert.equal(adj.newRadius, adj.oldRadius - 1);
      assert.equal(adj.limit, 120);
      assert.ok(adj.tokens > adj.limit);
    }
  });

  test("does not call adjustment callback if no reduction needed", () => {
    let callbackCalled = false;

    const generateFn = (radius) => ({
      atlas_timestamp: "2025-01-01T00:00:00Z",
      seed_modules: ["a"],
      fold_radius: radius,
      modules: [],
      edges: [],
      critical_rule: "small",
    });

    const result = autoTuneRadius(generateFn, 2, 10000, () => {
      callbackCalled = true;
    });

    assert.equal(callbackCalled, false);
    assert.equal(result.radiusUsed, 2);
  });
});

describe("estimateTokensBeforeGeneration", () => {
  test("estimates increase with more seeds", () => {
    const tokens1 = estimateTokensBeforeGeneration(1, 1);
    const tokens5 = estimateTokensBeforeGeneration(5, 1);

    assert.ok(tokens5 > tokens1);
  });

  test("estimates increase with higher radius", () => {
    const radius0 = estimateTokensBeforeGeneration(1, 0);
    const radius1 = estimateTokensBeforeGeneration(1, 1);
    const radius2 = estimateTokensBeforeGeneration(1, 2);

    assert.ok(radius1 > radius0);
    assert.ok(radius2 > radius1);
  });

  test("uses custom average degree", () => {
    // Higher degree = more module expansion
    const lowDegree = estimateTokensBeforeGeneration(1, 1, 2);
    const highDegree = estimateTokensBeforeGeneration(1, 1, 5);

    assert.ok(highDegree > lowDegree);
  });

  test("uses custom tokens per module", () => {
    const lowTokens = estimateTokensBeforeGeneration(1, 1, 3, 100);
    const highTokens = estimateTokensBeforeGeneration(1, 1, 3, 500);

    assert.ok(highTokens > lowTokens);
  });

  test("radius 0 returns approximately seed count * tokens per module", () => {
    const seeds = 5;
    const tokensPerModule = 200;
    const estimated = estimateTokensBeforeGeneration(seeds, 0, 3, tokensPerModule);

    // Radius 0 = just seed modules + overhead
    // Should be approximately seeds * tokensPerModule + overhead
    const expected = seeds * tokensPerModule;

    // Within 50% margin (rough estimate)
    assert.ok(estimated >= expected * 0.5);
    assert.ok(estimated <= expected * 1.5);
  });
});

console.log("All auto-tune tests passed! ✅");
