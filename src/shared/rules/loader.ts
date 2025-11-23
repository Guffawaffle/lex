/**
 * Rule Loading Utility
 *
 * Loads behavioral rule files with precedence chain support:
 * 1. LEX_RULES_DIR (explicit environment override)
 * 2. .smartergpt.local/canon/rules/ (local overlay)
 * 3. Package canon/rules/ (resolved from package installation)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getLogger } from "../logger/index.js";
import type { BehavioralRule, RuleContext, ResolvedRule, RuleScope } from "./types.js";

const logger = getLogger("rules");

/**
 * Zod schema for rule scope validation
 */
const RuleScopeSchema = z.object({
  environment: z.string().optional(),
  project: z.string().optional(),
  agent_family: z.string().optional(),
  context_tags: z.array(z.string()).optional(),
});

/**
 * Zod schema for behavioral rule validation
 */
const BehavioralRuleSchema = z.object({
  rule_id: z.string(),
  category: z.string(),
  text: z.string(),
  scope: RuleScopeSchema,
  alpha: z.number().int().min(2),
  beta: z.number().int().min(5),
  reinforcements: z.number().int().min(0).optional(),
  counter_examples: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1),
  severity: z.enum(['zero-tolerance', 'should', 'style']),
  timing_requirement_seconds: z.number().positive().optional(),
  first_seen: z.string().datetime(),
  last_correction: z.string().datetime(),
  frame_id: z.string().optional(),
});

/**
 * Resolve package asset path for both dev and installed contexts
 *
 * @param type - Asset type ('prompts', 'schemas', or 'rules')
 * @param name - Asset name/filename
 * @returns Resolved absolute path to the asset
 */
function resolvePackageAsset(type: "prompts" | "schemas" | "rules", name: string): string {
  const currentFile = fileURLToPath(import.meta.url);
  let pkgRoot = dirname(currentFile);

  // Walk up until we find package.json
  while (pkgRoot !== dirname(pkgRoot)) {
    const pkgJsonPath = join(pkgRoot, "package.json");
    if (existsSync(pkgJsonPath)) {
      // For rules, use canon/rules path
      if (type === "rules") {
        return join(pkgRoot, "canon", "rules", name);
      }
      return join(pkgRoot, type, name);
    }
    pkgRoot = dirname(pkgRoot);
  }

  throw new Error(`Could not resolve package root from ${currentFile}`);
}

/**
 * Load and validate a single rule file
 *
 * @param filePath - Path to the rule file
 * @param source - Source type for tracking
 * @returns Validated resolved rule or null if invalid
 */
function loadRuleFile(filePath: string, source: 'env' | 'workspace' | 'package'): ResolvedRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    
    // Validate against schema
    const validated = BehavioralRuleSchema.parse(json);
    
    return {
      ...validated,
      source,
      sourcePath: filePath,
    };
  } catch (error) {
    // Log warning but continue (graceful degradation)
    logger.warn(
      { path: filePath, error: error instanceof Error ? error.message : String(error) },
      "Failed to load rule file"
    );
    return null;
  }
}

/**
 * Load all rules from a directory
 *
 * @param dirPath - Directory containing rule files
 * @param source - Source type for tracking
 * @returns Array of resolved rules
 */
function loadRulesFromDirectory(dirPath: string, source: 'env' | 'workspace' | 'package'): ResolvedRule[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const rules: ResolvedRule[] = [];
  
  try {
    const files = readdirSync(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(dirPath, file);
        const rule = loadRuleFile(filePath, source);
        if (rule) {
          rules.push(rule);
        }
      }
    }
  } catch (error) {
    // Ignore errors when reading directory (graceful degradation)
    logger.warn(
      { path: dirPath, error: error instanceof Error ? error.message : String(error) },
      "Failed to read rules directory"
    );
  }

  return rules;
}

/**
 * Check if a rule matches the given context
 *
 * @param rule - Rule to check
 * @param context - Context for filtering
 * @returns True if the rule matches the context
 */
function matchesContext(rule: BehavioralRule, context: RuleContext): boolean {
  const scope = rule.scope;

  // Environment matching
  if (context.environment && scope.environment) {
    if (scope.environment !== context.environment) {
      return false;
    }
  }

  // Project matching
  if (context.project && scope.project) {
    if (scope.project !== context.project) {
      return false;
    }
  }

  // Agent family matching
  if (context.agent_family && scope.agent_family) {
    if (scope.agent_family !== context.agent_family) {
      return false;
    }
  }

  // Context tags matching (rule must have at least one matching tag)
  if (context.context_tags && context.context_tags.length > 0 && scope.context_tags && scope.context_tags.length > 0) {
    const hasMatchingTag = scope.context_tags.some(tag => context.context_tags!.includes(tag));
    if (!hasMatchingTag) {
      return false;
    }
  }

  return true;
}

