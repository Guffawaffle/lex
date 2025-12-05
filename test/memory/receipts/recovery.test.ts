/**
 * Tests for Receipt Recovery Suggestion Engine
 *
 * Covers:
 * - Recovery suggestion generation for all failure classes
 * - Intervention type mapping
 * - Edge cases
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { getRecoverySuggestion, getAllRecoverySuggestions } from "@app/memory/receipts/recovery.js";

describe("Receipt Recovery Suggestions", () => {
  describe("getRecoverySuggestion", () => {
    test("should return recovery suggestion for timeout", () => {
      const suggestion = getRecoverySuggestion("timeout");

      assert.strictEqual(suggestion.action, "Reduce scope or increase timeout budget");
      assert.strictEqual(suggestion.interventionType, "reduce_scope");
      assert.ok(suggestion.rationale.includes("time budget"));
    });

    test("should return recovery suggestion for resource_exhaustion", () => {
      const suggestion = getRecoverySuggestion("resource_exhaustion");

      assert.strictEqual(
        suggestion.action,
        "Chunk task into smaller units or increase resource allocation"
      );
      assert.strictEqual(suggestion.interventionType, "chunk_task");
      assert.ok(suggestion.rationale.includes("tokens"));
    });

    test("should return recovery suggestion for model_error", () => {
      const suggestion = getRecoverySuggestion("model_error");

      assert.strictEqual(suggestion.action, "Escalate to senior tier or retry with different model");
      assert.strictEqual(suggestion.interventionType, "escalate");
      assert.ok(suggestion.rationale.includes("model"));
    });

    test("should return recovery suggestion for context_overflow", () => {
      const suggestion = getRecoverySuggestion("context_overflow");

      assert.strictEqual(suggestion.action, "Chunk task into smaller units with focused context");
      assert.strictEqual(suggestion.interventionType, "chunk_task");
      assert.ok(suggestion.rationale.includes("context"));
    });

    test("should return recovery suggestion for policy_violation", () => {
      const suggestion = getRecoverySuggestion("policy_violation");

      assert.strictEqual(suggestion.action, "Review policy rules or escalate for policy exception");
      assert.strictEqual(suggestion.interventionType, "policy_review");
      assert.ok(suggestion.rationale.includes("policy"));
    });

    test("should accept optional context parameter", () => {
      const suggestion = getRecoverySuggestion("timeout", "Processing large file took 5 minutes");

      // Should still return valid suggestion even if context is not used
      assert.ok(suggestion.action);
      assert.ok(suggestion.rationale);
      assert.ok(suggestion.interventionType);
    });
  });

  describe("getAllRecoverySuggestions", () => {
    test("should return suggestions for all failure classes", () => {
      const allSuggestions = getAllRecoverySuggestions();

      assert.strictEqual(allSuggestions.size, 5);
      assert.ok(allSuggestions.has("timeout"));
      assert.ok(allSuggestions.has("resource_exhaustion"));
      assert.ok(allSuggestions.has("model_error"));
      assert.ok(allSuggestions.has("context_overflow"));
      assert.ok(allSuggestions.has("policy_violation"));
    });

    test("should return valid suggestions for each failure class", () => {
      const allSuggestions = getAllRecoverySuggestions();

      for (const [failureClass, suggestion] of allSuggestions) {
        assert.ok(suggestion.action, `Missing action for ${failureClass}`);
        assert.ok(suggestion.rationale, `Missing rationale for ${failureClass}`);
        assert.ok(suggestion.interventionType, `Missing intervention type for ${failureClass}`);
      }
    });
  });

  describe("Intervention types", () => {
    test("should map failure classes to appropriate intervention types", () => {
      assert.strictEqual(getRecoverySuggestion("timeout").interventionType, "reduce_scope");
      assert.strictEqual(getRecoverySuggestion("resource_exhaustion").interventionType, "chunk_task");
      assert.strictEqual(getRecoverySuggestion("model_error").interventionType, "escalate");
      assert.strictEqual(getRecoverySuggestion("context_overflow").interventionType, "chunk_task");
      assert.strictEqual(getRecoverySuggestion("policy_violation").interventionType, "policy_review");
    });
  });
});
