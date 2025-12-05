/**
 * Tests for Wave 2 integration between Turn Cost, Receipt, and Capability Tier systems
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  suggestTierFromTurnCost,
  analyzeConsistentTurnCost,
  TURN_COST_THRESHOLDS,
  type TurnCostHistoryEntry,
} from "../../../src/memory/frames/tier-feedback.js";
import { createReceipt } from "../../../src/memory/receipts/index.js";
import type { TurnCost, Frame } from "../../../src/memory/frames/types.js";
import { getDb } from "../../../src/memory/store/index.js";
import { saveFrame, getFramesByTier, getTierEscalationPatterns } from "../../../src/memory/store/queries.js";

describe("Turn Cost → Tier Feedback Loop", () => {
  test("should suggest escalation from junior to mid when Turn Cost is high", () => {
    const turnCost: TurnCost = {
      components: {
        latency: 5000,
        contextReset: 10000,
        renegotiation: 15,
        tokenBloat: 3000,
        attentionSwitch: 10,
      },
      weightedScore: 2807.5,
    };

    const recommendation = suggestTierFromTurnCost(turnCost, "junior");

    assert.ok(recommendation);
    assert.strictEqual(recommendation.recommendedTier, "mid");
    assert.strictEqual(recommendation.isEscalation, true);
  });
});

describe("Receipt → Turn Cost Attribution", () => {
  test("should create receipt with Turn Cost", () => {
    const turnCost: TurnCost = {
      components: {
        latency: 1500,
        contextReset: 2000,
        renegotiation: 3,
        tokenBloat: 500,
        attentionSwitch: 2,
      },
      weightedScore: 551.5,
    };

    const receipt = createReceipt({
      action: "Implemented feature X",
      rationale: "User requirement",
      confidence: "medium",
      reversibility: "reversible",
      turnCost,
    });

    assert.ok(receipt.turnCost);
    assert.deepStrictEqual(receipt.turnCost, turnCost);
  });
});
