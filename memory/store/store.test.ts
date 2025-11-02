/**
 * Tests for Frame storage
 * 
 * Run with: node --test memory/store/store.test.ts
 * Or with tsx: npx tsx --test memory/store/store.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  saveFrame,
  getFrameById,
  searchFrames,
  getFramesByBranch,
  getFramesByJira,
  getFramesByModuleScope,
  getAllFrames,
  deleteFrame,
  getFrameCount,
  createDatabase,
} from "./index.js";
import type { Frame } from "../frames/types.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-frames-${Date.now()}.db`);

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

describe("Frame Storage Tests", () => {
  let db: ReturnType<typeof getDb>;

  before(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = getDb(TEST_DB_PATH);
  });

  after(() => {
    closeDb();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Database Initialization", () => {
    test("should create database file on first use", () => {
      assert.ok(existsSync(TEST_DB_PATH), "Database file should exist");
    });

    test("should have frames table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='frames'")
        .all();
      assert.strictEqual(tables.length, 1, "frames table should exist");
    });

    test("should have FTS5 virtual table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='frames_fts'")
        .all();
      assert.strictEqual(tables.length, 1, "frames_fts table should exist");
    });

    test("should have schema_version table for migrations", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .all();
      assert.strictEqual(tables.length, 1, "schema_version table should exist");
    });
  });

  describe("CRUD Operations", () => {
    test("should save a Frame successfully", async () => {
      await saveFrame(db, testFrame1);
      const count = await getFrameCount(db);
      assert.strictEqual(count, 1, "Frame count should be 1 after insert");
    });

    test("should retrieve Frame by ID", async () => {
      const frame = await getFrameById(db, "frame-001");
      assert.ok(frame, "Frame should be found");
      assert.strictEqual(frame!.id, testFrame1.id);
      assert.strictEqual(frame!.reference_point, testFrame1.reference_point);
      assert.deepStrictEqual(frame!.module_scope, testFrame1.module_scope);
      assert.deepStrictEqual(frame!.keywords, testFrame1.keywords);
    });

    test("should return null for non-existent Frame ID", async () => {
      const frame = await getFrameById(db, "non-existent");
      assert.strictEqual(frame, null, "Should return null for non-existent ID");
    });

    test("should update existing Frame (upsert)", async () => {
      const updatedFrame = {
        ...testFrame1,
        summary_caption: "Updated caption",
      };
      await saveFrame(db, updatedFrame);
      const frame = await getFrameById(db, "frame-001");
      assert.strictEqual(frame!.summary_caption, "Updated caption");
      const count = await getFrameCount(db);
      assert.strictEqual(count, 1, "Frame count should still be 1 after update");
    });

    test("should delete Frame by ID", async () => {
      await saveFrame(db, testFrame2);
      const deleted = await deleteFrame(db, "frame-002");
      assert.strictEqual(deleted, true, "Delete should return true");
      const frame = await getFrameById(db, "frame-002");
      assert.strictEqual(frame, null, "Frame should not exist after delete");
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
      await saveFrame(db, minimalFrame);
      const retrieved = await getFrameById(db, "frame-minimal");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.jira, undefined);
      assert.strictEqual(retrieved!.keywords, undefined);
      assert.strictEqual(retrieved!.atlas_frame_id, undefined);
      await deleteFrame(db, "frame-minimal");
    });
  });

  describe("Search and Query Operations", () => {
    before(async () => {
      // Clean slate for search tests
      const frames = await getAllFrames(db);
      for (const frame of frames) {
        await deleteFrame(db, frame.id);
      }
      // Insert test frames
      await saveFrame(db, testFrame1);
      await saveFrame(db, testFrame2);
      await saveFrame(db, testFrame3);
    });

    test("should search Frames with FTS5 (reference_point match)", async () => {
      const results = await searchFrames(db, "auth deadlock");
      assert.ok(results.length > 0, "Should find frames matching 'auth deadlock'");
      assert.ok(
        results.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    test("should search Frames with FTS5 (keywords match)", async () => {
      const results = await searchFrames(db, "payment");
      assert.ok(results.length > 0, "Should find frames matching 'payment'");
      assert.ok(
        results.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should search Frames with FTS5 (summary_caption match)", async () => {
      const results = await searchFrames(db, "Stripe");
      assert.ok(results.length > 0, "Should find frames matching 'Stripe'");
      assert.ok(
        results.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should get Frames by branch", async () => {
      const results = await getFramesByBranch(db, "feature/auth-fix");
      assert.strictEqual(results.length, 2, "Should find 2 frames on feature/auth-fix");
      assert.ok(
        results.some((f) => f.id === "frame-001"),
        "Should include frame-001"
      );
      assert.ok(
        results.some((f) => f.id === "frame-003"),
        "Should include frame-003"
      );
    });

    test("should get Frames by Jira ID", async () => {
      const results = await getFramesByJira(db, "TICKET-123");
      assert.strictEqual(results.length, 1, "Should find 1 frame for TICKET-123");
      assert.strictEqual(results[0].id, "frame-001");
    });

    test("should get Frames by module scope", async () => {
      const results = await getFramesByModuleScope(db, "services/auth-core");
      assert.ok(results.length >= 2, "Should find at least 2 frames touching services/auth-core");
      assert.ok(
        results.some((f) => f.id === "frame-001"),
        "Should include frame-001"
      );
      assert.ok(
        results.some((f) => f.id === "frame-003"),
        "Should include frame-003"
      );
    });

    test("should get all Frames in descending timestamp order", async () => {
      const results = await getAllFrames(db);
      assert.strictEqual(results.length, 3, "Should get all 3 frames");
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

    test("should limit results when requested", async () => {
      const results = await getAllFrames(db, 2);
      assert.strictEqual(results.length, 2, "Should return only 2 frames");
    });

    test("should return empty array for non-matching searches", async () => {
      const results = await searchFrames(db, "zzzznonexistent");
      assert.strictEqual(results.length, 0, "Should return empty array for no matches");
    });
  });

  describe("Concurrent Access", () => {
    test("should handle concurrent writes", async () => {
      const concurrentFrames: Frame[] = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        timestamp: new Date().toISOString(),
        branch: "test-branch",
        module_scope: ["test"],
        summary_caption: `Concurrent frame ${i}`,
        reference_point: `concurrent ${i}`,
        status_snapshot: {
          next_action: `action ${i}`,
        },
      }));

      // Save all frames concurrently
      await Promise.all(concurrentFrames.map((f) => saveFrame(db, f)));

      const count = await getFrameCount(db);
      assert.ok(count >= 10, "All concurrent frames should be saved");

      // Clean up
      for (const frame of concurrentFrames) {
        await deleteFrame(db, frame.id);
      }
    });
  });

  describe("FTS5 Fuzzy Search", () => {
    test("should support fuzzy matching with wildcards", async () => {
      const results = await searchFrames(db, "auth*");
      assert.ok(results.length > 0, "Should find frames with auth prefix");
    });

    test("should support multiple search terms", async () => {
      const results = await searchFrames(db, "auth timeout");
      assert.ok(results.length > 0, "Should find frames matching multiple terms");
    });
  });
});

// Summary message
console.log("\n✅ Frame Storage Tests - covering CRUD, FTS5 search, queries, and concurrent access\n");
