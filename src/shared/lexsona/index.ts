/**
 * LexSona Behavioral Rules Module
 *
 * Internal API for behavioral rules learning and retrieval.
 *
 * @experimental This module is NOT part of the Lex 1.0.0 public contract.
 * The LexSona API and semantics are still evolving and may change without notice.
 *
 * @see docs/LEXSONA.md
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 */

// API functions
export { getRules, recordCorrection } from "./api.js";

// Types (re-exported from store)
export type {
  BehaviorRule,
  BehaviorRuleWithConfidence,
  RuleScope,
  RuleContext,
  Correction,
  GetRulesOptions,
  RuleSeverity,
} from "../../memory/store/lexsona-types.js";

export { LEXSONA_DEFAULTS } from "../../memory/store/lexsona-types.js";
