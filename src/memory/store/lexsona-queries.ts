/**
 * LexSona Behavioral Rules Queries
 *
 * CRUD operations and search functions for behavioral rules.
 * Part of LexSona v0 Integration (0.5.0 Tier 4).
 *
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 */

import Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "crypto";
import type {
  BehaviorRule,
  BehaviorRuleWithConfidence,
  RuleScope,
  RuleSeverity,
} from "./lexsona-types.js";
import { LEXSONA_DEFAULTS } from "./lexsona-types.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";

const logger = getNDJSONLogger("memory/store/lexsona-queries");

/**
 * Database row type for lexsona_behavior_rules table
 */
export interface BehaviorRuleRow {
  rule_id: string;
  category: string;
  text: string;
  scope: string; // JSON stringified RuleScope
  alpha: number;
  beta: number;
  observation_count: number;
  severity: string;
  decay_tau: number;
  created_at: string;
  updated_at: string;
  last_observed: string;
  frame_id: string | null;
}

/**
 * Convert BehaviorRule object to database row
 */
function ruleToRow(rule: BehaviorRule): Omit<BehaviorRuleRow, "created_at" | "updated_at"> {
  return {
    rule_id: rule.rule_id,
    category: rule.category,
    text: rule.text,
    scope: JSON.stringify(rule.scope),
    alpha: rule.alpha,
    beta: rule.beta,
    observation_count: rule.observation_count,
    severity: rule.severity,
    decay_tau: rule.decay_tau,
    last_observed: rule.last_observed,
    frame_id: rule.frame_id ?? null,
  };
}

/**
 * Convert database row to BehaviorRule object
 */
function rowToRule(row: BehaviorRuleRow): BehaviorRule {
  let scope: RuleScope;
  try {
    scope = JSON.parse(row.scope) as RuleScope;
  } catch {
    // Handle corrupt JSON gracefully with empty scope
    logger.warn("Invalid scope JSON in database row", {
      operation: "rowToRule",
      metadata: { ruleId: row.rule_id, scope: row.scope },
    });
    scope = {};
  }

  return {
    rule_id: row.rule_id,
    category: row.category,
    text: row.text,
    scope,
    alpha: row.alpha,
    beta: row.beta,
    observation_count: row.observation_count,
    severity: row.severity as RuleSeverity,
    decay_tau: row.decay_tau,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_observed: row.last_observed,
    frame_id: row.frame_id ?? undefined,
  };
}

/**
 * Calculate base confidence (Bayesian posterior mean)
 * confidence = alpha / (alpha + beta)
 *
 * Returns 0.5 (neutral) if both alpha and beta are 0
 */
function calculateConfidence(alpha: number, beta: number): number {
  const sum = alpha + beta;
  if (sum === 0) {
    return 0.5; // Neutral confidence when no data
  }
  return alpha / sum;
}

/**
 * Calculate decay factor based on time since last observation
 * decay = exp(-(now - last_observed) / (tau * 86400000))
 * where tau is in days and 86400000 = milliseconds per day
 *
 * @param lastObserved - ISO 8601 timestamp of last observation
 * @param tauDays - Decay time constant in days
 * @returns Decay factor in range (0, 1], or 1.0 for invalid dates
 */
function calculateDecayFactor(lastObserved: string, tauDays: number): number {
  const now = Date.now();
  const lastObservedMs = Date.parse(lastObserved);

  // Handle invalid dates gracefully
  if (isNaN(lastObservedMs)) {
    logger.warn("Invalid lastObserved timestamp", {
      operation: "calculateDecayFactor",
      metadata: { lastObserved },
    });
    return 1.0; // Return full confidence for invalid dates
  }

  const deltaMs = now - lastObservedMs;
  const tauMs = tauDays * 86400000; // Convert days to milliseconds

  return Math.exp(-deltaMs / tauMs);
}

/**
 * Add computed confidence fields to a BehaviorRule
 */
function addConfidenceFields(rule: BehaviorRule): BehaviorRuleWithConfidence {
  const confidence = calculateConfidence(rule.alpha, rule.beta);
  const decay_factor = calculateDecayFactor(rule.last_observed, rule.decay_tau);
  const effective_confidence = confidence * decay_factor;

  return {
    ...rule,
    confidence,
    decay_factor,
    effective_confidence,
  };
}

/**
 * Save a BehaviorRule to the database (insert or update)
 */
