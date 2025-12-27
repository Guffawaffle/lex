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

// Persona CRUD (V10)
export {
  savePersona,
  getPersona,
  listPersonas as listPersonasFromDb,
  deletePersona,
  upsertPersona,
  getPersonaChecksum,
  // Rule management
  promoteRule,
  getBehaviorRuleById,
} from "../../memory/store/lexsona-queries.js";

// Types (re-exported from store)
export type {
  BehaviorRule,
  BehaviorRuleWithConfidence,
  RuleScope,
  RuleContext,
  Correction,
  GetRulesOptions,
  RuleSeverity,
  // Persona types (V10)
  PersonaRecord,
  PersonaSource,
  ListPersonasFilter,
} from "../../memory/store/lexsona-types.js";

export { LEXSONA_DEFAULTS } from "../../memory/store/lexsona-types.js";
