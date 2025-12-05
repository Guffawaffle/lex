/**
 * Tests for Receipt Storage and Aggregation Queries
 *
 * Covers:
 * - Storing and retrieving receipts
 * - Session-based queries
 * - Failure mode aggregation
 * - Recovery statistics
 *
 * Run with: npm test
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createDatabase } from "@app/memory/store/db.js";
import {
  storeReceipt,
  getReceiptById,
  getReceiptsBySession,
  getMostCommonFailureMode,
  getFailureModesBySession,
  deleteReceiptsBySession,
} from "@app/memory/store/receipt-queries.js";
import { createReceipt, createFailureReceipt } from "@app/memory/receipts/index.js";
import type Database from "better-sqlite3-multiple-ciphers";

describe("Receipt Storage Queries", () => {
  let db: Database.Database;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for the test database
    testDir = mkdtempSync(join(tmpdir(), "lex-receipt-test-"));
    const dbPath = join(testDir, "test.db");
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    // Clean up
    if (db) {
      db.close();
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("storeReceipt", () => {
    test("should store a receipt and return an ID", () => {
      const receipt = createReceipt({
        action: "Test action",
        rationale: "Test rationale",
        confidence: "high",
        reversibility: "reversible",
      });

      const id = storeReceipt(db, receipt);
      assert.ok(id);
      assert.strictEqual(typeof id, "string");
    });

    test("should store receipt with failure classification", () => {
      const receipt = createFailureReceipt({
        action: "Failed to process",
        rationale: "Resource limit",
        reversibility: "reversible",
        failureClass: "resource_exhaustion",
        failureDetails: "Exceeded token limit",
      });

      const id = storeReceipt(db, receipt);
      assert.ok(id);
    });

    test("should store receipt with user isolation", () => {
      const receipt = createReceipt({
        action: "Test action",
        rationale: "Test rationale",
        confidence: "high",
        reversibility: "reversible",
      });

      const id = storeReceipt(db, receipt, "user-123");
      assert.ok(id);
    });
  });

  describe("getReceiptById", () => {
    test("should retrieve stored receipt", () => {
      const receipt = createReceipt({
        action: "Test action",
        rationale: "Test rationale",
        confidence: "high",
        reversibility: "reversible",
        sessionId: "session-1",
      });

      const id = storeReceipt(db, receipt);
      const retrieved = getReceiptById(db, id);

      assert.ok(retrieved);
      assert.strictEqual(retrieved.action, "Test action");
      assert.strictEqual(retrieved.confidence, "high");
      assert.strictEqual(retrieved.sessionId, "session-1");
    });

    test("should return null for non-existent receipt", () => {
      const retrieved = getReceiptById(db, "non-existent-id");
      assert.strictEqual(retrieved, null);
    });

    test("should respect user isolation", () => {
      const receipt = createReceipt({
        action: "Test action",
        rationale: "Test rationale",
        confidence: "high",
        reversibility: "reversible",
      });

      const id = storeReceipt(db, receipt, "user-123");

      // Should not retrieve with different user ID
      const retrieved = getReceiptById(db, id, "user-456");
      assert.strictEqual(retrieved, null);

      // Should retrieve with correct user ID
      const retrieved2 = getReceiptById(db, id, "user-123");
      assert.ok(retrieved2);
    });
  });

  describe("getReceiptsBySession", () => {
    test("should retrieve all receipts for a session", () => {
      const sessionId = "session-1";

      storeReceipt(
        db,
        createReceipt({
          action: "Action 1",
          rationale: "Rationale 1",
          confidence: "high",
          reversibility: "reversible",
          sessionId,
        })
      );

      storeReceipt(
        db,
        createReceipt({
          action: "Action 2",
          rationale: "Rationale 2",
          confidence: "medium",
          reversibility: "reversible",
          sessionId,
        })
      );

      storeReceipt(
        db,
        createReceipt({
          action: "Action 3",
          rationale: "Rationale 3",
          confidence: "low",
          reversibility: "reversible",
          sessionId: "session-2",
        })
      );

      const receipts = getReceiptsBySession(db, sessionId);
      assert.strictEqual(receipts.length, 2);
      assert.strictEqual(receipts[0].sessionId, sessionId);
      assert.strictEqual(receipts[1].sessionId, sessionId);
    });

    test("should return empty array for session with no receipts", () => {
      const receipts = getReceiptsBySession(db, "non-existent-session");
      assert.strictEqual(receipts.length, 0);
    });
  });

  describe("getMostCommonFailureMode", () => {
    test("should identify most common failure mode in session", () => {
      const sessionId = "session-1";

      // Add 3 context_overflow failures
      for (let i = 0; i < 3; i++) {
        storeReceipt(
          db,
          createFailureReceipt({
            action: `Action ${i}`,
            rationale: "Test",
            reversibility: "reversible",
            failureClass: "context_overflow",
            sessionId,
          })
        );
      }

      // Add 1 timeout failure
      storeReceipt(
        db,
        createFailureReceipt({
          action: "Timeout action",
          rationale: "Test",
          reversibility: "reversible",
          failureClass: "timeout",
          sessionId,
        })
      );

      const stats = getMostCommonFailureMode(db, sessionId);
      assert.ok(stats);
      assert.strictEqual(stats.failureClass, "context_overflow");
      assert.strictEqual(stats.count, 3);
      assert.strictEqual(stats.percentage, 75);
    });

    test("should return null when no failures in session", () => {
      const sessionId = "session-1";

      storeReceipt(
        db,
        createReceipt({
          action: "Success action",
          rationale: "Test",
          confidence: "high",
          reversibility: "reversible",
          outcome: "success",
          sessionId,
        })
      );

      const stats = getMostCommonFailureMode(db, sessionId);
      assert.strictEqual(stats, null);
    });
  });

  describe("getFailureModesBySession", () => {
    test("should return all failure modes with counts", () => {
      const sessionId = "session-1";

      // Add 3 context_overflow failures
      for (let i = 0; i < 3; i++) {
        storeReceipt(
          db,
          createFailureReceipt({
            action: `Action ${i}`,
            rationale: "Test",
            reversibility: "reversible",
            failureClass: "context_overflow",
            sessionId,
          })
        );
      }

      // Add 2 timeout failures
      for (let i = 0; i < 2; i++) {
        storeReceipt(
          db,
          createFailureReceipt({
            action: `Timeout ${i}`,
            rationale: "Test",
            reversibility: "reversible",
            failureClass: "timeout",
            sessionId,
          })
        );
      }

      // Add 1 model_error failure
      storeReceipt(
        db,
        createFailureReceipt({
          action: "Model error",
          rationale: "Test",
          reversibility: "reversible",
          failureClass: "model_error",
          sessionId,
        })
      );

      const stats = getFailureModesBySession(db, sessionId);
      assert.strictEqual(stats.length, 3);

      // Should be sorted by count descending
      assert.strictEqual(stats[0].failureClass, "context_overflow");
      assert.strictEqual(stats[0].count, 3);
      assert.strictEqual(stats[0].percentage, 50);

      assert.strictEqual(stats[1].failureClass, "timeout");
      assert.strictEqual(stats[1].count, 2);

      assert.strictEqual(stats[2].failureClass, "model_error");
      assert.strictEqual(stats[2].count, 1);
    });

    test("should return empty array when no failures", () => {
      const sessionId = "session-1";

      storeReceipt(
        db,
        createReceipt({
          action: "Success action",
          rationale: "Test",
          confidence: "high",
          reversibility: "reversible",
          outcome: "success",
          sessionId,
        })
      );

      const stats = getFailureModesBySession(db, sessionId);
      assert.strictEqual(stats.length, 0);
    });
  });

  describe("deleteReceiptsBySession", () => {
    test("should delete all receipts for a session", () => {
      const sessionId = "session-1";

      storeReceipt(
        db,
        createReceipt({
          action: "Action 1",
          rationale: "Test",
          confidence: "high",
          reversibility: "reversible",
          sessionId,
        })
      );

      storeReceipt(
        db,
        createReceipt({
          action: "Action 2",
          rationale: "Test",
          confidence: "high",
          reversibility: "reversible",
          sessionId,
        })
      );

      const deleted = deleteReceiptsBySession(db, sessionId);
      assert.strictEqual(deleted, 2);

      const receipts = getReceiptsBySession(db, sessionId);
      assert.strictEqual(receipts.length, 0);
    });

    test("should return 0 when no receipts to delete", () => {
      const deleted = deleteReceiptsBySession(db, "non-existent-session");
      assert.strictEqual(deleted, 0);
    });
  });
});
