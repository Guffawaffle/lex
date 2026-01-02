/**
 * Unit tests for similarity scoring module
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  computeKeywordSimilarity,
  computeStructuralSimilarity,
  computeTemporalSimilarity,
  computeSimilarity,
  detectDuplicates,
  DEFAULT_WEIGHTS,
} from "@app/memory/similarity.js";
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

describe("Similarity Scoring", () => {
  describe("computeKeywordSimilarity", () => {
    test("should return 1.0 for identical keywords", () => {
      const frameA = createTestFrame({
        keywords: ["auth", "bug", "fix"],
        summary_caption: "Fixed authentication bug",
        reference_point: "auth module",
      });
      const frameB = createTestFrame({
        keywords: ["auth", "bug", "fix"],
        summary_caption: "Fixed authentication bug",
        reference_point: "auth module",
      });

      const similarity = computeKeywordSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 1.0);
    });

    test("should return 0.0 for completely different keywords", () => {
      const frameA = createTestFrame({
        keywords: ["auth", "login"],
        summary_caption: "Authentication",
        reference_point: "login",
      });
      const frameB = createTestFrame({
        keywords: ["payment", "checkout"],
        summary_caption: "Payment processing",
        reference_point: "checkout",
      });

      const similarity = computeKeywordSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 0.0);
    });

    test("should compute Jaccard similarity for overlapping keywords", () => {
      const frameA = createTestFrame({
        keywords: ["auth", "bug", "fix"],
        summary_caption: "authentication",
        reference_point: "test",
      });
      const frameB = createTestFrame({
        keywords: ["auth", "security"],
        summary_caption: "authentication",
        reference_point: "test",
      });

      const similarity = computeKeywordSimilarity(frameA, frameB);
      // Common: auth, authentication, test = 3
      // Union: auth, bug, fix, security, authentication, test = 6
      // Jaccard: 3/6 = 0.5
      assert.ok(similarity > 0.4 && similarity < 0.6);
    });

    test("should extract keywords from summary and reference point", () => {
      const frameA = createTestFrame({
        summary_caption: "Fixed SQL injection bug in user module",
        reference_point: "SQL injection",
      });
      const frameB = createTestFrame({
        summary_caption: "Patched SQL injection vulnerability in user module",
        reference_point: "SQL injection",
      });

      const similarity = computeKeywordSimilarity(frameA, frameB);
      // Should have similarity >= 0.5 due to overlapping words (sql, injection, user, module, etc.)
      assert.ok(similarity >= 0.5, `Expected similarity >= 0.5, got ${similarity}`);
    });
  });

  describe("computeStructuralSimilarity", () => {
    test("should return 1.0 for identical module scopes", () => {
      const frameA = createTestFrame({
        module_scope: ["auth/core", "ui/login"],
      });
      const frameB = createTestFrame({
        module_scope: ["auth/core", "ui/login"],
      });

      const similarity = computeStructuralSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 1.0);
    });

    test("should return 0.0 for completely different modules", () => {
      const frameA = createTestFrame({
        module_scope: ["auth/core"],
      });
      const frameB = createTestFrame({
        module_scope: ["payment/gateway"],
      });

      const similarity = computeStructuralSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 0.0);
    });

    test("should compute Jaccard similarity for overlapping modules", () => {
      const frameA = createTestFrame({
        module_scope: ["auth/core", "ui/login", "services/user"],
      });
      const frameB = createTestFrame({
        module_scope: ["auth/core", "services/auth"],
      });

      const similarity = computeStructuralSimilarity(frameA, frameB);
      // Common: auth/core = 1
      // Union: auth/core, ui/login, services/user, services/auth = 4
      // Jaccard: 1/4 = 0.25
      assert.strictEqual(similarity, 0.25);
    });
  });

  describe("computeTemporalSimilarity", () => {
    test("should return 1.0 for frames within same hour", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-01T10:30:00Z",
      });

      const similarity = computeTemporalSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 1.0);
    });

    test("should return 0.5 for frames within same day", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-01T15:00:00Z",
      });

      const similarity = computeTemporalSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 0.5);
    });

    test("should return 0.25 for frames within same week", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-03T10:00:00Z",
      });

      const similarity = computeTemporalSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 0.25);
    });

    test("should return 0.0 for frames more than a week apart", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-15T10:00:00Z",
      });

      const similarity = computeTemporalSimilarity(frameA, frameB);
      assert.strictEqual(similarity, 0.0);
    });
  });

  describe("computeSimilarity", () => {
    test("should compute weighted composite similarity score", () => {
      const frameA = createTestFrame({
        id: "frame-a",
        timestamp: "2025-11-01T10:00:00Z",
        module_scope: ["auth/core"],
        keywords: ["auth", "bug"],
        summary_caption: "Fixed authentication bug",
        reference_point: "auth bug fix",
      });
      const frameB = createTestFrame({
        id: "frame-b",
        timestamp: "2025-11-01T10:30:00Z",
        module_scope: ["auth/core"],
        keywords: ["auth", "bug"],
        summary_caption: "Fixed authentication bug",
        reference_point: "auth bug fix",
      });

      const result = computeSimilarity(frameA, frameB);

      // Verify result structure
      assert.strictEqual(result.frameA, "frame-a");
      assert.strictEqual(result.frameB, "frame-b");
      assert.ok(result.overall >= 0 && result.overall <= 1);

      // Verify dimension scores
      assert.strictEqual(result.dimensions.semantic, 1.0); // identical keywords
      assert.strictEqual(result.dimensions.structural, 1.0); // identical modules
      assert.strictEqual(result.dimensions.temporal, 1.0); // within same hour

      // Verify weighted score (should be 1.0)
      assert.strictEqual(result.overall, 1.0);
    });

    test("should use custom weights when provided", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
        module_scope: ["auth"],
        keywords: ["auth"],
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-01T10:30:00Z",
        module_scope: ["auth"],
        keywords: ["auth"],
      });

      const customWeights = {
        semantic: 0.7,
        structural: 0.2,
        temporal: 0.1,
      };

      const result = computeSimilarity(frameA, frameB, customWeights);

      // With custom weights: 1.0 * 0.7 + 1.0 * 0.2 + 1.0 * 0.1 = 1.0
      // Use approximate equality for floating point
      assert.ok(Math.abs(result.overall - 1.0) < 0.0001, `Expected ~1.0, got ${result.overall}`);
    });
  });

  describe("detectDuplicates", () => {
    test("should detect frames above threshold", () => {
      const newFrame = createTestFrame({
        id: "new-frame",
        keywords: ["auth", "bug", "fix"],
        module_scope: ["auth/core"],
        timestamp: "2025-11-01T10:00:00Z",
      });

      const existingFrames = [
        createTestFrame({
          id: "existing-1",
          keywords: ["auth", "bug", "fix"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:30:00Z",
        }),
        createTestFrame({
          id: "existing-2",
          keywords: ["payment"],
          module_scope: ["payment/gateway"],
          timestamp: "2025-11-01T10:00:00Z",
        }),
      ];

      const duplicates = detectDuplicates(newFrame, existingFrames, 0.85);

      // Should find existing-1 as duplicate, not existing-2
      assert.strictEqual(duplicates.length, 1);
      assert.strictEqual(duplicates[0].frameB, "existing-1");
      assert.ok(duplicates[0].overall >= 0.85);
    });

    test("should sort duplicates by similarity descending", () => {
      const newFrame = createTestFrame({
        id: "new-frame",
        keywords: ["auth", "bug"],
        module_scope: ["auth/core"],
        timestamp: "2025-11-01T10:00:00Z",
      });

      const existingFrames = [
        createTestFrame({
          id: "similar-50",
          keywords: ["auth"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-15T10:00:00Z",
        }),
        createTestFrame({
          id: "similar-90",
          keywords: ["auth", "bug"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:30:00Z",
        }),
        createTestFrame({
          id: "similar-70",
          keywords: ["auth", "fix"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T15:00:00Z",
        }),
      ];

      const duplicates = detectDuplicates(newFrame, existingFrames, 0.5);

      // Should be sorted by similarity (highest first)
      assert.ok(duplicates.length >= 2);
      assert.strictEqual(duplicates[0].frameB, "similar-90");
      assert.ok(duplicates[0].overall > duplicates[1].overall);
    });

    test("should not include frame compared to itself", () => {
      const frame = createTestFrame({
        id: "same-frame",
        keywords: ["auth"],
      });

      const existingFrames = [frame];

      const duplicates = detectDuplicates(frame, existingFrames, 0.5);

      // Should not detect itself as duplicate
      assert.strictEqual(duplicates.length, 0);
    });
  });
});
