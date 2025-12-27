/**
 * Integration tests for expanded FTS5 index (DX-003)
 *
 * Validates that the expanded FTS5 index allows searching by:
 * - next_action (from status_snapshot)
 * - module_scope
 * - jira
 * - branch
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

describe("Expanded FTS5 index (DX-003)", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Create a fresh database for each test
    dbPath = join(tmpdir(), `test-expanded-fts5-${Date.now()}.db`);
    db = Database(dbPath);
    initializeDatabase(db);

    // Save test frames with various content
    const testFrames: Frame[] = [
      {
        id: "frame-001",
        timestamp: "2025-11-01T16:04:12-05:00",
        branch: "feature/dx-003-fts5",
        jira: "DX-003",
        module_scope: ["memory/store", "shared/cli"],
        summary_caption: "Expand FTS5 index for better search",
        reference_point: "FTS5 expansion implementation",
        status_snapshot: {
          next_action: "Add migration for expanded FTS5 index",
        },
        keywords: ["fts5", "search", "database"],
      },
      {
        id: "frame-002",
        timestamp: "2025-11-02T10:00:00-05:00",
        branch: "feature/authentication",
        jira: "AUTH-123",
        module_scope: ["auth", "mcp_server/auth"],
        summary_caption: "Implement JWT authentication",
        reference_point: "JWT auth implementation",
        status_snapshot: {
          next_action: "Test token refresh flow",
        },
        keywords: ["auth", "jwt", "security"],
      },
      {
        id: "frame-003",
        timestamp: "2025-11-03T14:00:00-05:00",
        branch: "main",
        jira: "PERF-456",
        module_scope: ["memory/store/sqlite"],
        summary_caption: "Optimize database queries",
        reference_point: "Database performance improvements",
        status_snapshot: {
          next_action: "Run performance benchmarks",
        },
        keywords: ["performance", "database", "optimization"],
      },
      {
        id: "frame-004",
        timestamp: "2025-11-04T12:00:00-05:00",
        branch: "feature/code-atlas",
        jira: "CA-789",
        module_scope: ["atlas", "memory/store"],
        summary_caption: "Code Atlas integration",
        reference_point: "Atlas code unit extraction",
        status_snapshot: {
          next_action: "Implement symbol path indexing",
        },
        keywords: ["atlas", "code-discovery"],
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

  describe("search by next_action", () => {
    it("should find frames by next_action content", () => {
      const result = searchFrames(db, "migration");
      assert.ok(result.frames.length >= 1, "Should find frames with 'migration' in next_action");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001 which has 'migration' in next_action"
      );
    });

    it("should support partial matches in next_action", () => {
      const result = searchFrames(db, "benchmark");
      assert.ok(result.frames.length >= 1, "Should find frames with 'benchmarks' in next_action");
      assert.ok(
        result.frames.some((f) => f.id === "frame-003"),
        "Should find frame-003"
      );
    });

    it("should find frames by next_action keywords", () => {
      const result = searchFrames(db, "symbol path");
      assert.ok(result.frames.length >= 1, "Should find frames with 'symbol path' in next_action");
      assert.ok(
        result.frames.some((f) => f.id === "frame-004"),
        "Should find frame-004"
      );
    });
  });

  describe("search by module_scope", () => {
    it("should find frames by module scope", () => {
      const result = searchFrames(db, "memory store");
      assert.ok(result.frames.length >= 2, "Should find frames with 'memory/store' in scope");
      // Should find frame-001 and frame-003 which have memory/store modules
      const foundIds = result.frames.map((f) => f.id);
      assert.ok(
        foundIds.includes("frame-001") || foundIds.includes("frame-003"),
        "Should find frames with memory/store in module_scope"
      );
    });

    it("should find frames by partial module name", () => {
      const result = searchFrames(db, "auth");
      assert.ok(result.frames.length >= 1, "Should find frames with 'auth' in module scope");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002 with auth modules"
      );
    });

    it("should find frames by specific module", () => {
      const result = searchFrames(db, "sqlite");
      assert.ok(result.frames.length >= 1, "Should find frames with 'sqlite' in module scope");
      assert.ok(
        result.frames.some((f) => f.id === "frame-003"),
        "Should find frame-003"
      );
    });
  });

  describe("search by jira", () => {
    it("should find frames by JIRA ticket ID", () => {
      const result = searchFrames(db, "DX-003");
      assert.ok(result.frames.length >= 1, "Should find frames with DX-003");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    it("should find frames by partial JIRA ID", () => {
      const result = searchFrames(db, "AUTH");
      assert.ok(result.frames.length >= 1, "Should find frames with AUTH in JIRA");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002 with AUTH-123"
      );
    });

    it("should find frames by JIRA number", () => {
      const result = searchFrames(db, "456");
      assert.ok(result.frames.length >= 1, "Should find frames with 456 in JIRA");
      assert.ok(
        result.frames.some((f) => f.id === "frame-003"),
        "Should find frame-003 with PERF-456"
      );
    });
  });

  describe("search by branch", () => {
    it("should find frames by branch name", () => {
      const result = searchFrames(db, "feature dx");
      assert.ok(result.frames.length >= 1, "Should find frames on feature/dx-003-fts5 branch");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    it("should find frames by branch prefix", () => {
      const result = searchFrames(db, "authentication");
      assert.ok(result.frames.length >= 1, "Should find frames with 'authentication' in branch");
      assert.ok(
        result.frames.some((f) => f.id === "frame-002"),
        "Should find frame-002 on feature/authentication branch"
      );
    });

    it("should find frames on main branch", () => {
      const result = searchFrames(db, "main");
      assert.ok(result.frames.length >= 1, "Should find frames on main branch");
      assert.ok(
        result.frames.some((f) => f.id === "frame-003"),
        "Should find frame-003"
      );
    });
  });

  describe("multi-field search", () => {
    it("should search across all indexed fields", () => {
      // Search for "DX" which appears in JIRA (DX-003) and branch (feature/dx-003-fts5)
      const result = searchFrames(db, "DX");
      assert.ok(result.frames.length >= 1, "Should find frames with DX");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    it("should combine terms from different fields", () => {
      // Search for "migration" (in next_action) and "FTS5" (in keywords)
      const result = searchFrames(db, "migration fts5");
      assert.ok(result.frames.length >= 1, "Should find frames matching both terms");
      assert.ok(
        result.frames.some((f) => f.id === "frame-001"),
        "Should find frame-001"
      );
    });

    it("should find frames by module and next_action", () => {
      // Search for "atlas" (module) and "symbol" (next_action)
      const result = searchFrames(db, "atlas symbol");
      assert.ok(result.frames.length >= 1, "Should find frames with atlas and symbol");
      assert.ok(
        result.frames.some((f) => f.id === "frame-004"),
        "Should find frame-004"
      );
    });
  });

  describe("acceptance criteria (DX-003)", () => {
    it("✓ next_action is searchable", () => {
      const result = searchFrames(db, "benchmark");
      assert.ok(
        result.frames.some((f) => f.status_snapshot.next_action.includes("benchmark")),
        "Should find frames with 'benchmark' in next_action"
      );
    });

    it("✓ module_scope is searchable", () => {
      const result = searchFrames(db, "sqlite");
      assert.ok(
        result.frames.some((f) => f.module_scope.some((m) => m.includes("sqlite"))),
        "Should find frames with 'sqlite' in module_scope"
      );
    });

    it("✓ jira is searchable", () => {
      const result = searchFrames(db, "AUTH-123");
      assert.ok(
        result.frames.some((f) => f.jira === "AUTH-123"),
        "Should find frames with JIRA ticket AUTH-123"
      );
    });

    it("✓ branch is searchable", () => {
      const result = searchFrames(db, "authentication");
      assert.ok(
        result.frames.some((f) => f.branch.includes("authentication")),
        "Should find frames with 'authentication' in branch"
      );
    });

    it("✓ existing fields still work", () => {
      const result = searchFrames(db, "jwt");
      assert.ok(
        result.frames.some((f) => f.keywords?.includes("jwt")),
        "Should still find frames by keywords"
      );
    });

    it("✓ FTS5 index is fast", () => {
      const startTime = Date.now();
      searchFrames(db, "memory store auth");
      const duration = Date.now() - startTime;
      assert.ok(duration < 100, `Search should be fast (${duration}ms)`);
    });
  });
});
