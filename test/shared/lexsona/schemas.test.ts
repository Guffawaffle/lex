/**
 * Tests for LexSona Schemas
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  BehaviorRuleSchema,
  CorrectionSchema,
  parseBehaviorRule,
  validateBehaviorRule,
  parseCorrection,
  validateCorrection,
} from "@app/shared/lexsona/schemas.js";

describe("LexSona Schemas", () => {
  describe("BehaviorRuleSchema", () => {
    const validRule = {
      rule_id: "rule-001",
      context: { module: "auth", task_type: "code_review" },
      correction: "Always check for null values before accessing object properties",
      confidence_alpha: 5.0,
      confidence_beta: 2.0,
      observation_count: 7,
      created_at: "2025-11-27T10:00:00.000Z",
      updated_at: "2025-11-27T12:00:00.000Z",
      last_observed: "2025-11-27T12:00:00.000Z",
      decay_tau: 180,
    };

    test("should validate a complete valid BehaviorRule", () => {
      const result = BehaviorRuleSchema.safeParse(validRule);
      assert.ok(result.success, "Valid rule should pass validation");
    });

    test("should apply default decay_tau of 180 days", () => {
      const ruleWithoutTau = { ...validRule };
      delete (ruleWithoutTau as Record<string, unknown>).decay_tau;

      const result = BehaviorRuleSchema.parse(ruleWithoutTau);
      assert.strictEqual(result.decay_tau, 180, "Default decay_tau should be 180");
    });

    test("should reject empty rule_id", () => {
      const invalidRule = { ...validRule, rule_id: "" };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Empty rule_id should fail validation");
    });

    test("should reject empty correction", () => {
      const invalidRule = { ...validRule, correction: "" };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Empty correction should fail validation");
    });

    test("should reject negative confidence_alpha", () => {
      const invalidRule = { ...validRule, confidence_alpha: -1 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Negative confidence_alpha should fail validation");
    });

    test("should reject negative confidence_beta", () => {
      const invalidRule = { ...validRule, confidence_beta: -1 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Negative confidence_beta should fail validation");
    });

    test("should reject negative observation_count", () => {
      const invalidRule = { ...validRule, observation_count: -1 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Negative observation_count should fail validation");
    });

    test("should reject non-integer observation_count", () => {
      const invalidRule = { ...validRule, observation_count: 3.5 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Non-integer observation_count should fail validation");
    });

    test("should reject invalid datetime format", () => {
      const invalidRule = { ...validRule, created_at: "not-a-date" };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Invalid datetime should fail validation");
    });

    test("should accept zero confidence_alpha (edge case)", () => {
      const rule = { ...validRule, confidence_alpha: 0 };
      const result = BehaviorRuleSchema.safeParse(rule);
      assert.ok(result.success, "Zero confidence_alpha should be valid");
    });

    test("should accept zero observation_count", () => {
      const rule = { ...validRule, observation_count: 0 };
      const result = BehaviorRuleSchema.safeParse(rule);
      assert.ok(result.success, "Zero observation_count should be valid");
    });

    test("should accept context with various value types", () => {
      const ruleWithComplexContext = {
        ...validRule,
        context: {
          module: "auth",
          task_type: "code_review",
          severity: 5,
          tags: ["security", "critical"],
          nested: { deep: true },
        },
      };
      const result = BehaviorRuleSchema.safeParse(ruleWithComplexContext);
      assert.ok(result.success, "Complex context should be valid");
    });

    test("should reject non-positive decay_tau", () => {
      const invalidRule = { ...validRule, decay_tau: 0 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Zero decay_tau should fail validation");
    });

    test("should reject negative decay_tau", () => {
      const invalidRule = { ...validRule, decay_tau: -30 };
      const result = BehaviorRuleSchema.safeParse(invalidRule);
      assert.ok(!result.success, "Negative decay_tau should fail validation");
    });
  });

  describe("CorrectionSchema", () => {
    const validCorrection = {
      context: { module: "auth", environment: "production" },
      correction: "Use parameterized queries instead of string concatenation for SQL",
      timestamp: "2025-11-27T10:00:00.000Z",
    };

    test("should validate a complete valid Correction", () => {
      const result = CorrectionSchema.safeParse(validCorrection);
      assert.ok(result.success, "Valid correction should pass validation");
    });

    test("should validate Correction with optional user_id", () => {
      const correctionWithUser = {
        ...validCorrection,
        user_id: "user-123",
      };
      const result = CorrectionSchema.safeParse(correctionWithUser);
      assert.ok(result.success, "Correction with user_id should pass validation");
    });

    test("should validate Correction without user_id", () => {
      const result = CorrectionSchema.safeParse(validCorrection);
      assert.ok(result.success, "Correction without user_id should pass validation");
    });

    test("should reject empty correction text", () => {
      const invalidCorrection = { ...validCorrection, correction: "" };
      const result = CorrectionSchema.safeParse(invalidCorrection);
      assert.ok(!result.success, "Empty correction should fail validation");
    });

    test("should reject invalid timestamp format", () => {
      const invalidCorrection = { ...validCorrection, timestamp: "2025-11-27" };
      const result = CorrectionSchema.safeParse(invalidCorrection);
      assert.ok(!result.success, "Invalid timestamp should fail validation");
    });

    test("should accept empty context object", () => {
      const correctionWithEmptyContext = { ...validCorrection, context: {} };
      const result = CorrectionSchema.safeParse(correctionWithEmptyContext);
      assert.ok(result.success, "Empty context should be valid");
    });
  });

  describe("parseBehaviorRule", () => {
    test("should parse valid BehaviorRule data", () => {
      const data = {
        rule_id: "rule-parse-001",
        context: { module: "test" },
        correction: "Test correction",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 1,
        created_at: "2025-11-27T10:00:00.000Z",
        updated_at: "2025-11-27T10:00:00.000Z",
        last_observed: "2025-11-27T10:00:00.000Z",
        decay_tau: 180,
      };

      const result = parseBehaviorRule(data);
      assert.strictEqual(result.rule_id, "rule-parse-001");
      assert.strictEqual(result.confidence_alpha, 1.0);
    });

    test("should throw on invalid BehaviorRule data", () => {
      const invalidData = { rule_id: "" };
      assert.throws(
        () => parseBehaviorRule(invalidData),
        "Should throw on invalid data"
      );
    });
  });

  describe("validateBehaviorRule", () => {
    test("should return success for valid BehaviorRule", () => {
      const data = {
        rule_id: "rule-validate-001",
        context: { module: "test" },
        correction: "Test correction",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 1,
        created_at: "2025-11-27T10:00:00.000Z",
        updated_at: "2025-11-27T10:00:00.000Z",
        last_observed: "2025-11-27T10:00:00.000Z",
        decay_tau: 180,
      };

      const result = validateBehaviorRule(data);
      assert.ok(result.success, "Validation should succeed");
      if (result.success) {
        assert.strictEqual(result.data.rule_id, "rule-validate-001");
      }
    });

    test("should return error for invalid BehaviorRule", () => {
      const invalidData = { rule_id: "" };
      const result = validateBehaviorRule(invalidData);
      assert.ok(!result.success, "Validation should fail");
      if (!result.success) {
        assert.ok(result.error, "Error should be present");
      }
    });
  });

  describe("parseCorrection", () => {
    test("should parse valid Correction data", () => {
      const data = {
        context: { module: "test" },
        correction: "Test correction",
        timestamp: "2025-11-27T10:00:00.000Z",
      };

      const result = parseCorrection(data);
      assert.strictEqual(result.correction, "Test correction");
    });

    test("should throw on invalid Correction data", () => {
      const invalidData = { correction: "" };
      assert.throws(
        () => parseCorrection(invalidData),
        "Should throw on invalid data"
      );
    });
  });

  describe("validateCorrection", () => {
    test("should return success for valid Correction", () => {
      const data = {
        context: { module: "test" },
        correction: "Test correction",
        timestamp: "2025-11-27T10:00:00.000Z",
      };

      const result = validateCorrection(data);
      assert.ok(result.success, "Validation should succeed");
      if (result.success) {
        assert.strictEqual(result.data.correction, "Test correction");
      }
    });

    test("should return error for invalid Correction", () => {
      const invalidData = { correction: "" };
      const result = validateCorrection(invalidData);
      assert.ok(!result.success, "Validation should fail");
      if (!result.success) {
        assert.ok(result.error, "Error should be present");
      }
    });
  });
});

console.log("\n✅ LexSona Schema Tests - covering BehaviorRule and Correction validation\n");
