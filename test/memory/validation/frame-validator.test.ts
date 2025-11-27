/**
 * Tests for Frame Payload Validation Helper
 *
 * Covers:
 * - Valid payloads with all fields
 * - Invalid payloads with missing required fields
 * - Invalid payloads with wrong types
 * - Partial validation with unknown field warnings
 * - Edge cases (null, undefined, arrays)
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  validateFramePayload,
} from "@app/memory/validation/index.js";

describe("Frame Payload Validation", () => {
  describe("Valid Payloads", () => {
    test("should validate a minimal valid Frame payload", () => {
      const payload = {
        id: "frame-001",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "feature/my-feature",
        module_scope: ["core"],
        summary_caption: "Implemented feature X",
        reference_point: "feature x complete",
        status_snapshot: { next_action: "PR review" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Valid minimal payload should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate a complete Frame payload with all v1 fields", () => {
      const payload = {
        id: "frame-002",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        jira: "TICKET-123",
        module_scope: ["core", "ui"],
        summary_caption: "Complete implementation",
        reference_point: "all done",
        status_snapshot: {
          next_action: "Deploy",
          blockers: ["waiting for approval"],
          merge_blockers: ["CI failing"],
          tests_failing: ["test-auth.ts"],
        },
        keywords: ["feature", "urgent"],
        atlas_frame_id: "atlas-001",
        feature_flags: ["dark-mode"],
        permissions: ["admin"],
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Complete v1 payload should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate Frame payload with v2 execution provenance fields", () => {
      const payload = {
        id: "frame-003",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Executed by runner",
        reference_point: "runner completed",
        status_snapshot: { next_action: "Review" },
        runId: "lexrunner-20251127-abc123",
        planHash: "sha256:7f8c9d",
        spend: {
          prompts: 3,
          tokens_estimated: 1500,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with v2 fields should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate Frame payload with v3 LexRunner metadata", () => {
      const payload = {
        id: "frame-004",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Agent execution",
        reference_point: "agent complete",
        status_snapshot: { next_action: "Merge" },
        userId: "user-123",
        executorRole: "code-reviewer",
        toolCalls: ["read_file", "write_file"],
        guardrailProfile: "standard-safety",
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with v3 fields should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate Frame payload with empty optional arrays", () => {
      const payload = {
        id: "frame-005",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: [],
        summary_caption: "Empty arrays test",
        reference_point: "empty arrays",
        status_snapshot: { next_action: "Test" },
        keywords: [],
        toolCalls: [],
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with empty arrays should pass");
    });
  });

  describe("Invalid Payloads - Missing Required Fields", () => {
    test("should reject payload missing id", () => {
      const payload = {
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Missing id",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload without id should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
      assert.ok(
        result.errors.some((e) => e.path === "id" || e.message.toLowerCase().includes("id")),
        "Should have error about id field"
      );
    });

    test("should reject payload missing status_snapshot", () => {
      const payload = {
        id: "frame-006",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Missing status",
        reference_point: "test",
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload without status_snapshot should fail");
      assert.ok(
        result.errors.some(
          (e) => e.path === "status_snapshot" || e.message.toLowerCase().includes("status")
        ),
        "Should have error about status_snapshot field"
      );
    });

    test("should reject payload with empty status_snapshot (missing next_action)", () => {
      const payload = {
        id: "frame-007",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Empty status",
        reference_point: "test",
        status_snapshot: {},
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with empty status_snapshot should fail");
      assert.ok(
        result.errors.some((e) => e.path.includes("next_action")),
        "Should have error about next_action field"
      );
    });
  });

  describe("Invalid Payloads - Wrong Types", () => {
    test("should reject payload with non-string id", () => {
      const payload = {
        id: 123,
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Wrong id type",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with non-string id should fail");
      assert.ok(
        result.errors.some((e) => e.path === "id" && e.code === "INVALID_TYPE"),
        "Should have INVALID_TYPE error for id"
      );
    });

    test("should reject payload with non-array module_scope", () => {
      const payload = {
        id: "frame-008",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: "core",
        summary_caption: "Wrong module_scope type",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with non-array module_scope should fail");
      assert.ok(
        result.errors.some((e) => e.path === "module_scope" && e.code === "INVALID_TYPE"),
        "Should have INVALID_TYPE error for module_scope"
      );
    });

    test("should reject payload with non-number spend.prompts", () => {
      const payload = {
        id: "frame-009",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Wrong spend type",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        spend: { prompts: "three" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with non-number spend.prompts should fail");
      assert.ok(
        result.errors.some((e) => e.path.includes("prompts") && e.code === "INVALID_TYPE"),
        "Should have INVALID_TYPE error for spend.prompts"
      );
    });

    test("should reject payload with non-array toolCalls", () => {
      const payload = {
        id: "frame-010",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Wrong toolCalls type",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        toolCalls: "read_file",
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with non-array toolCalls should fail");
      assert.ok(
        result.errors.some((e) => e.path === "toolCalls" && e.code === "INVALID_TYPE"),
        "Should have INVALID_TYPE error for toolCalls"
      );
    });
  });

  describe("Edge Cases", () => {
    test("should reject null payload", () => {
      const result = validateFramePayload(null);

      assert.strictEqual(result.valid, false, "Null payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
      assert.ok(
        result.errors.some((e) => e.code === "INVALID_TYPE"),
        "Should have INVALID_TYPE error"
      );
    });

    test("should reject undefined payload", () => {
      const result = validateFramePayload(undefined);

      assert.strictEqual(result.valid, false, "Undefined payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
    });

    test("should reject array payload", () => {
      const result = validateFramePayload([]);

      assert.strictEqual(result.valid, false, "Array payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
    });

    test("should reject string payload", () => {
      const result = validateFramePayload("not an object");

      assert.strictEqual(result.valid, false, "String payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
    });

    test("should reject number payload", () => {
      const result = validateFramePayload(42);

      assert.strictEqual(result.valid, false, "Number payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");
    });
  });

  describe("Partial Validation - Unknown Field Warnings", () => {
    test("should warn about unknown fields at root level", () => {
      const payload = {
        id: "frame-011",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "With unknown field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        unknownField: "value",
        anotherUnknown: 123,
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with unknown fields should still be valid");
      assert.ok(result.warnings.length >= 2, "Should have at least 2 warnings");
      assert.ok(
        result.warnings.some((w) => w.path === "unknownField"),
        "Should warn about unknownField"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "anotherUnknown"),
        "Should warn about anotherUnknown"
      );
    });

    test("should warn about unknown fields in status_snapshot", () => {
      const payload = {
        id: "frame-012",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown status field",
        reference_point: "test",
        status_snapshot: {
          next_action: "Test",
          unknownStatus: "extra",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown status_snapshot fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "status_snapshot.unknownStatus"),
        "Should warn about status_snapshot.unknownStatus"
      );
    });

    test("should warn about unknown fields in spend", () => {
      const payload = {
        id: "frame-013",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown spend field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        spend: {
          prompts: 5,
          unknownSpendField: "extra",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown spend fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "spend.unknownSpendField"),
        "Should warn about spend.unknownSpendField"
      );
    });

    test("should return empty warnings for valid payload without unknown fields", () => {
      const payload = {
        id: "frame-014",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Clean payload",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Valid payload should pass");
      assert.deepStrictEqual(result.warnings, [], "Should have no warnings");
    });
  });

  describe("Structured Errors", () => {
    test("should return structured errors with field paths", () => {
      const payload = {
        id: 123,
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Invalid id type",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Invalid payload should fail");
      assert.ok(result.errors.length > 0, "Should have errors");

      const idError = result.errors.find((e) => e.path === "id");
      assert.ok(idError, "Should have error for id field");
      assert.ok(idError.message, "Error should have message");
      assert.ok(idError.code, "Error should have code");
    });

    test("should return multiple errors for multiple invalid fields", () => {
      const payload = {
        id: 123,
        timestamp: 456,
        branch: "main",
        module_scope: "not-array",
        summary_caption: "Multiple errors",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Invalid payload should fail");
      assert.ok(result.errors.length >= 3, "Should have multiple errors");
    });

    test("should return nested path for nested field errors", () => {
      const payload = {
        id: "frame-015",
        timestamp: "2025-11-27T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Nested error",
        reference_point: "test",
        status_snapshot: { next_action: 123 },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with invalid nested field should fail");
      assert.ok(
        result.errors.some((e) => e.path.includes("status_snapshot") && e.path.includes("next_action")),
        "Should have error with nested path for status_snapshot.next_action"
      );
    });
  });
});

console.log(
  "\n✅ Frame Payload Validation Tests - covering valid/invalid payloads and unknown field warnings\n"
);
