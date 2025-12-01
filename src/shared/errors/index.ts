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
