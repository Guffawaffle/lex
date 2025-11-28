/**
 * LexSona Behavioral Rules Module
 *
 * @experimental This module is NOT part of the Lex 1.0.0 public contract.
 * The rules API and semantics are still evolving and may change without notice.
 *
 * Provides loading and resolution of behavioral rules with precedence chain:
 * 1. LEX_RULES_DIR (environment override)
 * 2. .smartergpt/rules/ (workspace overlay)
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
