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
        const frames = await store.listFrames();
        assert.ok(frames.length >= 3, "Should have at least 3 frames");
        // Verify order is descending by timestamp
        for (let i = 1; i < frames.length; i++) {
          assert.ok(
            frames[i - 1].timestamp >= frames[i].timestamp,
            "Frames should be in descending timestamp order"
          );
        }
      });

      test("should limit results when requested", async () => {
        const frames = await store.listFrames({ limit: 2 });
        assert.strictEqual(frames.length, 2, "Should return only 2 frames");
      });

      test("should support offset for pagination", async () => {
        const allFrames = await store.listFrames();
        const offsetFrames = await store.listFrames({ limit: 2, offset: 1 });

        assert.strictEqual(offsetFrames.length, 2, "Should return 2 frames");
        assert.strictEqual(offsetFrames[0].id, allFrames[1].id, "First frame should match second from full list");
      });

      test("should return empty array when offset exceeds total", async () => {
        const frames = await store.listFrames({ offset: 1000 });
        assert.strictEqual(frames.length, 0, "Should return empty array");
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
          assert.ok(
            new Date(frame.timestamp) >= since,
            "All frames should be after since date"
          );
        }
      });

      test("should filter by time range (until)", async () => {
        const until = new Date("2025-11-02T00:00:00Z");
        const frames = await store.searchFrames({ until });
        for (const frame of frames) {
          assert.ok(
            new Date(frame.timestamp) <= until,
            "All frames should be before until date"
          );
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

      await assert.rejects(
        async () => store.saveFrame(testFrame1),
        { message: "SqliteFrameStore is closed" }
      );
    });

    test("should throw after close for getFrameById", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(
        async () => store.getFrameById("frame-001"),
        { message: "SqliteFrameStore is closed" }
      );
    });

    test("should throw after close for searchFrames", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(
        async () => store.searchFrames({ query: "test" }),
        { message: "SqliteFrameStore is closed" }
      );
    });

    test("should throw after close for listFrames", async () => {
      const store = new SqliteFrameStore(":memory:");
      await store.close();

      await assert.rejects(
        async () => store.listFrames(),
        { message: "SqliteFrameStore is closed" }
      );
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

      assert.strictEqual(page1.length, 1, "Page 1 should have 1 frame");
      assert.strictEqual(page2.length, 1, "Page 2 should have 1 frame");
      assert.notStrictEqual(page1[0].id, page2[0].id, "Pages should have different frames");
    });
  });

  describe("Edge Cases", () => {
    let store: SqliteFrameStore;

    beforeEach(() => {
      store = new SqliteFrameStore(":memory:");
    });

    test("should handle empty database", async () => {
      const frames = await store.listFrames();
      assert.strictEqual(frames.length, 0, "Should return empty array");
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
});
