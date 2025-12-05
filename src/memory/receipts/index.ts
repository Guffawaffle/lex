/**
 * Receipt Protocol Helpers
 *
 * Utility functions for creating and manipulating receipts.
 *
 * @module memory/receipts
 */

import {
  Receipt,
  UncertaintyMarker,
  ConfidenceLevel,
  ReversibilityLevel,
  Outcome,
  RECEIPT_SCHEMA_VERSION,
} from "./schema.js";

/**
 * Parameters for creating a receipt
 */
export interface CreateReceiptParams {
  action: string;
  rationale: string;
  confidence: ConfidenceLevel;
  reversibility: ReversibilityLevel;
  outcome?: Outcome;
  rollbackPath?: string;
  rollbackTested?: boolean;
  escalationRequired?: boolean;
  escalationReason?: string;
  escalatedTo?: string;
  agentId?: string;
  sessionId?: string;
  frameId?: string;
}

/**
 * Create a new receipt with sensible defaults
 *
 * @param params - Receipt creation parameters
 * @returns A valid Receipt object
 *
 * @example
 * ```typescript
 * const receipt = createReceipt({
 *   action: 'Implemented token refresh',
 *   rationale: 'Needed to maintain authentication',
 *   confidence: 'medium',
 *   reversibility: 'reversible',
 *   rollbackPath: 'Change LEX_TOKEN_REFRESH_TTL env var'
 * });
 * ```
 */
export function createReceipt(params: CreateReceiptParams): Receipt {
  const receipt: Receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    kind: "Receipt",
    action: params.action,
    outcome: params.outcome ?? "success",
    rationale: params.rationale,
    confidence: params.confidence,
    reversibility: params.reversibility,
    rollbackPath: params.rollbackPath,
    rollbackTested: params.rollbackTested,
    escalationRequired: params.escalationRequired ?? false,
    escalationReason: params.escalationReason,
    escalatedTo: params.escalatedTo,
    timestamp: new Date().toISOString(),
    agentId: params.agentId,
    sessionId: params.sessionId,
    frameId: params.frameId,
  };

  return receipt;
}

/**
 * Add an uncertainty marker to an existing receipt
 *
 * @param receipt - The receipt to modify
 * @param marker - The uncertainty marker to add
 * @returns A new receipt with the marker added
 *
 * @example
 * ```typescript
 * const updated = markUncertainty(receipt, {
 *   stated: 'Not sure if 80% TTL is optimal',
 *   actionTaken: 'Implemented with 80% TTL, flagged for review',
 *   confidence: 'medium',
 *   mitigations: ['Made configurable via env var']
 * });
 * ```
 */
export function markUncertainty(receipt: Receipt, marker: UncertaintyMarker): Receipt {
  return {
    ...receipt,
    uncertaintyNotes: [...(receipt.uncertaintyNotes || []), marker],
  };
}

/**
 * Mark a receipt as requiring escalation
 *
 * @param receipt - The receipt to modify
 * @param reason - Why escalation is needed
 * @param escalatedTo - Optional: who/what it was escalated to
 * @returns A new receipt marked for escalation
 *
 * @example
 * ```typescript
 * const escalated = requireEscalation(
 *   receipt,
 *   'Cannot determine correct approach without domain expertise',
 *   'security-team'
 * );
 * ```
 */
export function requireEscalation(receipt: Receipt, reason: string, escalatedTo?: string): Receipt {
  return {
    ...receipt,
    escalationRequired: true,
    escalationReason: reason,
    escalatedTo,
  };
}

/**
 * Check if a receipt indicates a reversible action
 *
 * @param receipt - The receipt to check
 * @returns True if the action is reversible or partially reversible
 */
export function isReversible(receipt: Receipt): boolean {
  return receipt.reversibility === "reversible" || receipt.reversibility === "partially-reversible";
}

/**
 * Check if a receipt has high confidence
 *
 * @param receipt - The receipt to check
 * @returns True if confidence is 'high'
 */
export function hasHighConfidence(receipt: Receipt): boolean {
  return receipt.confidence === "high";
}

/**
 * Check if a receipt has uncertainty markers
 *
 * @param receipt - The receipt to check
 * @returns True if there are uncertainty notes
 */
export function hasUncertainty(receipt: Receipt): boolean {
  return (receipt.uncertaintyNotes?.length ?? 0) > 0;
}

// Re-export schema types and validators
export {
  Receipt,
  UncertaintyMarker,
  ConfidenceLevel,
  ReversibilityLevel,
  Outcome,
  RECEIPT_SCHEMA_VERSION,
  Receipt as ReceiptSchema,
  UncertaintyMarker as UncertaintyMarkerSchema,
} from "./schema.js";
