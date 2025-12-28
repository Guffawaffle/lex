/**
 * Tests for Receipt Validation
 *
 * Covers:
 * - Valid receipt validation
 * - Invalid receipts with structured errors
 * - Unknown field warnings
 * - Edge cases
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  validateReceiptPayload,
  validateUncertaintyMarkerPayload,
} from "@app/memory/receipts/validator.js";

describe("Receipt Validation", () => {
  describe("Valid Receipts", () => {
    test("should validate a minimal valid receipt", () => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Implemented feature X",
        outcome: "success",
        rationale: "User requirement",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(payload);

      assert.strictEqual(result.valid, true, "Valid minimal receipt should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate a complete receipt with all fields", () => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Implemented token refresh",
        outcome: "partial",
        rationale: "Security requirement",
        confidence: "medium",
        uncertaintyNotes: [
          {
            stated: "Not sure if 80% TTL is optimal",
            actionTaken: "Implemented with 80% TTL, flagged for review",
            confidence: "medium",
            mitigations: ["Made configurable via env var", "Added monitoring"],
          },
        ],
        reversibility: "reversible",
        rollbackPath: "Change LEX_TOKEN_REFRESH_TTL env var",
        rollbackTested: true,
        escalationRequired: true,
        escalationReason: "Needs security team review",
        escalatedTo: "security-team",
        timestamp: "2025-12-05T02:00:00Z",
        agentId: "agent-123",
        sessionId: "session-456",
        frameId: "frame-789",
      };

      const result = validateReceiptPayload(payload);

      assert.strictEqual(result.valid, true, "Complete receipt should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate receipt with multiple uncertainty markers", () => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Complex implementation",
        outcome: "success",
        rationale: "Multiple uncertainties present",
        confidence: "low",
        uncertaintyNotes: [
          {
            stated: "Uncertainty 1",
            actionTaken: "Action 1",
            confidence: "low",
          },
          {
            stated: "Uncertainty 2",
            actionTaken: "Action 2",
            confidence: "medium",
            mitigations: ["Mitigation A", "Mitigation B"],
          },
        ],
        reversibility: "partially-reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(payload);

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });
  });

  describe("Invalid Receipts", () => {
    test("should reject null receipt", () => {
      const result = validateReceiptPayload(null);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].path, "(root)");
      assert.strictEqual(result.errors[0].code, "INVALID_TYPE");
    });

    test("should reject non-object receipt", () => {
      const result = validateReceiptPayload("not an object");

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].code, "INVALID_TYPE");
    });

    test("should reject receipt with missing required fields", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "Should have errors for missing fields");
    });

    test("should reject receipt with invalid confidence", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "invalid",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "confidence"),
        "Should have error for confidence field"
      );
    });

    test("should reject receipt with invalid reversibility", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "invalid",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "reversibility"),
        "Should have error for reversibility field"
      );
    });

    test("should reject receipt with invalid outcome", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "invalid",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "outcome"),
        "Should have error for outcome field"
      );
    });

    test("should reject receipt with invalid timestamp", () => {
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

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "timestamp"),
        "Should have error for timestamp field"
      );
    });

    test("should reject receipt with wrong schemaVersion", () => {
      const invalid = {
        schemaVersion: "2.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "schemaVersion"),
        "Should have error for schemaVersion field"
      );
    });

    test("should reject receipt with wrong kind", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "NotReceipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "kind"),
        "Should have error for kind field"
      );
    });

    test("should reject receipt with invalid uncertainty marker", () => {
      const invalid = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        uncertaintyNotes: [
          {
            stated: "Missing actionTaken and confidence",
          },
        ],
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "Should have errors for invalid uncertainty marker");
    });
  });

  describe("Unknown Field Warnings", () => {
    test("should warn about unknown fields at root level", () => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
        unknownField: "should warn",
      };

      const result = validateReceiptPayload(payload);

      assert.strictEqual(result.valid, true, "Should be valid despite unknown field");
      assert.ok(
        result.warnings.some((w) => w.path === "unknownField"),
        "Should warn about unknown field"
      );
    });

    test("should warn about unknown fields in uncertainty markers", () => {
      const payload = {
        schemaVersion: "1.0.0",
        kind: "Receipt",
        action: "Test",
        outcome: "success",
        rationale: "Test",
        confidence: "high",
        uncertaintyNotes: [
          {
            stated: "Uncertainty",
            actionTaken: "Action",
            confidence: "medium",
            unknownField: "should warn",
          },
        ],
        reversibility: "reversible",
        escalationRequired: false,
        timestamp: "2025-12-05T02:00:00Z",
      };

      const result = validateReceiptPayload(payload);

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.warnings.some((w) => w.path === "uncertaintyNotes[0].unknownField"),
        "Should warn about unknown field in uncertainty marker"
      );
    });
  });

  describe("UncertaintyMarker Validation", () => {
    test("should validate minimal uncertainty marker", () => {
      const payload = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "medium",
      };

      const result = validateUncertaintyMarkerPayload(payload);

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    test("should validate uncertainty marker with mitigations", () => {
      const payload = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "low",
        mitigations: ["Added monitoring", "Made configurable"],
      };

      const result = validateUncertaintyMarkerPayload(payload);

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    test("should reject uncertainty marker with missing fields", () => {
      const invalid = {
        stated: "Not sure about X",
      };

      const result = validateUncertaintyMarkerPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "Should have errors for missing fields");
    });

    test("should reject uncertainty marker with invalid confidence", () => {
      const invalid = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "invalid",
      };

      const result = validateUncertaintyMarkerPayload(invalid);

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.path === "confidence"),
        "Should have error for confidence field"
      );
    });

    test("should reject null uncertainty marker", () => {
      const result = validateUncertaintyMarkerPayload(null);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].code, "INVALID_TYPE");
    });

    test("should warn about unknown fields in uncertainty marker", () => {
      const payload = {
        stated: "Not sure about X",
        actionTaken: "Proceeded with Y",
        confidence: "medium",
        unknownField: "should warn",
      };

      const result = validateUncertaintyMarkerPayload(payload);

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.warnings.some((w) => w.path === "unknownField"),
        "Should warn about unknown field"
      );
    });
  });
});
