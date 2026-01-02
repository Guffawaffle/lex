/**
 * Tests for Turn Cost schemas and calculation
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  TurnCostComponent,
  TurnCostWeights,
  TurnCost,
  Frame,
  FRAME_SCHEMA_VERSION,
} from "../../../src/memory/frames/types.js";
import {
  calculateWeightedTurnCost,
  DEFAULT_TURN_COST_WEIGHTS,
} from "../../../src/memory/frames/turncost.js";

describe("Turn Cost Schema Validation", () => {
  test("should validate TurnCostComponent with all fields", () => {
    const component = {
      latency: 1500,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    };

    const result = TurnCostComponent.safeParse(component);
    assert.ok(result.success, "TurnCostComponent should validate successfully");
    assert.deepStrictEqual(result.data, component);
  });

  test("should reject TurnCostComponent with missing fields", () => {
    const incomplete = {
      latency: 1500,
      contextReset: 2000,
      // Missing renegotiation, tokenBloat, attentionSwitch
    };

    const result = TurnCostComponent.safeParse(incomplete);
    assert.ok(!result.success, "TurnCostComponent should fail with missing fields");
  });

  test("should reject TurnCostComponent with wrong types", () => {
    const wrongTypes = {
      latency: "1500", // Should be number
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    };

    const result = TurnCostComponent.safeParse(wrongTypes);
    assert.ok(!result.success, "TurnCostComponent should fail with wrong types");
  });

  test("should validate TurnCostWeights with all fields", () => {
    const weights = {
      lambda: 0.1,
      gamma: 0.2,
      rho: 0.3,
      tau: 0.1,
      alpha: 0.3,
    };

    const result = TurnCostWeights.safeParse(weights);
    assert.ok(result.success, "TurnCostWeights should validate successfully");
    assert.deepStrictEqual(result.data, weights);
  });

  test("should use default values for TurnCostWeights", () => {
    const emptyWeights = {};
    const result = TurnCostWeights.safeParse(emptyWeights);
    assert.ok(result.success, "TurnCostWeights should parse with defaults");
    assert.strictEqual(result.data?.lambda, 0.1, "lambda should default to 0.1");
    assert.strictEqual(result.data?.gamma, 0.2, "gamma should default to 0.2");
    assert.strictEqual(result.data?.rho, 0.3, "rho should default to 0.3");
    assert.strictEqual(result.data?.tau, 0.1, "tau should default to 0.1");
    assert.strictEqual(result.data?.alpha, 0.3, "alpha should default to 0.3");
  });

  test("should validate TurnCost with required components", () => {
    const turnCost = {
      components: {
        latency: 1500,
        contextReset: 2000,
        renegotiation: 3,
        tokenBloat: 500,
        attentionSwitch: 2,
      },
    };

    const result = TurnCost.safeParse(turnCost);
    assert.ok(result.success, "TurnCost should validate successfully");
    assert.deepStrictEqual(result.data?.components, turnCost.components);
  });

  test("should validate TurnCost with optional fields", () => {
    const components = {
      latency: 1500,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    };

    const weights = {
      lambda: 0.15,
      gamma: 0.25,
      rho: 0.3,
      tau: 0.1,
      alpha: 0.2,
    };

    // Calculate actual score: 0.15*1500 + 0.25*2000 + 0.3*3 + 0.1*500 + 0.2*2
    // = 225 + 500 + 0.9 + 50 + 0.4 = 776.3
    const expectedScore = 776.3;

    const turnCost = {
      components,
      weights,
      weightedScore: expectedScore,
      sessionId: "session-123",
      timestamp: "2025-12-05T02:00:00Z",
    };

    const result = TurnCost.safeParse(turnCost);
    assert.ok(result.success, "TurnCost with optional fields should validate");
    assert.deepStrictEqual(result.data, turnCost);
  });
});

describe("Turn Cost Calculation", () => {
  test("should calculate weighted Turn Cost with default weights", () => {
    const components = {
      latency: 1000,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    };

    const score = calculateWeightedTurnCost(components);

    // Expected: 0.1*1000 + 0.2*2000 + 0.3*3 + 0.1*500 + 0.3*2
    // = 100 + 400 + 0.9 + 50 + 0.6 = 551.5
    assert.strictEqual(score, 551.5, "Should calculate correct weighted score");
  });

  test("should calculate weighted Turn Cost with custom weights", () => {
    const components = {
      latency: 1000,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    };

    const customWeights = {
      lambda: 0.2,
      gamma: 0.3,
      rho: 0.1,
      tau: 0.2,
      alpha: 0.2,
    };

    const score = calculateWeightedTurnCost(components, customWeights);

    // Expected: 0.2*1000 + 0.3*2000 + 0.1*3 + 0.2*500 + 0.2*2
    // = 200 + 600 + 0.3 + 100 + 0.4 = 900.7
    assert.ok(
      Math.abs(score - 900.7) < 0.0001,
      `Should calculate correct weighted score with custom weights (got ${score})`
    );
  });

  test("should handle zero values", () => {
    const components = {
      latency: 0,
      contextReset: 0,
      renegotiation: 0,
      tokenBloat: 0,
      attentionSwitch: 0,
    };

    const score = calculateWeightedTurnCost(components);
    assert.strictEqual(score, 0, "Should return 0 for all zero components");
  });

  test("should handle large values", () => {
    const components = {
      latency: 100000,
      contextReset: 50000,
      renegotiation: 100,
      tokenBloat: 10000,
      attentionSwitch: 50,
    };

    const score = calculateWeightedTurnCost(components);

    // Expected: 0.1*100000 + 0.2*50000 + 0.3*100 + 0.1*10000 + 0.3*50
    // = 10000 + 10000 + 30 + 1000 + 15 = 21045
    assert.strictEqual(score, 21045, "Should handle large values correctly");
  });

  test("DEFAULT_TURN_COST_WEIGHTS should match thesis weights", () => {
    assert.strictEqual(DEFAULT_TURN_COST_WEIGHTS.lambda, 0.1, "lambda should be 0.1");
    assert.strictEqual(DEFAULT_TURN_COST_WEIGHTS.gamma, 0.2, "gamma should be 0.2");
    assert.strictEqual(DEFAULT_TURN_COST_WEIGHTS.rho, 0.3, "rho should be 0.3");
    assert.strictEqual(DEFAULT_TURN_COST_WEIGHTS.tau, 0.1, "tau should be 0.1");
    assert.strictEqual(DEFAULT_TURN_COST_WEIGHTS.alpha, 0.3, "alpha should be 0.3");
  });
});

describe("Frame Schema Integration", () => {
  test("should validate Frame with turnCost field", () => {
    const frame = {
      id: "frame-turncost-001",
      timestamp: "2025-12-05T02:00:00Z",
      branch: "feature/turn-cost",
      module_scope: ["memory/frames"],
      summary_caption: "Testing Turn Cost integration",
      reference_point: "turn cost test frame",
      status_snapshot: {
        next_action: "Validate Turn Cost tracking",
      },
      turnCost: {
        components: {
          latency: 1500,
          contextReset: 2000,
          renegotiation: 3,
          tokenBloat: 500,
          attentionSwitch: 2,
        },
        weightedScore: 551.5,
        sessionId: "session-123",
        timestamp: "2025-12-05T02:00:00Z",
      },
    };

    const result = Frame.safeParse(frame);
    assert.ok(result.success, "Frame with turnCost should validate successfully");
    assert.deepStrictEqual(result.data?.turnCost, frame.turnCost);
  });

  test("should validate Frame without turnCost field (optional)", () => {
    const frame = {
      id: "frame-no-turncost",
      timestamp: "2025-12-05T02:00:00Z",
      branch: "feature/other",
      module_scope: ["memory/frames"],
      summary_caption: "Frame without Turn Cost",
      reference_point: "no turn cost frame",
      status_snapshot: {
        next_action: "Continue work",
      },
    };

    const result = Frame.safeParse(frame);
    assert.ok(result.success, "Frame without turnCost should validate successfully");
    assert.strictEqual(result.data?.turnCost, undefined, "turnCost should be undefined");
  });

  test("FRAME_SCHEMA_VERSION should be 5", () => {
    assert.strictEqual(FRAME_SCHEMA_VERSION, 5, "Frame schema version should be 5");
  });
});

describe("Turn Cost Edge Cases", () => {
  test("should handle decimal values in components", () => {
    const components = {
      latency: 1500.5,
      contextReset: 2000.75,
      renegotiation: 3.2,
      tokenBloat: 500.1,
      attentionSwitch: 2.8,
    };

    const result = TurnCostComponent.safeParse(components);
    assert.ok(result.success, "TurnCostComponent should accept decimal values");

    const score = calculateWeightedTurnCost(components);
    // Expected: 0.1*1500.5 + 0.2*2000.75 + 0.3*3.2 + 0.1*500.1 + 0.3*2.8
    // = 150.05 + 400.15 + 0.96 + 50.01 + 0.84 = 602.01
    assert.ok(
      Math.abs(score - 602.01) < 0.0001,
      `Should calculate with decimal precision (got ${score})`
    );
  });

  test("should handle negative values (debt reduction scenarios)", () => {
    const components = {
      latency: 1000,
      contextReset: -500, // Reduced context due to better memory
      renegotiation: 2,
      tokenBloat: 0,
      attentionSwitch: 1,
    };

    const result = TurnCostComponent.safeParse(components);
    assert.ok(result.success, "TurnCostComponent should accept negative values");

    const score = calculateWeightedTurnCost(components);
    // Expected: 0.1*1000 + 0.2*(-500) + 0.3*2 + 0.1*0 + 0.3*1
    // = 100 - 100 + 0.6 + 0 + 0.3 = 0.9
    assert.ok(
      Math.abs(score - 0.9) < 0.0001,
      `Should handle negative values correctly (got ${score})`
    );
  });

  test("should calculate Turn Cost for minimal session", () => {
    const components = {
      latency: 500,
      contextReset: 0,
      renegotiation: 0,
      tokenBloat: 0,
      attentionSwitch: 0,
    };

    const score = calculateWeightedTurnCost(components);
    // Expected: 0.1*500 = 50
    assert.strictEqual(score, 50, "Should calculate minimal Turn Cost");
  });

  test("should calculate Turn Cost for high-coordination session", () => {
    const components = {
      latency: 5000,
      contextReset: 10000,
      renegotiation: 15,
      tokenBloat: 3000,
      attentionSwitch: 10,
    };

    const score = calculateWeightedTurnCost(components);
    // Expected: 0.1*5000 + 0.2*10000 + 0.3*15 + 0.1*3000 + 0.3*10
    // = 500 + 2000 + 4.5 + 300 + 3 = 2807.5
    assert.strictEqual(score, 2807.5, "Should calculate high-coordination Turn Cost");
  });
});
