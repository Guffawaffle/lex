/**
 * Tests for Frame storage
 *
 * Run with: npm test
 * Or directly with tsx: npx tsx --test store.test.ts
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
} from \"@app/memory/store/index.js\";
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
      saveFrame(db, testFrame1);
      const count = getFrameCount(db);
      assert.strictEqual(count, 1, "Frame count should be 1 after insert");
    });

    test("should retrieve Frame by ID", async () => {
      const frame = getFrameById(db, "frame-001");
      assert.ok(frame, "Frame should be found");
      assert.strictEqual(frame!.id, testFrame1.id);
      assert.strictEqual(frame!.reference_point, testFrame1.reference_point);
      assert.deepStrictEqual(frame!.module_scope, testFrame1.module_scope);
      assert.deepStrictEqual(frame!.keywords, testFrame1.keywords);
    });

    test("should return null for non-existent Frame ID", async () => {
      const frame = getFrameById(db, "non-existent");
      assert.strictEqual(frame, null, "Should return null for non-existent ID");
    });

    test("should update existing Frame (upsert)", async () => {
      const updatedFrame = {
        ...testFrame1,
        summary_caption: "Updated caption",
      };
      saveFrame(db, updatedFrame);
      const frame = getFrameById(db, "frame-001");
      assert.strictEqual(frame!.summary_caption, "Updated caption");
      const count = getFrameCount(db);
      assert.strictEqual(count, 1, "Frame count should still be 1 after update");
    });

    test("should delete Frame by ID", async () => {
      saveFrame(db, testFrame2);
      const deleted = deleteFrame(db, "frame-002");
      assert.strictEqual(deleted, true, "Delete should return true");
      const frame = getFrameById(db, "frame-002");
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
      saveFrame(db, minimalFrame);
      const retrieved = getFrameById(db, "frame-minimal");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.jira, undefined);
      assert.strictEqual(retrieved!.keywords, undefined);
      assert.strictEqual(retrieved!.atlas_frame_id, undefined);
      deleteFrame(db, "frame-minimal");
    });
  });

  describe("Search and Query Operations", () => {
    before(async () => {
      // Clean slate for search tests
      const frames = getAllFrames(db);
      for (const frame of frames) {
        deleteFrame(db, frame.id);
      }
      // Insert test frames
      saveFrame(db, testFrame1);
      saveFrame(db, testFrame2);
      saveFrame(db, testFrame3);
    });

    test("should search Frames with FTS5 (reference_point match)", async () => {
      const result = searchFrames(db, "auth deadlock");
      assert.ok(result.frames.length > 0, "Should find frames matching 'auth deadlock'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    test("should search Frames with FTS5 (keywords match)", async () => {
      const result = searchFrames(db, "payment");
      assert.ok(result.frames.length > 0, "Should find frames matching 'payment'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should search Frames with FTS5 (summary_caption match)", async () => {
      const result = searchFrames(db, "Stripe");
      assert.ok(result.frames.length > 0, "Should find frames matching 'Stripe'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    test("should get Frames by branch", async () => {
      const results = getFramesByBranch(db, "feature/auth-fix");
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
      const results = getFramesByJira(db, "TICKET-123");
      assert.strictEqual(results.length, 1, "Should find 1 frame for TICKET-123");
      assert.strictEqual(results[0].id, "frame-001");
    });

    test("should get Frames by module scope", async () => {
      const results = getFramesByModuleScope(db, "services/auth-core");
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
      const results = getAllFrames(db);
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
      const results = getAllFrames(db, 2);
      assert.strictEqual(results.length, 2, "Should return only 2 frames");
    });

    test("should return empty array for non-matching searches", async () => {
      const result = searchFrames(db, "zzzznonexistent");
      assert.strictEqual(result.frames.length, 0, "Should return empty array for no matches");
      assert.strictEqual(
        result.hint,
        undefined,
        "Should not have hint for normal non-matching search"
      );
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

      const count = getFrameCount(db);
      assert.ok(count >= 10, "All concurrent frames should be saved");

      // Clean up
      for (const frame of concurrentFrames) {
        deleteFrame(db, frame.id);
      }
    });
  });

  describe("FTS5 Fuzzy Search", () => {
    test("should support fuzzy matching with wildcards", async () => {
      const result = searchFrames(db, "auth*");
      assert.ok(result.frames.length > 0, "Should find frames with auth prefix");
    });

    test("should support multiple search terms", async () => {
      const result = searchFrames(db, "auth timeout");
      assert.ok(result.frames.length > 0, "Should find frames matching multiple terms");
    });
  });

  describe("FTS5 Special Character Handling", () => {
    test("should handle period (.) without throwing error", async () => {
      const result = searchFrames(db, "0.3.0");
      assert.strictEqual(result.frames.length, 0, "Should return empty results");
      assert.ok(result.hint, "Should provide a hint");
      assert.ok(
        result.hint.includes("special characters"),
        "Hint should mention special characters"
      );
    });

    test("should handle colon (:) without throwing error", async () => {
      const result = searchFrames(db, "TICKET-123:");
      assert.strictEqual(result.frames.length, 0, "Should return empty results");
      assert.ok(result.hint, "Should provide a hint");
    });

    test("should handle asterisk at start without throwing error", async () => {
      const result = searchFrames(db, "*test");
      assert.strictEqual(result.frames.length, 0, "Should return empty results");
      assert.ok(result.hint, "Should provide a hint");
    });

    test("should handle hyphen (-) at start without throwing error", async () => {
      const result = searchFrames(db, "-test");
      assert.strictEqual(result.frames.length, 0, "Should return empty results");
      assert.ok(result.hint, "Should provide a hint");
    });

    test("should suggest simplified query in hint", async () => {
      const result = searchFrames(db, "v0.3.0 release");
      assert.strictEqual(result.frames.length, 0, "Should return empty results");
      assert.ok(result.hint, "Should provide a hint");
      assert.ok(
        result.hint.includes("v0 3 0 release") || result.hint.includes("release"),
        "Hint should suggest simplified query"
      );
    });
  });

  describe("Frame Schema v2: Merge-Weave Metadata", () => {
    test("should save and retrieve Frame with merge-weave metadata", async () => {
      const frameWithMergeWeave: Frame = {
        id: "frame-mw-001",
        timestamp: "2025-11-09T12:00:00Z",
        branch: "feat/merge-weave",
        module_scope: ["core"],
        summary_caption: "Merge-weave test frame",
        reference_point: "merge weave test",
        status_snapshot: {
          next_action: "Complete merge-weave",
        },
        runId: "lexrunner-20251109-abc123",
        planHash: "sha256:7f8c9d1234567890abcdef",
        spend: {
          prompts: 3,
          tokens_estimated: 1500,
        },
      };

      saveFrame(db, frameWithMergeWeave);
      const retrieved = getFrameById(db, "frame-mw-001");

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

      deleteFrame(db, "frame-mw-001");
    });

    test("should handle partial merge-weave metadata", async () => {
      const framePartial: Frame = {
        id: "frame-mw-002",
        timestamp: "2025-11-09T12:10:00Z",
        branch: "feat/merge-weave",
        module_scope: ["core"],
        summary_caption: "Partial merge-weave metadata",
        reference_point: "partial test",
        status_snapshot: {
          next_action: "Test partial fields",
        },
        runId: "lexrunner-20251109-def456",
        // planHash and spend are omitted
      };

      saveFrame(db, framePartial);
      const retrieved = getFrameById(db, "frame-mw-002");

      assert.ok(retrieved, "Frame should be retrieved");
      assert.strictEqual(retrieved!.runId, "lexrunner-20251109-def456", "runId should match");
      assert.strictEqual(retrieved!.planHash, undefined, "planHash should be undefined");
      assert.strictEqual(retrieved!.spend, undefined, "spend should be undefined");

      deleteFrame(db, "frame-mw-002");
    });

    test("should handle spend with only one field", async () => {
      const framePartialSpend: Frame = {
        id: "frame-mw-003",
        timestamp: "2025-11-09T12:20:00Z",
        branch: "feat/merge-weave",
        module_scope: ["core"],
        summary_caption: "Partial spend metadata",
        reference_point: "partial spend",
        status_snapshot: {
          next_action: "Test partial spend",
        },
        spend: {
          prompts: 5,
          // tokens_estimated is omitted
        },
      };

      saveFrame(db, framePartialSpend);
      const retrieved = getFrameById(db, "frame-mw-003");

      assert.ok(retrieved, "Frame should be retrieved");
      assert.ok(retrieved!.spend, "spend should be present");
      assert.strictEqual(retrieved!.spend!.prompts, 5, "spend.prompts should match");
      assert.strictEqual(
        retrieved!.spend!.tokens_estimated,
        undefined,
        "spend.tokens_estimated should be undefined"
      );

      deleteFrame(db, "frame-mw-003");
    });

    test("should maintain backward compatibility with legacy frames", async () => {
      const legacyFrame: Frame = {
        id: "frame-legacy-001",
        timestamp: "2025-11-09T12:30:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Legacy frame without v2 fields",
        reference_point: "legacy test",
        status_snapshot: {
          next_action: "Test backward compatibility",
        },
        // No merge-weave fields
      };

      saveFrame(db, legacyFrame);
      const retrieved = getFrameById(db, "frame-legacy-001");

      assert.ok(retrieved, "Legacy frame should be retrieved");
      assert.strictEqual(retrieved!.id, "frame-legacy-001", "id should match");
      assert.strictEqual(retrieved!.runId, undefined, "runId should be undefined for legacy frame");
      assert.strictEqual(
        retrieved!.planHash,
        undefined,
        "planHash should be undefined for legacy frame"
      );
      assert.strictEqual(retrieved!.spend, undefined, "spend should be undefined for legacy frame");

      deleteFrame(db, "frame-legacy-001");
    });

    test("should allow updating frame from v1 to v2", async () => {
      const v1Frame: Frame = {
        id: "frame-upgrade-001",
        timestamp: "2025-11-09T12:40:00Z",
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Frame to upgrade",
        reference_point: "upgrade test",
        status_snapshot: {
          next_action: "Upgrade to v2",
        },
      };

      saveFrame(db, v1Frame);
      let retrieved = getFrameById(db, "frame-upgrade-001");
      assert.strictEqual(retrieved!.runId, undefined, "Should start without runId");

      // Update with v2 fields
      const v2Frame: Frame = {
        ...v1Frame,
        runId: "lexrunner-20251109-ghi789",
        planHash: "sha256:updated",
        spend: {
          prompts: 2,
          tokens_estimated: 800,
        },
      };

      saveFrame(db, v2Frame);
      retrieved = getFrameById(db, "frame-upgrade-001");

      assert.strictEqual(retrieved!.runId, "lexrunner-20251109-ghi789", "runId should be updated");
      assert.strictEqual(retrieved!.planHash, "sha256:updated", "planHash should be updated");
      assert.ok(retrieved!.spend, "spend should be present");
      assert.strictEqual(retrieved!.spend!.prompts, 2, "spend should be updated");

      deleteFrame(db, "frame-upgrade-001");
    });
  });
});

// Summary message
console.log(
  "\n✅ Frame Storage Tests - covering CRUD, FTS5 search, queries, concurrent access, and Frame Schema v2\n"
);
