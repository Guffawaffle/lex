/**
 * Receipt Recovery Suggestion Engine
 *
 * Generates recovery suggestions based on failure classification.
 *
 * @module memory/receipts/recovery
 */

import { FailureClass } from "./schema.js";

/**
 * Recovery suggestion for a specific failure class
 */
export interface RecoverySuggestion {
  /** Short description of the recovery action */
  action: string;
  /** Detailed explanation of why this helps */
  rationale: string;
  /** Governance intervention type needed */
  interventionType: "reduce_scope" | "increase_budget" | "escalate" | "chunk_task" | "retry" | "policy_review";
}

/**
 * Get recovery suggestion for a failure class
 *
 * Maps failure classifications to recommended recovery actions with
 * governance intervention types.
 *
 * @param failureClass - The failure classification
 * @param context - Optional additional context about the failure
 * @returns Recovery suggestion with action, rationale, and intervention type
 *
 * @example
 * ```typescript
 * const suggestion = getRecoverySuggestion('timeout');
 * console.log(suggestion.action);
 * // => "Reduce scope or increase timeout budget"
 * ```
 */
export function getRecoverySuggestion(
  failureClass: FailureClass,
  _context?: string
): RecoverySuggestion {
  switch (failureClass) {
    case "timeout":
      return {
        action: "Reduce scope or increase timeout budget",
        rationale:
          "Operation exceeded time budget. Consider breaking the task into smaller units or allocating more time for complex operations.",
        interventionType: "reduce_scope",
      };

    case "resource_exhaustion":
      return {
        action: "Chunk task into smaller units or increase resource allocation",
        rationale:
          "Ran out of tokens, memory, or other resources. Breaking the task into smaller pieces or increasing resource limits may help.",
        interventionType: "chunk_task",
      };

    case "model_error":
      return {
        action: "Escalate to senior tier or retry with different model",
        rationale:
          "The model returned an error or invalid response. A more capable model or human review may be needed.",
        interventionType: "escalate",
      };

    case "context_overflow":
      return {
        action: "Chunk task into smaller units with focused context",
        rationale:
          "Too much context for the model to handle effectively. Break down the task and provide only relevant context for each chunk.",
        interventionType: "chunk_task",
      };

    case "policy_violation":
      return {
        action: "Review policy rules or escalate for policy exception",
        rationale:
          "Action was blocked by policy rules. Review the policy to understand why it was blocked, or escalate if an exception is justified.",
        interventionType: "policy_review",
      };

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = failureClass;
      return _exhaustive;
  }
}

/**
 * Get all recovery suggestions for reference
 *
 * Useful for documentation or UI display of all possible recovery paths.
 *
 * @returns Map of failure classes to their recovery suggestions
 */
export function getAllRecoverySuggestions(): Map<FailureClass, RecoverySuggestion> {
  const classes: FailureClass[] = [
    "timeout",
    "resource_exhaustion",
    "model_error",
    "context_overflow",
    "policy_violation",
  ];

  const suggestions = new Map<FailureClass, RecoverySuggestion>();
  for (const failureClass of classes) {
    suggestions.set(failureClass, getRecoverySuggestion(failureClass));
  }

  return suggestions;
}
