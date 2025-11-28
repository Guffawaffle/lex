/**
 * Policy loader module exports
 */

export { loadPolicy, loadPolicyIfAvailable, clearPolicyCache } from "./loader.js";
export {
  PolicySchema,
  PolicyModuleSchema,
  GlobalKillPatternSchema,
  validatePolicySchema,
  type PolicySchemaType,
  type PolicyModuleSchemaType,
  type PolicyValidationResult,
  type PolicyValidationError,
  type PolicyValidationWarning,
} from "./schema.js";

// Path matching for lex.yaml policy enforcement
export {
  matchesPattern,
  isPathAllowed,
  filterPathsByPolicy,
  getDenialReason,
} from "./path-matcher.js";
