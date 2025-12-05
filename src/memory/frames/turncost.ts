/**
 * Turn Cost calculation utilities
 *
 * Implements the Turn Cost formula from the governance thesis:
 * Turn Cost = λL + γC + ρR + τT + αA
 *
 * Where:
 * - L = Latency (response time in ms)
 * - C = Context Reset (tokens to re-establish context)
 * - R = Renegotiation (clarification turns)
 * - T = Token Bloat (excess tokens beyond minimum)
 * - A = Attention Switch (human cognitive overhead)
 */

import type { TurnCostComponent, TurnCostWeights } from "./types.js";

/**
 * Default Turn Cost weights from the governance thesis
 */
export const DEFAULT_TURN_COST_WEIGHTS: TurnCostWeights = {
  lambda: 0.1,
  gamma: 0.2,
  rho: 0.3,
  tau: 0.1,
  alpha: 0.3,
};

/**
 * Calculate weighted Turn Cost score from components
 *
 * @param components - Turn Cost components (L, C, R, T, A)
 * @param weights - Optional weight overrides (defaults to thesis weights)
 * @returns Weighted Turn Cost score
 *
 * @example
 * ```typescript
 * const score = calculateWeightedTurnCost({
 *   latency: 1500,
 *   contextReset: 2000,
 *   renegotiation: 3,
 *   tokenBloat: 500,
 *   attentionSwitch: 2
 * });
 * console.log(`Turn Cost: ${score}`);
 * ```
 */
export function calculateWeightedTurnCost(
  components: TurnCostComponent,
  weights: TurnCostWeights = DEFAULT_TURN_COST_WEIGHTS
): number {
  return (
    weights.lambda * components.latency +
    weights.gamma * components.contextReset +
    weights.rho * components.renegotiation +
    weights.tau * components.tokenBloat +
    weights.alpha * components.attentionSwitch
  );
}
