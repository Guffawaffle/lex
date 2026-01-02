/**
 * Unit tests for narrative formatting module
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { formatAsNarrative, buildNarrativeResponse } from "@app/memory/narrative.js";
import type { Frame } from "@app/memory/frames/types.js";
import type { NaturalQuery } from "@app/memory/natural-query.js";

// Helper function to create a test frame
function createTestFrame(overrides: Partial<Frame>): Frame {
  return {
    id: "test-frame-id",
    timestamp: "2025-11-01T10:00:00Z",
    branch: "main",
    module_scope: ["module1"],
    summary_caption: "Test summary",
    reference_point: "test reference",
    status_snapshot: {
      next_action: "Test action",
    },
    ...overrides,
  };
}

// Helper function to create a natural query
function createNaturalQuery(overrides: Partial<NaturalQuery>): NaturalQuery {
  return {
    originalText: "test query",
    extractedTopic: "test",
    timeHints: null,
    moduleHints: [],
    questionType: "general",
    isConversational: false,
    ...overrides,
  };
}

describe("Narrative Formatting", () => {
  describe("formatAsNarrative", () => {
    test("should format empty results with helpful message", () => {
      const query = createNaturalQuery({
        extractedTopic: "authentication",
        isConversational: true,
      });
      const result = formatAsNarrative([], query);

      assert.ok(result.includes("don't have any memories"));
      assert.ok(result.includes("authentication"));
      assert.ok(result.includes("Would you like to search for something else?"));
    });

    test("should format single frame with proper structure", () => {
      const frame = createTestFrame({
        summary_caption: "Fixed authentication bug",
        timestamp: "2025-12-15T10:00:00Z",
        keywords: ["auth", "bug"],
      });
      const query = createNaturalQuery({
        extractedTopic: "authentication",
      });
      const result = formatAsNarrative([frame], query);

      assert.ok(result.includes("Here's what I remember"));
      assert.ok(result.includes("authentication"));
      assert.ok(result.includes("Fixed authentication bug"));
      assert.ok(result.includes("December 2025"));
    });

    test("should include date formatting", () => {
      const frame = createTestFrame({
        summary_caption: "Test work",
        timestamp: "2025-12-15T10:00:00Z",
      });
      const query = createNaturalQuery({ extractedTopic: "test" });
      const result = formatAsNarrative([frame], query);

      assert.ok(result.includes("Dec 15"));
    });

    test("should include Jira ticket if available", () => {
      const frame = createTestFrame({
        summary_caption: "Fixed bug",
        timestamp: "2025-12-15T10:00:00Z",
        jira: "PROJ-123",
      });
      const query = createNaturalQuery({ extractedTopic: "bug" });
      const result = formatAsNarrative([frame], query);

      assert.ok(result.includes("[PROJ-123]"));
    });

    test("should group frames by month", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "December work",
          timestamp: "2025-12-15T10:00:00Z",
        }),
        createTestFrame({
          id: "frame2",
          summary_caption: "November work",
          timestamp: "2025-11-20T10:00:00Z",
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "work" });
      const result = formatAsNarrative(frames, query);

      assert.ok(result.includes("December 2025"));
      assert.ok(result.includes("November 2025"));
    });

    test("should sort frames by date (most recent first)", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "Older work",
          timestamp: "2025-11-15T10:00:00Z",
        }),
        createTestFrame({
          id: "frame2",
          summary_caption: "Newer work",
          timestamp: "2025-12-15T10:00:00Z",
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "work" });
      const result = formatAsNarrative(frames, query);

      const newerIndex = result.indexOf("Newer work");
      const olderIndex = result.indexOf("Older work");
      assert.ok(newerIndex < olderIndex, "Newer work should appear before older work");
    });

    test("should include time context in summary when provided", () => {
      const query = createNaturalQuery({
        extractedTopic: "work",
        timeHints: {
          description: "last week",
          since: new Date("2025-12-08"),
        },
      });
      const frames = [
        createTestFrame({
          summary_caption: "Test work",
          timestamp: "2025-12-15T10:00:00Z",
        }),
      ];
      const result = formatAsNarrative(frames, query);

      assert.ok(result.includes("from last week"));
    });

    test("should include follow-up suggestion", () => {
      const frames = [
        createTestFrame({
          summary_caption: "Auth work",
          timestamp: "2025-12-15T10:00:00Z",
          keywords: ["authentication", "security"],
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "auth" });
      const result = formatAsNarrative(frames, query);

      assert.ok(result.includes("Would you like more details"));
    });

    test("should mention most common keyword in follow-up", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "Auth work 1",
          timestamp: "2025-12-15T10:00:00Z",
          keywords: ["authentication", "security"],
        }),
        createTestFrame({
          id: "frame2",
          summary_caption: "Auth work 2",
          timestamp: "2025-12-14T10:00:00Z",
          keywords: ["authentication", "login"],
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "auth" });
      const result = formatAsNarrative(frames, query);

      assert.ok(result.includes("authentication"));
    });

    test("should use emoji for month headings", () => {
      const frame = createTestFrame({
        summary_caption: "Test work",
        timestamp: "2025-12-15T10:00:00Z",
      });
      const query = createNaturalQuery({ extractedTopic: "test" });
      const result = formatAsNarrative([frame], query);

      assert.ok(result.includes("📅"));
    });
  });

  describe("buildNarrativeResponse", () => {
    test("should build structured narrative response", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "December work",
          timestamp: "2025-12-15T10:00:00Z",
          keywords: ["test"],
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "work" });
      const response = buildNarrativeResponse(frames, query);

      assert.ok(response.summary);
      assert.ok(Array.isArray(response.groupedResults));
      assert.ok(response.followUp);
    });

    test("should group results by time period", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "December work",
          timestamp: "2025-12-15T10:00:00Z",
        }),
        createTestFrame({
          id: "frame2",
          summary_caption: "November work",
          timestamp: "2025-11-20T10:00:00Z",
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "work" });
      const response = buildNarrativeResponse(frames, query);

      assert.strictEqual(response.groupedResults.length, 2);
      assert.ok(response.groupedResults[0].timeGroup.includes("2025"));
    });

    test("should include frame metadata in narrative items", () => {
      const frame = createTestFrame({
        id: "test-123",
        summary_caption: "Test work",
        timestamp: "2025-12-15T10:00:00Z",
        keywords: ["test", "work"],
      });
      const query = createNaturalQuery({ extractedTopic: "test" });
      const response = buildNarrativeResponse([frame], query);

      const item = response.groupedResults[0].items[0];
      assert.strictEqual(item.frameId, "test-123");
      assert.strictEqual(item.summary, "Test work");
      assert.ok(item.date);
      assert.deepStrictEqual(item.keywords, ["test", "work"]);
    });

    test("should handle empty frames array", () => {
      const query = createNaturalQuery({ extractedTopic: "nothing" });
      const response = buildNarrativeResponse([], query);

      assert.ok(response.summary.includes("don't have any memories"));
      assert.strictEqual(response.groupedResults.length, 0);
    });

    test("should sort groups by date (most recent first)", () => {
      const frames = [
        createTestFrame({
          id: "frame1",
          summary_caption: "November work",
          timestamp: "2025-11-15T10:00:00Z",
        }),
        createTestFrame({
          id: "frame2",
          summary_caption: "December work",
          timestamp: "2025-12-15T10:00:00Z",
        }),
      ];
      const query = createNaturalQuery({ extractedTopic: "work" });
      const response = buildNarrativeResponse(frames, query);

      assert.ok(response.groupedResults[0].timeGroup.includes("December"));
      assert.ok(response.groupedResults[1].timeGroup.includes("November"));
    });
  });
});
