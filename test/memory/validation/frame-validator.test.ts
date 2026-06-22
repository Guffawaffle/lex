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
import { validateFramePayload } from "@app/memory/validation/index.js";

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
        module_scope: ["core"],
        summary_caption: "Empty arrays test",
        reference_point: "empty arrays",
        status_snapshot: { next_action: "Test" },
        keywords: [],
        toolCalls: [],
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with empty arrays should pass");
    });

    test("should validate Frame payload with v7 LMV epistemic envelope", () => {
      const payload = {
        id: "frame-lmv-001",
        timestamp: "2026-06-16T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "LMV envelope captured",
        reference_point: "lmv envelope validation",
        status_snapshot: { next_action: "Render recall label" },
        lmv: {
          claim: "Recall can distinguish evidence-backed claims from unsupported memory.",
          evidence: [
            {
              kind: "test",
              ref: "test/memory/validation/frame-validator.test.ts",
              status: "supports",
              exitCode: 0,
              line: 1,
              artifactPath: "test/memory/validation/frame-validator.test.ts",
              receiptId: "receipt-lmv-validation",
            },
          ],
          status: "observed",
          confidence: "high",
          uncertainty: ["This validates shape, not recall ranking."],
          lineage: {
            sourceFrames: ["frame-source"],
            sourceReceipts: ["receipt-source"],
          },
          contradictions: [],
          invalidatedBy: [],
          nextValidation: "Run recall rendering tests.",
          boundaries: {
            trustZone: "workspace",
            privilege: "normal",
            dataClass: "local_private",
            egress: "none",
            pathScope: ["src/shared/types/**"],
            doesNotAuthorize: ["remote writes"],
          },
          experiment: {
            hypothesis: "Optional LMV metadata can travel with a Frame.",
            bounds: {
              pathScope: ["src/memory/frames/types.ts"],
              maxAttempts: 1,
              timeBudgetSeconds: 60,
              allowedEffects: ["read", "write"],
              stopConditions: [
                {
                  code: "invalid_schema",
                  action: "stop",
                  message: "Stop if the LMV envelope is rejected.",
                },
              ],
            },
            rollbackOrContainment: "Remove only the optional lmv field.",
            result: "supported",
            lesson: "The envelope remains optional and validated.",
            changedFutureAction: true,
          },
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with LMV metadata should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
      assert.deepStrictEqual(result.warnings, [], "Should have no warnings");
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

    test("should reject LMV evidence with invalid status", () => {
      const payload = {
        id: "frame-lmv-invalid",
        timestamp: "2026-06-16T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Invalid LMV evidence status",
        reference_point: "lmv invalid status",
        status_snapshot: { next_action: "Fix evidence status" },
        lmv: {
          claim: "This should not validate.",
          evidence: [
            {
              kind: "test",
              ref: "test/memory/validation/frame-validator.test.ts",
              status: "maybe",
            },
          ],
          status: "observed",
          confidence: "high",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Invalid LMV evidence status should fail");
      assert.ok(
        result.errors.some((e) => e.path.includes("lmv") && e.path.includes("status")),
        "Should have an LMV evidence status error"
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

    test("should warn about unknown fields inside LMV metadata", () => {
      const payload = {
        id: "frame-lmv-warning",
        timestamp: "2026-06-16T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "LMV unknown field warning",
        reference_point: "lmv warning",
        status_snapshot: { next_action: "Review warnings" },
        lmv: {
          claim: "Unknown LMV fields should be surfaced without rejecting the frame.",
          evidence: [
            {
              kind: "test",
              ref: "test/memory/validation/frame-validator.test.ts",
              status: "supports",
              extraEvidenceField: true,
            },
          ],
          status: "observed",
          confidence: "medium",
          unknownLmvField: "extra",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Unknown LMV fields should warn, not fail");
      assert.ok(
        result.warnings.some((w) => w.path === "lmv.unknownLmvField"),
        "Should warn about unknown LMV root field"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "lmv.evidence[0].extraEvidenceField"),
        "Should warn about unknown LMV evidence field"
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
        result.errors.some(
          (e) => e.path.includes("status_snapshot") && e.path.includes("next_action")
        ),
        "Should have error with nested path for status_snapshot.next_action"
      );
    });
  });

  describe("Capability Tier Fields (v4)", () => {
    test("should validate Frame with capabilityTier", () => {
      const payload = {
        id: "frame-016",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Mid-tier task",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        capabilityTier: "mid",
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with capabilityTier should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should validate all valid capabilityTier values", () => {
      const tiers = ["senior", "mid", "junior"];
      for (const tier of tiers) {
        const payload = {
          id: `frame-tier-${tier}`,
          timestamp: "2025-12-05T10:00:00Z",
          branch: "main",
          module_scope: ["core"],
          summary_caption: `${tier} tier task`,
          reference_point: "test",
          status_snapshot: { next_action: "Test" },
          capabilityTier: tier,
        };

        const result = validateFramePayload(payload);
        assert.strictEqual(result.valid, true, `Payload with '${tier}' tier should pass`);
      }
    });

    test("should validate Frame with taskComplexity", () => {
      const payload = {
        id: "frame-017",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Task with complexity tracking",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        taskComplexity: {
          tier: "mid",
          assignedModel: "claude-sonnet-4.5",
          escalated: false,
          retryCount: 0,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with taskComplexity should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
      assert.deepStrictEqual(result.warnings, [], "Canonical taskComplexity should not warn");
    });

    test("should validate Frame with minimal taskComplexity", () => {
      const payload = {
        id: "frame-018",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Minimal complexity",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        taskComplexity: {
          tier: "junior",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with minimal taskComplexity should pass");
    });

    test("should validate Frame with escalated taskComplexity", () => {
      const payload = {
        id: "frame-019",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Escalated task",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        taskComplexity: {
          tier: "mid",
          assignedModel: "claude-haiku-4",
          escalated: true,
          escalationReason: "Required architectural decision",
          retryCount: 2,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with escalation should pass");
      assert.deepStrictEqual(result.warnings, [], "Canonical escalation fields should not warn");
    });

    test("should validate Frame with both capabilityTier and taskComplexity", () => {
      const payload = {
        id: "frame-020",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Complete v4 fields",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        capabilityTier: "senior",
        taskComplexity: {
          tier: "senior",
          assignedModel: "claude-opus-4",
          escalated: false,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with both v4 fields should pass");
    });
  });

  describe("v4 Fields - Unknown Field Warnings", () => {
    test("should warn about unknown fields in turnCost", () => {
      const payload = {
        id: "frame-021",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown turnCost field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        turnCost: {
          components: {
            latency: 100,
            contextReset: 50,
            renegotiation: 2,
            tokenBloat: 30,
            attentionSwitch: 1,
          },
          unknownTurnCostField: "extra",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown turnCost fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "turnCost.unknownTurnCostField"),
        "Should warn about turnCost.unknownTurnCostField"
      );
    });

    test("should warn about unknown fields in turnCost.components", () => {
      const payload = {
        id: "frame-022",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown component field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        turnCost: {
          components: {
            latency: 100,
            contextReset: 50,
            renegotiation: 2,
            tokenBloat: 30,
            attentionSwitch: 1,
            unknownComponent: 999,
          },
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown component fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "turnCost.components.unknownComponent"),
        "Should warn about turnCost.components.unknownComponent"
      );
    });

    test("should warn about unknown fields in turnCost.weights", () => {
      const payload = {
        id: "frame-023",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown weights field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        turnCost: {
          components: {
            latency: 100,
            contextReset: 50,
            renegotiation: 2,
            tokenBloat: 30,
            attentionSwitch: 1,
          },
          weights: {
            lambda: 0.1,
            gamma: 0.2,
            rho: 0.3,
            tau: 0.1,
            alpha: 0.3,
            unknownWeight: 0.5,
          },
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown weights fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "turnCost.weights.unknownWeight"),
        "Should warn about turnCost.weights.unknownWeight"
      );
    });

    test("should warn about unknown fields in taskComplexity", () => {
      const payload = {
        id: "frame-024",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Unknown complexity field",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        taskComplexity: {
          tier: "mid",
          assignedModel: "claude-sonnet-4.5",
          unknownComplexityField: "extra",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Payload with unknown taskComplexity fields should still be valid"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "taskComplexity.unknownComplexityField"),
        "Should warn about taskComplexity.unknownComplexityField"
      );
    });

    test("should strip deprecated taskComplexity model-attribution fields for ingestion", () => {
      const payload = {
        id: "frame-024b",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Deprecated complexity fields",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        taskComplexity: {
          tier: "mid",
          assignedModel: "claude-sonnet-4.5",
          actualModel: "claude-sonnet-4.5",
          tierMismatch: false,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(
        result.valid,
        true,
        "Deprecated compatibility fields should be stripped before ingestion validation"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "taskComplexity.actualModel"),
        "Should warn on stripped taskComplexity.actualModel"
      );
      assert.ok(
        result.warnings.some((w) => w.path === "taskComplexity.tierMismatch"),
        "Should warn on stripped taskComplexity.tierMismatch"
      );
    });

    test("should not warn when v4 fields are valid without unknown fields", () => {
      const payload = {
        id: "frame-025",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Clean v4 payload",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        turnCost: {
          components: {
            latency: 100,
            contextReset: 50,
            renegotiation: 2,
            tokenBloat: 30,
            attentionSwitch: 1,
          },
          weights: {
            lambda: 0.1,
            gamma: 0.2,
            rho: 0.3,
            tau: 0.1,
            alpha: 0.3,
          },
          weightedScore: 50.5,
        },
        capabilityTier: "senior",
        taskComplexity: {
          tier: "senior",
          assignedModel: "claude-opus-4",
          escalated: false,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Valid v4 payload should pass");
      // Should not warn about v4 fields since they are all known
      const v4Warnings = result.warnings.filter(
        (w) =>
          w.path.includes("turnCost") ||
          w.path.includes("taskComplexity") ||
          w.path.includes("capabilityTier")
      );
      assert.strictEqual(v4Warnings.length, 0, "Should have no warnings for known v4 fields");
    });
  });

  describe("Size Validation", () => {
    // Size limits from frame-validator.ts SIZE_LIMITS
    // These are duplicated here to avoid exposing internal constants
    const MAX_STRING_LENGTH = 10000;
    const MAX_ARRAY_LENGTH = 1000;
    const MAX_ARRAY_ITEM_LENGTH = 500;
    const MAX_NESTED_OBJECT_SIZE = 50000;

    test("should reject payload with excessively long string field", () => {
      const payload = {
        id: "frame-026",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "x".repeat(MAX_STRING_LENGTH + 100), // Exceeds MAX_STRING_LENGTH
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with oversized string should fail");
      assert.ok(
        result.errors.some((e) => e.path === "summary_caption" && e.code === "TOO_BIG"),
        "Should have TOO_BIG error for summary_caption"
      );
    });

    test("should reject payload with excessively long LMV claim", () => {
      const payload = {
        id: "frame-026b",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Large LMV claim",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        lmv: {
          claim: "x".repeat(MAX_STRING_LENGTH + 100),
          evidence: [
            {
              kind: "manual",
              ref: "observation",
              status: "supports",
            },
          ],
          status: "observed",
          confidence: "medium",
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with oversized LMV claim should fail");
      assert.ok(
        result.errors.some((e) => e.path === "lmv.claim" && e.code === "TOO_BIG"),
        "Should have TOO_BIG error for lmv.claim"
      );
    });

    test("should reject payload with excessively long array", () => {
      const payload = {
        id: "frame-027",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: Array(MAX_ARRAY_LENGTH + 500).fill("module"), // Exceeds MAX_ARRAY_LENGTH
        summary_caption: "Large array test",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with oversized array should fail");
      assert.ok(
        result.errors.some((e) => e.path === "module_scope" && e.code === "TOO_BIG"),
        "Should have TOO_BIG error for module_scope"
      );
    });

    test("should reject payload with excessively long array items", () => {
      const payload = {
        id: "frame-028",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Large array items test",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        keywords: ["short", "x".repeat(MAX_ARRAY_ITEM_LENGTH + 100)], // Second item exceeds MAX_ARRAY_ITEM_LENGTH
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with oversized array item should fail");
      assert.ok(
        result.errors.some((e) => e.path === "keywords[1]" && e.code === "TOO_BIG"),
        "Should have TOO_BIG error for keywords[1]"
      );
    });

    test("should reject payload with excessively large nested object", () => {
      // Create a very large turnCost object
      const largeComponents = {
        latency: 100,
        contextReset: 50,
        renegotiation: 2,
        tokenBloat: 30,
        attentionSwitch: 1,
        // Add a large string to exceed MAX_NESTED_OBJECT_SIZE
        extraData: "x".repeat(MAX_NESTED_OBJECT_SIZE + 1000),
      };

      const payload = {
        id: "frame-029",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Large nested object test",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        turnCost: {
          components: largeComponents,
        },
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, false, "Payload with oversized nested object should fail");
      assert.ok(
        result.errors.some((e) => e.path === "turnCost" && e.code === "TOO_BIG"),
        "Should have TOO_BIG error for turnCost"
      );
    });

    test("should accept payload with reasonable sizes", () => {
      const payload = {
        id: "frame-030",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: ["core", "api", "ui"],
        summary_caption: "A reasonably sized summary caption",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        keywords: ["keyword1", "keyword2", "keyword3"],
        toolCalls: ["tool1", "tool2"],
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload with reasonable sizes should pass");
      assert.deepStrictEqual(result.errors, [], "Should have no errors");
    });

    test("should accept payload at size boundaries", () => {
      const payload = {
        id: "frame-031",
        timestamp: "2025-12-05T10:00:00Z",
        branch: "main",
        module_scope: Array(100).fill("module"), // Well within MAX_ARRAY_LENGTH
        summary_caption: "x".repeat(1000), // Well within MAX_STRING_LENGTH
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
        keywords: ["x".repeat(400)], // Just within MAX_ARRAY_ITEM_LENGTH
      };

      const result = validateFramePayload(payload);

      assert.strictEqual(result.valid, true, "Payload at reasonable boundaries should pass");
    });
  });
});
