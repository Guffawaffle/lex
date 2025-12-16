/**
 * Receipt Schema Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ReceiptSchema,
  ReceiptStatusSchema,
  ExecutorTypeSchema,
  CapabilityTierSchema,
  isReceipt,
  parseReceipt,
  safeParseReceipt,
  createReceipt,
} from "../../../src/shared/types/receipt-schema.js";

describe("Receipt Schema Tests", () => {
  describe("ReceiptStatusSchema", () => {
    it("should accept valid statuses", () => {
      assert.doesNotThrow(() => ReceiptStatusSchema.parse("success"));
      assert.doesNotThrow(() => ReceiptStatusSchema.parse("failure"));
      assert.doesNotThrow(() => ReceiptStatusSchema.parse("partial"));
      assert.doesNotThrow(() => ReceiptStatusSchema.parse("blocked"));
    });

    it("should reject invalid status", () => {
      assert.throws(() => ReceiptStatusSchema.parse("invalid"));
    });
  });

  describe("ExecutorTypeSchema", () => {
    it("should accept valid executor types", () => {
      assert.doesNotThrow(() => ExecutorTypeSchema.parse("human"));
      assert.doesNotThrow(() => ExecutorTypeSchema.parse("agent"));
      assert.doesNotThrow(() => ExecutorTypeSchema.parse("tool"));
    });

    it("should reject invalid executor type", () => {
      assert.throws(() => ExecutorTypeSchema.parse("robot"));
    });
  });

  describe("CapabilityTierSchema", () => {
    it("should accept valid capability tiers", () => {
      assert.doesNotThrow(() => CapabilityTierSchema.parse("senior"));
      assert.doesNotThrow(() => CapabilityTierSchema.parse("mid"));
      assert.doesNotThrow(() => CapabilityTierSchema.parse("junior"));
    });

    it("should reject invalid capability tier", () => {
      assert.throws(() => CapabilityTierSchema.parse("expert"));
    });
  });

  describe("ReceiptSchema", () => {
    const validReceipt = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      timestamp: "2025-12-16T06:00:00Z",
      executor: {
        type: "agent" as const,
        id: "copilot-1",
        version: "1.0.0",
      },
      task: {
        id: "task-1",
        description: "Test task",
        capabilityTier: "mid" as const,
      },
      status: "success" as const,
      outcome: {
        result: "completed",
        artifacts: ["file1.ts"],
      },
      metadata: {
        durationMs: 1000,
        retryCount: 0,
        escalated: false,
      },
    };

    it("should validate a complete valid Receipt", () => {
      assert.doesNotThrow(() => ReceiptSchema.parse(validReceipt));
    });

    it("should validate minimal Receipt (required fields only)", () => {
      const minimal = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        timestamp: "2025-12-16T06:00:00Z",
        executor: {
          type: "agent" as const,
          id: "copilot-1",
        },
        task: {
          id: "task-1",
          description: "Test",
        },
        status: "success" as const,
        outcome: {},
      };
      assert.doesNotThrow(() => ReceiptSchema.parse(minimal));
    });

    it("should validate Receipt with frameId", () => {
      const withFrame = {
        ...validReceipt,
        frameId: "550e8400-e29b-41d4-a716-446655440001",
      };
      assert.doesNotThrow(() => ReceiptSchema.parse(withFrame));
    });

    it("should reject Receipt without id", () => {
      const { id, ...noId } = validReceipt;
      assert.throws(() => ReceiptSchema.parse(noId));
    });

    it("should reject Receipt with invalid UUID", () => {
      const invalid = { ...validReceipt, id: "not-a-uuid" };
      assert.throws(() => ReceiptSchema.parse(invalid));
    });

    it("should reject Receipt without executor", () => {
      const { executor, ...noExecutor } = validReceipt;
      assert.throws(() => ReceiptSchema.parse(noExecutor));
    });

    it("should reject Receipt without task", () => {
      const { task, ...noTask } = validReceipt;
      assert.throws(() => ReceiptSchema.parse(noTask));
    });

    it("should reject Receipt with invalid status", () => {
      const invalid = { ...validReceipt, status: "invalid" };
      assert.throws(() => ReceiptSchema.parse(invalid));
    });

    it("should reject Receipt with invalid executor type", () => {
      const invalid = {
        ...validReceipt,
        executor: { ...validReceipt.executor, type: "robot" },
      };
      assert.throws(() => ReceiptSchema.parse(invalid));
    });

    it("should reject Receipt with negative durationMs", () => {
      const invalid = {
        ...validReceipt,
        metadata: { durationMs: -100 },
      };
      assert.throws(() => ReceiptSchema.parse(invalid));
    });

    it("should reject Receipt with negative retryCount", () => {
      const invalid = {
        ...validReceipt,
        metadata: { retryCount: -1 },
      };
      assert.throws(() => ReceiptSchema.parse(invalid));
    });
  });

  describe("isReceipt type guard", () => {
    it("should return true for valid Receipt", () => {
      const receipt = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        timestamp: "2025-12-16T06:00:00Z",
        executor: { type: "agent" as const, id: "copilot-1" },
        task: { id: "task-1", description: "Test" },
        status: "success" as const,
        outcome: {},
      };
      assert.strictEqual(isReceipt(receipt), true);
    });

    it("should return false for invalid Receipt", () => {
      const invalid = { id: "not-a-uuid", status: "invalid" };
      assert.strictEqual(isReceipt(invalid), false);
    });
  });

  describe("parseReceipt", () => {
    it("should parse valid Receipt", () => {
      const receipt = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        timestamp: "2025-12-16T06:00:00Z",
        executor: { type: "agent" as const, id: "copilot-1" },
        task: { id: "task-1", description: "Test" },
        status: "success" as const,
        outcome: {},
      };
      const parsed = parseReceipt(receipt);
      assert.strictEqual(parsed.id, receipt.id);
    });

    it("should throw on invalid Receipt", () => {
      assert.throws(() => parseReceipt({ invalid: true }));
    });
  });

  describe("safeParseReceipt", () => {
    it("should return success for valid Receipt", () => {
      const receipt = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        timestamp: "2025-12-16T06:00:00Z",
        executor: { type: "agent" as const, id: "copilot-1" },
        task: { id: "task-1", description: "Test" },
        status: "success" as const,
        outcome: {},
      };
      const result = safeParseReceipt(receipt);
      assert.strictEqual(result.success, true);
    });

    it("should return error for invalid Receipt", () => {
      const result = safeParseReceipt({ invalid: true });
      assert.strictEqual(result.success, false);
    });
  });

  describe("createReceipt", () => {
    it("should create valid Receipt with required fields", () => {
      const receipt = createReceipt({
        executor: { type: "agent", id: "copilot-1" },
        task: { id: "task-1", description: "Test task" },
        status: "success",
      });
      assert.ok(receipt.id);
      assert.ok(receipt.timestamp);
      assert.strictEqual(receipt.executor.type, "agent");
      assert.strictEqual(receipt.status, "success");
    });

    it("should create Receipt with optional fields", () => {
      const receipt = createReceipt({
        executor: { type: "human", id: "user-1", version: "2.0" },
        task: {
          id: "task-2",
          description: "Complex task",
          capabilityTier: "senior",
        },
        status: "partial",
        outcome: {
          result: "in-progress",
          blockers: ["blocker-1"],
        },
        frameId: "550e8400-e29b-41d4-a716-446655440001",
        metadata: {
          durationMs: 5000,
          retryCount: 2,
          escalated: true,
        },
      });
      assert.strictEqual(receipt.frameId, "550e8400-e29b-41d4-a716-446655440001");
      assert.strictEqual(receipt.metadata?.durationMs, 5000);
      assert.strictEqual(receipt.metadata?.escalated, true);
    });
  });
});
