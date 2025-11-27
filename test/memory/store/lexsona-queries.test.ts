/**
 * Tests for LexSona Behavior Rules storage (Migration V7)
 *
 * Run with: npm test
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  saveBehaviorRule,
  getBehaviorRuleById,
  getAllBehaviorRules,
  queryBehaviorRules,
  deleteBehaviorRule,
  getBehaviorRuleCount,
  updateBehaviorRuleConfidence,
} from "@app/memory/store/index.js";
import type { BehaviorRule } from "@app/shared/lexsona/schemas.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-lexsona-${Date.now()}.db`);

// Sample test BehaviorRules
const testRule1: BehaviorRule = {
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

const testRule2: BehaviorRule = {
  rule_id: "rule-002",
  context: { module: "db", environment: "production" },
  correction: "Use parameterized queries instead of string concatenation",
  confidence_alpha: 10.0,
  confidence_beta: 1.0,
  observation_count: 11,
  created_at: "2025-11-27T08:00:00.000Z",
  updated_at: "2025-11-27T14:00:00.000Z",
  last_observed: "2025-11-27T14:00:00.000Z",
  decay_tau: 365,
};

const testRule3: BehaviorRule = {
  rule_id: "rule-003",
  context: { module: "ui", task_type: "styling" },
  correction: "Prefer CSS modules over inline styles",
  confidence_alpha: 2.0,
  confidence_beta: 3.0,
  observation_count: 5,
  created_at: "2025-11-27T06:00:00.000Z",
  updated_at: "2025-11-27T10:00:00.000Z",
  last_observed: "2025-11-27T10:00:00.000Z",
  decay_tau: 90,
};

describe("LexSona Behavior Rules Storage Tests", () => {
  let db: ReturnType<typeof getDb>;

  before(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = getDb(TEST_DB_PATH);
  });

  after(() => {
    closeDb();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Database Migration V7", () => {
    test("should create lexsona_behavior_rules table", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_behavior_rules'"
        )
        .all();
      assert.strictEqual(tables.length, 1, "lexsona_behavior_rules table should exist");
    });

    test("should have context index", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lexsona_context'"
        )
        .all();
      assert.strictEqual(indexes.length, 1, "idx_lexsona_context index should exist");
    });

    test("should have updated_at index", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lexsona_updated'"
        )
        .all();
      assert.strictEqual(indexes.length, 1, "idx_lexsona_updated index should exist");
    });

    test("should have schema version 7 recorded", () => {
      const versionRow = db
        .prepare("SELECT MAX(version) as version FROM schema_version")
        .get() as { version: number };
      assert.ok(versionRow.version >= 7, "Schema version should be at least 7");
    });
  });

  describe("CRUD Operations", () => {
    test("should save a BehaviorRule successfully", () => {
      saveBehaviorRule(db, testRule1);
      const count = getBehaviorRuleCount(db);
      assert.strictEqual(count, 1, "BehaviorRule count should be 1 after insert");
    });

    test("should retrieve BehaviorRule by ID", () => {
      const rule = getBehaviorRuleById(db, "rule-001");
      assert.ok(rule, "BehaviorRule should be found");
      assert.strictEqual(rule!.rule_id, testRule1.rule_id);
      assert.deepStrictEqual(rule!.context, testRule1.context);
      assert.strictEqual(rule!.correction, testRule1.correction);
      assert.strictEqual(rule!.confidence_alpha, testRule1.confidence_alpha);
      assert.strictEqual(rule!.confidence_beta, testRule1.confidence_beta);
      assert.strictEqual(rule!.observation_count, testRule1.observation_count);
      assert.strictEqual(rule!.created_at, testRule1.created_at);
      assert.strictEqual(rule!.updated_at, testRule1.updated_at);
      assert.strictEqual(rule!.last_observed, testRule1.last_observed);
      assert.strictEqual(rule!.decay_tau, testRule1.decay_tau);
    });

    test("should return null for non-existent BehaviorRule ID", () => {
      const rule = getBehaviorRuleById(db, "non-existent");
      assert.strictEqual(rule, null, "Should return null for non-existent ID");
    });

    test("should update existing BehaviorRule (upsert)", () => {
      const updatedRule = {
        ...testRule1,
        correction: "Updated correction text",
        confidence_alpha: 8.0,
      };
      saveBehaviorRule(db, updatedRule);
      const rule = getBehaviorRuleById(db, "rule-001");
      assert.strictEqual(rule!.correction, "Updated correction text");
      assert.strictEqual(rule!.confidence_alpha, 8.0);
      const count = getBehaviorRuleCount(db);
      assert.strictEqual(count, 1, "BehaviorRule count should still be 1 after update");
    });

    test("should delete BehaviorRule by ID", () => {
      saveBehaviorRule(db, testRule2);
      const deleted = deleteBehaviorRule(db, "rule-002");
      assert.strictEqual(deleted, true, "Delete should return true");
      const rule = getBehaviorRuleById(db, "rule-002");
      assert.strictEqual(rule, null, "BehaviorRule should not exist after delete");
    });

    test("should handle BehaviorRule with empty context", () => {
      const ruleWithEmptyContext: BehaviorRule = {
        rule_id: "rule-empty-context",
        context: {},
        correction: "Rule with empty context",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 0,
        created_at: "2025-11-27T17:00:00.000Z",
        updated_at: "2025-11-27T17:00:00.000Z",
        last_observed: "2025-11-27T17:00:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithEmptyContext);
      const retrieved = getBehaviorRuleById(db, "rule-empty-context");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved!.context, {});
      deleteBehaviorRule(db, "rule-empty-context");
    });

    test("should handle BehaviorRule with complex nested context", () => {
      const ruleWithComplexContext: BehaviorRule = {
        rule_id: "rule-complex-context",
        context: {
          module: "auth",
          tags: ["security", "critical"],
          settings: { nested: { deep: true } },
          count: 42,
        },
        correction: "Rule with complex context",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 0,
        created_at: "2025-11-27T17:30:00.000Z",
        updated_at: "2025-11-27T17:30:00.000Z",
        last_observed: "2025-11-27T17:30:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithComplexContext);
      const retrieved = getBehaviorRuleById(db, "rule-complex-context");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved!.context, ruleWithComplexContext.context);
      deleteBehaviorRule(db, "rule-complex-context");
    });
  });

  describe("Query Operations", () => {
    before(() => {
      // Clean slate for query tests
      const rules = getAllBehaviorRules(db);
      for (const rule of rules) {
        deleteBehaviorRule(db, rule.rule_id);
      }
      // Reset testRule1 to original state
      const originalRule1 = { ...testRule1 };
      // Insert test rules
      saveBehaviorRule(db, originalRule1);
      saveBehaviorRule(db, testRule2);
      saveBehaviorRule(db, testRule3);
    });

    test("should get all BehaviorRules in descending updated_at order", () => {
      const results = getAllBehaviorRules(db);
      assert.strictEqual(results.length, 3, "Should get all 3 rules");
      // Rules should be ordered newest first by updated_at
      assert.ok(
        results[0].updated_at >= results[1].updated_at,
        "Results should be in descending updated_at order"
      );
      assert.ok(
        results[1].updated_at >= results[2].updated_at,
        "Results should be in descending updated_at order"
      );
    });

    test("should limit results when requested", () => {
      const results = getAllBehaviorRules(db, 2);
      assert.strictEqual(results.length, 2, "Should return only 2 rules");
    });

    test("should get correct count", () => {
      const count = getBehaviorRuleCount(db);
      assert.strictEqual(count, 3, "Should count 3 rules");
    });

    test("should query rules with minObservations filter", () => {
      const results = queryBehaviorRules(db, { minObservations: 10 });
      assert.strictEqual(results.length, 1, "Should find 1 rule with 10+ observations");
      assert.strictEqual(results[0].rule_id, "rule-002");
    });

    test("should query rules with minConfidence filter", () => {
      // testRule2 has confidence = 10/(10+1) = 0.909
      // testRule1 has confidence = 5/(5+2) = 0.714
      // testRule3 has confidence = 2/(2+3) = 0.4
      const results = queryBehaviorRules(db, { minConfidence: 0.8 });
      assert.strictEqual(results.length, 1, "Should find 1 rule with 80%+ confidence");
      assert.strictEqual(results[0].rule_id, "rule-002");
    });

    test("should query rules with combined filters", () => {
      const results = queryBehaviorRules(db, {
        minObservations: 5,
        minConfidence: 0.5,
        limit: 2,
      });
      // testRule1: observations=7, confidence=0.714 ✓
      // testRule2: observations=11, confidence=0.909 ✓
      // testRule3: observations=5, confidence=0.4 ✗ (low confidence)
      assert.strictEqual(results.length, 2, "Should find 2 rules matching criteria");
    });

    test("should return empty array when no rules match", () => {
      const results = queryBehaviorRules(db, { minObservations: 100 });
      assert.strictEqual(results.length, 0, "Should return empty for no matches");
    });

    test("should return all rules with default options", () => {
      const results = queryBehaviorRules(db, {});
      assert.strictEqual(results.length, 3, "Should return all rules with empty options");
    });
  });

  describe("Confidence Update Operations", () => {
    before(() => {
      // Ensure clean state for update tests
      const existing = getBehaviorRuleById(db, testRule1.rule_id);
      if (!existing) {
        saveBehaviorRule(db, testRule1);
      }
    });

    test("should update confidence scores", () => {
      const newTimestamp = "2025-11-27T18:00:00.000Z";
      const updated = updateBehaviorRuleConfidence(db, testRule1.rule_id, {
        confidence_alpha: 10.0,
        confidence_beta: 3.0,
        observation_count: 13,
        updated_at: newTimestamp,
        last_observed: newTimestamp,
      });

      assert.strictEqual(updated, true, "Update should return true");

      const rule = getBehaviorRuleById(db, testRule1.rule_id);
      assert.strictEqual(rule!.confidence_alpha, 10.0);
      assert.strictEqual(rule!.confidence_beta, 3.0);
      assert.strictEqual(rule!.observation_count, 13);
      assert.strictEqual(rule!.updated_at, newTimestamp);
      assert.strictEqual(rule!.last_observed, newTimestamp);
    });

    test("should return false when updating non-existent rule", () => {
      const updated = updateBehaviorRuleConfidence(db, "non-existent-rule", {
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 1,
        updated_at: "2025-11-27T18:00:00.000Z",
        last_observed: "2025-11-27T18:00:00.000Z",
      });

      assert.strictEqual(updated, false, "Update should return false for non-existent rule");
    });

    test("should preserve other fields when updating confidence", () => {
      const rule = getBehaviorRuleById(db, testRule1.rule_id);
      assert.ok(rule, "Rule should exist");

      // Verify that fields not updated are preserved
      assert.strictEqual(rule!.rule_id, testRule1.rule_id);
      assert.deepStrictEqual(rule!.context, testRule1.context);
      assert.strictEqual(rule!.correction, testRule1.correction);
      assert.strictEqual(rule!.created_at, testRule1.created_at);
      assert.strictEqual(rule!.decay_tau, testRule1.decay_tau);
    });
  });

  describe("Edge Cases", () => {
    test("should handle zero confidence values", () => {
      const ruleWithZeroConfidence: BehaviorRule = {
        rule_id: "rule-zero-confidence",
        context: { test: true },
        correction: "Zero confidence rule",
        confidence_alpha: 0.0,
        confidence_beta: 0.0,
        observation_count: 0,
        created_at: "2025-11-27T19:00:00.000Z",
        updated_at: "2025-11-27T19:00:00.000Z",
        last_observed: "2025-11-27T19:00:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithZeroConfidence);
      const retrieved = getBehaviorRuleById(db, "rule-zero-confidence");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.confidence_alpha, 0.0);
      assert.strictEqual(retrieved!.confidence_beta, 0.0);
      deleteBehaviorRule(db, "rule-zero-confidence");
    });

    test("should handle very large observation counts", () => {
      const ruleWithLargeCount: BehaviorRule = {
        rule_id: "rule-large-count",
        context: { test: true },
        correction: "Large observation count rule",
        confidence_alpha: 1000000.0,
        confidence_beta: 1.0,
        observation_count: 1000001,
        created_at: "2025-11-27T19:30:00.000Z",
        updated_at: "2025-11-27T19:30:00.000Z",
        last_observed: "2025-11-27T19:30:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithLargeCount);
      const retrieved = getBehaviorRuleById(db, "rule-large-count");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.observation_count, 1000001);
      deleteBehaviorRule(db, "rule-large-count");
    });

    test("should handle special characters in correction text", () => {
      const ruleWithSpecialChars: BehaviorRule = {
        rule_id: "rule-special-chars",
        context: { test: true },
        correction: "Use 'single quotes' and \"double quotes\" with <html> & symbols $100",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 1,
        created_at: "2025-11-27T20:00:00.000Z",
        updated_at: "2025-11-27T20:00:00.000Z",
        last_observed: "2025-11-27T20:00:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithSpecialChars);
      const retrieved = getBehaviorRuleById(db, "rule-special-chars");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.correction, ruleWithSpecialChars.correction);
      deleteBehaviorRule(db, "rule-special-chars");
    });

    test("should handle unicode in correction text", () => {
      const ruleWithUnicode: BehaviorRule = {
        rule_id: "rule-unicode",
        context: { test: true },
        correction: "使用参数化查询 🔒 instead of 文字列連結",
        confidence_alpha: 1.0,
        confidence_beta: 1.0,
        observation_count: 1,
        created_at: "2025-11-27T20:30:00.000Z",
        updated_at: "2025-11-27T20:30:00.000Z",
        last_observed: "2025-11-27T20:30:00.000Z",
        decay_tau: 180,
      };
      saveBehaviorRule(db, ruleWithUnicode);
      const retrieved = getBehaviorRuleById(db, "rule-unicode");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.correction, ruleWithUnicode.correction);
      deleteBehaviorRule(db, "rule-unicode");
    });
  });
});

console.log(
  "\n✅ LexSona Behavior Rules Storage Tests - covering Migration V7, CRUD, queries, and edge cases\n"
);
