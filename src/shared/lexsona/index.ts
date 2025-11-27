/**
 * LexSona Module - Behavioral Memory System
 *
 * Exports schemas and utilities for the LexSona behavioral rules system.
 *
 * @see docs/LEXSONA.md for architecture overview
 */

export {
  BehaviorRuleSchema,
  CorrectionSchema,
  parseBehaviorRule,
  validateBehaviorRule,
  parseCorrection,
  validateCorrection,
} from "./schemas.js";

export type { BehaviorRule, Correction } from "./schemas.js";
