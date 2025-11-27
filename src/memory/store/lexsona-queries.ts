/**
 * LexSona Behavior Rules storage queries
 *
 * CRUD operations for BehaviorRule records in the LexSona behavioral memory system.
 *
 * @see docs/LEXSONA.md for architecture overview
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md for mathematical framework
 */

import Database from "better-sqlite3-multiple-ciphers";
import type { BehaviorRuleRow } from "./db.js";
import type { BehaviorRule } from "../../shared/lexsona/schemas.js";
import { getNDJSONLogger } from "../../shared/logger/index.js";

const logger = getNDJSONLogger("memory/store/lexsona");

/**
 * Convert BehaviorRule object to database row
 */
function behaviorRuleToRow(rule: BehaviorRule): BehaviorRuleRow {
  return {
    rule_id: rule.rule_id,
    context: JSON.stringify(rule.context),
    correction: rule.correction,
    confidence_alpha: rule.confidence_alpha,
    confidence_beta: rule.confidence_beta,
    observation_count: rule.observation_count,
    created_at: rule.created_at,
    updated_at: rule.updated_at,
    last_observed: rule.last_observed,
    decay_tau: rule.decay_tau,
  };
}

/**
 * Convert database row to BehaviorRule object
 */
function rowToBehaviorRule(row: BehaviorRuleRow): BehaviorRule {
  return {
    rule_id: row.rule_id,
    context: JSON.parse(row.context) as Record<string, unknown>,
    correction: row.correction,
    confidence_alpha: row.confidence_alpha,
    confidence_beta: row.confidence_beta,
    observation_count: row.observation_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_observed: row.last_observed,
    decay_tau: row.decay_tau,
  };
}

/**
 * Save a BehaviorRule to the database (insert or update)
 */
export function saveBehaviorRule(db: Database.Database, rule: BehaviorRule): void {
  const startTime = Date.now();
  const row = behaviorRuleToRow(rule);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lexsona_behavior_rules (
      rule_id, context, correction, confidence_alpha, confidence_beta,
      observation_count, created_at, updated_at, last_observed, decay_tau
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    row.rule_id,
    row.context,
    row.correction,
    row.confidence_alpha,
    row.confidence_beta,
    row.observation_count,
    row.created_at,
    row.updated_at,
    row.last_observed,
    row.decay_tau
  );

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule saved", {
    operation: "saveBehaviorRule",
    duration_ms: duration,
    metadata: { ruleId: rule.rule_id },
  });
}

/**
 * Get a BehaviorRule by ID
 */
export function getBehaviorRuleById(db: Database.Database, ruleId: string): BehaviorRule | null {
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

  logger.debug("BehaviorRule retrieved", {
    operation: "getBehaviorRuleById",
    duration_ms: Date.now() - startTime,
    metadata: { ruleId },
  });
  return rowToBehaviorRule(row);
}

/**
 * Get all BehaviorRules (with optional limit), ordered by updated_at descending
 */
export function getAllBehaviorRules(db: Database.Database, limit?: number): BehaviorRule[] {
  const startTime = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM lexsona_behavior_rules
    ORDER BY updated_at DESC
    ${limit ? "LIMIT ?" : ""}
  `);

  const rows = limit
    ? (stmt.all(limit) as BehaviorRuleRow[])
    : (stmt.all() as BehaviorRuleRow[]);

  const duration = Date.now() - startTime;
  logger.debug("All BehaviorRules retrieved", {
    operation: "getAllBehaviorRules",
    duration_ms: duration,
    metadata: { count: rows.length, limit },
  });
  return rows.map(rowToBehaviorRule);
}

/**
 * Options for querying behavior rules
 */
export interface BehaviorRuleQueryOptions {
  /** Minimum confidence threshold (calculated as alpha / (alpha + beta)) */
  minConfidence?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum observation count */
  minObservations?: number;
}

/**
 * Get BehaviorRules with filtering options
 *
 * Note: Confidence filtering is done in application code since SQLite
 * doesn't natively support computed column filters efficiently.
 */
export function queryBehaviorRules(
  db: Database.Database,
  options: BehaviorRuleQueryOptions = {}
): BehaviorRule[] {
  const startTime = Date.now();

  // Build WHERE clause for observation_count if specified
  const whereClauses: string[] = [];
  const params: (number | string)[] = [];

  if (options.minObservations !== undefined && options.minObservations > 0) {
    whereClauses.push("observation_count >= ?");
    params.push(options.minObservations);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT * FROM lexsona_behavior_rules
    ${whereClause}
    ORDER BY updated_at DESC
  `);

  let rows = stmt.all(...params) as BehaviorRuleRow[];
  let rules = rows.map(rowToBehaviorRule);

  // Apply confidence filtering in application code
  if (options.minConfidence !== undefined && options.minConfidence > 0) {
    rules = rules.filter((rule) => {
      const confidence =
        rule.confidence_alpha / (rule.confidence_alpha + rule.confidence_beta);
      return confidence >= options.minConfidence!;
    });
  }

  // Apply limit after filtering
  if (options.limit !== undefined && options.limit > 0) {
    rules = rules.slice(0, options.limit);
  }

  const duration = Date.now() - startTime;
  logger.debug("BehaviorRules queried", {
    operation: "queryBehaviorRules",
    duration_ms: duration,
    metadata: { resultCount: rules.length, options },
  });
  return rules;
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
 * Update the confidence scores and observation metadata for a rule
 *
 * This is used when reinforcing or counteracting a rule based on new corrections.
 * Implements the state update algorithm from the LexSona mathematical framework.
 */
export function updateBehaviorRuleConfidence(
  db: Database.Database,
  ruleId: string,
  updates: {
    confidence_alpha: number;
    confidence_beta: number;
    observation_count: number;
    updated_at: string;
    last_observed: string;
  }
): boolean {
  const startTime = Date.now();
  const stmt = db.prepare(`
    UPDATE lexsona_behavior_rules
    SET confidence_alpha = ?,
        confidence_beta = ?,
        observation_count = ?,
        updated_at = ?,
        last_observed = ?
    WHERE rule_id = ?
  `);

  const result = stmt.run(
    updates.confidence_alpha,
    updates.confidence_beta,
    updates.observation_count,
    updates.updated_at,
    updates.last_observed,
    ruleId
  );

  const duration = Date.now() - startTime;
  logger.info("BehaviorRule confidence updated", {
    operation: "updateBehaviorRuleConfidence",
    duration_ms: duration,
    metadata: {
      ruleId,
      updated: result.changes > 0,
      newAlpha: updates.confidence_alpha,
      newBeta: updates.confidence_beta,
    },
  });
  return result.changes > 0;
}
