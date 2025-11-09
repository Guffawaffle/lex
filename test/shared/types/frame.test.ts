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
    assert.strictEqual(FRAME_SCHEMA_VERSION, 2, "Schema version should be 2");
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

  test("should validate Frame with merge-weave metadata (v2)", () => {
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
});

console.log("\n✅ Frame Type Validation Tests - covering v1 and v2 schema validation\n");