export function saveBehaviorRule(db: Database.Database, rule: BehaviorRule): void {
  const startTime = Date.now();
  const row = ruleToRow(rule);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lexsona_behavior_rules (
      rule_id, category, text, scope, alpha, beta, observation_count,
      severity, decay_tau, created_at, updated_at, last_observed, frame_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `);

  stmt.run(
    row.rule_id,
    row.category,
    row.text,
    row.scope,
    row.alpha,
    row.beta,
    row.observation_count,
    row.severity,
    row.decay_tau,
    rule.created_at,
    row.last_observed,
    row.frame_id
  );

  const duration = Date.now() - startTime;
  logger.debug("BehaviorRule saved", {
    operation: "saveBehaviorRule",
    duration_ms: duration,
    metadata: { ruleId: rule.rule_id, category: rule.category },
  });
}

/**
 * Get a BehaviorRule by ID
 */
export function getBehaviorRuleById(
  db: Database.Database,
  ruleId: string
): BehaviorRuleWithConfidence | null {
  const startTime = Date.now();
  const stmt = db.prepare("SELECT * FROM lexsona_behavior_rules WHERE rule_id = ?");
  const row = stmt.get(ruleId) as BehaviorRuleRow | undefined;

  if (!row) {
    logger.debug("BehaviorRule not found", {
      operation: "getBehaviorRuleById",
      duration_ms: Date.now() - startTime,
      metadata: { ruleId },
    });
    return null;
  }

  const rule = rowToRule(row);
  logger.debug("BehaviorRule retrieved", {
    operation: "getBehaviorRuleById",
    duration_ms: Date.now() - startTime,
    metadata: { ruleId },
  });

  return addConfidenceFields(rule);
}

/**
 * Find an existing rule by matching context (module_id and text)
 */
export function findRuleByContext(
  db: Database.Database,
  moduleId: string | undefined,
  text: string
): BehaviorRuleWithConfidence | null {
  const startTime = Date.now();

  // Match on module_id (if provided) and exact text match
  let stmt;
  let row: BehaviorRuleRow | undefined;

  if (moduleId) {
    stmt = db.prepare(`
      SELECT * FROM lexsona_behavior_rules
      WHERE json_extract(scope, '$.module_id') = ?
        AND text = ?
    `);
    row = stmt.get(moduleId, text) as BehaviorRuleRow | undefined;
  } else {
    stmt = db.prepare(`
      SELECT * FROM lexsona_behavior_rules
      WHERE json_extract(scope, '$.module_id') IS NULL
        AND text = ?
    `);
    row = stmt.get(text) as BehaviorRuleRow | undefined;
  }

  if (!row) {
    logger.debug("BehaviorRule not found by context", {
      operation: "findRuleByContext",
      duration_ms: Date.now() - startTime,
      metadata: { moduleId, textLength: text.length },
    });
    return null;
  }

  const rule = rowToRule(row);
  logger.debug("BehaviorRule found by context", {
    operation: "findRuleByContext",
    duration_ms: Date.now() - startTime,
    metadata: { ruleId: rule.rule_id, moduleId },
  });

  return addConfidenceFields(rule);
}

/**
 * Delete a BehaviorRule by ID
 */
export function deleteBehaviorRule(db: Database.Database, ruleId: string): boolean {
  const startTime = Date.now();
  const stmt = db.prepare("DELETE FROM lexsona_behavior_rules WHERE rule_id = ?");
  const result = stmt.run(ruleId);

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule deleted", {
    operation: "deleteBehaviorRule",
    duration_ms: duration,
    metadata: { ruleId, deleted: result.changes > 0 },
  });

  return result.changes > 0;
}

/**
 * Get count of all BehaviorRules
 */
export function getBehaviorRuleCount(db: Database.Database): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM lexsona_behavior_rules");
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Increment alpha (reinforcement) for an existing rule
 */
export function reinforceRule(db: Database.Database, ruleId: string): boolean {
  const startTime = Date.now();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE lexsona_behavior_rules
    SET alpha = alpha + 1,
        observation_count = observation_count + 1,
        updated_at = ?,
        last_observed = ?
    WHERE rule_id = ?
  `);

  const result = stmt.run(now, now, ruleId);

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule reinforced", {
    operation: "reinforceRule",
    duration_ms: duration,
    metadata: { ruleId, updated: result.changes > 0 },
  });

  return result.changes > 0;
}

/**
 * Increment beta (counterexample) for an existing rule
 */
