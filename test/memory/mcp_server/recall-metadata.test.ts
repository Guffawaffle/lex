/**
 * Tests for recall search metadata (AX #578)
 *
 * Verifies that recall responses include structured metadata:
 * - query parameters used
 * - search timing
 * - total frame count
 * - match strategy (fts, filter:jira, filter:branch)
 * - status (success, no_matches)
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Recall Search Metadata (AX #578)", () => {
  let server: MCPServer;
  let testDbPath: string;
  let tmpDir: string;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "recall-metadata-"));
    testDbPath = join(tmpDir, "test.db");
    server = new MCPServer(testDbPath);
    return server;
  }

  async function teardown() {
    if (server) {
      await server.close();
    }
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  describe("Meta object structure", () => {
    test("should return meta object with all required fields on success", async () => {
      const srv = setup();
      try {
        // First, create a frame with jira for reliable lookup
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "remember",
            arguments: {
              reference_point: "metadata test frame",
              summary_caption: "Testing recall metadata",
              status_snapshot: { next_action: "verify metadata" },
              module_scope: ["policy/scanners"],
              jira: "META-001",
            },
          },
        });

        // Recall using jira filter for reliable matching
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "META-001" },
          },
        });

        assert.ok(response.data, "Response should include data object");
        assert.ok(response.data.meta, "Data should include meta object");

        const meta = response.data.meta as Record<string, unknown>;

        // Verify all required meta fields
        assert.ok(meta.query, "Meta should include query");
        assert.ok(typeof meta.searchTimeMs === "number", "searchTimeMs should be a number");
        assert.ok(typeof meta.totalFrames === "number", "totalFrames should be a number");
        assert.ok(typeof meta.matchStrategy === "string", "matchStrategy should be a string");
        assert.ok(typeof meta.matchCount === "number", "matchCount should be a number");
        assert.ok(typeof meta.status === "string", "status should be a string");
      } finally {
        await teardown();
      }
    });

    test("should return meta object even when no matches found", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "nonexistent query xyz" },
          },
        });

        assert.ok(response.data, "Response should include data object");
        assert.ok(response.data.meta, "Data should include meta object");

        const meta = response.data.meta as Record<string, unknown>;
        assert.strictEqual(meta.status, "no_matches", "Status should be no_matches");
        assert.strictEqual(meta.matchCount, 0, "matchCount should be 0");
      } finally {
        await teardown();
      }
    });
  });

  describe("Query reflection", () => {
    test("should reflect reference_point in query", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "test query" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        const query = meta.query as Record<string, unknown>;

        assert.strictEqual(query.reference_point, "test query");
        assert.strictEqual(query.jira, null);
        assert.strictEqual(query.branch, null);
      } finally {
        await teardown();
      }
    });

    test("should reflect jira in query", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "PROJ-123" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        const query = meta.query as Record<string, unknown>;

        assert.strictEqual(query.reference_point, null);
        assert.strictEqual(query.jira, "PROJ-123");
        assert.strictEqual(query.branch, null);
      } finally {
        await teardown();
      }
    });

    test("should reflect branch in query", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { branch: "feature/test" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        const query = meta.query as Record<string, unknown>;

        assert.strictEqual(query.reference_point, null);
        assert.strictEqual(query.jira, null);
        assert.strictEqual(query.branch, "feature/test");
      } finally {
        await teardown();
      }
    });

    test("should include limit in query", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "test", limit: 5 },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        const query = meta.query as Record<string, unknown>;

        assert.strictEqual(query.limit, 5);
      } finally {
        await teardown();
      }
    });

    test("should use default limit of 10", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "test" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        const query = meta.query as Record<string, unknown>;

        assert.strictEqual(query.limit, 10);
      } finally {
        await teardown();
      }
    });
  });

  describe("Match strategy", () => {
    test("should use fts strategy for reference_point search", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "test" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.matchStrategy, "fts");
      } finally {
        await teardown();
      }
    });

    test("should use filter:jira strategy for jira search", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "PROJ-123" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.matchStrategy, "filter:jira");
      } finally {
        await teardown();
      }
    });

    test("should use filter:branch strategy for branch search", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { branch: "main" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.matchStrategy, "filter:branch");
      } finally {
        await teardown();
      }
    });
  });

  describe("Total frames count", () => {
    test("should report correct totalFrames count", async () => {
      const srv = setup();
      try {
        // Create 3 frames with same jira for reliable lookup
        for (let i = 1; i <= 3; i++) {
          await srv.handleRequest({
            method: "tools/call",
            params: {
              name: "remember",
              arguments: {
                reference_point: `frame ${i}`,
                summary_caption: `Test frame ${i}`,
                status_snapshot: { next_action: "test" },
                module_scope: ["policy/scanners"],
                jira: "COUNT-001",
              },
            },
          });
        }

        // Recall using jira filter (avoids FTS5 indexing timing)
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "COUNT-001" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.totalFrames, 3, "Should report 3 total frames");
      } finally {
        await teardown();
      }
    });

    test("should report 0 totalFrames in empty database", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "anything" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.totalFrames, 0, "Should report 0 total frames");
      } finally {
        await teardown();
      }
    });
  });

  describe("Search timing", () => {
    test("searchTimeMs should be a non-negative number", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "test" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.ok(typeof meta.searchTimeMs === "number", "searchTimeMs should be a number");
        assert.ok((meta.searchTimeMs as number) >= 0, "searchTimeMs should be non-negative");
      } finally {
        await teardown();
      }
    });
  });

  describe("Status values", () => {
    test("should return status:success when frames found via jira filter", async () => {
      const srv = setup();
      try {
        // Create a frame with jira
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "remember",
            arguments: {
              reference_point: "findable frame",
              summary_caption: "Should be found",
              status_snapshot: { next_action: "test" },
              module_scope: ["policy/scanners"],
              jira: "TEST-999",
            },
          },
        });

        // Use jira filter (not FTS5) to ensure we find the frame
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "TEST-999" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.status, "success");
        assert.ok((meta.matchCount as number) > 0, "matchCount should be > 0");
      } finally {
        await teardown();
      }
    });

    test("should return status:no_matches when no frames found", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { reference_point: "definitely not found xyz123" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.status, "no_matches");
        assert.strictEqual(meta.matchCount, 0);
      } finally {
        await teardown();
      }
    });
  });

  describe("matchCount accuracy", () => {
    test("should accurately report matchCount with jira filter", async () => {
      const srv = setup();
      try {
        // Create 3 frames with same jira
        for (let i = 1; i <= 3; i++) {
          await srv.handleRequest({
            method: "tools/call",
            params: {
              name: "remember",
              arguments: {
                reference_point: `matchtest item ${i}`,
                summary_caption: `Match test ${i}`,
                status_snapshot: { next_action: "verify count" },
                module_scope: ["policy/scanners"],
                jira: "MATCH-001",
              },
            },
          });
        }

        // Use jira filter instead of FTS5 to ensure reliable matching
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: { jira: "MATCH-001" },
          },
        });

        const meta = response.data?.meta as Record<string, unknown>;
        assert.strictEqual(meta.matchCount, 3, "Should find 3 matching frames");
      } finally {
        await teardown();
      }
    });
  });
});
