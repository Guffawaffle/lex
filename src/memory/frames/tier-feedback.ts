/**
 * Turn Cost → Tier Feedback Loop
 *
 * Provides helpers to suggest tier escalation/de-escalation based on Turn Cost metrics.
 * Part of the Wave 2 governance model integration.
 *
 * @module memory/frames/tier-feedback
 */

import type { CapabilityTier, TurnCost } from "./types.js";

/**
 * Turn Cost thresholds for tier recommendations
 * 
 * These are initial thresholds based on governance model.
 * Should be tuned based on empirical data.
 */
export const TURN_COST_THRESHOLDS = {
  /** Below this, consider de-escalation from senior to mid */
  SENIOR_TO_MID: 200,
  /** Below this, consider de-escalation from mid to junior */
  MID_TO_JUNIOR: 100,
  /** Above this, consider escalation from junior to mid */
  JUNIOR_TO_MID: 500,
  /** Above this, consider escalation from mid to senior */
  MID_TO_SENIOR: 1000,
} as const;

/**
 * Tier recommendation result
 */
export interface TierRecommendation {
  /** Recommended tier based on Turn Cost */
  recommendedTier: CapabilityTier;
  /** Reason for the recommendation */
  reason: string;
  /** Turn Cost that triggered the recommendation */
  turnCostScore: number;
  /** Whether this is an escalation (true) or de-escalation (false) */
  isEscalation: boolean;
}

/**
 * Suggest tier based on Turn Cost score
 *
 * @param turnCost - Turn Cost measurement
 * @param currentTier - Current capability tier assignment
 * @returns Tier recommendation or null if no change suggested
 *
 * @example
 * ```typescript
 * const recommendation = suggestTierFromTurnCost(
 *   { components: {...}, weightedScore: 1200 },
 *   'mid'
 * );
 * if (recommendation) {
 *   console.log(`Suggest ${recommendation.recommendedTier}: ${recommendation.reason}`);
 * }
 * ```
 */
export function suggestTierFromTurnCost(
  turnCost: TurnCost,
  currentTier: CapabilityTier
): TierRecommendation | null {
  const score = turnCost.weightedScore ?? 0;

  // Escalation logic
  if (currentTier === "junior" && score >= TURN_COST_THRESHOLDS.JUNIOR_TO_MID) {
    return {
      recommendedTier: "mid",
      reason: `Turn Cost ${score} exceeds junior threshold (${TURN_COST_THRESHOLDS.JUNIOR_TO_MID}). Task complexity suggests mid-tier capability needed.`,
      turnCostScore: score,
      isEscalation: true,
    };
  }

  if (currentTier === "mid" && score >= TURN_COST_THRESHOLDS.MID_TO_SENIOR) {
    return {
      recommendedTier: "senior",
      reason: `Turn Cost ${score} exceeds mid threshold (${TURN_COST_THRESHOLDS.MID_TO_SENIOR}). Task complexity suggests senior-tier capability needed.`,
      turnCostScore: score,
      isEscalation: true,
    };
  }

  // De-escalation logic
  if (currentTier === "senior" && score < TURN_COST_THRESHOLDS.SENIOR_TO_MID) {
    return {
      recommendedTier: "mid",
      reason: `Turn Cost ${score} below senior threshold (${TURN_COST_THRESHOLDS.SENIOR_TO_MID}). Task can be handled by mid-tier.`,
      turnCostScore: score,
      isEscalation: false,
    };
  }

  if (currentTier === "mid" && score < TURN_COST_THRESHOLDS.MID_TO_JUNIOR) {
    return {
      recommendedTier: "junior",
      reason: `Turn Cost ${score} below mid threshold (${TURN_COST_THRESHOLDS.MID_TO_JUNIOR}). Task can be handled by junior-tier.`,
      turnCostScore: score,
      isEscalation: false,
    };
  }

  return null; // No change recommended
}

/**
 * History entry for tracking Turn Cost over time
 */
export interface TurnCostHistoryEntry {
  turnCost: TurnCost;
  tier: CapabilityTier;
  timestamp: string;
}

/**
 * Analyze Turn Cost history to detect consistent patterns
 *
 * @param history - Array of Turn Cost measurements with tiers
 * @param windowSize - Number of recent entries to analyze (default: 5)
 * @returns Tier recommendation based on patterns, or null
 *
 * @example
 * ```typescript
 * const recommendation = analyzeConsistentTurnCost(history, 5);
 * if (recommendation) {
 *   console.log(`Pattern detected: ${recommendation.reason}`);
 * }
 * ```
 */
export function analyzeConsistentTurnCost(
  history: TurnCostHistoryEntry[],
  windowSize: number = 5
): TierRecommendation | null {
  if (history.length < windowSize) {
    return null; // Not enough data
  }

  // Get recent window
  const recentEntries = history.slice(-windowSize);
  const currentTier = recentEntries[recentEntries.length - 1].tier;

  // Calculate average Turn Cost in window
  const avgScore =
    recentEntries.reduce((sum, entry) => sum + (entry.turnCost.weightedScore ?? 0), 0) / windowSize;

  // Check if all entries are consistently high or low
  const allScores = recentEntries.map((e) => e.turnCost.weightedScore ?? 0);
  const maxScore = Math.max(...allScores);
  const minScore = Math.min(...allScores);

  // Consistent = within 20% variance
  const variance = (maxScore - minScore) / avgScore;
  const isConsistent = variance < 0.2;

  if (!isConsistent) {
    return null; // Too much variance, not a clear pattern
  }

  // Apply same threshold logic as single measurement
  // but with "consistently" qualifier
  if (currentTier === "junior" && avgScore >= TURN_COST_THRESHOLDS.JUNIOR_TO_MID) {
    return {
      recommendedTier: "mid",
      reason: `Turn Cost consistently high (avg ${avgScore.toFixed(0)} over ${windowSize} sessions). Escalate to mid-tier.`,
      turnCostScore: avgScore,
      isEscalation: true,
    };
  }

  if (currentTier === "mid" && avgScore >= TURN_COST_THRESHOLDS.MID_TO_SENIOR) {
    return {
      recommendedTier: "senior",
      reason: `Turn Cost consistently high (avg ${avgScore.toFixed(0)} over ${windowSize} sessions). Escalate to senior-tier.`,
      turnCostScore: avgScore,
      isEscalation: true,
    };
  }

  if (currentTier === "senior" && avgScore < TURN_COST_THRESHOLDS.SENIOR_TO_MID) {
    return {
      recommendedTier: "mid",
      reason: `Turn Cost consistently low (avg ${avgScore.toFixed(0)} over ${windowSize} sessions). De-escalate to mid-tier.`,
      turnCostScore: avgScore,
      isEscalation: false,
    };
  }

  if (currentTier === "mid" && avgScore < TURN_COST_THRESHOLDS.MID_TO_JUNIOR) {
    return {
      recommendedTier: "junior",
      reason: `Turn Cost consistently low (avg ${avgScore.toFixed(0)} over ${windowSize} sessions). De-escalate to junior-tier.`,
      turnCostScore: avgScore,
      isEscalation: false,
    };
  }

  return null;
}
