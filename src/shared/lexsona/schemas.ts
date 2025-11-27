/**
 * LexSona Behavioral Rules Schemas
 *
 * Zod schemas for behavioral rules with confidence scoring.
 * Part of LexSona v0 Integration (0.5.0 Tier 4).
 *
 * @see docs/LEXSONA.md for architecture overview
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md for mathematical framework
 */

import { z } from "zod";

/**
 * BehaviorRule schema - validation for rule records stored in lexsona_behavior_rules table
 *
 * Stores behavioral patterns learned from user corrections with Bayesian confidence scoring.
 * Based on the LexSona mathematical framework's Beta-Bernoulli confidence estimation.
 */
export const BehaviorRuleSchema = z.object({
  /** Unique rule identifier */
  rule_id: z.string().min(1),

  /** Context object storing scope information (module, task_type, environment, etc.) */
  context: z.record(z.string(), z.unknown()),

  /** The behavioral pattern/rule text (the correction learned) */
  correction: z.string().min(1),

  /** Beta distribution α parameter - accumulated support (pseudo-count) */
  confidence_alpha: z.number().min(0),

  /** Beta distribution β parameter - accumulated counter-evidence (pseudo-count) */
  confidence_beta: z.number().min(0),

  /** Number of times this rule has been observed/reinforced */
  observation_count: z.number().int().min(0),

  /** ISO 8601 timestamp when the rule was created */
  created_at: z.string().datetime(),

  /** ISO 8601 timestamp when the rule was last updated */
  updated_at: z.string().datetime(),

  /** ISO 8601 timestamp when the rule was last observed/reinforced */
  last_observed: z.string().datetime(),

  /** Decay time constant in days (default: 180 days, ~6 months half-life) */
  decay_tau: z.number().int().positive().default(180),
});

export type BehaviorRule = z.infer<typeof BehaviorRuleSchema>;

/**
 * CorrectionSchema - validation for user feedback/corrections
 *
 * Used when ingesting new corrections from users. The system will match
 * corrections to existing rules or create new ones.
 */
export const CorrectionSchema = z.object({
  /** Context object storing scope information where correction applies */
  context: z.record(z.string(), z.unknown()),

  /** The correction text (behavioral pattern to learn) */
  correction: z.string().min(1),

  /** Optional user identifier for attribution */
  user_id: z.string().optional(),

  /** ISO 8601 timestamp when the correction was made */
  timestamp: z.string().datetime(),
});

export type Correction = z.infer<typeof CorrectionSchema>;

/**
 * Parse and validate a BehaviorRule object
 * @param data - The data to parse
 * @returns Validated BehaviorRule object
 * @throws ZodError if validation fails
 */
export function parseBehaviorRule(data: unknown): BehaviorRule {
  return BehaviorRuleSchema.parse(data);
}

/**
 * Validate a BehaviorRule object without throwing
 * @param data - The data to validate
 * @returns Validation result with success flag and optional data/error
 */
export function validateBehaviorRule(
  data: unknown
): { success: true; data: BehaviorRule } | { success: false; error: z.ZodError } {
  const result = BehaviorRuleSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Parse and validate a Correction object
 * @param data - The data to parse
 * @returns Validated Correction object
 * @throws ZodError if validation fails
 */
export function parseCorrection(data: unknown): Correction {
  return CorrectionSchema.parse(data);
}

/**
 * Validate a Correction object without throwing
 * @param data - The data to validate
 * @returns Validation result with success flag and optional data/error
 */
export function validateCorrection(
  data: unknown
): { success: true; data: Correction } | { success: false; error: z.ZodError } {
  const result = CorrectionSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
