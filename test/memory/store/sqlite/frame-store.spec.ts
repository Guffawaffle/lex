/**
 * SqliteFrameStore tests
 *
 * Unit tests using in-memory SQLite (`:memory:`) for speed.
 * Tests edge cases: empty results, FTS special characters, time boundary conditions.
 * Verifies close() is idempotent.
 *
 * Run with: npm test
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";
import { createDatabase } from "@app/memory/store/db.js";
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

describe("SqliteFrameStore Tests", () => {
  describe("In-Memory Database Tests", () => {
    let store: SqliteFrameStore;

    before(() => {
      store = new SqliteFrameStore(":memory:");
    });

    after(async () => {
      await store.close();
    });

    describe("Basic CRUD Operations", () => {
      test("should save and retrieve a Frame by ID", async () => {
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
        const updatedFrame = {
          ...testFrame1,
          summary_caption: "Updated caption via SqliteFrameStore",
        };
        await store.saveFrame(updatedFrame);
        const frame = await store.getFrameById("frame-001");
        assert.strictEqual(frame!.summary_caption, "Updated caption via SqliteFrameStore");
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

      test("should handle Frame with execution provenance fields", async () => {
        const frameWithProvenance: Frame = {
          id: "frame-provenance",
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
        const retrieved = await store.getFrameById("frame-provenance");

        assert.ok(retrieved, "Frame should be retrieved");
        assert.strictEqual(retrieved!.runId, "lexrunner-20251109-abc123");
        assert.strictEqual(retrieved!.planHash, "sha256:7f8c9d1234567890abcdef");
        assert.ok(retrieved!.spend);
        assert.strictEqual(retrieved!.spend!.prompts, 3);
        assert.strictEqual(retrieved!.spend!.tokens_estimated, 1500);
      });
    });

    describe("listFrames()", () => {
      before(async () => {
        // Ensure test frames are saved
        await store.saveFrame(testFrame2);
        await store.saveFrame(testFrame3);
      });

      test("should list all Frames in descending timestamp order", async () => {
        const result = await store.listFrames();
        assert.ok(result.frames.length >= 3, "Should have at least 3 frames");
        // Verify order is descending by timestamp
        for (let i = 1; i < result.frames.length; i++) {
          assert.ok(
            result.frames[i - 1].timestamp >= result.frames[i].timestamp,
            "Frames should be in descending timestamp order"
          );
        }
        // Verify metadata
        assert.strictEqual(result.order.by, "timestamp");
        assert.strictEqual(result.order.direction, "desc");
      });

      test("should limit results when requested", async () => {
        const result = await store.listFrames({ limit: 2 });
        assert.strictEqual(result.frames.length, 2, "Should return only 2 frames");
        assert.strictEqual(result.page.limit, 2);
      });

      test("should support offset for pagination", async () => {
        const allResult = await store.listFrames();
        const offsetResult = await store.listFrames({ limit: 2, offset: 1 });

        assert.strictEqual(offsetResult.frames.length, 2, "Should return 2 frames");
        assert.strictEqual(
          offsetResult.frames[0].id,
          allResult.frames[1].id,
          "First frame should match second from full list"
        );
      });

      test("should return empty array when offset exceeds total", async () => {
        const result = await store.listFrames({ offset: 1000 });
        assert.strictEqual(result.frames.length, 0, "Should return empty array");
        assert.strictEqual(result.page.hasMore, false);
      });

      test("should support cursor-based pagination", async () => {
        // Get first page
        const page1 = await store.listFrames({ limit: 2 });
        assert.strictEqual(page1.frames.length, 2, "First page should have 2 frames");
        assert.strictEqual(page1.page.hasMore, true, "Should indicate more results");
        assert.ok(page1.page.nextCursor, "Should provide next cursor");

        // Get second page using cursor
        const page2 = await store.listFrames({ limit: 2, cursor: page1.page.nextCursor! });
        assert.strictEqual(page2.frames.length, 2, "Second page should have 2 frames");

        // Ensure no duplicates between pages
        const page1Ids = new Set(page1.frames.map((f) => f.id));
        const page2Ids = new Set(page2.frames.map((f) => f.id));
        for (const id of page2Ids) {
          assert.ok(!page1Ids.has(id), `Frame ${id} should not appear in both pages`);
        }
      });

      test("should indicate hasMore=false on last page", async () => {
        // Get all frames to know total count
        const allResult = await store.listFrames();
        const totalCount = allResult.frames.length;

        // Request more than total
        const result = await store.listFrames({ limit: totalCount + 10 });
        assert.strictEqual(result.page.hasMore, false, "Should indicate no more results");
        assert.strictEqual(result.page.nextCursor, null, "Should not provide next cursor");
      });

      test("should maintain stable ordering with cursor pagination", async () => {
        // Save frames with same timestamp to test tie-breaking
        const sameTimestamp = "2025-11-05T12:00:00Z";
        await store.saveFrame({
          id: "frame-same-ts-1",
          timestamp: sameTimestamp,
          branch: "test",
          module_scope: ["test"],
          summary_caption: "Test 1",
          reference_point: "test 1",
          status_snapshot: { next_action: "test" },
        });
        await store.saveFrame({
          id: "frame-same-ts-2",
          timestamp: sameTimestamp,
          branch: "test",
          module_scope: ["test"],
          summary_caption: "Test 2",
          reference_point: "test 2",
          status_snapshot: { next_action: "test" },
        });

        // Page through results
        const page1 = await store.listFrames({ limit: 3 });
        const page2 = await store.listFrames({ limit: 3, cursor: page1.page.nextCursor! });

        // Collect all IDs
        const allIds = [...page1.frames.map((f) => f.id), ...page2.frames.map((f) => f.id)];

        // Ensure no duplicates
        const uniqueIds = new Set(allIds);
        assert.strictEqual(
          uniqueIds.size,
          allIds.length,
          "Should have no duplicate frames across pages"
        );
      });

      test("should handle invalid cursor gracefully", async () => {
        // Invalid cursor should be treated as if no cursor was provided
        const result = await store.listFrames({ limit: 2, cursor: "invalid-cursor" });
        assert.ok(result.frames.length > 0, "Should return results even with invalid cursor");
      });
    });

    describe("searchFrames()", () => {
      test("should search Frames with FTS5 (reference_point match)", async () => {
        const frames = await store.searchFrames({ query: "auth deadlock" });
        assert.ok(frames.length > 0, "Should find frames matching 'auth deadlock'");
        assert.ok(
          frames.some((f) => f.id === "frame-001"),
          "Should find frame-001"
        );
      });

      test("should search Frames with FTS5 (keywords match)", async () => {
        const frames = await store.searchFrames({ query: "payment" });
        assert.ok(frames.length > 0, "Should find frames matching 'payment'");
        assert.ok(
          frames.some((f) => f.id === "frame-002"),
          "Should find frame-002"
        );
      });

      test("should filter by moduleScope", async () => {
        const frames = await store.searchFrames({
          moduleScope: ["services/auth-core"],
        });
        assert.ok(frames.length >= 2, "Should find at least 2 frames");
        // All returned frames should contain the module
        for (const frame of frames) {
          assert.ok(
            frame.module_scope.includes("services/auth-core"),
            "All frames should include services/auth-core"
          );
        }
      });

      test("should filter by time range (since)", async () => {
        const since = new Date("2025-11-02T00:00:00Z");
        const frames = await store.searchFrames({ since });
        assert.ok(frames.length > 0, "Should find frames after since date");
        for (const frame of frames) {
          assert.ok(new Date(frame.timestamp) >= since, "All frames should be after since date");
        }
      });

      test("should filter by time range (until)", async () => {
        const until = new Date("2025-11-02T00:00:00Z");
        const frames = await store.searchFrames({ until });
        for (const frame of frames) {
          assert.ok(new Date(frame.timestamp) <= until, "All frames should be before until date");
        }
      });

      test("should combine query with time range", async () => {
        const since = new Date("2025-11-01T00:00:00Z");
        const until = new Date("2025-11-02T00:00:00Z");
        const frames = await store.searchFrames({
          query: "auth",
          since,
          until,
        });
        for (const frame of frames) {
          const ts = new Date(frame.timestamp);
          assert.ok(ts >= since && ts <= until, "Frame should be within time range");
        }
      });

      test("should respect limit", async () => {
        const frames = await store.searchFrames({ limit: 1 });
        assert.ok(frames.length <= 1, "Should return at most 1 frame");
      });

      test("should return empty array for non-matching searches", async () => {
        const frames = await store.searchFrames({ query: "zzzznonexistent" });
        assert.strictEqual(frames.length, 0, "Should return empty array for no matches");
      });
    });

    describe("FTS5 Special Character Handling", () => {
      test("should handle period (.) without throwing error", async () => {
        const frames = await store.searchFrames({ query: "0.3.0" });
        assert.ok(Array.isArray(frames), "Should return an array");
      });

      test("should handle colon (:) without throwing error", async () => {
        const frames = await store.searchFrames({ query: "TICKET-123:" });
        assert.ok(Array.isArray(frames), "Should return an array");
      });

      test("should handle asterisk at start without throwing error", async () => {
        const frames = await store.searchFrames({ query: "*test" });
        assert.ok(Array.isArray(frames), "Should return an array");
      });

      test("should handle hyphen (-) at start without throwing error", async () => {
        const frames = await store.searchFrames({ query: "-test" });
        assert.ok(Array.isArray(frames), "Should return an array");
      });
    });
  });

  describe("close() Behavior", () => {
    test("should be idempotent - safe to call multiple times", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);

      // Close multiple times - should not throw
      await store.close();
      await store.close();
      await store.close();
    });

    test("should throw after close for saveFrame", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(async () => store.saveFrame(testFrame1), {
        message: "SqliteFrameStore is closed",
      });
    });

    test("should throw after close for getFrameById", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(async () => store.getFrameById("frame-001"), {
        message: "SqliteFrameStore is closed",
      });
    });

    test("should throw after close for searchFrames", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(async () => store.searchFrames({ query: "test" }), {
        message: "SqliteFrameStore is closed",
      });
    });

    test("should throw after close for listFrames", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(async () => store.listFrames(), {
        message: "SqliteFrameStore is closed",
      });
    });
  });

  describe("Connection Ownership", () => {
    test("should close connection when store owns it (path)", async () => {
      const dbPath = join(tmpdir(), `test-sqlite-store-${Date.now()}.db`);
      const store = new SqliteFrameStore(dbPath);

      await store.saveFrame(testFrame1);
      await store.close();

      // Clean up
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    });

    test("should not close connection when caller owns it (Database)", async () => {
      const db = createDatabase(":memory:");
      const store = new SqliteFrameStore(db);

      await store.saveFrame(testFrame1);
      await store.close();

      // Database should still be usable
      const stmt = db.prepare("SELECT COUNT(*) as count FROM frames");
      const result = stmt.get() as { count: number };
      assert.strictEqual(result.count, 1, "Database should still have the frame");

      db.close();
    });
  });

  describe("File-Based SQLite Integration Test", () => {
    const TEST_DB_PATH = join(tmpdir(), `test-sqlite-frame-store-${Date.now()}.db`);
    let store: SqliteFrameStore;

    before(() => {
      // Clean up any existing test database
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
      }
      store = new SqliteFrameStore(TEST_DB_PATH);
    });

    after(async () => {
      await store.close();
      // Clean up test database
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
      }
    });

    test("should persist frames to file", async () => {
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);

      const frame = await store.getFrameById("frame-001");
      assert.ok(frame, "Frame should be persisted to file");
      assert.strictEqual(frame!.id, testFrame1.id);
    });

    test("should support search on file-based database", async () => {
      const frames = await store.searchFrames({ query: "payment" });
      assert.ok(frames.length > 0, "Should find frames");
      assert.ok(
        frames.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should support pagination on file-based database", async () => {
      const page1 = await store.listFrames({ limit: 1 });
      const page2 = await store.listFrames({ limit: 1, offset: 1 });

      assert.strictEqual(page1.frames.length, 1, "Page 1 should have 1 frame");
      assert.strictEqual(page2.frames.length, 1, "Page 2 should have 1 frame");
      assert.notStrictEqual(
        page1.frames[0].id,
        page2.frames[0].id,
        "Pages should have different frames"
      );
    });
  });

  describe("Edge Cases", () => {
    let store: SqliteFrameStore;

    beforeEach(() => {
      store = new SqliteFrameStore(":memory:");
    });

    test("should handle empty database", async () => {
      const result = await store.listFrames();
      assert.strictEqual(result.frames.length, 0, "Should return empty array");
      await store.close();
    });

    test("should handle search on empty database", async () => {
      const frames = await store.searchFrames({ query: "anything" });
      assert.strictEqual(frames.length, 0, "Should return empty array");
      await store.close();
    });

    test("should handle moduleScope filter with no matches", async () => {
      await store.saveFrame(testFrame1);
      const frames = await store.searchFrames({
        moduleScope: ["nonexistent/module"],
      });
      assert.strictEqual(frames.length, 0, "Should return empty array");
      await store.close();
    });

    test("should handle time range with no matches", async () => {
      await store.saveFrame(testFrame1);
      const frames = await store.searchFrames({
        since: new Date("2030-01-01"),
      });
      assert.strictEqual(frames.length, 0, "Should return empty array");
      await store.close();
    });
  });

  describe("deleteFrame", () => {
    test("should delete an existing Frame and return true", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      const result = await store.deleteFrame("frame-001");
      assert.strictEqual(result, true, "Should return true for deleted frame");
      const frame = await store.getFrameById("frame-001");
      assert.strictEqual(frame, null, "Frame should no longer exist");
      await store.close();
    });

    test("should return false for non-existent Frame ID", async () => {
      const store = new SqliteFrameStore(":memory:");
      const result = await store.deleteFrame("non-existent");
      assert.strictEqual(result, false, "Should return false for non-existent ID");
      await store.close();
    });

    test("should not affect other Frames when deleting", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.deleteFrame("frame-001");
      const remaining = await store.getFrameById("frame-002");
      assert.ok(remaining, "Other frame should still exist");
      assert.strictEqual(remaining!.id, "frame-002");
      await store.close();
    });

    test("should throw if store is closed", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();
      await assert.rejects(
        () => store.deleteFrame("frame-001"),
        /closed/,
        "Should throw when store is closed"
      );
    });
  });

  describe("getFrameCount", () => {
    test("should return 0 for empty store", async () => {
      const store = new SqliteFrameStore(":memory:");
      const count = await store.getFrameCount();
      assert.strictEqual(count, 0, "Empty store should have count 0");
      await store.close();
    });

    test("should return correct count after inserts", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      const count = await store.getFrameCount();
      assert.strictEqual(count, 2, "Should count 2 frames");
      await store.close();
    });

    test("should return correct count after delete", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      await store.saveFrame(testFrame2);
      await store.deleteFrame("frame-001");
      const count = await store.getFrameCount();
      assert.strictEqual(count, 1, "Should count 1 frame after deletion");
      await store.close();
    });

    test("should throw if store is closed", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();
      await assert.rejects(
        () => store.getFrameCount(),
        /closed/,
        "Should throw when store is closed"
      );
    });
  });

  describe("userId filtering", () => {
    let store: SqliteFrameStore;

    const userAFrame1: Frame = {
      ...testFrame1,
      id: "user-a-frame-1",
      userId: "user-alice",
      summary_caption: "Alice auth work",
      reference_point: "alice auth task",
    };

    const userAFrame2: Frame = {
      ...testFrame2,
      id: "user-a-frame-2",
      userId: "user-alice",
      summary_caption: "Alice payment work",
      reference_point: "alice payment task",
    };

    const userBFrame1: Frame = {
      ...testFrame1,
      id: "user-b-frame-1",
      userId: "user-bob",
      summary_caption: "Bob auth work",
      reference_point: "bob auth task",
    };

    const noUserFrame: Frame = {
      ...testFrame3,
      id: "no-user-frame",
      userId: undefined,
      summary_caption: "Legacy frame no user",
      reference_point: "legacy task",
    };

    before(async () => {
      store = new SqliteFrameStore(":memory:");
      await store.saveFrame(userAFrame1);
      await store.saveFrame(userAFrame2);
      await store.saveFrame(userBFrame1);
      await store.saveFrame(noUserFrame);
    });

    after(async () => {
      await store.close();
    });

    test("searchFrames with userId returns only that user's frames", async () => {
      const results = await store.searchFrames({ userId: "user-alice" });
      assert.strictEqual(results.length, 2, "Should return 2 frames for Alice");
      assert.ok(
        results.every((f) => f.userId === "user-alice"),
        "All frames should belong to Alice"
      );
    });

    test("searchFrames with userId + query narrows results", async () => {
      const results = await store.searchFrames({ userId: "user-alice", query: "auth" });
      assert.strictEqual(results.length, 1, "Should return 1 frame for Alice matching 'auth'");
      assert.strictEqual(results[0].id, "user-a-frame-1");
    });

    test("searchFrames without userId returns all frames", async () => {
      const results = await store.searchFrames({});
      assert.strictEqual(results.length, 4, "Should return all 4 frames when no userId filter");
    });

    test("searchFrames with non-existent userId returns empty", async () => {
      const results = await store.searchFrames({ userId: "user-nonexistent" });
      assert.strictEqual(results.length, 0, "Should return 0 frames for non-existent user");
    });

    test("listFrames with userId returns only that user's frames", async () => {
      const result = await store.listFrames({ userId: "user-alice" });
      assert.strictEqual(result.frames.length, 2, "Should list 2 frames for Alice");
      assert.ok(
        result.frames.every((f) => f.userId === "user-alice"),
        "All listed frames should belong to Alice"
      );
    });

    test("listFrames with userId + limit paginates correctly", async () => {
      const result = await store.listFrames({ userId: "user-alice", limit: 1 });
      assert.strictEqual(result.frames.length, 1, "Should return 1 frame");
      assert.strictEqual(result.page.hasMore, true, "Should indicate more results");
      assert.ok(result.page.nextCursor, "Should provide a cursor");

      // Fetch next page
      const result2 = await store.listFrames({
        userId: "user-alice",
        cursor: result.page.nextCursor!,
      });
      assert.strictEqual(result2.frames.length, 1, "Second page should return 1 frame");
      assert.strictEqual(result2.page.hasMore, false, "No more results after second page");
    });

    test("listFrames without userId returns all frames", async () => {
      const result = await store.listFrames({});
      assert.strictEqual(result.frames.length, 4, "Should list all 4 frames when no userId filter");
    });

    test("listFrames with non-existent userId returns empty", async () => {
      const result = await store.listFrames({ userId: "user-nonexistent" });
      assert.strictEqual(result.frames.length, 0, "Should list 0 frames for non-existent user");
      assert.strictEqual(result.page.hasMore, false);
    });
  });

  describe("deleteFramesBefore", () => {
    test("should delete frames older than given date", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1); // Nov 1
      await store.saveFrame(testFrame2); // Nov 2
      await store.saveFrame(testFrame3); // Nov 3

      // Delete frames before Nov 2 (should delete frame1)
      const deleted = await store.deleteFramesBefore(new Date("2025-11-02T00:00:00Z"));
      assert.strictEqual(deleted, 1, "Should delete 1 frame");

      const remaining = await store.getFrameCount();
      assert.strictEqual(remaining, 2, "Should have 2 frames remaining");

      const gone = await store.getFrameById("frame-001");
      assert.strictEqual(gone, null, "Deleted frame should not be found");
      await store.close();
    });

    test("should return 0 when no frames match", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      const deleted = await store.deleteFramesBefore(new Date("2020-01-01T00:00:00Z"));
      assert.strictEqual(deleted, 0, "Should delete 0 frames");
      await store.close();
    });

    test("should throw if store is closed", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();
      await assert.rejects(
        () => store.deleteFramesBefore(new Date()),
        /closed/,
        "Should throw when store is closed"
      );
    });
  });

  describe("deleteFramesByBranch", () => {
    test("should delete all frames for a branch", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1); // feature/auth-fix
      await store.saveFrame(testFrame2); // feature/payment-integration
      await store.saveFrame(testFrame3); // feature/auth-fix

      const deleted = await store.deleteFramesByBranch("feature/auth-fix");
      assert.strictEqual(deleted, 2, "Should delete 2 frames from auth-fix branch");

      const remaining = await store.getFrameCount();
      assert.strictEqual(remaining, 1, "Should have 1 frame remaining");

      const kept = await store.getFrameById("frame-002");
      assert.ok(kept, "Payment frame should still exist");
      await store.close();
    });

    test("should return 0 for non-existent branch", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      const deleted = await store.deleteFramesByBranch("nonexistent/branch");
      assert.strictEqual(deleted, 0);
      await store.close();
    });

    test("should throw if store is closed", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();
      await assert.rejects(
        () => store.deleteFramesByBranch("main"),
        /closed/,
        "Should throw when store is closed"
      );
    });
  });

  describe("deleteFramesByModule", () => {
    test("should delete all frames containing a module", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1); // ["ui/user-admin-panel", "services/auth-core"]
      await store.saveFrame(testFrame2); // ["services/payment-gateway", "ui/checkout"]
      await store.saveFrame(testFrame3); // ["services/auth-core", "lib/crypto"]

      const deleted = await store.deleteFramesByModule("services/auth-core");
      assert.strictEqual(deleted, 2, "Should delete 2 frames containing services/auth-core");

      const remaining = await store.getFrameCount();
      assert.strictEqual(remaining, 1, "Should have 1 frame remaining");

      const kept = await store.getFrameById("frame-002");
      assert.ok(kept, "Payment frame should still exist");
      await store.close();
    });

    test("should return 0 for non-existent module", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.saveFrame(testFrame1);
      const deleted = await store.deleteFramesByModule("nonexistent/module");
      assert.strictEqual(deleted, 0);
      await store.close();
    });

    test("should throw if store is closed", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();
      await assert.rejects(
        () => store.deleteFramesByModule("services/auth-core"),
        /closed/,
        "Should throw when store is closed"
      );
    });
  });
});
