/**
 * LexSona Behavioral Rules Module
 * 
 * Provides loading and resolution of behavioral rules with precedence chain:
 * 1. LEX_RULES_DIR (environment override)
 * 2. .smartergpt.local/canon/rules/ (workspace overlay)
 * 3. canon/rules/ (package defaults)
 */

export { resolveRules, listRules, getRule } from "./loader.js";
export type {
  BehavioralRule,
  RuleScope,
  RuleContext,
  ResolvedRule,
  EnforcementMode,
} from "./types.js";
