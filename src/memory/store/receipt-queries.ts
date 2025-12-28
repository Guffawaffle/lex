/**
 * Receipt Storage Queries
 *
 * Curated SQL queries for receipt CRUD operations and aggregations.
 * All SQL must live in this module per SQL Safety policy.
 *
 * @module memory/store/receipt-queries
 */

import Database from "better-sqlite3-multiple-ciphers";
import { Receipt } from "../receipts/schema.js";
import { randomUUID } from "crypto";

/**
 * Database row type for receipts table
 */
export interface ReceiptRow {
  id: string;
  schema_version: string;
  kind: string;
  action: string;
  outcome: string;
  rationale: string;
  failure_class: string | null;
  failure_details: string | null;
  recovery_suggestion: string | null;
  confidence: string;
  uncertainty_notes: string | null; // JSON stringified array
  reversibility: string;
  rollback_path: string | null;
  rollback_tested: number | null; // SQLite boolean (0 or 1)
  escalation_required: number; // SQLite boolean (0 or 1)
  escalation_reason: string | null;
  escalated_to: string | null;
  timestamp: string;
  agent_id: string | null;
  session_id: string | null;
  frame_id: string | null;
  user_id: string | null;
  created_at: string;
}

/**
 * Failure statistics for aggregation queries
 */
export interface FailureStats {
  failureClass: string;
  count: number;
  percentage: number;
}

/**
 * Module failure statistics
 */
export interface ModuleFailureStats {
  moduleScope: string;
  failureCount: number;
  totalCount: number;
  failureRate: number;
}

/**
 * Recovery success rate by failure class
 */
export interface RecoverySuccessRate {
  failureClass: string;
  totalFailures: number;
  retriedCount: number;
  successfulRetries: number;
  successRate: number;
}

/**
 * Convert Receipt to database row format
 */
function receiptToRow(receipt: Receipt, userId?: string): Omit<ReceiptRow, "created_at"> {
  return {
    id: randomUUID(),
    schema_version: receipt.schemaVersion,
    kind: receipt.kind,
    action: receipt.action,
    outcome: receipt.outcome,
    rationale: receipt.rationale,
    failure_class: receipt.failureClass || null,
    failure_details: receipt.failureDetails || null,
    recovery_suggestion: receipt.recoverySuggestion || null,
    confidence: receipt.confidence,
    uncertainty_notes: receipt.uncertaintyNotes ? JSON.stringify(receipt.uncertaintyNotes) : null,
    reversibility: receipt.reversibility,
    rollback_path: receipt.rollbackPath || null,
    rollback_tested: receipt.rollbackTested !== undefined ? (receipt.rollbackTested ? 1 : 0) : null,
    escalation_required: receipt.escalationRequired ? 1 : 0,
    escalation_reason: receipt.escalationReason || null,
    escalated_to: receipt.escalatedTo || null,
    timestamp: receipt.timestamp,
    agent_id: receipt.agentId || null,
    session_id: receipt.sessionId || null,
    frame_id: receipt.frameId || null,
    user_id: userId || null,
  };
}

/**
 * Convert database row to Receipt
 */
function rowToReceipt(row: ReceiptRow): Receipt {
  return {
    schemaVersion: row.schema_version as "1.0.0",
    kind: row.kind as "Receipt",
    action: row.action,
    outcome: row.outcome as Receipt["outcome"],
    rationale: row.rationale,
    failureClass: row.failure_class as Receipt["failureClass"],
    failureDetails: row.failure_details || undefined,
    recoverySuggestion: row.recovery_suggestion || undefined,
    confidence: row.confidence as Receipt["confidence"],
    uncertaintyNotes: row.uncertainty_notes
      ? (JSON.parse(row.uncertainty_notes) as Receipt["uncertaintyNotes"])
      : undefined,
    reversibility: row.reversibility as Receipt["reversibility"],
    rollbackPath: row.rollback_path || undefined,
    rollbackTested: row.rollback_tested !== null ? row.rollback_tested === 1 : undefined,
    escalationRequired: row.escalation_required === 1,
    escalationReason: row.escalation_reason || undefined,
    escalatedTo: row.escalated_to || undefined,
    timestamp: row.timestamp,
    agentId: row.agent_id || undefined,
    sessionId: row.session_id || undefined,
    frameId: row.frame_id || undefined,
  };
}

/**
 * Store a receipt in the database
 */
