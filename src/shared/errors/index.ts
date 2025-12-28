/**
 * Lex Error Types and Utilities
 *
 * Exports the AX-compliant error schema and utilities for
 * agent-friendly error handling per AX v0.1 Contract.
 *
 * @module shared/errors
 * @see /docs/specs/AX-CONTRACT.md
 */

export {
  AXErrorSchema,
  type AXError,
  createAXError,
  wrapAsAXError,
  isAXError,
  AXErrorException,
  isAXErrorException,
} from "./ax-error.js";

// Error code catalog
export {
  LEX_ERROR_CODES,
  CONFIG_ERROR_CODES,
  POLICY_ERROR_CODES,
  STORE_ERROR_CODES,
  PROMPT_ERROR_CODES,
  SCHEMA_ERROR_CODES,
  INSTRUCTIONS_ERROR_CODES,
  GIT_ERROR_CODES,
  LEXSONA_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  STANDARD_NEXT_ACTIONS,
  isLexErrorCode,
  type LexErrorCode,
} from "./error-codes.js";

// Compact error envelope (AX-012)
export {
  CompactErrorEnvelopeSchema,
  type CompactErrorEnvelope,
  type CompactError,
  toCompactError,
  mcpErrorToCompactError,
  createCompactErrorEnvelope,
  axErrorToCompactEnvelope,
  mcpErrorToCompactEnvelope,
} from "./compact-error.js";

// Hint registry (AX-012)
export {
  HINT_REGISTRY,
  ERROR_CODE_TO_HINT_ID,
  getHint,
  getHints,
  getHintIdForErrorCode,
  isValidHintId,
  type Hint,
  type HintId,
} from "./hint-registry.js";
