/**
 * Integration tests for fuzzy/prefix search (AX-006)
 *
 * Validates that the recall search finds frames with partial matches:
 * - "debug" matches "debugging"
 * - "AX" matches frames mentioning "AX-006" anywhere
 * - "hidden" matches "hidden-variables"
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import Database from "better-sqlite3-multiple-ciphers";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { initializeDatabase } from "../../../src/memory/store/db.js";
import { saveFrame, searchFrames } from "../../../src/memory/store/index.js";
import type { Frame } from "../../../src/memory/frames/types.js";

describe("Fuzzy search (AX-006)", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Create a fresh database for each test
    dbPath = join(tmpdir(), `test-fuzzy-search-${Date.now()}.db`);
    db = Database(dbPath);
    initializeDatabase(db);

    // Save test frames with various content
    const testFrames: Frame[] = [
      {
        id: "frame-001",
        timestamp: "2025-11-01T16:04:12-05:00",
        branch: "main",
        module_scope: ["test"],
        summary_caption: "Testing AX debugging doctrine",
        reference_point: "AX-006 fuzzy search",
        status_snapshot: {
          next_action: "Test search",
        },
        keywords: ["debugging", "AX", "hidden-variables"],
      },
      {
        id: "frame-002",
        timestamp: "2025-11-02T10:00:00-05:00",
        branch: "main",
        module_scope: ["test"],
        summary_caption: "Debugging session for authentication",
        reference_point: "auth debug session",
        status_snapshot: {
          next_action: "Continue debugging",
        },
        keywords: ["auth", "debugging"],
      },
      {
        id: "frame-003",
        timestamp: "2025-11-03T14:00:00-05:00",
        branch: "main",
        module_scope: ["test"],
        summary_caption: "Hidden variables in config",
        reference_point: "config hidden vars",
        status_snapshot: {
          next_action: "Document hidden variables",
        },
        keywords: ["config", "variables"],
      },
    ];

    for (const frame of testFrames) {
      saveFrame(db, frame);
    }
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("prefix matching", () => {
    it('should find "debugging" when searching for "debug"', () => {
      const result = searchFrames(db, "debug");
      assert.ok(result.frames.length >= 2, "Should find at least 2 frames with 'debugging'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });

    it('should find "AX-006" when searching for "AX"', () => {
      const result = searchFrames(db, "AX");
      assert.ok(result.frames.length >= 1, "Should find at least 1 frame with 'AX'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    it('should find "hidden-variables" when searching for "hidden"', () => {
      const result = searchFrames(db, "hidden");
      assert.ok(result.frames.length >= 1, "Should find at least 1 frame with 'hidden'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001" || f.id === "frame-003"),
        "Should find frame with 'hidden' in keywords or summary"
      );
    });

    it('should find "variables" when searching for "var"', () => {
      const result = searchFrames(db, "var");
      assert.ok(result.frames.length >= 1, "Should find at least 1 frame with 'variables'");
      assert.ok(
        result.frames.some((f) => f.id === "frame-003"),
        "Should find frame-003"
      );
    });
  });

  describe("multi-term fuzzy search", () => {
    it('should find frames matching multiple partial terms', () => {
      const result = searchFrames(db, "AX debug");
      assert.ok(result.frames.length >= 1, "Should find frames matching both terms");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001 which has both AX and debugging"
      );
    });

    it('should support partial matches in multi-term queries', () => {
      const result = searchFrames(db, "auth debug");
      assert.ok(result.frames.length >= 1, "Should find frames with auth and debugging");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002"
      );
    });
  });

  describe("exact mode (--exact flag)", () => {
    it("should require exact match when exact=true", () => {
      // With fuzzy search (default), "debug" finds "debugging"
      const fuzzyResult = searchFrames(db, "debug");
      assert.ok(fuzzyResult.frames.length >= 2, "Fuzzy: should find debugging");

      // With exact search, "debug" should only find exact token "debug", not "debugging"
      // Note: FTS5 still matches complete words/tokens, so "debug" will match the token "debug" in "auth debug session"
      // but NOT the word "debugging" (which is a different token)
      const exactResult = searchFrames(db, "debug", { exact: true });
      
      // Should find frame-002 which has "debug" as an exact token
      // Should NOT find frame-001 which has "debugging" but not "debug"
      assert.ok(
        exactResult.frames.some((f) => f.id === "frame-002"),
        "Exact: should find frame with exact token 'debug'"
      );
      assert.ok(
        !exactResult.frames.some((f) => f.id === "frame-001"),
        "Exact: should NOT find frame with 'debugging' when searching for 'debug'"
      );
    });

    it("should find exact term when exact=true", () => {
      // Searching for exact term "debugging" should still work
      const result = searchFrames(db, "debugging", { exact: true });
      assert.ok(result.frames.length >= 2, "Exact: should find 'debugging' when searching for 'debugging'");
    });
  });

  describe("performance", () => {
    it("should complete search in under 100ms", () => {
      const startTime = Date.now();
      searchFrames(db, "debug");
      const duration = Date.now() - startTime;
      assert.ok(duration < 100, `Search took ${duration}ms, should be under 100ms`);
    });
  });

  describe("acceptance criteria (AX-006)", () => {
    it('✓ "debug" finds frames with "debugging" in them', () => {
      const result = searchFrames(db, "debug");
      assert.ok(
        result.frames.some((f) => f.keywords?.includes("debugging") || f.summary_caption.includes("debugging")),
        '"debug" should match "debugging"'
      );
    });

    it('✓ "AX" finds frames mentioning AX anywhere', () => {
      const result = searchFrames(db, "AX");
      assert.ok(
        result.frames.some((f) => 
          f.reference_point.includes("AX") || 
          f.summary_caption.includes("AX") || 
          f.keywords?.includes("AX")
        ),
        '"AX" should match frames with AX'
      );
    });

    it("✓ Search is fast (<100ms for typical queries)", () => {
      const startTime = Date.now();
      searchFrames(db, "debug hidden variables");
      const duration = Date.now() - startTime;
      assert.ok(duration < 100, `Search should be fast (${duration}ms)`);
    });

    it("✓ --exact flag for strict matching works", () => {
      const fuzzyResult = searchFrames(db, "debug");
      const exactResult = searchFrames(db, "debug", { exact: true });
      assert.ok(fuzzyResult.frames.length > exactResult.frames.length, "--exact should reduce results");
    });
  });
});
