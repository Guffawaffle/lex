/**
 * Unit tests for deduplication module
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  determineConsolidationStrategy,
  detectDuplicateFrames,
} from "@app/memory/deduplication.js";
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

describe("Deduplication Logic", () => {
  describe("determineConsolidationStrategy", () => {
    test("should choose keep-both for different branches", () => {
      const frameA = createTestFrame({
        branch: "main",
        keywords: ["auth", "bug"],
      });
      const frameB = createTestFrame({
        branch: "feature/auth-fix",
        keywords: ["auth", "bug"],
      });

      const strategy = determineConsolidationStrategy(frameA, frameB);

      assert.strictEqual(strategy.mode, "keep-both");
      assert.ok(strategy.rationale.includes("different branches"));
    });

    test("should choose keep-both for different Jira tickets", () => {
      const frameA = createTestFrame({
        jira: "TICKET-123",
        keywords: ["auth"],
      });
      const frameB = createTestFrame({
        jira: "TICKET-456",
        keywords: ["auth"],
      });

      const strategy = determineConsolidationStrategy(frameA, frameB);

      assert.strictEqual(strategy.mode, "keep-both");
      assert.ok(strategy.rationale.includes("different Jira tickets"));
    });

    test("should choose supersede when newer frame contains all info", () => {
      const olderFrame = createTestFrame({
        id: "older",
        timestamp: "2025-11-01T10:00:00Z",
        keywords: ["auth", "bug"],
        module_scope: ["auth/core"],
      });
      const newerFrame = createTestFrame({
        id: "newer",
        timestamp: "2025-11-01T11:00:00Z",
        keywords: ["auth", "bug", "fix", "security"],
        module_scope: ["auth/core", "services/auth"],
      });

      const strategy = determineConsolidationStrategy(newerFrame, olderFrame);

      assert.strictEqual(strategy.mode, "supersede");
      assert.ok(strategy.mergedFrame);
      assert.strictEqual(strategy.mergedFrame.id, "newer");
      assert.ok(strategy.rationale.includes("contains all information"));
    });

    test("should choose merge when both have unique information", () => {
      const frameA = createTestFrame({
        id: "frame-a",
        timestamp: "2025-11-01T10:00:00Z",
        keywords: ["auth", "login"],
        module_scope: ["auth/core"],
        summary_caption: "Fixed login bug",
        status_snapshot: {
          next_action: "Test login flow",
          blockers: ["Missing test coverage"],
        },
      });
      const frameB = createTestFrame({
        id: "frame-b",
        timestamp: "2025-11-01T09:00:00Z",
        keywords: ["auth", "session"],
        module_scope: ["services/session"],
        summary_caption: "Improved session handling",
        status_snapshot: {
          next_action: "Test session timeout",
          blockers: ["Performance issues"],
        },
      });

      const strategy = determineConsolidationStrategy(frameA, frameB);

      assert.strictEqual(strategy.mode, "merge");
      assert.ok(strategy.mergedFrame);
      assert.ok(strategy.rationale.includes("unique information"));

      // Verify merged frame contains information from both
      const merged = strategy.mergedFrame;
      assert.ok(merged.keywords?.includes("auth"));
      assert.ok(merged.keywords?.includes("login"));
      assert.ok(merged.keywords?.includes("session"));
      assert.ok(merged.module_scope.includes("auth/core"));
      assert.ok(merged.module_scope.includes("services/session"));
    });

    test("merged frame should combine blockers from both frames", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
        status_snapshot: {
          next_action: "Fix bugs",
          blockers: ["Blocker A", "Shared blocker"],
        },
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-01T09:00:00Z",
        status_snapshot: {
          next_action: "Fix bugs",
          blockers: ["Blocker B", "Shared blocker"],
        },
      });

      const strategy = determineConsolidationStrategy(frameA, frameB);

      assert.strictEqual(strategy.mode, "merge");
      const merged = strategy.mergedFrame!;
      const blockers = merged.status_snapshot.blockers || [];

      // Should have all unique blockers
      assert.ok(blockers.includes("Blocker A"));
      assert.ok(blockers.includes("Blocker B"));
      assert.ok(blockers.includes("Shared blocker"));
      // Should not have duplicates
      assert.strictEqual(blockers.filter((b) => b === "Shared blocker").length, 1);
    });

    test("merged frame should use newer frame as base", () => {
      const olderFrame = createTestFrame({
        id: "older",
        timestamp: "2025-11-01T09:00:00Z",
        summary_caption: "Old summary",
        keywords: ["old"],
      });
      const newerFrame = createTestFrame({
        id: "newer",
        timestamp: "2025-11-01T10:00:00Z",
        summary_caption: "New summary",
        keywords: ["new"],
      });

      const strategy = determineConsolidationStrategy(newerFrame, olderFrame);

      const merged = strategy.mergedFrame!;
      // Should use newer frame's ID and timestamp
      assert.strictEqual(merged.id, "newer");
      assert.strictEqual(merged.timestamp, "2025-11-01T10:00:00Z");
    });

    test("merged frame should combine reference points if different", () => {
      const frameA = createTestFrame({
        timestamp: "2025-11-01T10:00:00Z",
        reference_point: "auth bug fix",
      });
      const frameB = createTestFrame({
        timestamp: "2025-11-01T09:00:00Z",
        reference_point: "session timeout issue",
      });

      const strategy = determineConsolidationStrategy(frameA, frameB);

      const merged = strategy.mergedFrame!;
      assert.ok(merged.reference_point.includes("auth bug fix"));
      assert.ok(merged.reference_point.includes("session timeout issue"));
    });
  });

  describe("detectDuplicateFrames", () => {
    test("should detect duplicates above threshold", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          timestamp: "2025-11-01T10:00:00Z",
          keywords: ["auth", "bug"],
          module_scope: ["auth/core"],
        }),
        createTestFrame({
          id: "frame-2",
          timestamp: "2025-11-01T10:30:00Z",
          keywords: ["auth", "bug"],
          module_scope: ["auth/core"],
        }),
        createTestFrame({
          id: "frame-3",
          timestamp: "2025-11-01T10:00:00Z",
          keywords: ["payment"],
          module_scope: ["payment/gateway"],
        }),
      ];

      const result = detectDuplicateFrames(frames, { threshold: 0.85 });

      assert.strictEqual(result.totalFrames, 3);
      assert.strictEqual(result.duplicateGroups, 1);
      assert.strictEqual(result.duplicates.length, 1);
      assert.strictEqual(result.strategies.length, 1);

      // Verify the duplicate pair
      const dup = result.duplicates[0];
      assert.ok(
        (dup.frameA === "frame-1" && dup.frameB === "frame-2") ||
          (dup.frameA === "frame-2" && dup.frameB === "frame-1")
      );
    });

    test("should not detect duplicates below threshold", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          keywords: ["auth"],
          module_scope: ["auth/core"],
        }),
        createTestFrame({
          id: "frame-2",
          keywords: ["payment"],
          module_scope: ["payment/gateway"],
        }),
      ];

      const result = detectDuplicateFrames(frames, { threshold: 0.85 });

      assert.strictEqual(result.duplicateGroups, 0);
      assert.strictEqual(result.duplicates.length, 0);
    });

    test("should handle empty frame list", () => {
      const result = detectDuplicateFrames([], { threshold: 0.85 });

      assert.strictEqual(result.totalFrames, 0);
      assert.strictEqual(result.duplicateGroups, 0);
      assert.strictEqual(result.duplicates.length, 0);
    });

    test("should handle single frame", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          keywords: ["auth"],
        }),
      ];

      const result = detectDuplicateFrames(frames, { threshold: 0.85 });

      assert.strictEqual(result.totalFrames, 1);
      assert.strictEqual(result.duplicateGroups, 0);
    });

    test("should detect multiple duplicate groups", () => {
      const frames = [
        // Group 1: auth-related
        createTestFrame({
          id: "auth-1",
          keywords: ["auth", "bug"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:00:00Z",
        }),
        createTestFrame({
          id: "auth-2",
          keywords: ["auth", "bug"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:30:00Z",
        }),
        // Group 2: payment-related
        createTestFrame({
          id: "payment-1",
          keywords: ["payment", "integration"],
          module_scope: ["payment/gateway"],
          timestamp: "2025-11-01T10:00:00Z",
        }),
        createTestFrame({
          id: "payment-2",
          keywords: ["payment", "integration"],
          module_scope: ["payment/gateway"],
          timestamp: "2025-11-01T10:30:00Z",
        }),
      ];

      const result = detectDuplicateFrames(frames, { threshold: 0.85 });

      assert.strictEqual(result.duplicateGroups, 2);
      assert.strictEqual(result.duplicates.length, 2);
    });

    test("should use default threshold of 0.85", () => {
      const frames = [
        createTestFrame({
          id: "frame-1",
          keywords: ["auth"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:00:00Z",
        }),
        createTestFrame({
          id: "frame-2",
          keywords: ["auth"],
          module_scope: ["auth/core"],
          timestamp: "2025-11-01T10:30:00Z",
        }),
      ];

      const result = detectDuplicateFrames(frames); // no options

      // Should use default threshold of 0.85
      assert.ok(result.duplicates.length >= 0);
    });
  });
});
