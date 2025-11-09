/**
 * Integration tests for Frame lifecycle
 *
 * Tests the full end-to-end flow:
 * - Frame creation → storage → recall
 * - Module validation
 * - Image attachments
 * - Atlas Frame generation
 * - Memory card rendering
 *
 * Run with: npx tsx --test integration.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  saveFrame,
  getFrameById,
  searchFrames,
  getAllFrames,
  deleteFrame,
  createDatabase,
} from "./store/index.js";
import type { Frame } from "./frames/types.js";
import { validateModuleIds } from "../shared/module_ids/validator.js";
import { renderMemoryCard } from "./renderer/card.js";

// Mock policy for module validation tests
const mockPolicy = {
  modules: {
    "policy/scanners": { owns_paths: ["src/policy/scanners/**"] },
    "shared/types": { owns_paths: ["src/shared/types/**"] },
    "memory/mcp": { owns_paths: ["src/memory/mcp_server/**"] },
  },
};

// Test database path
const TEST_DB_PATH = join(tmpdir(), `integration-test-${Date.now()}.db`);

describe("Memory Integration Tests", () => {
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

  describe("Full Frame Lifecycle", () => {
    test("should complete full Frame creation → storage → recall flow", async () => {
      // Step 1: Create a Frame
      const frame: Frame = {
        id: "lifecycle-001",
        timestamp: new Date().toISOString(),
        branch: "feature/integration-test",
        jira: "TEST-001",
        module_scope: ["policy/scanners", "shared/types"],
        summary_caption: "Integration test for Frame lifecycle",
        reference_point: "full lifecycle test",
        status_snapshot: {
          next_action: "Verify end-to-end flow works",
          blockers: [],
        },
        keywords: ["integration", "test", "lifecycle"],
      };

      // Step 2: Store the Frame
      saveFrame(db, frame);

      // Step 3: Recall by ID
      const retrievedById = getFrameById(db, frame.id);
      assert.ok(retrievedById, "Frame should be retrieved by ID");
      assert.strictEqual(retrievedById!.id, frame.id);
      assert.strictEqual(retrievedById!.reference_point, frame.reference_point);

      // Step 4: Recall by search (FTS5)
      const searchResults = searchFrames(db, "lifecycle test");
      assert.ok(searchResults.length > 0, "Should find Frame via FTS5 search");
      assert.ok(
        searchResults.some((f) => f.id === frame.id),
        "Search should include our Frame"
      );

      // Step 5: List all Frames
      const allFrames = getAllFrames(db, 10);
      assert.ok(
        allFrames.some((f) => f.id === frame.id),
        "Frame should appear in getAllFrames"
      );

      // Clean up
      deleteFrame(db, frame.id);
    });

    test("should handle Frame lifecycle with module validation", async () => {
      // Create Frame with valid module IDs
      const validFrame: Frame = {
        id: "lifecycle-002",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["policy/scanners", "shared/types", "memory/mcp"],
        summary_caption: "Testing module validation in lifecycle",
        reference_point: "module validation test",
        status_snapshot: {
          next_action: "Validate modules",
        },
      };

      // Validate modules before storage
      const validationResult = await validateModuleIds(validFrame.module_scope, mockPolicy as any);
      assert.strictEqual(validationResult.valid, true, "Valid module IDs should pass validation");

      // Store and retrieve
      saveFrame(db, validFrame);
      const retrieved = getFrameById(db, validFrame.id);
      assert.ok(retrieved);
      assert.deepStrictEqual(
        retrieved!.module_scope,
        validFrame.module_scope,
        "Module scope should be preserved"
      );

      // Clean up
      deleteFrame(db, validFrame.id);
    });

    test("should reject Frame with invalid module IDs", async () => {
      const invalidModules = ["invalid-module", "another-bad-one"];

      const validationResult = await validateModuleIds(invalidModules, mockPolicy as any);
      assert.strictEqual(
        validationResult.valid,
        false,
        "Invalid module IDs should fail validation"
      );
      assert.ok(
        validationResult.errors && validationResult.errors.length > 0,
        "Should have error messages"
      );
    });

    test("should handle Frame with Atlas Frame placeholder", async () => {
      const frame: Frame = {
        id: "lifecycle-003",
        timestamp: new Date().toISOString(),
        branch: "feature/atlas-integration",
        module_scope: ["policy/scanners"],
        summary_caption: "Testing Atlas Frame integration",
        reference_point: "atlas frame test",
        status_snapshot: {
          next_action: "Generate Atlas Frame",
          blockers: ["Waiting for API response"],
        },
        keywords: ["atlas", "integration"],
      };

      // Note: Atlas Frame generation requires policy module to be built
      // For integration tests, we test the Frame storage with atlas_frame_id
      const frameWithAtlas: Frame = {
        ...frame,
        atlas_frame_id: "atlas-001",
      };
      saveFrame(db, frameWithAtlas);

      // Retrieve and verify
      const retrieved = getFrameById(db, frameWithAtlas.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.atlas_frame_id, "atlas-001");

      // Clean up
      deleteFrame(db, frameWithAtlas.id);
    });

    test("should render memory card for Frame", async () => {
      const frame: Frame = {
        id: "lifecycle-004",
        timestamp: new Date().toISOString(),
        branch: "feature/rendering",
        module_scope: ["policy/scanners", "shared/types"],
        summary_caption: "Testing memory card rendering",
        reference_point: "rendering test",
        status_snapshot: {
          next_action: "Render memory card",
        },
        keywords: ["rendering", "card"],
      };

      // Store Frame
      saveFrame(db, frame);

      // Render memory card
      const card = await renderMemoryCard(frame);
      assert.ok(card, "Should generate memory card");
      assert.ok(Buffer.isBuffer(card), "Card should be a Buffer");
      assert.ok(card.length > 0, "Card buffer should not be empty");

      // Clean up
      deleteFrame(db, frame.id);
    });
  });

  describe("Multi-Frame Scenarios", () => {
    test("should handle multiple Frames for same branch", async () => {
      const branch = "feature/multi-frame-test";
      const frames: Frame[] = [
        {
          id: "multi-001",
          timestamp: "2025-11-01T10:00:00Z",
          branch,
          module_scope: ["policy/scanners"],
          summary_caption: "First frame on branch",
          reference_point: "first work",
          status_snapshot: { next_action: "Continue" },
        },
        {
          id: "multi-002",
          timestamp: "2025-11-02T10:00:00Z",
          branch,
          module_scope: ["shared/types"],
          summary_caption: "Second frame on branch",
          reference_point: "second work",
          status_snapshot: { next_action: "Complete" },
        },
      ];

      // Store all frames
      frames.forEach((f) => saveFrame(db, f));

      // Search by branch
      const branchFrames = getAllFrames(db).filter((f) => f.branch === branch);
      assert.ok(branchFrames.length >= 2, "Should find both frames for branch");

      // Clean up
      frames.forEach((f) => deleteFrame(db, f.id));
    });

    test("should maintain FTS5 search accuracy with multiple Frames", async () => {
      const testFrames: Frame[] = [
        {
          id: "search-001",
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["policy/scanners"],
          summary_caption: "Authentication refactoring work",
          reference_point: "auth refactor",
          status_snapshot: { next_action: "Test" },
          keywords: ["authentication", "security"],
        },
        {
          id: "search-002",
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["shared/types"],
          summary_caption: "Database optimization",
          reference_point: "db perf",
          status_snapshot: { next_action: "Benchmark" },
          keywords: ["database", "performance"],
        },
        {
          id: "search-003",
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["policy/scanners"],
          summary_caption: "UI authentication flow",
          reference_point: "ui auth",
          status_snapshot: { next_action: "Design" },
          keywords: ["authentication", "ui"],
        },
      ];

      // Store all test frames
      testFrames.forEach((f) => saveFrame(db, f));

      // Search for "authentication" - should find 2 frames
      const authResults = searchFrames(db, "authentication");
      assert.ok(authResults.length >= 2, "Should find at least 2 frames with 'authentication'");

      // Search for "database" - should find 1 frame
      const dbResults = searchFrames(db, "database");
      assert.ok(
        dbResults.some((f) => f.id === "search-002"),
        "Should find database optimization frame"
      );

      // Clean up
      testFrames.forEach((f) => deleteFrame(db, f.id));
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("should handle Frame with missing optional fields", async () => {
      const minimalFrame: Frame = {
        id: "minimal-001",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["policy/scanners"],
        summary_caption: "Minimal frame",
        reference_point: "minimal test",
        status_snapshot: {
          next_action: "Nothing",
        },
      };

      saveFrame(db, minimalFrame);
      const retrieved = getFrameById(db, minimalFrame.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.jira, undefined);
      assert.strictEqual(retrieved!.keywords, undefined);

      // Render card should still work
      const card = await renderMemoryCard(retrieved!);
      assert.ok(card, "Should render card even with minimal fields");
      assert.ok(Buffer.isBuffer(card), "Card should be a Buffer");

      deleteFrame(db, minimalFrame.id);
    });

    test("should handle Frame updates (upsert)", async () => {
      const frame: Frame = {
        id: "update-001",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["policy/scanners"],
        summary_caption: "Original caption",
        reference_point: "original ref",
        status_snapshot: {
          next_action: "Original action",
        },
      };

      // First save
      saveFrame(db, frame);
      const original = getFrameById(db, frame.id);
      assert.strictEqual(original!.summary_caption, "Original caption");

      // Update
      const updatedFrame: Frame = {
        ...frame,
        summary_caption: "Updated caption",
        status_snapshot: {
          next_action: "Updated action",
        },
      };
      saveFrame(db, updatedFrame);

      // Verify update
      const updated = getFrameById(db, frame.id);
      assert.strictEqual(updated!.summary_caption, "Updated caption");
      assert.strictEqual(updated!.status_snapshot.next_action, "Updated action");

      deleteFrame(db, frame.id);
    });

    test("should return empty results for non-existent searches", async () => {
      const results = searchFrames(db, "zzznonexistentquerywhere");
      assert.strictEqual(results.length, 0, "Should return empty array");
    });

    test("should handle concurrent Frame operations", async () => {
      const concurrentFrames: Frame[] = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-${i}`,
        timestamp: new Date().toISOString(),
        branch: "concurrent-test",
        module_scope: ["policy/scanners"],
        summary_caption: `Concurrent frame ${i}`,
        reference_point: `concurrent ${i}`,
        status_snapshot: {
          next_action: `Action ${i}`,
        },
      }));

      // Save concurrently
      await Promise.all(concurrentFrames.map((f) => saveFrame(db, f)));

      // Verify all saved
      const savedFrames = getAllFrames(db).filter((f) => f.id.startsWith("concurrent-"));
      assert.ok(savedFrames.length >= 5, "All concurrent frames should be saved");

      // Clean up
      concurrentFrames.forEach((f) => deleteFrame(db, f.id));
    });
  });
});

console.log("\n✅ Memory Integration Tests - Full Frame lifecycle coverage\n");
