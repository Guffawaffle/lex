/**
 * Unit tests for natural query parsing module
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  isConversationalQuery,
  detectQuestionType,
  extractTimeHints,
  extractModuleHints,
  cleanQuery,
  parseNaturalQuery,
} from "@app/memory/natural-query.js";

describe("Natural Query Parsing", () => {
  describe("isConversationalQuery", () => {
    test("should detect conversational queries with question words", () => {
      assert.strictEqual(isConversationalQuery("what do you remember about auth?"), true);
      assert.strictEqual(isConversationalQuery("when did I work on login?"), true);
      assert.strictEqual(isConversationalQuery("why did we change the API?"), true);
      assert.strictEqual(isConversationalQuery("how does authentication work?"), true);
    });

    test("should detect queries with question marks", () => {
      assert.strictEqual(isConversationalQuery("authentication?"), true);
      assert.strictEqual(isConversationalQuery("did we fix the bug?"), true);
    });

    test("should detect queries with action words", () => {
      assert.strictEqual(isConversationalQuery("tell me about authentication"), true);
      assert.strictEqual(isConversationalQuery("show me login work"), true);
      assert.strictEqual(isConversationalQuery("find auth bugs"), true);
      assert.strictEqual(isConversationalQuery("recall login issues"), true);
    });

    test("should not detect simple keyword queries as conversational", () => {
      assert.strictEqual(isConversationalQuery("authentication"), false);
      assert.strictEqual(isConversationalQuery("login bug"), false);
      assert.strictEqual(isConversationalQuery("api/auth"), false);
    });

    test("should handle queries with 'lex' prefix", () => {
      assert.strictEqual(isConversationalQuery("lex, what about auth?"), true);
      assert.strictEqual(isConversationalQuery("lex what about auth"), true);
    });
  });

  describe("detectQuestionType", () => {
    test("should detect 'what' questions", () => {
      assert.strictEqual(detectQuestionType("what do you remember"), "what");
      assert.strictEqual(detectQuestionType("What about auth?"), "what");
    });

    test("should detect 'when' questions", () => {
      assert.strictEqual(detectQuestionType("when did I work on this"), "when");
      assert.strictEqual(detectQuestionType("When was the bug fixed?"), "when");
    });

    test("should detect 'why' questions", () => {
      assert.strictEqual(detectQuestionType("why did we change this"), "why");
      assert.strictEqual(detectQuestionType("Why was this needed?"), "why");
    });

    test("should detect 'how' questions", () => {
      assert.strictEqual(detectQuestionType("how does this work"), "how");
      assert.strictEqual(detectQuestionType("How to fix the issue?"), "how");
    });

    test("should return 'general' for non-question queries", () => {
      assert.strictEqual(detectQuestionType("authentication"), "general");
      assert.strictEqual(detectQuestionType("tell me about auth"), "general");
    });

    test("should handle queries with 'lex' prefix", () => {
      assert.strictEqual(detectQuestionType("lex, what about auth?"), "what");
      assert.strictEqual(detectQuestionType("lex when was this done"), "when");
    });
  });

  describe("extractTimeHints", () => {
    test("should extract 'last week' time hint", () => {
      const result = extractTimeHints("what happened last week");
      assert.ok(result);
      assert.strictEqual(result.description, "last week");
      assert.ok(result.since);
      assert.ok(result.since < new Date());
    });

    test("should extract 'last month' time hint", () => {
      const result = extractTimeHints("show me work from last month");
      assert.ok(result);
      assert.strictEqual(result.description, "last month");
      assert.ok(result.since);
    });

    test("should extract 'recently' time hint", () => {
      const result = extractTimeHints("what did I do recently");
      assert.ok(result);
      assert.strictEqual(result.description, "recently");
      assert.ok(result.since);
    });

    test("should extract 'today' time hint", () => {
      const result = extractTimeHints("what did I do today");
      assert.ok(result);
      assert.strictEqual(result.description, "today");
      assert.ok(result.since);
    });

    test("should extract 'this week' time hint", () => {
      const result = extractTimeHints("what happened this week");
      assert.ok(result);
      assert.strictEqual(result.description, "this week");
      assert.ok(result.since);
    });

    test("should extract month names", () => {
      const result = extractTimeHints("work done in November");
      assert.ok(result);
      assert.ok(result.description.includes("November"));
      assert.ok(result.since);
      assert.ok(result.until);
    });

    test("should handle different month name formats", () => {
      const result1 = extractTimeHints("in December");
      const result2 = extractTimeHints("during January");
      const result3 = extractTimeHints("from February");

      assert.ok(result1);
      assert.ok(result2);
      assert.ok(result3);
    });

    test("should return null for queries without time hints", () => {
      const result = extractTimeHints("authentication work");
      assert.strictEqual(result, null);
    });
  });

  describe("extractModuleHints", () => {
    test("should extract module path patterns", () => {
      const hints = extractModuleHints("work on ui/admin-panel");
      assert.ok(hints.includes("ui/admin-panel"));
    });

    test("should extract multiple module hints", () => {
      const hints = extractModuleHints("changes to api/auth and ui/login");
      assert.ok(hints.length >= 2);
    });

    test("should extract auth-related keywords", () => {
      const hints = extractModuleHints("authentication fixes");
      assert.ok(hints.some((h) => h.includes("auth")));
    });

    test("should extract login keywords", () => {
      const hints = extractModuleHints("login page updates");
      assert.ok(hints.some((h) => h.includes("login")));
    });

    test("should return empty array for no module hints", () => {
      const hints = extractModuleHints("general work");
      assert.ok(Array.isArray(hints));
    });

    test("should deduplicate hints", () => {
      const hints = extractModuleHints("ui/auth and ui/auth module");
      const uniqueHints = new Set(hints);
      assert.strictEqual(hints.length, uniqueHints.size);
    });
  });

  describe("cleanQuery", () => {
    test("should remove conversational prefixes", () => {
      assert.strictEqual(cleanQuery("what do you remember about auth"), "auth");
      assert.strictEqual(cleanQuery("do you know about login"), "know about login");
      assert.strictEqual(cleanQuery("can you show me auth"), "show me auth");
    });

    test("should remove question marks", () => {
      assert.strictEqual(cleanQuery("authentication?"), "authentication");
      assert.strictEqual(cleanQuery("what about auth?"), "what about auth");
    });

    test("should remove 'lex' prefix", () => {
      assert.strictEqual(cleanQuery("lex, what about auth"), "what about auth");
      assert.strictEqual(cleanQuery("lex what about login"), "what about login");
    });

    test("should remove 'remember' and 'recall' prefixes", () => {
      assert.strictEqual(cleanQuery("remember auth work"), "auth work");
      assert.strictEqual(cleanQuery("recall login changes"), "login changes");
    });

    test("should remove 'about' prefix", () => {
      assert.strictEqual(cleanQuery("about authentication"), "authentication");
    });

    test("should trim whitespace", () => {
      assert.strictEqual(cleanQuery("  authentication  "), "authentication");
    });

    test("should handle multiple transformations", () => {
      const result = cleanQuery("lex, what do you remember about authentication?");
      assert.strictEqual(result, "authentication");
    });
  });

  describe("parseNaturalQuery", () => {
    test("should parse conversational query with time hints", () => {
      const result = parseNaturalQuery("what did you do last week?");
      assert.strictEqual(result.isConversational, true);
      assert.strictEqual(result.questionType, "what");
      assert.ok(result.timeHints);
      assert.strictEqual(result.timeHints.description, "last week");
      assert.ok(result.extractedTopic.length > 0);
    });

    test("should parse simple keyword query", () => {
      const result = parseNaturalQuery("authentication");
      assert.strictEqual(result.isConversational, false);
      assert.strictEqual(result.originalText, "authentication");
      assert.strictEqual(result.extractedTopic, "authentication");
    });

    test("should extract all metadata from complex query", () => {
      const result = parseNaturalQuery("what do you remember about ui/auth work from last month?");
      assert.strictEqual(result.isConversational, true);
      assert.strictEqual(result.questionType, "what");
      assert.ok(result.timeHints);
      assert.ok(result.moduleHints.length > 0);
      assert.ok(result.extractedTopic.length > 0);
    });

    test("should preserve original text", () => {
      const original = "what about authentication?";
      const result = parseNaturalQuery(original);
      assert.strictEqual(result.originalText, original);
    });
  });
});