/**
 * Resolve rules with precedence chain
 *
 * @param context - Context for filtering and scoping rules
 * @returns Array of resolved rules matching the context
 *
 * Precedence chain:
 * 1. LEX_RULES_DIR (explicit environment override)
 * 2. .smartergpt.local/canon/rules/ (local overlay - untracked)
 * 3. Package canon/rules/ (package defaults)
 *
 * Rules are merged by rule_id with precedence (higher priority overrides lower).
 * Confidence threshold filtering is applied after precedence resolution.
 *
 * @example
 * ```typescript
 * const rules = resolveRules({
 *   environment: 'github-copilot',
 *   context_tags: ['execution', 'tools'],
 *   confidenceThreshold: 0.75
 * });
 * console.log(rules); // Array of high-confidence rules for this context
 * ```
 *
 * @example With environment variable override
 * ```typescript
 * process.env.LEX_RULES_DIR = '/custom/rules';
 * const rules = resolveRules({ environment: 'production' });
 * // Loads from /custom/rules first
 * ```
 */
export function resolveRules(context: RuleContext = {}): ResolvedRule[] {
  const confidenceThreshold = context.confidenceThreshold ?? 0.75;
  const ruleMap = new Map<string, ResolvedRule>();

  // Priority 3: Package canon (lowest priority)
  const canonPath = resolvePackageAsset("rules", "");
  const canonRules = loadRulesFromDirectory(canonPath, 'package');
  for (const rule of canonRules) {
    ruleMap.set(rule.rule_id, rule);
  }

  // Priority 2: .smartergpt.local/canon/rules/ (local overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "canon", "rules");
  const localRules = loadRulesFromDirectory(localPath, 'workspace');
  for (const rule of localRules) {
    // Override package rules
    ruleMap.set(rule.rule_id, rule);
  }

  // Priority 1: LEX_RULES_DIR (explicit env override, highest priority)
  const envDir = process.env.LEX_RULES_DIR;
  if (envDir) {
    const envPath = resolve(envDir);
    const envRules = loadRulesFromDirectory(envPath, 'env');
    for (const rule of envRules) {
      // Override all lower priority rules
      ruleMap.set(rule.rule_id, rule);
    }
  }

  // Get all rules (precedence already applied via Map)
  let rules = Array.from(ruleMap.values());

  // Apply confidence filtering
  rules = rules.filter(rule => rule.confidence >= confidenceThreshold);

  // Apply scope matching
  rules = rules.filter(rule => matchesContext(rule, context));

  return rules;
}

/**
 * List all available rule IDs across all precedence levels
 *
 * @returns Array of unique rule IDs (deduplicated)
 *
 * @example
 * ```typescript
 * const ruleIds = listRules();
 * console.log(ruleIds); // ['tool-fallback-protocol', 'operator-role', ...]
 * ```
 */
export function listRules(): string[] {
  const ruleIds = new Set<string>();

  // Collect from package canon
  try {
    const canonPath = resolvePackageAsset("rules", "");
    const canonRules = loadRulesFromDirectory(canonPath, 'package');
    canonRules.forEach(rule => ruleIds.add(rule.rule_id));
  } catch {
    // Ignore errors
  }

  // Collect from local
  const localPath = join(process.cwd(), ".smartergpt.local", "canon", "rules");
  const localRules = loadRulesFromDirectory(localPath, 'workspace');
  localRules.forEach(rule => ruleIds.add(rule.rule_id));

  // Collect from LEX_RULES_DIR
  const envDir = process.env.LEX_RULES_DIR;
  if (envDir) {
    const envPath = resolve(envDir);
    const envRules = loadRulesFromDirectory(envPath, 'env');
    envRules.forEach(rule => ruleIds.add(rule.rule_id));
  }

  return Array.from(ruleIds).sort();
}

/**
 * Get a specific rule by ID with precedence chain
 *
 * @param ruleId - ID of the rule to retrieve
 * @returns Resolved rule or null if not found
 *
 * @example
 * ```typescript
 * const rule = getRule('tool-fallback-protocol');
 * if (rule) {
 *   console.log(rule.text, rule.source);
 * }
 * ```
 */
export function getRule(ruleId: string): ResolvedRule | null {
  // Check ENV first
  const envDir = process.env.LEX_RULES_DIR;
  if (envDir) {
    const envPath = resolve(envDir);
    const envRules = loadRulesFromDirectory(envPath, 'env');
    const found = envRules.find(r => r.rule_id === ruleId);
    if (found) return found;
  }

  // Check local
  const localPath = join(process.cwd(), ".smartergpt.local", "canon", "rules");
  const localRules = loadRulesFromDirectory(localPath, 'workspace');
  const found = localRules.find(r => r.rule_id === ruleId);
  if (found) return found;

  // Check package
  const canonPath = resolvePackageAsset("rules", "");
  const canonRules = loadRulesFromDirectory(canonPath, 'package');
  return canonRules.find(r => r.rule_id === ruleId) || null;
}
