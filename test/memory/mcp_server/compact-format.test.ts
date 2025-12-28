/**
 * Tests for compact format mode in MCP tools
 *
 * Tests that the compact format reduces payload size while preserving essential information.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - Compact Format", () => {
  let server: MCPServer;
  let testDbPath: string;

  // Setup: create test database in temp directory
  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-test-"));
    testDbPath = join(tmpDir, "test-frames.db");
    server = new MCPServer(testDbPath);
    return server;
  }

  // Teardown: close database and cleanup
  async function teardown() {
    if (server) {
      await server.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  test("recall with format=compact returns compact format", async () => {
    const srv = setup();
    try {
      // Create a test frame
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Refactoring authentication module for better security",
            summary_caption: "Extracted password validation to separate function",
            status_snapshot: {
              next_action: "Write tests for password validation",
              blockers: ["Need access to PermissionService API"],
              merge_blockers: [],
              tests_failing: [],
            },
            module_scope: ["cli", "memory/store"],
            branch: "feature/auth-refactor",
            jira: "AUTH-123",
            keywords: ["authentication", "refactoring"],
          },
        },
      });

      // Recall with compact format
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "recall",
          arguments: {
            branch: "feature/auth-refactor",
            format: "compact",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check compact response structure
      assert.ok("frames" in data, "Should have frames array");
      assert.ok("count" in data, "Should have count field");

      const frames = data.frames as Array<Record<string, unknown>>;
      assert.strictEqual(frames.length, 1, "Should have one frame");

      const frame = frames[0];

      // Check compact field names
      assert.ok("id" in frame, "Should have id field");
      assert.ok("ref" in frame, "Should have ref field (not reference_point)");
      assert.ok("ts" in frame, "Should have ts field (not timestamp)");
      assert.ok("modules" in frame, "Should have modules field");
      assert.ok("next" in frame, "Should have next field");

      // Verify ts is Unix epoch (number)
      assert.strictEqual(typeof frame.ts, "number", "Timestamp should be Unix epoch (number)");

      // Verify reference point is truncated
      const ref = frame.ref as string;
      assert.ok(
        ref.length <= 53,
        `Reference should be truncated to max 50 chars + "..." (got ${ref.length})`
      );

      // Verify optional fields are present
      assert.strictEqual(frame.branch, "feature/auth-refactor", "Should have branch");
      assert.strictEqual(frame.jira, "AUTH-123", "Should have jira");

      // Verify blockers array is present
      assert.ok("blockers" in frame, "Should have blockers array");
      const blockers = frame.blockers as string[];
      assert.strictEqual(blockers.length, 1, "Should have one blocker");

      // Verify empty arrays are omitted
      assert.ok(!("mergeBlockers" in frame), "Empty merge blockers should be omitted");
      assert.ok(!("testsFailing" in frame), "Empty tests failing should be omitted");

      // Check truncation flag
      assert.ok("_truncated" in frame, "Should have _truncated flag when content is shortened");
    } finally {
      await teardown();
    }
  });

  test("get_frame with format=compact returns compact format", async () => {
    const srv = setup();
    try {
      // Create a test frame
      const createResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Short reference",
            summary_caption: "Short summary",
            status_snapshot: {
              next_action: "Continue work",
            },
            module_scope: ["cli"],
          },
        },
      });

      const createData = createResponse.data as Record<string, unknown>;
      const frameId = createData.frame_id as string;

      // Get frame with compact format
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "get_frame",
          arguments: {
            frame_id: frameId,
            format: "compact",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check compact fields
      assert.ok("id" in data, "Should have id field");
      assert.strictEqual(data.id, frameId, "Should match requested frame ID");
      assert.ok("ref" in data, "Should have ref field");
      assert.ok("ts" in data, "Should have ts field (Unix epoch)");
      assert.strictEqual(typeof data.ts, "number", "Timestamp should be number");

      // Short content should not have truncation flag
      assert.ok(!("_truncated" in data), "Should not have truncation flag for short content");
    } finally {
      await teardown();
    }
  });

  test("list_frames with format=compact returns compact format", async () => {
    const srv = setup();
    try {
      // Create multiple test frames
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "First frame",
            summary_caption: "First summary",
            status_snapshot: { next_action: "Next 1" },
            module_scope: ["cli"],
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Second frame",
            summary_caption: "Second summary",
            status_snapshot: { next_action: "Next 2" },
            module_scope: ["memory/store"],
          },
        },
      });

      // List frames with compact format
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "list_frames",
          arguments: {
            limit: 10,
            format: "compact",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check compact response structure
      assert.ok("frames" in data, "Should have frames array");
      assert.ok("count" in data, "Should have count field");

      const frames = data.frames as Array<Record<string, unknown>>;
      assert.strictEqual(frames.length, 2, "Should have two frames");

      // Verify all frames have compact format
      for (const frame of frames) {
        assert.ok("id" in frame, "Frame should have id");
        assert.ok("ref" in frame, "Frame should have ref");
        assert.ok("ts" in frame, "Frame should have ts");
        assert.strictEqual(typeof frame.ts, "number", "Timestamp should be number");
        assert.ok("modules" in frame, "Frame should have modules");
        assert.ok("next" in frame, "Frame should have next");
      }
    } finally {
      await teardown();
    }
  });

  test("compact format reduces payload size by 50%+", async () => {
    const srv = setup();
    try {
      // Create a frame with long content
      const longReference =
        "This is a very long reference point that describes in detail what we are working on and why it matters";
      const longNext =
        "This is a very long next action that describes in detail what needs to be done next";

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: longReference,
            summary_caption: "Long frame for testing payload size reduction",
            status_snapshot: {
              next_action: longNext,
              blockers: [
                "Very long blocker description that explains the issue in detail",
                "Another long blocker with extensive explanation",
              ],
            },
            module_scope: ["cli", "memory/store", "shared/git"],
            branch: "feature/long-test",
            keywords: ["authentication", "refactoring", "security", "testing"],
          },
        },
      });

      // Get frame in full format
      const fullResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "recall",
          arguments: {
            branch: "feature/long-test",
          },
        },
      });

      // Get frame in compact format
      const compactResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "recall",
          arguments: {
            branch: "feature/long-test",
            format: "compact",
          },
        },
      });

      // Measure payload sizes
      const fullSize = JSON.stringify(fullResponse).length;
      const compactSize = JSON.stringify(compactResponse).length;
      const reduction = ((fullSize - compactSize) / fullSize) * 100;

      // Verify at least 50% reduction
      assert.ok(
        reduction >= 50,
        `Compact format should reduce size by 50%+ (actual: ${reduction.toFixed(1)}%)`
      );
    } finally {
      await teardown();
    }
  });

  test("compact format preserves IDs for round-trip", async () => {
    const srv = setup();
    try {
      // Create a frame
      const createResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Test roundtrip",
            summary_caption: "Test summary",
            status_snapshot: { next_action: "Continue" },
            module_scope: ["cli"],
          },
        },
      });

      const createData = createResponse.data as Record<string, unknown>;
      const frameId = createData.frame_id as string;

      // Get compact version
      const compactResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "get_frame",
          arguments: {
            frame_id: frameId,
            format: "compact",
          },
        },
      });

      const compactData = compactResponse.data as Record<string, unknown>;
      const compactId = compactData.id as string;

      // Verify ID is preserved
      assert.strictEqual(compactId, frameId, "Compact format should preserve frame ID");

      // Verify we can retrieve the frame using the ID from compact format
      const retrieveResponse = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "get_frame",
          arguments: {
            frame_id: compactId,
          },
        },
      });

      assert.ok(retrieveResponse.data, "Should be able to retrieve frame using compact ID");
    } finally {
      await teardown();
    }
  });

  test("timeline with format=compact returns compact format", async () => {
    const srv = setup();
    try {
      // Create frames for a timeline
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Initial work",
            summary_caption: "Started feature",
            status_snapshot: { next_action: "Continue development" },
            module_scope: ["cli"],
            jira: "FEAT-100",
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "Progress update",
            summary_caption: "Added validation",
            status_snapshot: { next_action: "Add tests" },
            module_scope: ["cli", "memory/store"],
            jira: "FEAT-100",
          },
        },
      });

      // Get timeline in compact format
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "timeline",
          arguments: {
            ticketOrBranch: "FEAT-100",
            format: "compact",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check compact response structure
      assert.ok("frames" in data, "Should have frames array");
      assert.ok("count" in data, "Should have count field");
      assert.ok("timeline" in data, "Should have timeline metadata");

      const timeline = data.timeline as Record<string, unknown>;
      assert.ok("title" in timeline, "Timeline should have title");
      assert.ok("count" in timeline, "Timeline should have count");
      assert.ok("firstTimestamp" in timeline, "Timeline should have firstTimestamp");
      assert.ok("lastTimestamp" in timeline, "Timeline should have lastTimestamp");
    } finally {
      await teardown();
    }
  });
});
