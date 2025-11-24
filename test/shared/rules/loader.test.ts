/**
 * Rule loader tests with precedence chain validation
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { resolveRules } from "../../../src/shared/rules/loader.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Rule Loader Precedence", () => {
  let originalDir: string;
  let originalRulesDir: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalRulesDir = process.env.LEX_RULES_DIR;
    delete process.env.LEX_RULES_DIR;
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (originalRulesDir !== undefined) {
      process.env.LEX_RULES_DIR = originalRulesDir;
    } else {
      delete process.env.LEX_RULES_DIR;
    }

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-rule-test-"));
    testRepoDir = dir;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));
    return dir;
  }

  function createTestRule(rule_id: string, source: string, confidence = 0.85) {
    return JSON.stringify({
      rule_id,
      category: "test",
      text: "Test rule from " + source,
      scope: {},
      alpha: 8,
      beta: 5,
      confidence,
      severity: "should",
      first_seen: "2025-11-23T00:00:00Z",
      last_correction: "2025-11-23T00:00:00Z",
    });
  }

  test("loads from package canon/rules/ when no overrides exist", () => {
    const repo = createTestRepo();
    process.chdir(repo);

    const rules = resolveRules({ confidenceThreshold: 0.5 });

    assert.ok(rules.length > 0);
    assert.ok(rules.some((r) => r.source === "package"));

    const fallbackRule = rules.find((r) => r.rule_id === "tool-fallback-protocol");
    assert.ok(fallbackRule);
    assert.strictEqual(fallbackRule.source, "package");
  });

  test("LEX_RULES_DIR overrides workspace rules", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "rules"), { recursive: true });
      writeFileSync(join(customCanon, "rules", "test.json"), createTestRule("shared-rule", "env"));

      mkdirSync(join(repo, ".smartergpt", "canon", "rules"), { recursive: true });
      writeFileSync(
        join(repo, ".smartergpt", "canon", "rules", "test.json"),
        createTestRule("shared-rule", "workspace")
      );

      process.env.LEX_RULES_DIR = join(customCanon, "rules");
      process.chdir(repo);

      const rules = resolveRules();
      const sharedRule = rules.find((r) => r.rule_id === "shared-rule");

      assert.ok(sharedRule);
      assert.strictEqual(sharedRule.source, "env");
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("workspace rules override package rules", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "canon", "rules"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "tool-fallback-protocol.json"),
      createTestRule("tool-fallback-protocol", "workspace-override", 0.95)
    );

    process.chdir(repo);

    const rules = resolveRules();
    const overriddenRule = rules.find((r) => r.rule_id === "tool-fallback-protocol");

    assert.ok(overriddenRule);
    assert.strictEqual(overriddenRule.source, "workspace");
    assert.strictEqual(overriddenRule.confidence, 0.95);
  });
});

describe("Rule Confidence Filtering", () => {
  let originalDir: string;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-rule-test-"));
    testRepoDir = dir;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));
    return dir;
  }

  function createRuleWithConfidence(rule_id: string, confidence: number) {
    return JSON.stringify({
      rule_id,
      category: "test",
      text: "Rule with " + confidence + " confidence",
      scope: {},
      alpha: 8,
      beta: 5,
      confidence,
      severity: "should",
      first_seen: "2025-11-23T00:00:00Z",
      last_correction: "2025-11-23T00:00:00Z",
    });
  }

  test("filters rules below confidence threshold", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "canon", "rules"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "high.json"),
      createRuleWithConfidence("high-confidence", 0.85)
    );
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "low.json"),
      createRuleWithConfidence("low-confidence", 0.65)
    );

    process.chdir(repo);

    const rules = resolveRules({ confidenceThreshold: 0.75 });

    assert.ok(rules.every((r) => r.confidence >= 0.75));
    assert.ok(rules.some((r) => r.rule_id === "high-confidence"));
    assert.ok(!rules.some((r) => r.rule_id === "low-confidence"));
  });
});

describe("Rule Scope Matching", () => {
  let originalDir: string;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-rule-test-"));
    testRepoDir = dir;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));
    return dir;
  }

  function createRuleWithScope(rule_id: string, scope: object) {
    return JSON.stringify({
      rule_id,
      category: "test",
      text: "Rule with scope",
      scope,
      alpha: 8,
      beta: 5,
      confidence: 0.85,
      severity: "should",
      first_seen: "2025-11-23T00:00:00Z",
      last_correction: "2025-11-23T00:00:00Z",
    });
  }

  test("filters rules by environment scope", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "canon", "rules"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "copilot.json"),
      createRuleWithScope("copilot-rule", { environment: "github-copilot" })
    );
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "awa.json"),
      createRuleWithScope("awa-rule", { environment: "awa" })
    );

    process.chdir(repo);

    const rules = resolveRules({ environment: "github-copilot" });

    assert.ok(rules.some((r) => r.rule_id === "copilot-rule"));
    assert.ok(!rules.some((r) => r.rule_id === "awa-rule"));
  });

  test("matches rules with context tags", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "canon", "rules"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "canon", "rules", "tools.json"),
      createRuleWithScope("tools-rule", { context_tags: ["execution", "tools"] })
    );

    process.chdir(repo);

    const rules = resolveRules({ context_tags: ["execution", "tools"] });

    assert.ok(rules.some((r) => r.rule_id === "tools-rule"));
  });
});
