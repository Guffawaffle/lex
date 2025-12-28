/**
 * Types for LexSona behavioral rules
 */

/**
 * Scope definition for behavioral rules
 */
export interface RuleScope {
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
 * Enforcement mode for behavioral rules
 */
export type EnforcementMode = "zero-tolerance" | "should" | "style";

/**
 * Behavioral rule definition
 */
export interface BehavioralRule {
  /**
   * Unique identifier for the rule (stable across edits)
   */
  rule_id: string;

  /**
   * Category for grouping (e.g., 'tool_preference', 'communication_style')
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
   */
  alpha: number;

  /**
   * Bayesian confidence: failures (counterexamples + prior)
   */
  beta: number;

  /**
   * Count of reinforcements (informational)
   */
  reinforcements?: number;

  /**
   * Count of counterexamples (informational)
   */
  counter_examples?: number;

  /**
   * Derived confidence score (alpha / (alpha + beta))
   */
  confidence: number;

  /**
   * Enforcement mode
   */
  severity: EnforcementMode;

  /**
   * Optional timing requirement in seconds
   */
  timing_requirement_seconds?: number;

  /**
   * When the rule was first created
   */
  first_seen: string;

  /**
   * When the rule was last updated
   */
  last_correction: string;

  /**
   * Optional frame ID for auditability
   */
  frame_id?: string;
}

/**
 * Context for resolving and filtering rules
 */
export interface RuleContext {
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

  /**
   * Minimum confidence threshold (default: 0.75)
   */
  confidenceThreshold?: number;
}

/**
 * Resolved rule with source information
 */
export interface ResolvedRule extends BehavioralRule {
  /**
   * Source of the rule (for debugging/precedence tracking)
   */
  source: "env" | "workspace" | "package";

  /**
   * Full path to the rule file
   */
  sourcePath: string;
}
