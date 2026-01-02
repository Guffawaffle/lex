/**
 * Tests for Frame type validation
 *
 * Run with: npm test
 * Or directly with tsx: npx tsx --test frame.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { validateFrameMetadata, FRAME_SCHEMA_VERSION } from "@app/shared/types/frame.js";

describe("Frame Type Validation", () => {
  test("should export FRAME_SCHEMA_VERSION", () => {
    assert.strictEqual(FRAME_SCHEMA_VERSION, 5, "Schema version should be 5");
  });

  test("should validate a minimal Frame", () => {
    const minimalFrame = {
      id: "test-001",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
    };

    assert.ok(validateFrameMetadata(minimalFrame), "Minimal frame should be valid");
  });

  test("should validate Frame with all v1 fields", () => {
    const v1Frame = {
      id: "test-002",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
        blockers: ["blocker1"],
        merge_blockers: ["merge blocker"],
        tests_failing: ["test1"],
      },
      jira: "TICKET-123",
      keywords: ["test", "frame"],
      atlas_frame_id: "atlas-001",
      feature_flags: ["flag1"],
      permissions: ["perm1"],
      image_ids: ["img1"],
    };

    assert.ok(validateFrameMetadata(v1Frame), "Frame with all v1 fields should be valid");
  });

  test("should validate Frame with execution provenance (v2)", () => {
    const v2Frame = {
      id: "test-003",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      runId: "lexrunner-20251109-abc123",
      planHash: "sha256:7f8c9d",
      spend: {
        prompts: 3,
        tokens_estimated: 1500,
      },
    };

    assert.ok(validateFrameMetadata(v2Frame), "Frame with v2 metadata should be valid");
  });

  test("should validate Frame with partial spend metadata", () => {
    const frameWithPartialSpend = {
      id: "test-004",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      spend: {
        prompts: 5,
      },
    };

    assert.ok(
      validateFrameMetadata(frameWithPartialSpend),
      "Frame with partial spend should be valid"
    );
  });

  test("should reject invalid runId type", () => {
    const invalidFrame = {
      id: "test-005",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      runId: 123, // Should be string
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid runId should be rejected"
    );
  });

  test("should reject invalid planHash type", () => {
    const invalidFrame = {
      id: "test-006",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      planHash: true, // Should be string
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid planHash should be rejected"
    );
  });

  test("should reject invalid spend type", () => {
    const invalidFrame = {
      id: "test-007",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      spend: "invalid", // Should be object
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid spend should be rejected"
    );
  });

  test("should reject invalid spend.prompts type", () => {
    const invalidFrame = {
      id: "test-008",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      spend: {
        prompts: "3", // Should be number
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid spend.prompts should be rejected"
    );
  });

  test("should reject invalid spend.tokens_estimated type", () => {
    const invalidFrame = {
      id: "test-009",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      spend: {
        tokens_estimated: "1500", // Should be number
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid spend.tokens_estimated should be rejected"
    );
  });

  test("should reject missing required fields", () => {
    const invalidFrame = {
      id: "test-010",
      timestamp: "2025-11-09T12:00:00Z",
      // Missing branch, module_scope, etc.
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with missing required fields should be rejected"
    );
  });

  test("should reject null Frame", () => {
    assert.strictEqual(validateFrameMetadata(null), false, "Null should be rejected");
  });

  test("should reject non-object Frame", () => {
    assert.strictEqual(validateFrameMetadata("not an object"), false, "String should be rejected");
    assert.strictEqual(validateFrameMetadata(123), false, "Number should be rejected");
    assert.strictEqual(validateFrameMetadata([]), false, "Array should be rejected");
  });

  test("should validate Frame with LexRunner metadata (v3)", () => {
    const v3Frame = {
      id: "test-011",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      executorRole: "code-reviewer",
      toolCalls: ["read_file", "write_file", "run_tests"],
      guardrailProfile: "standard-safety",
    };

    assert.ok(validateFrameMetadata(v3Frame), "Frame with v3 LexRunner metadata should be valid");
  });

  test("should validate Frame with partial v3 fields", () => {
    const frameWithPartialV3 = {
      id: "test-012",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      executorRole: "agent",
    };

    assert.ok(
      validateFrameMetadata(frameWithPartialV3),
      "Frame with partial v3 fields should be valid"
    );
  });

  test("should reject invalid executorRole type", () => {
    const invalidFrame = {
      id: "test-013",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      executorRole: 123, // Should be string
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid executorRole should be rejected"
    );
  });

  test("should reject invalid toolCalls type", () => {
    const invalidFrame = {
      id: "test-014",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      toolCalls: "read_file", // Should be array
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid toolCalls should be rejected"
    );
  });

  test("should reject invalid toolCalls array elements", () => {
    const invalidFrame = {
      id: "test-015",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      toolCalls: ["read_file", 123, "write_file"], // Should all be strings
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid toolCalls elements should be rejected"
    );
  });

  test("should reject invalid guardrailProfile type", () => {
    const invalidFrame = {
      id: "test-016",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      guardrailProfile: ["standard-safety"], // Should be string
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid guardrailProfile should be rejected"
    );
  });

  test("should validate Frame with capability tier (v4)", () => {
    const v4Frame = {
      id: "test-017",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      capabilityTier: "mid",
    };

    assert.ok(validateFrameMetadata(v4Frame), "Frame with capabilityTier should be valid");
  });

  test("should validate Frame with all capability tier values", () => {
    const tiers = ["senior", "mid", "junior"];
    for (const tier of tiers) {
      const frame = {
        id: `test-tier-${tier}`,
        timestamp: "2025-11-09T12:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Test frame",
        reference_point: "test",
        status_snapshot: {
          next_action: "test action",
        },
        capabilityTier: tier,
      };

      assert.ok(
        validateFrameMetadata(frame),
        `Frame with capabilityTier '${tier}' should be valid`
      );
    }
  });

  test("should reject invalid capabilityTier value", () => {
    const invalidFrame = {
      id: "test-018",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      capabilityTier: "invalid",
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid capabilityTier should be rejected"
    );
  });

  test("should reject invalid capabilityTier type", () => {
    const invalidFrame = {
      id: "test-019",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      capabilityTier: 123,
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with non-string capabilityTier should be rejected"
    );
  });

  test("should validate Frame with taskComplexity (v4)", () => {
    const v4Frame = {
      id: "test-020",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "mid",
        assignedModel: "claude-sonnet-4.5",
        actualModel: "claude-sonnet-4.5",
        escalated: false,
        retryCount: 0,
        tierMismatch: false,
      },
    };

    assert.ok(validateFrameMetadata(v4Frame), "Frame with taskComplexity should be valid");
  });

  test("should validate Frame with minimal taskComplexity", () => {
    const frame = {
      id: "test-021",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "junior",
      },
    };

    assert.ok(validateFrameMetadata(frame), "Frame with minimal taskComplexity should be valid");
  });

  test("should validate Frame with escalated taskComplexity", () => {
    const frame = {
      id: "test-022",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "mid",
        assignedModel: "claude-haiku-4",
        actualModel: "claude-sonnet-4.5",
        escalated: true,
        escalationReason: "Required architectural decision",
        retryCount: 2,
        tierMismatch: true,
      },
    };

    assert.ok(validateFrameMetadata(frame), "Frame with escalated taskComplexity should be valid");
  });

  test("should reject taskComplexity with invalid tier", () => {
    const invalidFrame = {
      id: "test-023",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "expert",
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid taskComplexity.tier should be rejected"
    );
  });

  test("should reject taskComplexity without tier", () => {
    const invalidFrame = {
      id: "test-024",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        assignedModel: "claude-sonnet-4.5",
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with taskComplexity missing tier should be rejected"
    );
  });

  test("should reject taskComplexity with invalid assignedModel type", () => {
    const invalidFrame = {
      id: "test-025",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "mid",
        assignedModel: 123,
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid assignedModel type should be rejected"
    );
  });

  test("should reject taskComplexity with invalid escalated type", () => {
    const invalidFrame = {
      id: "test-026",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "mid",
        escalated: "yes",
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid escalated type should be rejected"
    );
  });

  test("should reject taskComplexity with invalid retryCount type", () => {
    const invalidFrame = {
      id: "test-027",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      taskComplexity: {
        tier: "mid",
        retryCount: "2",
      },
    };

    assert.strictEqual(
      validateFrameMetadata(invalidFrame),
      false,
      "Frame with invalid retryCount type should be rejected"
    );
  });

  test("should validate Frame with both capabilityTier and taskComplexity", () => {
    const frame = {
      id: "test-028",
      timestamp: "2025-11-09T12:00:00Z",
      branch: "main",
      module_scope: ["core"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "test action",
      },
      capabilityTier: "senior",
      taskComplexity: {
        tier: "senior",
        assignedModel: "claude-opus-4",
        actualModel: "claude-opus-4",
        escalated: false,
        retryCount: 0,
      },
    };

    assert.ok(
      validateFrameMetadata(frame),
      "Frame with both capabilityTier and taskComplexity should be valid"
    );
  });
});

console.log("\n✅ Frame Type Validation Tests - covering v1, v2, v3, and v4 schema validation\n");
