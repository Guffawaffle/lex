/**
 * Memory Validation Module
 *
 * Provides validation helpers for Frame payloads and other memory-related data.
 *
 * @module memory/validation
 */

export {
  normalizeFramePayloadForIngestion,
  validateFramePayload,
  type FrameNormalizationResult,
  type FrameValidationResult,
  type FrameValidationError,
  type FrameValidationWarning,
} from "./frame-validator.js";
