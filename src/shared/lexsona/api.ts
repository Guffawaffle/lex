/**
 * LexSona Behavioral Rules API
 *
 * Internal API endpoints for behavioral rules:
 * - `getRules(context, options)` - Retrieve applicable rules for context
 * - `recordCorrection(db, correction)` - Capture user feedback
 *
 * These are internal APIs (not exposed via HTTP yet).
 * Used by LexRunner integration.
 *
 * @see docs/LEXSONA.md
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 */

import Database from "better-sqlite3-multiple-ciphers";
import type {
  BehaviorRuleWithConfidence,
  RuleContext,
  Correction,
  GetRulesOptions,
} from "../../memory/store/lexsona-types.js";
import { LEXSONA_DEFAULTS } from "../../memory/store/lexsona-types.js";
import {
  getRulesByContext,
  findRuleByContext,
  reinforceRule,
  counterExampleRule,
  createBehaviorRule,
} from "../../memory/store/lexsona-queries.js";
import { getNDJSONLogger } from "../logger/index.js";

const logger = getNDJSONLogger("lexsona/api");

/**
 * Retrieve applicable behavioral rules for a given context.
 *
 * Rules are filtered by:
 * - Exact match on module_id (if provided in context)
 * - Fuzzy match on task_type (if provided in context)
 * - Minimum observation count (N ≥ minN, default 3)
 * - Minimum effective confidence (confidence * decay_factor)
 *
 * Rules are sorted by effective_confidence (descending).
 *
 * @param db - Database connection
 * @param context - Context for filtering rules
 * @param options - Options for filtering (minN, minConfidence, limit)
 * @returns Array of applicable rules sorted by confidence
 *
 * @example
 * ```typescript
 * const rules = getRules(db, {
 *   module_id: 'src/services/auth',
 *   task_type: 'code-review',
 *   environment: 'github-copilot'
 * });
 * // Returns rules applicable to the auth module for code review
 * ```
 */
export function getRules(
  db: Database.Database,
  context: RuleContext = {},
  options: GetRulesOptions = {}
): BehaviorRuleWithConfidence[] {
  const startTime = Date.now();

  const result = getRulesByContext(db, context, {
    minN: options.minN ?? LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT,
    minConfidence: options.minConfidence ?? LEXSONA_DEFAULTS.MIN_CONFIDENCE,
    limit: options.limit ?? LEXSONA_DEFAULTS.DEFAULT_LIMIT,
  });

  const duration = Date.now() - startTime;
  logger.info("getRules completed", {
    operation: "getRules",
    duration_ms: duration,
    metadata: {
      context: Object.keys(context).length > 0 ? context : "empty",
      resultCount: result.length,
      options,
    },
  });

  return result;
}

/**
 * Record a user correction to update behavioral rules.
 *
 * If a matching rule exists (same module_id and text):
 * - Reinforcement (polarity=1): Increment α (alpha), increment N
 * - Counterexample (polarity=-1): Increment β (beta), increment N
 *
 * If no matching rule exists:
 * - Create new rule with initial values: α=α_0+1, β=β_0, N=1
 *
 * The last_observed timestamp is always updated to enable decay calculation.
 *
 * @param db - Database connection
 * @param correction - The correction to record
 * @returns The updated or created rule with confidence scores
 *
 * @example
 * ```typescript
 * // Record a positive correction (reinforcement)
 * const rule = recordCorrection(db, {
 *   context: { module_id: 'src/services/auth' },
 *   correction: 'Always use JWT for authentication in this module',
 *   category: 'security_policy',
 *   severity: 'must'
 * });
 *
 * // Record a negative correction (counterexample)
 * const rule = recordCorrection(db, {
 *   context: { module_id: 'src/utils' },
 *   correction: 'Use lodash for utility functions',
 *   polarity: -1  // This is a counterexample
 * });
 * ```
 */
export function recordCorrection(
  db: Database.Database,
  correction: Correction
): BehaviorRuleWithConfidence {
  const startTime = Date.now();
  const polarity = correction.polarity ?? 1;

  // Try to find an existing rule matching the context
  const existingRule = findRuleByContext(db, correction.context.module_id, correction.correction);

  let result: BehaviorRuleWithConfidence;

  if (existingRule) {
    // Update existing rule based on polarity
    if (polarity === 1) {
      reinforceRule(db, existingRule.rule_id);
    } else {
      counterExampleRule(db, existingRule.rule_id);
    }

    // Fetch updated rule
    const updated = findRuleByContext(db, correction.context.module_id, correction.correction);

    if (!updated) {
      // Should not happen, but handle gracefully
      throw new Error(`Failed to retrieve updated rule: ${existingRule.rule_id}`);
    }

    result = updated;

    logger.info("Correction recorded: existing rule updated", {
      operation: "recordCorrection",
      duration_ms: Date.now() - startTime,
      metadata: {
        ruleId: result.rule_id,
        polarity,
        newAlpha: result.alpha,
        newBeta: result.beta,
        observationCount: result.observation_count,
        confidence: result.confidence,
      },
    });
  } else {
    // Create a new rule
    result = createBehaviorRule(db, {
      text: correction.correction,
      scope: correction.context,
      category: correction.category,
      severity: correction.severity,
      frameId: correction.frame_id,
    });

    logger.info("Correction recorded: new rule created", {
      operation: "recordCorrection",
      duration_ms: Date.now() - startTime,
      metadata: {
        ruleId: result.rule_id,
        category: result.category,
        severity: result.severity,
        confidence: result.confidence,
      },
    });
  }

  return result;
}
