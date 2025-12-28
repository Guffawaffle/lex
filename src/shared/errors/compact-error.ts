/**
 * Compact Error Envelope
 *
 * Per AX-012, provides minimal error shapes with stable hint IDs for token efficiency.
 * Agents can fetch hint details separately and cache them.
 *
 * @module shared/errors/compact-error
 */

import { z } from "zod";
import type { AXError } from "./ax-error.js";
import { getHintIdForErrorCode, type HintId } from "./hint-registry.js";

/**
 * Compact error envelope schema
 *
 * Uses short field names to reduce token usage:
 * - err: error details
 * - msg: message
 * - retry: whether the error is retryable
 * - hintId: reference to cacheable hint
 */
export const CompactErrorEnvelopeSchema = z.object({
  err: z.object({
    code: z.string(),
    msg: z.string(),
    retry: z.boolean(),
    hintId: z.string().optional(),
  }),
});

export type CompactErrorEnvelope = z.infer<typeof CompactErrorEnvelopeSchema>;

/**
 * Compact error structure (just the error part)
 */
export interface CompactError {
  code: string;
  msg: string;
  retry: boolean;
  hintId?: HintId;
}

/**
 * MCP error metadata for determining retryability
 * Duplicated here to avoid cross-project imports
 */
const MCP_RETRYABLE_ERRORS = new Set([
  "STORAGE_WRITE_FAILED",
  "STORAGE_READ_FAILED",
  "STORAGE_DELETE_FAILED",
  "STORAGE_IMAGE_FAILED",
  "INTERNAL_ERROR",
]);

/**
 * Convert an AXError to a compact error
 */
export function toCompactError(error: AXError): CompactError {
  const hintId = getHintIdForErrorCode(error.code);

  // Truncate message if too long (keep first sentence or first 100 chars)
  let msg = error.message;
  const firstSentence = error.message.split(/[.!?]\s/)[0];
  if (firstSentence && firstSentence.length < 100) {
    msg = firstSentence + (error.message.length > firstSentence.length ? "." : "");
  } else if (error.message.length > 100) {
    msg = error.message.substring(0, 97) + "...";
  }

  return {
    code: error.code,
    msg,
    retry: false, // AXErrors are typically not retryable by default
    hintId,
  };
}

/**
 * Convert an MCP error response to a compact error
 */
export function mcpErrorToCompactError(code: string, message: string): CompactError {
  // Check if error is retryable based on error code
  const retry = MCP_RETRYABLE_ERRORS.has(code);

  const hintId = getHintIdForErrorCode(code);

  // Truncate message if too long (keep first sentence or first 100 chars)
  let msg = message;
  const firstSentence = message.split(/[.!?]\s/)[0];
  if (firstSentence && firstSentence.length < 100) {
    msg = firstSentence + (message.length > firstSentence.length ? "." : "");
  } else if (message.length > 100) {
    msg = message.substring(0, 97) + "...";
  }

  return {
    code,
    msg,
    retry,
    hintId,
  };
}

/**
 * Create a compact error envelope
 */
export function createCompactErrorEnvelope(error: CompactError): CompactErrorEnvelope {
  return { err: error };
}

/**
 * Create a compact error envelope from an AXError
 */
export function axErrorToCompactEnvelope(error: AXError): CompactErrorEnvelope {
  const compactError = toCompactError(error);
  return createCompactErrorEnvelope(compactError);
}

/**
 * Create a compact error envelope from MCP error details
 */
export function mcpErrorToCompactEnvelope(code: string, message: string): CompactErrorEnvelope {
  const compactError = mcpErrorToCompactError(code, message);
  return createCompactErrorEnvelope(compactError);
}
