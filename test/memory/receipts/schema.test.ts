/**
 * Tests for Receipt Schema
 *
 * Covers:
 * - Valid receipt creation
 * - Schema validation with all fields
 * - Enum constraints (confidence, reversibility, outcome)
 * - Helper functions (createReceipt, markUncertainty, etc.)
 * - Edge cases
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  createReceipt,
  markUncertainty,
  requireEscalation,
  isReversible,
  hasHighConfidence,
  hasUncertainty,
  Receipt,
  UncertaintyMarker,
  RECEIPT_SCHEMA_VERSION,
  ReceiptSchema,
  UncertaintyMarkerSchema,
} from "@app/memory/receipts/index.js";

describe("Receipt Schema", () => {
  describe("createReceipt", () => {
    test("should create a minimal valid receipt", () => {
      const receipt = createReceipt({
        action: "Implemented feature X",
        rationale: "User requirement",
        confidence: "high",
        reversibility: "reversible",
      });

      assert.strictEqual(receipt.schemaVersion, RECEIPT_SCHEMA_VERSION);
      assert.strictEqual(receipt.kind, "Receipt");
      assert.strictEqual(receipt.action, "Implemented feature X");
      assert.strictEqual(receipt.outcome, "success");
      assert.strictEqual(receipt.rationale, "User requirement");
      assert.strictEqual(receipt.confidence, "high");
      assert.strictEqual(receipt.reversibility, "reversible");
      assert.strictEqual(receipt.escalationRequired, false);
      assert.ok(receipt.timestamp);
    });

    test("should create receipt with all optional fields", () => {
      const receipt = createReceipt({
        action: "Implemented token refresh",
        rationale: "Security requirement",
        confidence: "medium",
        reversibility: "partially-reversible",
        outcome: "partial",
        rollbackPath: "Change LEX_TOKEN_REFRESH_TTL env var",
        rollbackTested: true,
        escalationRequired: true,
        escalationReason: "Needs security team review",
        escalatedTo: "security-team",
        agentId: "agent-123",
        sessionId: "session-456",
        frameId: "frame-789",
      });

      assert.strictEqual(receipt.outcome, "partial");
      assert.strictEqual(receipt.rollbackPath, "Change LEX_TOKEN_REFRESH_TTL env var");
      assert.strictEqual(receipt.rollbackTested, true);
      assert.strictEqual(receipt.escalationRequired, true);
      assert.strictEqual(receipt.escalationReason, "Needs security team review");
      assert.strictEqual(receipt.escalatedTo, "security-team");
      assert.strictEqual(receipt.agentId, "agent-123");
      assert.strictEqual(receipt.sessionId, "session-456");
      assert.strictEqual(receipt.frameId, "frame-789");
    });

    test("should create receipt with valid timestamp", () => {
      const before = new Date();
      const receipt = createReceipt({
        action: "Test action",
        rationale: "Test rationale",
        confidence: "high",
        reversibility: "reversible",
      });
      const after = new Date();

      const timestamp = new Date(receipt.timestamp);
      assert.ok(timestamp >= before);
      assert.ok(timestamp <= after);
    });
  });

  describe("markUncertainty", () => {
    test("should add uncertainty marker to receipt", () => {
      const receipt = createReceipt({
        action: "Implemented feature",
        rationale: "User requirement",
        confidence: "medium",
        reversibility: "reversible",
      });

      const marker: UncertaintyMarker = {
        stated: "Not sure if 80% TTL is optimal",
        actionTaken: "Implemented with 80% TTL, flagged for review",
        confidence: "medium",
        mitigations: ["Made configurable via env var"],
      };

      const updated = markUncertainty(receipt, marker);

      assert.strictEqual(updated.uncertaintyNotes?.length, 1);
      assert.deepStrictEqual(updated.uncertaintyNotes?.[0], marker);
    });

    test("should add multiple uncertainty markers", () => {
      let receipt = createReceipt({
        action: "Implemented feature",
        rationale: "User requirement",
        confidence: "low",
        reversibility: "reversible",
      });

      const marker1: UncertaintyMarker = {
        stated: "Uncertainty 1",
        actionTaken: "Action 1",
        confidence: "low",
      };

      const marker2: UncertaintyMarker = {
        stated: "Uncertainty 2",
        actionTaken: "Action 2",
        confidence: "medium",
        mitigations: ["Mitigation A", "Mitigation B"],
      };

      receipt = markUncertainty(receipt, marker1);
      receipt = markUncertainty(receipt, marker2);

      assert.strictEqual(receipt.uncertaintyNotes?.length, 2);
      assert.deepStrictEqual(receipt.uncertaintyNotes?.[0], marker1);
      assert.deepStrictEqual(receipt.uncertaintyNotes?.[1], marker2);
    });
  });

  describe("requireEscalation", () => {
    test("should mark receipt for escalation", () => {
      const receipt = createReceipt({
        action: "Complex decision",
        rationale: "Need expert input",
        confidence: "uncertain",
        reversibility: "irreversible",
      });

      const escalated = requireEscalation(
        receipt,
        "Cannot determine correct approach without domain expertise",
        "security-team"
      );

      assert.strictEqual(escalated.escalationRequired, true);
      assert.strictEqual(escalated.escalationReason, "Cannot determine correct approach without domain expertise");
      assert.strictEqual(escalated.escalatedTo, "security-team");
    });

    test("should mark receipt for escalation without escalatedTo", () => {
      const receipt = createReceipt({
        action: "Complex decision",
        rationale: "Need expert input",
        confidence: "uncertain",
        reversibility: "irreversible",
      });

      const escalated = requireEscalation(receipt, "Needs review");

      assert.strictEqual(escalated.escalationRequired, true);
      assert.strictEqual(escalated.escalationReason, "Needs review");
      assert.strictEqual(escalated.escalatedTo, undefined);
    });
  });

  describe("Helper functions", () => {
    test("isReversible should detect reversible actions", () => {
      const reversible = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
      });

      const partiallyReversible = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "high",
        reversibility: "partially-reversible",
      });

      const irreversible = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "high",
        reversibility: "irreversible",
      });

      assert.strictEqual(isReversible(reversible), true);
      assert.strictEqual(isReversible(partiallyReversible), true);
      assert.strictEqual(isReversible(irreversible), false);
    });

    test("hasHighConfidence should detect high confidence", () => {
      const high = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
      });

      const medium = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "medium",
        reversibility: "reversible",
      });

      assert.strictEqual(hasHighConfidence(high), true);
      assert.strictEqual(hasHighConfidence(medium), false);
    });

    test("hasUncertainty should detect uncertainty markers", () => {
      const withoutUncertainty = createReceipt({
        action: "Test",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
      });

      const withUncertainty = markUncertainty(withoutUncertainty, {
        stated: "Not sure",
        actionTaken: "Proceeded anyway",
        confidence: "medium",
      });

      assert.strictEqual(hasUncertainty(withoutUncertainty), false);
      assert.strictEqual(hasUncertainty(withUncertainty), true);
    });
  });

  describe("Schema validation", () => {
    test("should validate receipt with all confidence levels", () => {
      const levels: Array<"high" | "medium" | "low" | "uncertain"> = ["high", "medium", "low", "uncertain"];

      for (const level of levels) {
        const receipt = createReceipt({
          action: "Test",
          rationale: "Test",
          confidence: level,
          reversibility: "reversible",
        });

        const result = ReceiptSchema.safeParse(receipt);
        assert.strictEqual(result.success, true, `Should accept confidence level: ${level}`);
      }
    });

    test("should validate receipt with all reversibility levels", () => {
      const levels: Array<"reversible" | "partially-reversible" | "irreversible"> = [
        "reversible",
        "partially-reversible",
        "irreversible",
      ];

      for (const level of levels) {
        const receipt = createReceipt({
          action: "Test",
          rationale: "Test",
          confidence: "high",
          reversibility: level,
        });

        const result = ReceiptSchema.safeParse(receipt);
        assert.strictEqual(result.success, true, `Should accept reversibility level: ${level}`);
      }
    });

    test("should validate receipt with all outcome types", () => {
      const outcomes: Array<"success" | "failure" | "partial" | "deferred"> = [
        "success",
        "failure",
        "partial",
        "deferred",
      ];

      for (const outcome of outcomes) {
        const receipt = createReceipt({
          action: "Test",
          rationale: "Test",
          confidence: "high",
          reversibility: "reversible",
          outcome,
        });

        const result = ReceiptSchema.safeParse(receipt);
        assert.strictEqual(result.success, true, `Should accept outcome: ${outcome}`);
      }
    });

    test("should reject invalid confidence level", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "invalid",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: new Date().toISOString(),
      };

      const result = ReceiptSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test("should reject invalid reversibility level", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "invalid",
        escalationRequired: false,
        timestamp: new Date().toISOString(),
      };

      const result = ReceiptSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test("should reject invalid outcome", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "invalid",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: new Date().toISOString(),
      };

      const result = ReceiptSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test("should reject missing required fields", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
      };

      const result = ReceiptSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test("should reject invalid timestamp format", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "not-a-timestamp",
      };

      const result = ReceiptSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });
  });

  describe("UncertaintyMarker validation", () => {
    test("should validate minimal uncertainty marker", () => {
      const marker: UncertaintyMarker = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "medium",
      };

      const result = UncertaintyMarkerSchema.safeParse(marker);
      assert.strictEqual(result.success, true);
    });

    test("should validate uncertainty marker with mitigations", () => {
      const marker: UncertaintyMarker = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "low",
        mitigations: ["Added monitoring", "Made configurable"],
      };

      const result = UncertaintyMarkerSchema.safeParse(marker);
      assert.strictEqual(result.success, true);
    });

    test("should reject uncertainty marker with missing fields", () => {
      const invalid = {
        stated: "Not sure about X",
      };

      const result = UncertaintyMarkerSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });
  });
});
