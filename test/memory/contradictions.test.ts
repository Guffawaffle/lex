/**
 * Unit tests for contradiction detection module
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  detectContradiction,
  findContradictions,
  scanForContradictions,
  OPPOSITE_KEYWORD_PAIRS,
} from "@app/memory/contradictions.js";
import type { Frame } from "@app/memory/frames/types.js";

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

describe("Contradiction Detection", () => {
  describe("detectContradiction", () => {
    test("should detect opposite keywords in same module", () => {
      const frameA = createTestFrame({
        id: "frame-a",
        module_scope: ["database"],
        summary_caption: "Always use async/await for database calls",
        keywords: ["async", "await", "always"],
      });
      const frameB = createTestFrame({
        id: "frame-b",
        module_scope: ["database"],
        summary_caption: "Never use async/await in hot paths",
        keywords: ["async", "await", "never"],
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect contradiction");
      assert.strictEqual(signal.type, "opposite-keywords");
      assert.ok(signal.confidence > 0);
      assert.ok(signal.explanation.includes("always"));
      assert.ok(signal.explanation.includes("never"));
    });

    test("should detect 'use' vs 'avoid' contradiction", () => {
      const frameA = createTestFrame({
        module_scope: ["javascript"],
        summary_caption: "Use strict mode for all JavaScript files",
        keywords: ["use", "strict"],
      });
      const frameB = createTestFrame({
        module_scope: ["javascript"],
        summary_caption: "Avoid strict mode for legacy compatibility",
        keywords: ["avoid", "strict"],
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect contradiction");
      assert.strictEqual(signal.type, "opposite-keywords");
    });

    test("should detect 'enable' vs 'disable' contradiction", () => {
      const frameA = createTestFrame({
        module_scope: ["config"],
        summary_caption: "Enable caching for performance",
        keywords: ["enable", "caching"],
      });
      const frameB = createTestFrame({
        module_scope: ["config"],
        summary_caption: "Disable caching for debugging",
        keywords: ["disable", "caching"],
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect contradiction");
      assert.strictEqual(signal.type, "opposite-keywords");
    });

    test("should not detect contradiction in different modules", () => {
      const frameA = createTestFrame({
        module_scope: ["auth"],
        summary_caption: "Always require authentication",
        keywords: ["always", "auth"],
      });
      const frameB = createTestFrame({
        module_scope: ["public"],
        summary_caption: "Never require authentication for public endpoints",
        keywords: ["never", "auth"],
      });

      const signal = detectContradiction(frameA, frameB);

      assert.strictEqual(signal, null, "Should not detect contradiction in different modules");
    });

    test("should detect contradiction with overlapping modules", () => {
      const frameA = createTestFrame({
        module_scope: ["auth", "api"],
        summary_caption: "Always validate input",
        keywords: ["always", "validate"],
      });
      const frameB = createTestFrame({
        module_scope: ["api", "internal"],
        summary_caption: "Never validate internal calls",
        keywords: ["never", "validate"],
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect contradiction with overlapping modules");
    });

    test("should detect negation pattern contradiction", () => {
      const frameA = createTestFrame({
        module_scope: ["docs"],
        summary_caption: "Include docstrings for all public functions",
      });
      const frameB = createTestFrame({
        module_scope: ["docs"],
        summary_caption: "Don't include docstrings for internal helpers",
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect negation pattern");
      assert.strictEqual(signal.type, "negation-pattern");
      assert.ok(signal.confidence > 0);
    });

    test("should detect negation with 'avoid'", () => {
      const frameA = createTestFrame({
        module_scope: ["testing"],
        summary_caption: "Use mocks for external dependencies",
      });
      const frameB = createTestFrame({
        module_scope: ["testing"],
        summary_caption: "Avoid mocking external dependencies in integration tests",
      });

      const signal = detectContradiction(frameA, frameB);

      assert.ok(signal, "Should detect negation with avoid");
    });

    test("should not detect contradiction with unrelated content", () => {
      const frameA = createTestFrame({
        module_scope: ["auth"],
        summary_caption: "Implement JWT authentication",
      });
      const frameB = createTestFrame({
        module_scope: ["auth"],
        summary_caption: "Add OAuth2 provider support",
      });

      const signal = detectContradiction(frameA, frameB);

      assert.strictEqual(signal, null, "Should not detect contradiction in unrelated content");
    });

    test("should handle frames with no keywords", () => {
      const frameA = createTestFrame({
        module_scope: ["test"],
        summary_caption: "Simple summary",
        keywords: undefined,
      });
      const frameB = createTestFrame({
        module_scope: ["test"],
        summary_caption: "Another summary",
        keywords: undefined,
      });

      const signal = detectContradiction(frameA, frameB);

      assert.strictEqual(signal, null, "Should handle frames with no keywords");
    });

    test("should skip superseded frames in findContradictions", () => {
      const frameA = createTestFrame({
        id: "frame-a",
        module_scope: ["database"],
        summary_caption: "Always use transactions",
        keywords: ["always", "transactions"],
      });
      const frameB = createTestFrame({
        id: "frame-b",
        module_scope: ["database"],
        summary_caption: "Never use transactions for read queries",
        keywords: ["never", "transactions"],
        superseded_by: "some-other-frame",
      });

      const contradictions = findContradictions(frameA, [frameB]);

      assert.strictEqual(contradictions.length, 0, "Should skip superseded frames");
    });
  });

  describe("findContradictions", () => {
    test("should find all contradicting frames", () => {
      const newFrame = createTestFrame({
        id: "new",
        module_scope: ["database"],
        summary_caption: "Never use async/await",
        keywords: ["never", "async"],
      });

      const existingFrames = [
        createTestFrame({
          id: "old-1",
          module_scope: ["database"],
          summary_caption: "Always use async/await",
          keywords: ["always", "async"],
        }),
        createTestFrame({
          id: "old-2",
          module_scope: ["api"],
          summary_caption: "Always validate input",
          keywords: ["always", "validate"],
        }),
        createTestFrame({
          id: "old-3",
          module_scope: ["database"],
          summary_caption: "Use promises for async operations",
          keywords: ["use", "promises"],
        }),
      ];

      const contradictions = findContradictions(newFrame, existingFrames);

      assert.strictEqual(contradictions.length, 1, "Should find one contradiction");
      assert.strictEqual(contradictions[0].frameB, "old-1");
      assert.ok(contradictions[0].signal);
      assert.strictEqual(contradictions[0].moduleOverlap.length, 1);
      assert.strictEqual(contradictions[0].moduleOverlap[0], "database");
    });

    test("should not include self-comparison", () => {
      const frame = createTestFrame({
        id: "same-frame",
        module_scope: ["test"],
        summary_caption: "Always test",
        keywords: ["always"],
      });

      const contradictions = findContradictions(frame, [frame]);

      assert.strictEqual(contradictions.length, 0, "Should not compare frame to itself");
    });
  });

  describe("scanForContradictions", () => {
    test("should find all contradictions in frame set", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          module_scope: ["auth"],
          summary_caption: "Always require authentication",
          keywords: ["always", "auth"],
        }),
        createTestFrame({
          id: "frame-2",
          module_scope: ["auth"],
          summary_caption: "Never require authentication for health checks",
          keywords: ["never", "auth"],
        }),
        createTestFrame({
          id: "frame-3",
          module_scope: ["logging"],
          summary_caption: "Enable verbose logging",
          keywords: ["enable", "logging"],
        }),
        createTestFrame({
          id: "frame-4",
          module_scope: ["logging"],
          summary_caption: "Disable verbose logging in production",
          keywords: ["disable", "logging"],
        }),
      ];

      const contradictions = scanForContradictions(frames);

      assert.strictEqual(contradictions.length, 2, "Should find two contradiction pairs");
    });

    test("should filter by module", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          module_scope: ["auth"],
          summary_caption: "Always validate",
          keywords: ["always"],
        }),
        createTestFrame({
          id: "frame-2",
          module_scope: ["auth"],
          summary_caption: "Never validate internal",
          keywords: ["never"],
        }),
        createTestFrame({
          id: "frame-3",
          module_scope: ["api"],
          summary_caption: "Always check permissions",
          keywords: ["always"],
        }),
        createTestFrame({
          id: "frame-4",
          module_scope: ["api"],
          summary_caption: "Never check for admin",
          keywords: ["never"],
        }),
      ];

      const contradictions = scanForContradictions(frames, "auth");

      assert.strictEqual(contradictions.length, 1, "Should find one contradiction in auth module");
      const contradiction = contradictions[0];
      const frameIds = [contradiction.frameA, contradiction.frameB].sort();
      assert.deepStrictEqual(frameIds, ["frame-1", "frame-2"]);
    });

    test("should sort by confidence", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          module_scope: ["test"],
          summary_caption: "Always use mocks for testing",
          keywords: ["always", "mocks", "testing"],
        }),
        createTestFrame({
          id: "frame-2",
          module_scope: ["test"],
          summary_caption: "Don't use mocks for integration testing components", // negation pattern (lower confidence)
          keywords: ["mocks", "testing"],
        }),
        createTestFrame({
          id: "frame-3",
          module_scope: ["test"],
          summary_caption: "Never use mocks in tests", // opposite keywords (higher confidence)
          keywords: ["never", "mocks"],
        }),
      ];

      const contradictions = scanForContradictions(frames);

      assert.ok(contradictions.length >= 2, "Should find at least 2 contradictions");
      // First result should have higher confidence than second
      assert.ok(
        contradictions[0].signal!.confidence >= contradictions[1].signal!.confidence,
        "Should be sorted by confidence"
      );
    });

    test("should handle empty frame list", () => {
      const contradictions = scanForContradictions([]);
      assert.strictEqual(contradictions.length, 0);
    });

    test("should skip superseded frames in scan", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          module_scope: ["test"],
          summary_caption: "Always test",
          keywords: ["always"],
        }),
        createTestFrame({
          id: "frame-2",
          module_scope: ["test"],
          summary_caption: "Never test",
          keywords: ["never"],
          superseded_by: "frame-3",
        }),
      ];

      const contradictions = scanForContradictions(frames);

      assert.strictEqual(contradictions.length, 0, "Should skip superseded frames");
    });
  });

  describe("OPPOSITE_KEYWORD_PAIRS", () => {
    test("should have valid keyword pairs", () => {
      assert.ok(OPPOSITE_KEYWORD_PAIRS.length > 0, "Should have keyword pairs");

      for (const [positive, negative] of OPPOSITE_KEYWORD_PAIRS) {
        assert.ok(typeof positive === "string" && positive.length > 0);
        assert.ok(typeof negative === "string" && negative.length > 0);
        assert.notStrictEqual(positive, negative, "Pairs should be different");
      }
    });
  });
});