export function storeReceipt(db: Database.Database, receipt: Receipt, userId?: string): string {
  const row = receiptToRow(receipt, userId);

  const stmt = db.prepare(`
    INSERT INTO receipts (
      id, schema_version, kind, action, outcome, rationale,
      failure_class, failure_details, recovery_suggestion,
      confidence, uncertainty_notes, reversibility, rollback_path, rollback_tested,
      escalation_required, escalation_reason, escalated_to,
      timestamp, agent_id, session_id, frame_id, user_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
    row.id,
    row.schema_version,
    row.kind,
    row.action,
    row.outcome,
    row.rationale,
    row.failure_class,
    row.failure_details,
    row.recovery_suggestion,
    row.confidence,
    row.uncertainty_notes,
    row.reversibility,
    row.rollback_path,
    row.rollback_tested,
    row.escalation_required,
    row.escalation_reason,
    row.escalated_to,
    row.timestamp,
    row.agent_id,
    row.session_id,
    row.frame_id,
    row.user_id
  );

  return row.id;
}

/**
 * Get a receipt by ID
 */
export function getReceiptById(db: Database.Database, id: string, userId?: string): Receipt | null {
  let stmt;
  let row;

  if (userId) {
    stmt = db.prepare("SELECT * FROM receipts WHERE id = ? AND user_id = ?");
    row = stmt.get(id, userId) as ReceiptRow | undefined;
  } else {
    stmt = db.prepare("SELECT * FROM receipts WHERE id = ?");
    row = stmt.get(id) as ReceiptRow | undefined;
  }

  return row ? rowToReceipt(row) : null;
}

/**
 * Get receipts by session ID
 */
export function getReceiptsBySession(
  db: Database.Database,
  sessionId: string,
  userId?: string
): Receipt[] {
  let stmt;
  let rows;

  if (userId) {
    stmt = db.prepare(
      "SELECT * FROM receipts WHERE session_id = ? AND user_id = ? ORDER BY timestamp DESC"
    );
    rows = stmt.all(sessionId, userId) as ReceiptRow[];
  } else {
    stmt = db.prepare("SELECT * FROM receipts WHERE session_id = ? ORDER BY timestamp DESC");
    rows = stmt.all(sessionId) as ReceiptRow[];
  }

  return rows.map(rowToReceipt);
}

/**
 * Get most common failure mode for a session
 *
 * Query: "What's my most common failure mode this session?"
 */
export function getMostCommonFailureMode(
  db: Database.Database,
  sessionId: string,
  userId?: string
): FailureStats | null {
  let stmt;
  let row;

  if (userId) {
    stmt = db.prepare(`
      SELECT 
        failure_class as failureClass,
        COUNT(*) as count,
        CAST(COUNT(*) * 100.0 / (
          SELECT COUNT(*) 
          FROM receipts 
          WHERE session_id = ? 
            AND user_id = ?
            AND outcome = 'failure'
        ) AS REAL) as percentage
      FROM receipts
      WHERE session_id = ? 
        AND user_id = ?
        AND outcome = 'failure'
        AND failure_class IS NOT NULL
      GROUP BY failure_class
      ORDER BY count DESC
      LIMIT 1
    `);
    row = stmt.get(sessionId, userId, sessionId, userId) as FailureStats | undefined;
  } else {
    stmt = db.prepare(`
      SELECT 
        failure_class as failureClass,
        COUNT(*) as count,
        CAST(COUNT(*) * 100.0 / (
          SELECT COUNT(*) 
          FROM receipts 
          WHERE session_id = ?
            AND outcome = 'failure'
        ) AS REAL) as percentage
      FROM receipts
      WHERE session_id = ?
        AND outcome = 'failure'
        AND failure_class IS NOT NULL
      GROUP BY failure_class
      ORDER BY count DESC
      LIMIT 1
    `);
    row = stmt.get(sessionId, sessionId) as FailureStats | undefined;
  }

  return row || null;
}

/**
 * Get all failure modes for a session with counts
 */
export function getFailureModesBySession(
  db: Database.Database,
  sessionId: string,
  userId?: string
): FailureStats[] {
  let stmt;
  let rows;

  if (userId) {
    stmt = db.prepare(`
      SELECT 
        failure_class as failureClass,
        COUNT(*) as count,
        CAST(COUNT(*) * 100.0 / (
          SELECT COUNT(*) 
          FROM receipts 
          WHERE session_id = ? 
            AND user_id = ?
            AND outcome = 'failure'
        ) AS REAL) as percentage
      FROM receipts
      WHERE session_id = ? 
        AND user_id = ?
        AND outcome = 'failure'
        AND failure_class IS NOT NULL
      GROUP BY failure_class
      ORDER BY count DESC
    `);
    rows = stmt.all(sessionId, userId, sessionId, userId) as FailureStats[];
  } else {
    stmt = db.prepare(`
      SELECT 
        failure_class as failureClass,
        COUNT(*) as count,
        CAST(COUNT(*) * 100.0 / (
          SELECT COUNT(*) 
          FROM receipts 
          WHERE session_id = ?
            AND outcome = 'failure'
        ) AS REAL) as percentage
      FROM receipts
      WHERE session_id = ?
        AND outcome = 'failure'
        AND failure_class IS NOT NULL
      GROUP BY failure_class
      ORDER BY count DESC
    `);
    rows = stmt.all(sessionId, sessionId) as FailureStats[];
  }

  return rows;
}

/**
 * Note: Module failure rate requires joining with frames table or
 * using a separate module tracking mechanism. For now, we'll stub
 * this with a note that it requires additional integration.
 *
 * This query would need to correlate receipts with the modules they
 * operated on, which isn't directly stored in the receipt.
 */

/**
 * Delete all receipts for a session (for testing/cleanup)
 */
export function deleteReceiptsBySession(
  db: Database.Database,
  sessionId: string,
  userId?: string
): number {
  let stmt;
  let result;

  if (userId) {
    stmt = db.prepare("DELETE FROM receipts WHERE session_id = ? AND user_id = ?");
    result = stmt.run(sessionId, userId);
  } else {
    stmt = db.prepare("DELETE FROM receipts WHERE session_id = ?");
    result = stmt.run(sessionId);
  }

  return result.changes;
}
