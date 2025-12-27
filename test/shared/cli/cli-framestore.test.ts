/**
 * CLI Commands with FrameStore Dependency Injection Tests
 *
 * Tests for CLI commands using MemoryFrameStore for isolation.
 * Verifies that dependency injection works correctly and commands
 * function properly with both SqliteFrameStore and MemoryFrameStore.
 *
 * Run with: npm test
 */

import "../../../test/helpers/setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import { createFrameStore } from "@app/memory/store/index.js";
import type { Frame } from "@app/memory/frames/types.js";

// Sample test frames
const testFrame1: Frame = {
  id: "frame-001",
  timestamp: "2025-11-01T16:04:12-05:00",
  branch: "feature/auth-fix",
  jira: "TICKET-123",
  module_scope: ["ui/user-admin-panel", "services/auth-core"],
  summary_caption: "Auth handshake timeout; Add User button disabled",
  reference_point: "that auth deadlock",
  status_snapshot: {
    next_action: "Reroute user-admin-panel to call user-access-api",
    merge_blockers: ["Direct call to auth-core forbidden by policy"],
  },
  keywords: ["auth", "timeout", "policy-violation"],
};

const testFrame2: Frame = {
  id: "frame-002",
  timestamp: "2025-11-02T10:30:00-05:00",
  branch: "feature/payment-integration",
  jira: "TICKET-456",
  module_scope: ["services/payment-gateway", "ui/checkout"],
  summary_caption: "Payment gateway integration with Stripe",
  reference_point: "stripe webhook handler",
  status_snapshot: {
    next_action: "Add webhook signature verification",
    blockers: ["Missing Stripe API keys in env"],
  },
  keywords: ["payment", "stripe", "webhook"],
};

const testFrame3: Frame = {
  id: "frame-003",
  timestamp: "2025-11-03T14:15:00-05:00",
  branch: "feature/auth-fix",
  jira: "TICKET-123",
  module_scope: ["services/auth-core", "lib/crypto"],
  summary_caption: "Fixed auth token expiration bug",
  reference_point: "token expiration issue",
  status_snapshot: {
    next_action: "Deploy to staging",
  },
  keywords: ["auth", "bug-fix", "tokens"],
};

