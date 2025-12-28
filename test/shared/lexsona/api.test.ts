/**
 * LexSona API Tests
 *
 * Tests for the internal API for behavioral rules:
 * - getRules(context, options)
 * - recordCorrection(correction)
 *
 * @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb, closeDb } from "@app/memory/store/index.js";
import { getRules, recordCorrection } from "@app/shared/lexsona/api.js";
import { LEXSONA_DEFAULTS } from "@app/memory/store/lexsona-types.js";
import {
  saveBehaviorRule,
  getBehaviorRuleById,
  deleteBehaviorRule,
} from "@app/memory/store/lexsona-queries.js";
import type { BehaviorRule, Correction } from "@app/memory/store/lexsona-types.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-lexsona-api-${Date.now()}.db`);

describe("LexSona API Tests", () => {
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

  describe("Database Schema", () => {
    test("should have lexsona_behavior_rules table", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_behavior_rules'"
        )
        .all();
      assert.strictEqual(tables.length, 1, "lexsona_behavior_rules table should exist");
    });

    test("should have required indexes", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_lexsona_%'")
        .all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_lexsona_rules_module"), "module index should exist");
      assert.ok(indexNames.includes("idx_lexsona_rules_category"), "category index should exist");
      assert.ok(indexNames.includes("idx_lexsona_rules_severity"), "severity index should exist");
    });
  });

  describe("recordCorrection", () => {
    test("should create a new rule when no matching rule exists", () => {
      const correction: Correction = {
        context: { module_id: "src/services/auth" },
        correction: "Always use JWT for authentication",
        category: "security_policy",
        severity: "must",
      };

      const result = recordCorrection(db, correction);

      assert.ok(result.rule_id, "Should have a rule_id");
      assert.strictEqual(result.text, correction.correction);
      assert.strictEqual(result.category, "security_policy");
      assert.strictEqual(result.severity, "must");
      assert.strictEqual(result.observation_count, 1);
      assert.strictEqual(result.alpha, LEXSONA_DEFAULTS.ALPHA_PRIOR + 1); // α_0 + 1
      assert.strictEqual(result.beta, LEXSONA_DEFAULTS.BETA_PRIOR);
      assert.ok(result.confidence > 0 && result.confidence < 1);
      assert.ok(result.decay_factor > 0 && result.decay_factor <= 1);
      assert.ok(result.effective_confidence > 0);

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });

    test("should reinforce existing rule when matching rule exists", () => {
      // Create initial rule
      const correction: Correction = {
        context: { module_id: "src/services/payment" },
        correction: "Use Stripe for payments",
      };

      const initial = recordCorrection(db, correction);
      const initialAlpha = initial.alpha;
      const initialObservationCount = initial.observation_count;

      // Record another correction with same context and text
      const reinforced = recordCorrection(db, correction);

      assert.strictEqual(reinforced.rule_id, initial.rule_id, "Should update same rule");
      assert.strictEqual(reinforced.alpha, initialAlpha + 1, "Alpha should be incremented");
      assert.strictEqual(reinforced.observation_count, initialObservationCount + 1);

      // Cleanup
      deleteBehaviorRule(db, initial.rule_id);
    });

    test("should record counterexample when polarity is -1", () => {
      // Create initial rule
      const correction: Correction = {
        context: { module_id: "src/utils" },
        correction: "Use lodash for utilities",
      };

      const initial = recordCorrection(db, correction);
      const initialBeta = initial.beta;

      // Record counterexample
      const counterexample: Correction = {
        ...correction,
        polarity: -1,
      };
      const updated = recordCorrection(db, counterexample);

      assert.strictEqual(updated.rule_id, initial.rule_id, "Should update same rule");
      assert.strictEqual(updated.beta, initialBeta + 1, "Beta should be incremented");

      // Cleanup
      deleteBehaviorRule(db, initial.rule_id);
    });

    test("should use default values when optional fields not provided", () => {
      const correction: Correction = {
        context: {},
        correction: "Simple rule without context",
      };

      const result = recordCorrection(db, correction);

      assert.strictEqual(result.category, "general");
      assert.strictEqual(result.severity, "should");
      assert.strictEqual(result.decay_tau, LEXSONA_DEFAULTS.DECAY_TAU_DAYS);

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });
  });

  describe("getRules", () => {
    before(() => {
      // Create test rules with varying observation counts and contexts
      const rules: BehaviorRule[] = [
        {
          rule_id: "rule-auth-001",
          category: "security",
          text: "Use JWT tokens",
          scope: { module_id: "src/services/auth" },
          alpha: 10,
          beta: 5,
          observation_count: 5,
          severity: "must",
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "rule-auth-002",
          category: "security",
          text: "Validate input",
          scope: { module_id: "src/services/auth" },
          alpha: 8,
          beta: 5,
          observation_count: 3,
          severity: "must",
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "rule-low-n",
          category: "style",
          text: "Low observation rule",
          scope: { module_id: "src/services/auth" },
          alpha: 3,
          beta: 5,
          observation_count: 2, // Below default threshold
          severity: "style",
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "rule-payment-001",
          category: "integration",
          text: "Use Stripe webhooks",
          scope: { module_id: "src/services/payment" },
          alpha: 12,
          beta: 5,
          observation_count: 7,
          severity: "should",
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "rule-global-001",
          category: "style",
          text: "Use TypeScript",
          scope: {}, // No module_id - applies globally
          alpha: 15,
          beta: 5,
          observation_count: 10,
          severity: "should",
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      for (const rule of rules) {
        saveBehaviorRule(db, rule);
      }
    });

    after(() => {
      // Cleanup test rules
      deleteBehaviorRule(db, "rule-auth-001");
      deleteBehaviorRule(db, "rule-auth-002");
      deleteBehaviorRule(db, "rule-low-n");
      deleteBehaviorRule(db, "rule-payment-001");
      deleteBehaviorRule(db, "rule-global-001");
    });

    test("should filter rules by module_id (exact match)", () => {
      const rules = getRules(db, { module_id: "src/services/auth" });

      // Should get auth rules but NOT payment rules
      assert.ok(rules.some((r) => r.rule_id === "rule-auth-001"));
      assert.ok(rules.some((r) => r.rule_id === "rule-auth-002"));
      assert.ok(!rules.some((r) => r.rule_id === "rule-payment-001"));
    });

    test("should filter out rules with observation_count < minN", () => {
      const rules = getRules(db, { module_id: "src/services/auth" }, { minN: 3 });

      // rule-low-n has observation_count=2, should be filtered out
      assert.ok(!rules.some((r) => r.rule_id === "rule-low-n"));
      assert.ok(rules.some((r) => r.rule_id === "rule-auth-001"));
      assert.ok(rules.some((r) => r.rule_id === "rule-auth-002"));
    });

    test("should include rules when minN=1", () => {
      // Note: rule-low-n has alpha=3, beta=5 → confidence=0.375, which is below
      // the default minConfidence of 0.5, so we need to lower the threshold
      const rules = getRules(
        db,
        { module_id: "src/services/auth" },
        { minN: 1, minConfidence: 0.3 }
      );

      // All auth rules should be included
      assert.ok(
        rules.some((r) => r.rule_id === "rule-low-n"),
        "Should find rule-low-n with minN=1"
      );
      assert.ok(
        rules.some((r) => r.rule_id === "rule-auth-001"),
        "Should find rule-auth-001"
      );
    });

    test("should return rules sorted by effective_confidence descending", () => {
      const rules = getRules(db, {}, { minN: 1, minConfidence: 0 });

      // Check that rules are sorted by effective_confidence
      for (let i = 0; i < rules.length - 1; i++) {
        assert.ok(
          rules[i].effective_confidence >= rules[i + 1].effective_confidence,
          `Rules should be sorted by effective_confidence: ${rules[i].effective_confidence} >= ${rules[i + 1].effective_confidence}`
        );
      }
    });

    test("should include confidence and decay_factor in results", () => {
      const rules = getRules(db, { module_id: "src/services/auth" });

      for (const rule of rules) {
        assert.ok(typeof rule.confidence === "number", "confidence should be a number");
        assert.ok(
          rule.confidence >= 0 && rule.confidence <= 1,
          "confidence should be between 0 and 1"
        );
        assert.ok(typeof rule.decay_factor === "number", "decay_factor should be a number");
        assert.ok(
          rule.decay_factor > 0 && rule.decay_factor <= 1,
          "decay_factor should be between 0 and 1"
        );
        assert.ok(
          typeof rule.effective_confidence === "number",
          "effective_confidence should be a number"
        );
      }
    });

    test("should return empty array when no rules match", () => {
      const rules = getRules(db, { module_id: "nonexistent/module" });
      assert.strictEqual(rules.length, 0);
    });

    test("should respect limit option", () => {
      const rules = getRules(db, {}, { minN: 1, limit: 2 });
      assert.ok(rules.length <= 2, "Should return at most 2 rules");
    });

    test("should filter by minConfidence", () => {
      // Set a high confidence threshold that should filter out low-confidence rules
      const rules = getRules(db, {}, { minN: 1, minConfidence: 0.7 });

      for (const rule of rules) {
        assert.ok(
          rule.effective_confidence >= 0.7,
          `Rule ${rule.rule_id} effective_confidence ${rule.effective_confidence} should be >= 0.7`
        );
      }
    });
  });

  describe("Bayesian Confidence Calculation", () => {
    test("should calculate confidence as alpha / (alpha + beta)", () => {
      const correction: Correction = {
        context: { module_id: "test/bayesian" },
        correction: "Test Bayesian confidence",
      };

      const result = recordCorrection(db, correction);

      // Initial: α = α_0 + 1 = 3, β = β_0 = 5
      // Confidence = 3 / (3 + 5) = 0.375
      const expectedConfidence = 3 / (3 + 5);
      assert.ok(
        Math.abs(result.confidence - expectedConfidence) < 0.001,
        `Confidence ${result.confidence} should be approximately ${expectedConfidence}`
      );

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });

    test("should increase confidence with reinforcements", () => {
      const correction: Correction = {
        context: { module_id: "test/reinforcement" },
        correction: "Test reinforcement",
      };

      const initial = recordCorrection(db, correction);
      const initialConfidence = initial.confidence;

      // Add more reinforcements
      recordCorrection(db, correction);
      const second = recordCorrection(db, correction);

      assert.ok(
        second.confidence > initialConfidence,
        `Confidence should increase: ${second.confidence} > ${initialConfidence}`
      );

      // Cleanup
      deleteBehaviorRule(db, initial.rule_id);
    });

    test("should decrease confidence with counterexamples", () => {
      const correction: Correction = {
        context: { module_id: "test/counterexample" },
        correction: "Test counterexample",
      };

      const initial = recordCorrection(db, correction);
      const initialConfidence = initial.confidence;

      // Add counterexample
      const counterexample: Correction = {
        ...correction,
        polarity: -1,
      };
      const updated = recordCorrection(db, counterexample);

      assert.ok(
        updated.confidence < initialConfidence,
        `Confidence should decrease: ${updated.confidence} < ${initialConfidence}`
      );

      // Cleanup
      deleteBehaviorRule(db, initial.rule_id);
    });
  });

  describe("Decay Factor", () => {
    test("should have decay_factor close to 1 for recently observed rules", () => {
      const correction: Correction = {
        context: { module_id: "test/decay" },
        correction: "Test decay factor",
      };

      const result = recordCorrection(db, correction);

      // Rule was just created, decay_factor should be very close to 1
      assert.ok(
        result.decay_factor > 0.99,
        `decay_factor ${result.decay_factor} should be very close to 1 for new rules`
      );

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });

    test("should have lower decay_factor for older rules", () => {
      // Create a rule with old last_observed timestamp
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90); // 90 days ago

      const rule: BehaviorRule = {
        rule_id: "rule-old-decay",
        category: "test",
        text: "Old rule",
        scope: {},
        alpha: 10,
        beta: 5,
        observation_count: 5,
        severity: "should",
        decay_tau: 180, // 180 day half-life
        created_at: oldDate.toISOString(),
        updated_at: oldDate.toISOString(),
        last_observed: oldDate.toISOString(),
      };

      saveBehaviorRule(db, rule);

      const retrieved = getBehaviorRuleById(db, "rule-old-decay");
      assert.ok(retrieved);

      // After 90 days with τ=180, decay_factor = exp(-90/180) ≈ 0.606
      assert.ok(
        retrieved!.decay_factor < 0.7,
        `decay_factor ${retrieved!.decay_factor} should be < 0.7 for 90-day-old rule`
      );
      assert.ok(
        retrieved!.decay_factor > 0.5,
        `decay_factor ${retrieved!.decay_factor} should be > 0.5 for 90-day-old rule`
      );

      // Cleanup
      deleteBehaviorRule(db, "rule-old-decay");
    });
  });

  describe("Context Matching", () => {
    test("should match rules with exact module_id", () => {
      const correction: Correction = {
        context: { module_id: "test/exact-match" },
        correction: "Exact match test",
      };

      const created = recordCorrection(db, correction);

      // New rules have low confidence, so we need to use minConfidence=0
      const rules = getRules(db, { module_id: "test/exact-match" }, { minN: 1, minConfidence: 0 });
      assert.ok(
        rules.some((r) => r.rule_id === created.rule_id),
        "Should find rule with exact module_id match"
      );

      const otherRules = getRules(db, { module_id: "test/other" }, { minN: 1, minConfidence: 0 });
      assert.ok(
        !otherRules.some((r) => r.rule_id === created.rule_id),
        "Should not find rule when module_id doesn't match"
      );

      // Cleanup
      deleteBehaviorRule(db, created.rule_id);
    });

    test("should use fuzzy matching for task_type", () => {
      // Create rule with task_type scope
      const rule: BehaviorRule = {
        rule_id: "rule-task-type",
        category: "workflow",
        text: "Use PR template",
        scope: { task_type: "code-review" },
        alpha: 10,
        beta: 5,
        observation_count: 5,
        severity: "should",
        decay_tau: 180,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_observed: new Date().toISOString(),
      };

      saveBehaviorRule(db, rule);

      // Should match with fuzzy task_type
      const rules = getRules(db, { task_type: "code" }, { minN: 1 });
      assert.ok(
        rules.some((r) => r.rule_id === "rule-task-type"),
        "Should find rule with fuzzy task_type match"
      );

      // Cleanup
      deleteBehaviorRule(db, "rule-task-type");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty context", () => {
      const rules = getRules(db, {});
      // Should return all rules that meet minN and minConfidence
      assert.ok(Array.isArray(rules));
    });

    test("should handle correction with frame_id", () => {
      const correction: Correction = {
        context: { module_id: "test/frame" },
        correction: "Test with frame_id",
        frame_id: "frame-123",
      };

      const result = recordCorrection(db, correction);
      assert.strictEqual(result.frame_id, "frame-123");

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });

    test("should handle special characters in correction text", () => {
      const correction: Correction = {
        context: {},
        correction: "Use `const` instead of 'var' for \"immutable\" values",
      };

      const result = recordCorrection(db, correction);
      assert.strictEqual(result.text, correction.correction);

      // Cleanup
      deleteBehaviorRule(db, result.rule_id);
    });
  });
});
