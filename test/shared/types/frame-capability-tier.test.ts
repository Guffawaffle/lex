/**
 * Frame Capability Tier Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FrameSchema,
  CapabilityTierSchema,
  TaskComplexitySchema,
} from "../../../src/shared/types/frame-schema.js";

describe("Frame Capability Tier Tests", () => {
  const minimalFrame = {
    id: "f-550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2025-12-16T06:00:00Z",
    branch: "main",
    module_scope: ["test"],
    summary_caption: "Test frame",
    reference_point: "test-ref",
    status_snapshot: {
      next_action: "Test next action",
    },
  };

  describe("CapabilityTierSchema", () => {
    it("should accept 'senior'", () => {
      assert.doesNotThrow(() => CapabilityTierSchema.parse("senior"));
    });

    it("should accept 'mid'", () => {
      assert.doesNotThrow(() => CapabilityTierSchema.parse("mid"));
    });

    it("should accept 'junior'", () => {
      assert.doesNotThrow(() => CapabilityTierSchema.parse("junior"));
    });

    it("should reject invalid tier value", () => {
      assert.throws(() => CapabilityTierSchema.parse("expert"));
    });
  });

  describe("TaskComplexitySchema", () => {
    it("should validate minimal taskComplexity", () => {
      const complexity = { tier: "mid" as const };
      assert.doesNotThrow(() => TaskComplexitySchema.parse(complexity));
    });

    it("should validate full taskComplexity", () => {
      const complexity = {
        tier: "senior" as const,
        assignedModel: "gpt-4",
        escalated: true,
        escalationReason: "Too complex for mid tier",
        retryCount: 2,
      };
      assert.doesNotThrow(() => TaskComplexitySchema.parse(complexity));
    });

    it("should reject taskComplexity without tier", () => {
      const complexity = { assignedModel: "gpt-4" };
      assert.throws(() => TaskComplexitySchema.parse(complexity));
    });

    it("should reject taskComplexity with invalid tier", () => {
      const complexity = { tier: "expert" };
      assert.throws(() => TaskComplexitySchema.parse(complexity));
    });

    it("should reject taskComplexity with negative retryCount", () => {
      const complexity = { tier: "mid" as const, retryCount: -1 };
      assert.throws(() => TaskComplexitySchema.parse(complexity));
    });
  });

  describe("Frame with capabilityTier", () => {
    it("should validate Frame with capabilityTier='senior'", () => {
      const frame = { ...minimalFrame, capabilityTier: "senior" as const };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should validate Frame with capabilityTier='mid'", () => {
      const frame = { ...minimalFrame, capabilityTier: "mid" as const };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should validate Frame with capabilityTier='junior'", () => {
      const frame = { ...minimalFrame, capabilityTier: "junior" as const };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should reject Frame with invalid capabilityTier", () => {
      const frame = { ...minimalFrame, capabilityTier: "expert" };
      assert.throws(() => FrameSchema.parse(frame));
    });

    it("should validate Frame without capabilityTier (optional)", () => {
      assert.doesNotThrow(() => FrameSchema.parse(minimalFrame));
    });
  });

  describe("Frame with taskComplexity", () => {
    it("should validate Frame with minimal taskComplexity", () => {
      const frame = {
        ...minimalFrame,
        taskComplexity: { tier: "mid" as const },
      };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should validate Frame with full taskComplexity", () => {
      const frame = {
        ...minimalFrame,
        taskComplexity: {
          tier: "senior" as const,
          assignedModel: "claude-3-opus",
          escalated: true,
          escalationReason: "Requires architectural decisions",
          retryCount: 1,
        },
      };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should validate Frame with both capabilityTier and taskComplexity", () => {
      const frame = {
        ...minimalFrame,
        capabilityTier: "senior" as const,
        taskComplexity: {
          tier: "senior" as const,
          assignedModel: "gpt-4-turbo",
        },
      };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });

    it("should validate Frame with escalated task", () => {
      const frame = {
        ...minimalFrame,
        capabilityTier: "mid" as const,
        taskComplexity: {
          tier: "senior" as const,
          escalated: true,
          escalationReason: "Mid tier failed after 2 retries",
          retryCount: 2,
        },
      };
      assert.doesNotThrow(() => FrameSchema.parse(frame));
    });
  });
});