describe("CLI Commands with FrameStore Dependency Injection", () => {
  describe("createFrameStore Factory", () => {
    test("should create a SqliteFrameStore by default", async () => {
      // Use in-memory SQLite for test
      const store = createFrameStore(":memory:");
      
      // Verify store is functional
      await store.saveFrame(testFrame1);
      const retrieved = await store.getFrameById("frame-001");
      
      assert.ok(retrieved, "Should retrieve saved frame");
      assert.strictEqual(retrieved!.id, "frame-001");
      
      await store.close();
    });

    test("should accept custom database path", async () => {
      const tempPath = ":memory:";
      const store = createFrameStore(tempPath);
      
      // Verify store is functional with custom path
      await store.saveFrame(testFrame1);
      const result = await store.listFrames(); const frames = result.frames;
      
      assert.strictEqual(frames.length, 1);
      
      await store.close();
    });
  });

  describe("MemoryFrameStore as CLI Store", () => {
    let store: MemoryFrameStore;

    beforeEach(() => {
      store = new MemoryFrameStore();
    });

    test("should support saveFrame for remember command", async () => {
      // Simulate what remember command does
      const newFrame: Frame = {
        id: "frame-new",
        timestamp: new Date().toISOString(),
        branch: "test-branch",
        module_scope: ["test/module"],
        summary_caption: "Test summary",
        reference_point: "test reference",
        status_snapshot: {
          next_action: "Test next action",
        },
      };

      await store.saveFrame(newFrame);
      
      const retrieved = await store.getFrameById("frame-new");
      assert.ok(retrieved, "Frame should be saved and retrievable");
      assert.strictEqual(retrieved!.summary_caption, "Test summary");
    });

    test("should support getFrameById for recall command", async () => {
      await store.saveFrame(testFrame1);
      
      // Simulate recall by ID
      const frame = await store.getFrameById("frame-001");
      
      assert.ok(frame, "Should find frame by ID");
      assert.strictEqual(frame!.reference_point, "that auth deadlock");
    });

    test("should support searchFrames for recall command", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      
      // Simulate recall by search query
      const results = await store.searchFrames({ query: "auth" });
      
      assert.ok(results.length > 0, "Should find frames matching query");
      assert.ok(
        results.some(f => f.id === "frame-001"),
        "Should include frame with 'auth' in reference_point"
      );
    });

    test("should support listFrames for timeline command", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
      
      // Simulate timeline filtering by Jira
      const result = await store.listFrames();
      const allFrames = result.frames;
      const framesByJira = allFrames.filter(f => f.jira === "TICKET-123");
      
      assert.strictEqual(framesByJira.length, 2, "Should find 2 frames for TICKET-123");
      assert.ok(
        framesByJira.every(f => f.jira === "TICKET-123"),
        "All filtered frames should have the same Jira ID"
      );
    });

    test("should support listFrames filtering by branch for timeline command", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
      
      // Simulate timeline filtering by branch
      const result = await store.listFrames();
      const allFrames = result.frames;
      const framesByBranch = allFrames.filter(f => f.branch === "feature/auth-fix");
      
      assert.strictEqual(framesByBranch.length, 2, "Should find 2 frames for feature/auth-fix branch");
    });

    test("should support listFrames for export command", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
      
      // Simulate export - get all frames
      const result = await store.listFrames(); const frames = result.frames;
      
      assert.strictEqual(frames.length, 3, "Should export all 3 frames");
      
      // Verify frames are returned in descending timestamp order
      assert.ok(
        frames[0].timestamp >= frames[1].timestamp,
        "Frames should be in descending order"
      );
    });

    test("should support searchFrames with since filter for export command", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
      
      // Simulate export with since filter
      const since = new Date("2025-11-02T00:00:00Z");
      const frames = await store.searchFrames({ since });
      
      assert.strictEqual(frames.length, 2, "Should find 2 frames since Nov 2");
      assert.ok(
        frames.every(f => new Date(f.timestamp).getTime() >= since.getTime()),
        "All frames should be on or after since date"
      );
    });

    test("should support close without error", async () => {
      await store.saveFrame(testFrame1);
      
      // close() should be a no-op for MemoryFrameStore
      await assert.doesNotReject(async () => {
        await store.close();
      }, "close should not throw");
    });
  });

  describe("Store Isolation", () => {
    test("MemoryFrameStore instances should be isolated", async () => {
      const store1 = new MemoryFrameStore();
      const store2 = new MemoryFrameStore();
      
      await store1.saveFrame(testFrame1);
      await store2.saveFrame(testFrame2);
      
      const result1 = await store1.listFrames();
      const result2 = await store2.listFrames();
      const store1Frames = result1.frames;
      const store2Frames = result2.frames;
      
      assert.strictEqual(store1Frames.length, 1, "Store 1 should have 1 frame");
      assert.strictEqual(store2Frames.length, 1, "Store 2 should have 1 frame");
      assert.strictEqual(store1Frames[0].id, "frame-001", "Store 1 should have frame-001");
      assert.strictEqual(store2Frames[0].id, "frame-002", "Store 2 should have frame-002");
    });

    test("Pre-populated MemoryFrameStore should work correctly", async () => {
      const prePopulatedStore = new MemoryFrameStore([testFrame1, testFrame2]);
      
      const result = await prePopulatedStore.listFrames();
      const frames = result.frames;
      assert.strictEqual(frames.length, 2, "Pre-populated store should have 2 frames");
      
      const frame1 = await prePopulatedStore.getFrameById("frame-001");
      assert.ok(frame1, "Should find pre-populated frame-001");
    });
  });

  describe("FrameStore Interface Compliance", () => {
    test("MemoryFrameStore should implement all required FrameStore methods", async () => {
      const store = new MemoryFrameStore();
      
      // Verify all required methods exist
      assert.strictEqual(typeof store.saveFrame, "function");
      assert.strictEqual(typeof store.saveFrames, "function");
      assert.strictEqual(typeof store.getFrameById, "function");
      assert.strictEqual(typeof store.searchFrames, "function");
      assert.strictEqual(typeof store.listFrames, "function");
      assert.strictEqual(typeof store.close, "function");
    });

    test("saveFrames should work with MemoryFrameStore", async () => {
      const store = new MemoryFrameStore();
      
      const results = await store.saveFrames([testFrame1, testFrame2, testFrame3]);
      
      assert.strictEqual(results.length, 3, "Should return 3 results");
      assert.ok(results.every(r => r.success), "All saves should succeed");
      
      const result = await store.listFrames(); const frames = result.frames;
      assert.strictEqual(frames.length, 3, "Store should have 3 frames");
    });
  });

  describe("recall --list functionality", () => {
    let store: MemoryFrameStore;

    beforeEach(() => {
      store = new MemoryFrameStore();
    });

    test("should list frames with default limit", async () => {
      // Add multiple frames
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);

      // List with default limit
      const result = await store.listFrames({ limit: 10 }); const frames = result.frames;
      
      assert.strictEqual(frames.length, 3, "Should return all 3 frames when limit is 10");
    });

    test("should list frames with custom limit", async () => {
      // Add multiple frames
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);

      // List with limit of 2
      const result = await store.listFrames({ limit: 2 }); const frames = result.frames;
      
      assert.strictEqual(frames.length, 2, "Should return only 2 frames");
    });

    test("should return frames in descending timestamp order", async () => {
      await store.saveFrame(testFrame1); // 2025-11-01
      await store.saveFrame(testFrame2); // 2025-11-02
      await store.saveFrame(testFrame3); // 2025-11-03

      const result = await store.listFrames({ limit: 10 }); const frames = result.frames;
      
      assert.strictEqual(frames.length, 3, "Should return all frames");
      // Most recent first
      assert.strictEqual(frames[0].id, "frame-003", "Most recent frame should be first");
      assert.strictEqual(frames[1].id, "frame-002", "Second most recent frame should be second");
      assert.strictEqual(frames[2].id, "frame-001", "Oldest frame should be last");
    });

    test("should return empty array when no frames exist", async () => {
      const result = await store.listFrames({ limit: 10 }); const frames = result.frames;
      
      assert.strictEqual(frames.length, 0, "Should return empty array when no frames exist");
    });

    test("should handle limit of 1", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);

      const result = await store.listFrames({ limit: 1 }); const frames = result.frames;
      
      assert.strictEqual(frames.length, 1, "Should return exactly 1 frame");
      assert.strictEqual(frames[0].id, "frame-003", "Should return the most recent frame");
    });
  });
});
