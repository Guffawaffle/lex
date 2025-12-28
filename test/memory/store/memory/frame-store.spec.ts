/**
 * Tests for MemoryFrameStore
 *
 * Run with: npm test
 * Or directly with tsx: npx tsx --test test/memory/store/memory/frame-store.spec.ts
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
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
  atlas_frame_id: "atlas-001",
  feature_flags: ["beta_user_admin"],
  permissions: ["can_manage_users"],
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
  module_scope: ["services/auth-core", "lib/crypto"],
  summary_caption: "Fixed auth token expiration bug",
  reference_point: "token expiration issue",
  status_snapshot: {
    next_action: "Deploy to staging",
  },
  keywords: ["auth", "bug-fix", "tokens"],
};

describe("MemoryFrameStore", () => {
  let store: MemoryFrameStore;

  beforeEach(() => {
    store = new MemoryFrameStore();
  });

  describe("Constructor", () => {
    test("should create empty store by default", () => {
      const emptyStore = new MemoryFrameStore();
      assert.strictEqual(emptyStore.size(), 0, "Store should be empty");
    });

    test("should pre-populate with initial frames", () => {
      const prePopulatedStore = new MemoryFrameStore([testFrame1, testFrame2]);
      assert.strictEqual(prePopulatedStore.size(), 2, "Store should have 2 frames");
    });
  });

  describe("CRUD Operations", () => {
    test("should save a Frame successfully", async () => {
      await store.saveFrame(testFrame1);
      assert.strictEqual(store.size(), 1, "Frame count should be 1 after insert");
    });

    test("should retrieve Frame by ID", async () => {
      await store.saveFrame(testFrame1);
      const frame = await store.getFrameById("frame-001");
      assert.ok(frame, "Frame should be found");
      assert.strictEqual(frame!.id, testFrame1.id);
      assert.strictEqual(frame!.reference_point, testFrame1.reference_point);
      assert.deepStrictEqual(frame!.module_scope, testFrame1.module_scope);
      assert.deepStrictEqual(frame!.keywords, testFrame1.keywords);
    });

    test("should return null for non-existent Frame ID", async () => {
      const frame = await store.getFrameById("non-existent");
      assert.strictEqual(frame, null, "Should return null for non-existent ID");
    });

    test("should update existing Frame (upsert)", async () => {
      await store.saveFrame(testFrame1);
      const updatedFrame = {
        ...testFrame1,
        summary_caption: "Updated caption",
      };
      await store.saveFrame(updatedFrame);
      const frame = await store.getFrameById("frame-001");
      assert.strictEqual(frame!.summary_caption, "Updated caption");
      assert.strictEqual(store.size(), 1, "Frame count should still be 1 after update");
    });

    test("should handle all optional fields correctly", async () => {
      const minimalFrame: Frame = {
        id: "frame-minimal",
        timestamp: "2025-11-04T12:00:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Minimal frame",
        reference_point: "minimal test",
        status_snapshot: {
          next_action: "nothing",
        },
      };
      await store.saveFrame(minimalFrame);
      const retrieved = await store.getFrameById("frame-minimal");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.jira, undefined);
      assert.strictEqual(retrieved!.keywords, undefined);
      assert.strictEqual(retrieved!.atlas_frame_id, undefined);
    });
  });

  describe("searchFrames", () => {
    beforeEach(async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
    });

    test("should find frames by query (reference_point match)", async () => {
      const results = await store.searchFrames({ query: "auth deadlock" });
      assert.ok(results.length > 0, "Should find frames matching 'auth deadlock'");
      assert.ok(
        results.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    test("should find frames by query (summary_caption match)", async () => {
      const results = await store.searchFrames({ query: "Stripe" });
      assert.ok(results.length > 0, "Should find frames matching 'Stripe'");
      assert.ok(
        results.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should be case-insensitive", async () => {
      const results = await store.searchFrames({ query: "STRIPE" });
      assert.ok(results.length > 0, "Should find frames matching 'STRIPE' (case-insensitive)");
      assert.ok(
        results.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should filter by moduleScope", async () => {
      const results = await store.searchFrames({
        moduleScope: ["services/auth-core"],
      });
      assert.strictEqual(results.length, 2, "Should find 2 frames with services/auth-core");
      assert.ok(
        results.some((f) => f.id === "frame-001"),
        "Should include frame-001"
      );
      assert.ok(
        results.some((f) => f.id === "frame-003"),
        "Should include frame-003"
      );
    });

    test("should filter by since date", async () => {
      const sinceDate = new Date("2025-11-02T00:00:00Z");
      const results = await store.searchFrames({ since: sinceDate });
      assert.strictEqual(results.length, 2, "Should find 2 frames since Nov 2");
      assert.ok(
        results.every((f) => new Date(f.timestamp).getTime() >= sinceDate.getTime()),
        "All results should be on or after since date"
      );
    });

    test("should filter by until date", async () => {
      const untilDate = new Date("2025-11-02T00:00:00Z");
      const results = await store.searchFrames({ until: untilDate });
      assert.strictEqual(results.length, 1, "Should find 1 frame until Nov 2");
      assert.ok(
        results.every((f) => new Date(f.timestamp).getTime() <= untilDate.getTime()),
        "All results should be on or before until date"
      );
    });

    test("should respect limit", async () => {
      const results = await store.searchFrames({ limit: 2 });
      assert.strictEqual(results.length, 2, "Should return only 2 frames");
    });

    test("should combine multiple criteria", async () => {
      const results = await store.searchFrames({
        query: "auth",
        moduleScope: ["services/auth-core"],
      });
      // frame-001 has "auth" in reference_point and has services/auth-core
      // frame-003 has "auth" in summary_caption and has services/auth-core
      assert.ok(results.length > 0, "Should find frames matching combined criteria");
    });

    test("should return empty array for non-matching queries", async () => {
      const results = await store.searchFrames({ query: "zzzznonexistent" });
      assert.strictEqual(results.length, 0, "Should return empty array for no matches");
    });

    test("should sort results by timestamp descending", async () => {
      const results = await store.searchFrames({});
      assert.strictEqual(results.length, 3, "Should return all 3 frames");
      // Frames should be ordered newest first
      assert.ok(
        results[0].timestamp >= results[1].timestamp,
        "Results should be in descending timestamp order"
      );
      assert.ok(
        results[1].timestamp >= results[2].timestamp,
        "Results should be in descending timestamp order"
      );
    });
  });

  describe("listFrames", () => {
    beforeEach(async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.saveFrame(testFrame3);
    });

    test("should list all frames when no options provided", async () => {
      const result = await store.listFrames();
      assert.strictEqual(result.frames.length, 3, "Should return all 3 frames");
    });

    test("should sort by timestamp descending", async () => {
      const result = await store.listFrames();
      // Frames should be ordered newest first
      assert.ok(
        result.frames[0].timestamp >= result.frames[1].timestamp,
        "Results should be in descending timestamp order"
      );
      assert.ok(
        result.frames[1].timestamp >= result.frames[2].timestamp,
        "Results should be in descending timestamp order"
      );
    });

    test("should respect limit option", async () => {
      const result = await store.listFrames({ limit: 2 });
      assert.strictEqual(result.frames.length, 2, "Should return only 2 frames");
    });

    test("should respect offset option", async () => {
      const allResult = await store.listFrames();
      const offsetResult = await store.listFrames({ offset: 1 });
      assert.strictEqual(offsetResult.frames.length, 2, "Should return 2 frames after offset");
      assert.strictEqual(
        offsetResult.frames[0].id,
        allResult.frames[1].id,
        "First offset result should match second overall result"
      );
    });

    test("should handle limit and offset together", async () => {
      const result = await store.listFrames({ limit: 1, offset: 1 });
      assert.strictEqual(result.frames.length, 1, "Should return 1 frame");
    });

    test("should handle offset larger than total", async () => {
      const result = await store.listFrames({ offset: 100 });
      assert.strictEqual(result.frames.length, 0, "Should return empty array for large offset");
    });

    test("should support cursor-based pagination", async () => {
      // Get first page
      const page1 = await store.listFrames({ limit: 2 });
      assert.strictEqual(page1.frames.length, 2, "First page should have 2 frames");
      assert.strictEqual(page1.page.hasMore, true, "Should indicate more results");
      assert.ok(page1.page.nextCursor, "Should provide next cursor");

      // Get second page using cursor
      const page2 = await store.listFrames({ limit: 2, cursor: page1.page.nextCursor! });
      assert.strictEqual(page2.frames.length, 1, "Second page should have 1 frame");

      // Ensure no duplicates between pages
      const page1Ids = new Set(page1.frames.map((f) => f.id));
      const page2Ids = new Set(page2.frames.map((f) => f.id));
      for (const id of page2Ids) {
        assert.ok(!page1Ids.has(id), `Frame ${id} should not appear in both pages`);
      }
    });

    test("should indicate hasMore=false on last page", async () => {
      const result = await store.listFrames({ limit: 10 });
      assert.strictEqual(result.page.hasMore, false, "Should indicate no more results");
      assert.strictEqual(result.page.nextCursor, null, "Should not provide next cursor");
    });
  });

  describe("close", () => {
    test("should complete without error (no-op)", async () => {
      await store.saveFrame(testFrame1);
      await assert.doesNotReject(async () => {
        await store.close();
      }, "close should not throw");
      // Store should still be usable after close (it's just a no-op)
      const frame = await store.getFrameById("frame-001");
      assert.ok(frame, "Frame should still be accessible after close");
    });
  });

  describe("clear (test helper)", () => {
    test("should remove all frames", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      assert.strictEqual(store.size(), 2, "Store should have 2 frames");
      store.clear();
      assert.strictEqual(store.size(), 0, "Store should be empty after clear");
    });
  });

  describe("Frame Schema v2: Execution Provenance Metadata", () => {
    test("should save and retrieve Frame with execution provenance", async () => {
      const frameWithProvenance: Frame = {
        id: "frame-mw-001",
        timestamp: "2025-11-09T12:00:00Z",
        branch: "feat/provenance",
        module_scope: ["core"],
        summary_caption: "Execution provenance test frame",
        reference_point: "provenance test",
        status_snapshot: {
          next_action: "Complete provenance test",
        },
        runId: "lexrunner-20251109-abc123",
        planHash: "sha256:7f8c9d1234567890abcdef",
        spend: {
          prompts: 3,
          tokens_estimated: 1500,
        },
      };

      await store.saveFrame(frameWithProvenance);
      const retrieved = await store.getFrameById("frame-mw-001");

      assert.ok(retrieved, "Frame should be retrieved");
      assert.strictEqual(retrieved!.runId, "lexrunner-20251109-abc123", "runId should match");
      assert.strictEqual(
        retrieved!.planHash,
        "sha256:7f8c9d1234567890abcdef",
        "planHash should match"
      );
      assert.ok(retrieved!.spend, "spend should be present");
      assert.strictEqual(retrieved!.spend!.prompts, 3, "spend.prompts should match");
      assert.strictEqual(
        retrieved!.spend!.tokens_estimated,
        1500,
        "spend.tokens_estimated should match"
      );
    });
  });

  describe("FrameStore interface compliance", () => {
    test("should implement all required methods", () => {
      assert.strictEqual(typeof store.saveFrame, "function", "saveFrame should be a function");
      assert.strictEqual(
        typeof store.getFrameById,
        "function",
        "getFrameById should be a function"
      );
      assert.strictEqual(
        typeof store.searchFrames,
        "function",
        "searchFrames should be a function"
      );
      assert.strictEqual(typeof store.listFrames, "function", "listFrames should be a function");
      assert.strictEqual(typeof store.close, "function", "close should be a function");
    });

    test("all methods should return Promises", async () => {
      const saveResult = store.saveFrame(testFrame1);
      assert.ok(saveResult instanceof Promise, "saveFrame should return a Promise");

      const getResult = store.getFrameById("frame-001");
      assert.ok(getResult instanceof Promise, "getFrameById should return a Promise");

      const searchResult = store.searchFrames({});
      assert.ok(searchResult instanceof Promise, "searchFrames should return a Promise");

      const listResult = store.listFrames();
      assert.ok(listResult instanceof Promise, "listFrames should return a Promise");

      const closeResult = store.close();
      assert.ok(closeResult instanceof Promise, "close should return a Promise");

      // Await all to avoid unhandled rejections
      await Promise.all([saveResult, getResult, searchResult, listResult, closeResult]);
    });
  });
});

console.log("\n✅ MemoryFrameStore Tests - In-memory FrameStore implementation for testing\n");