export function counterExampleRule(db: Database.Database, ruleId: string): boolean {
  const startTime = Date.now();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE lexsona_behavior_rules
    SET beta = beta + 1,
        observation_count = observation_count + 1,
        updated_at = ?,
        last_observed = ?
    WHERE rule_id = ?
  `);

  const result = stmt.run(now, now, ruleId);

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule counter-example", {
    operation: "counterExampleRule",
    duration_ms: duration,
    metadata: { ruleId, updated: result.changes > 0 },
  });

  return result.changes > 0;
}

/**
 * Create a new behavior rule with initial observation
 */
export function createBehaviorRule(
  db: Database.Database,
  params: {
    text: string;
    scope: RuleScope;
    category?: string;
    severity?: RuleSeverity;
    frameId?: string;
  }
): BehaviorRuleWithConfidence {
  const startTime = Date.now();
  const now = new Date().toISOString();

  const rule: BehaviorRule = {
    rule_id: randomUUID(),
    category: params.category ?? "general",
    text: params.text,
    scope: params.scope,
    alpha: LEXSONA_DEFAULTS.ALPHA_PRIOR + 1, // α_0 + first observation
    beta: LEXSONA_DEFAULTS.BETA_PRIOR,
    observation_count: 1,
    severity: params.severity ?? "should",
    decay_tau: LEXSONA_DEFAULTS.DECAY_TAU_DAYS,
    created_at: now,
    updated_at: now,
    last_observed: now,
    frame_id: params.frameId,
  };

  saveBehaviorRule(db, rule);

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule created", {
    operation: "createBehaviorRule",
    duration_ms: duration,
    metadata: { ruleId: rule.rule_id, category: rule.category },
  });

  return addConfidenceFields(rule);
}

/**
 * Get all behavior rules matching a context, sorted by effective confidence
 *
 * @param db - Database connection
 * @param context - Context for filtering rules
 * @param options - Options for filtering
 * @returns Rules matching context, sorted by effective_confidence descending
 */
export function getRulesByContext(
  db: Database.Database,
  context: {
    module_id?: string;
    task_type?: string;
    environment?: string;
    project?: string;
    agent_family?: string;
    context_tags?: string[];
  },
  options: {
    minN?: number;
    minConfidence?: number;
    limit?: number;
  } = {}
): BehaviorRuleWithConfidence[] {
  const startTime = Date.now();
  const minN = options.minN ?? LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT;
  const minConfidence = options.minConfidence ?? LEXSONA_DEFAULTS.MIN_CONFIDENCE;
  const limit = options.limit ?? LEXSONA_DEFAULTS.DEFAULT_LIMIT;

  // Build WHERE clauses
  const whereClauses: string[] = ["observation_count >= ?"];
  const params: (string | number)[] = [minN];

  // Exact match on module_id
  if (context.module_id !== undefined) {
    whereClauses.push("json_extract(scope, '$.module_id') = ?");
    params.push(context.module_id);
  }

  // Fuzzy match on task_type (LIKE pattern)
  if (context.task_type !== undefined) {
    whereClauses.push(
      "(json_extract(scope, '$.task_type') IS NULL OR json_extract(scope, '$.task_type') LIKE ?)"
    );
    params.push(`%${context.task_type}%`);
  }

  // Environment match
  if (context.environment !== undefined) {
    whereClauses.push(
      "(json_extract(scope, '$.environment') IS NULL OR json_extract(scope, '$.environment') = ?)"
    );
    params.push(context.environment);
  }

  // Project match
  if (context.project !== undefined) {
    whereClauses.push(
      "(json_extract(scope, '$.project') IS NULL OR json_extract(scope, '$.project') = ?)"
    );
    params.push(context.project);
  }

  // Agent family match
  if (context.agent_family !== undefined) {
    whereClauses.push(
      "(json_extract(scope, '$.agent_family') IS NULL OR json_extract(scope, '$.agent_family') = ?)"
    );
    params.push(context.agent_family);
  }

  // Note: context_tags matching is done in-memory due to JSON array complexity
  const whereClause = whereClauses.join(" AND ");

  const stmt = db.prepare(`
    SELECT *
    FROM lexsona_behavior_rules
    WHERE ${whereClause}
    ORDER BY
      (CAST(alpha AS REAL) / (alpha + beta)) DESC,
      last_observed DESC
  `);

  const rows = stmt.all(...params) as BehaviorRuleRow[];

  // Convert to rules with confidence fields
  let rules = rows.map(rowToRule).map(addConfidenceFields);

  // Filter by minimum confidence
  rules = rules.filter((r) => r.effective_confidence >= minConfidence);

  // Filter by context_tags if provided (AND logic)
  if (context.context_tags && context.context_tags.length > 0) {
    rules = rules.filter((rule) => {
      if (!rule.scope.context_tags || rule.scope.context_tags.length === 0) {
        return true; // Rule with no tags matches all contexts
      }
      // Rule must have at least one matching tag
      return rule.scope.context_tags.some((tag) => context.context_tags!.includes(tag));
    });
  }

  // Sort by effective_confidence (already mostly sorted by base confidence)
  rules.sort((a, b) => b.effective_confidence - a.effective_confidence);

  // Apply limit
  rules = rules.slice(0, limit);

  const duration = Date.now() - startTime;
  logger.info("Rules retrieved by context", {
    operation: "getRulesByContext",
    duration_ms: duration,
    metadata: { resultCount: rules.length, minN, minConfidence, limit },
  });

  return rules;
}

/**
 * Get all behavior rules without filtering
 */
export function getAllBehaviorRules(
  db: Database.Database,
  limit?: number
): BehaviorRuleWithConfidence[] {
  const startTime = Date.now();

  const stmt = db.prepare(`
    SELECT * FROM lexsona_behavior_rules
    ORDER BY
      (CAST(alpha AS REAL) / (alpha + beta)) DESC,
      last_observed DESC
    ${limit ? "LIMIT ?" : ""}
  `);

  const rows = limit
    ? (stmt.all(limit) as BehaviorRuleRow[])
    : (stmt.all() as BehaviorRuleRow[]);

  const rules = rows.map(rowToRule).map(addConfidenceFields);

  const duration = Date.now() - startTime;
  logger.debug("All BehaviorRules retrieved", {
    operation: "getAllBehaviorRules",
    duration_ms: duration,
    metadata: { count: rules.length },
  });

  return rules;
}
