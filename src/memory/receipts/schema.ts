/**
 * Receipt Protocol Schema
 *
 * Implements "Permission to Fail with Discipline" governance concept.
 * Receipts document action chains with explicit uncertainty, reversibility,
 * and escalation paths.
 *
 * @module memory/receipts/schema
 */

import { z } from "zod";

/**
 * Confidence level for an action taken under uncertainty
 */
export const ConfidenceLevel = z.enum(["high", "medium", "low", "uncertain"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

/**
 * Reversibility level for an action
 */
export const ReversibilityLevel = z.enum(["reversible", "partially-reversible", "irreversible"]);
export type ReversibilityLevel = z.infer<typeof ReversibilityLevel>;

/**
 * Outcome of an action
 */
export const Outcome = z.enum(["success", "failure", "partial", "deferred"]);
export type Outcome = z.infer<typeof Outcome>;

/**
 * Failure classification for governance tracking
 *
 * Each class maps to specific recovery actions:
 * - timeout: Operation exceeded time budget
 * - resource_exhaustion: Ran out of tokens, memory, or other resources
 * - model_error: LLM returned error or invalid response
 * - context_overflow: Too much context for model to handle
 * - policy_violation: Action blocked by policy rules
 */
export const FailureClass = z.enum([
  "timeout",
  "resource_exhaustion",
  "model_error",
  "context_overflow",
  "policy_violation",
]);
export type FailureClass = z.infer<typeof FailureClass>;

/**
 * Explicit marker for uncertainty in decision-making
 *
 * Records what was uncertain, what action was taken despite uncertainty,
 * and what mitigations were applied.
 */
export const UncertaintyMarker = z.object({
  stated: z.string().describe("What uncertainty was identified"),
  actionTaken: z.string().describe("What action was taken despite uncertainty"),
  confidence: ConfidenceLevel,
  mitigations: z.array(z.string()).optional().describe("Steps taken to reduce risk"),
});
export type UncertaintyMarker = z.infer<typeof UncertaintyMarker>;

/**
 * Receipt documenting a disciplined action with uncertainty handling
 *
 * Provides a structured way to document:
 * 1. What action was taken and why
 * 2. Explicit uncertainty markers
 * 3. Reversibility and rollback paths
 * 4. Escalation requirements
 *
 * @example
 * ```typescript
 * const receipt: Receipt = {
 *   schemaVersion: '1.0.0',
 *   kind: 'Receipt',
 *   action: 'Implemented token refresh with 80% TTL',
 *   outcome: 'success',
 *   rationale: 'Balances security (fresh tokens) with performance (fewer refreshes)',
 *   confidence: 'medium',
 *   uncertaintyNotes: [{
 *     stated: 'Not sure if 80% TTL is optimal for token refresh',
 *     actionTaken: 'Implemented with 80% TTL, flagged for review',
 *     confidence: 'medium',
 *     mitigations: ['Made configurable via env var', 'Added monitoring']
 *   }],
 *   reversibility: 'reversible',
 *   rollbackPath: 'Change LEX_TOKEN_REFRESH_TTL env var',
 *   rollbackTested: false,
 *   escalationRequired: false,
 *   timestamp: '2025-12-05T02:00:00Z',
 * };
 * ```
 */
export const Receipt = z.object({
  schemaVersion: z.literal("1.0.0"),
  kind: z.literal("Receipt"),

  // What happened
  action: z.string().describe("What action was taken"),
  outcome: Outcome,
  rationale: z.string().describe("Why this action was chosen"),

  // Failure classification (Wave 2)
  failureClass: FailureClass.optional().describe("Classification of failure for governance"),
  failureDetails: z.string().optional().describe("Additional context about the failure"),
  recoverySuggestion: z
    .string()
    .optional()
    .describe("Suggested recovery action based on failure class"),

  // Uncertainty handling
  confidence: ConfidenceLevel,
  uncertaintyNotes: z.array(UncertaintyMarker).optional().describe("Explicit uncertainty markers"),

  // Reversibility
  reversibility: ReversibilityLevel,
  rollbackPath: z.string().optional().describe("How to undo if needed"),
  rollbackTested: z.boolean().optional().describe("Whether rollback has been tested"),

  // Escalation
  escalationRequired: z.boolean().default(false),
  escalationReason: z.string().optional().describe("Why escalation is needed"),
  escalatedTo: z.string().optional().describe("Who/what this was escalated to"),

  // Metadata
  timestamp: z.string().datetime().describe("When this receipt was created (ISO 8601)"),
  agentId: z.string().optional().describe("ID of the agent that created this receipt"),
  sessionId: z.string().optional().describe("Session ID for tracking"),
  frameId: z.string().optional().describe("Link to associated Frame"),
});
export type Receipt = z.infer<typeof Receipt>;

/**
 * Receipt schema version constant
 */
export const RECEIPT_SCHEMA_VERSION = "1.0.0";
