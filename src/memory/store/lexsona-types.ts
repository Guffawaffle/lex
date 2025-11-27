/**
 * LexSona Behavioral Rules Types
 *
 * Types for the internal API for behavioral rules.
 * Based on LexSona Mathematical Framework v0.1 and CptPlnt schema.
 *
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 * @see docs/research/LexSona/CptPlnt/lexsona_behavior_rule.schema.json
 */

/**
 * Scope definition for behavioral rules
 * Matches the context lattice structure from the mathematical framework
 */
export interface RuleScope {
  /**
   * Module identifier (exact match for filtering)
   */
  module_id?: string;

  /**
   * Task type (fuzzy matching for filtering)
   */
  task_type?: string;

  /**
   * Environment context (e.g., 'github-copilot', 'awa', 'personal')
   */
  environment?: string;

  /**
   * Project context (e.g., 'lex-core', 'awa-monorepo')
   */
  project?: string;

  /**
   * Agent family (e.g., 'gpt', 'claude', 'copilot', 'coding-agent')
   */
  agent_family?: string;

  /**
   * Context tags for fine-grained matching (e.g., ['execution', 'tools', 'php'])
   */
  context_tags?: string[];
}

/**
 * Severity level for behavioral rules
 */
export type RuleSeverity = "must" | "should" | "style";

/**
 * Behavioral rule stored in the database
 */
export interface BehaviorRule {
  /**
   * Unique identifier for the rule (stable across edits)
   */
  rule_id: string;

  /**
   * Category for grouping (e.g., 'tool_preference', 'communication_style', 'security_policy')
   */
  category: string;

  /**
   * Human-readable rule statement / directive
   */
  text: string;

  /**
   * Context scope where this rule applies
   */
  scope: RuleScope;

  /**
   * Bayesian confidence: successes (reinforcements + prior)
   * Default skeptical prior: alpha_0 = 2
   */
  alpha: number;

  /**
   * Bayesian confidence: failures (counterexamples + prior)
   * Default skeptical prior: beta_0 = 5
   */
  beta: number;

  /**
   * Count of observations (reinforcements + counterexamples)
   */
  observation_count: number;

  /**
   * Severity level for the rule
   */
  severity: RuleSeverity;

  /**
   * Decay time constant in days (default: 180 days)
   */
  decay_tau: number;

  /**
   * When the rule was first created
   */
  created_at: string;

  /**
   * When the rule was last updated
   */
  updated_at: string;

  /**
   * When the rule was last observed (used for recency decay)
   */
  last_observed: string;

  /**
   * Optional frame ID for auditability
   */
  frame_id?: string;
}

/**
 * Extended rule with computed fields for API response
 */
export interface BehaviorRuleWithConfidence extends BehaviorRule {
  /**
   * Derived base confidence score: alpha / (alpha + beta)
   */
  confidence: number;

  /**
   * Decay factor based on time since last observation
   * exp(-(now - last_observed) / (decay_tau * 86400000))
   */
  decay_factor: number;

  /**
   * Combined score: confidence * decay_factor
   */
  effective_confidence: number;
}

/**
 * Context for retrieving rules
 */
export interface RuleContext {
  /**
   * Module identifier for exact match filtering
   */
  module_id?: string;

  /**
   * Task type for fuzzy matching
   */
  task_type?: string;

  /**
   * Environment filter
   */
  environment?: string;

  /**
   * Project filter
   */
  project?: string;

  /**
   * Agent family filter
   */
  agent_family?: string;

  /**
   * Context tags filter
   */
  context_tags?: string[];
}

/**
 * Correction event to record user feedback
 */
export interface Correction {
  /**
   * Context where the correction occurred
   */
  context: RuleScope;

  /**
   * The correction text / rule statement
   */
  correction: string;

  /**
   * Category for the rule
   */
  category?: string;

  /**
   * Severity level
   */
  severity?: RuleSeverity;

  /**
   * Whether this is a reinforcement (+1) or counterexample (-1)
   * Default: 1 (reinforcement)
   */
  polarity?: 1 | -1;

  /**
   * Optional frame ID for auditability
   */
  frame_id?: string;
}

/**
 * Options for getRules function
 */
export interface GetRulesOptions {
  /**
   * Minimum observation count for rule activation (default: 3)
   */
  minN?: number;

  /**
   * Minimum confidence threshold (default: 0.5)
   */
  minConfidence?: number;

  /**
   * Maximum number of rules to return (default: 100)
   */
  limit?: number;
}

/**
 * Default hyperparameters for LexSona
 */
export const LEXSONA_DEFAULTS = {
  /**
   * Skeptical prior: alpha_0 = 2
   */
  ALPHA_PRIOR: 2,

  /**
   * Skeptical prior: beta_0 = 5
   */
  BETA_PRIOR: 5,

  /**
   * Default decay time constant: 180 days
   */
  DECAY_TAU_DAYS: 180,

  /**
   * Minimum sample size for rule activation
   */
  MIN_OBSERVATION_COUNT: 3,

  /**
   * Default confidence threshold
   */
  MIN_CONFIDENCE: 0.5,

  /**
   * Maximum rules to return in API
   */
  DEFAULT_LIMIT: 100,
} as const;
