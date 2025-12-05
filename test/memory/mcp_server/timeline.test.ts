/**
 * Tests for lex.timeline MCP tool
 *
 * Tests the timeline visualization functionality via MCP protocol.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - Timeline Tool", () => {
  let server: MCPServer;
  let testDbPath: string;

  // Setup: create test database in temp directory
  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-test-timeline-"));
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

  test("lex.timeline tool is listed in tools/list", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({ method: "tools/list" });

      assert.ok(response.tools, "Response should have tools array");
      const toolNames = response.tools.map((t: { name: string }) => t.name);
      assert.ok(toolNames.includes("lex.timeline"), "Should include lex.timeline");

      // Find the timeline tool and check its schema
      const timelineTool = response.tools.find((t: { name: string }) => t.name === "lex.timeline");
      assert.ok(timelineTool, "Timeline tool should exist");
      assert.ok(timelineTool.inputSchema, "Timeline tool should have inputSchema");
      assert.ok(
        timelineTool.inputSchema.required.includes("ticketOrBranch"),
        "ticketOrBranch should be required"
      );
    } finally {
      await teardown();
    }
  });

  test("lex.timeline shows timeline for frames with matching Jira ticket", async () => {
    const srv = setup();
    try {
      // Create frames with same Jira ticket
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "initial work",
            summary_caption: "Started feature",
            status_snapshot: {
              next_action: "Continue implementation",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-123",
            branch: "feature/test",
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "added tests",
            summary_caption: "Added unit tests",
            status_snapshot: {
              next_action: "Review and merge",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-123",
            branch: "feature/test",
          },
        },
      });

      // Get timeline by Jira ticket
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "TICKET-123",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.content[0].text, "Response should have text content");
      const text = response.content[0].text;
      assert.ok(text.includes("TICKET-123"), "Should include ticket ID in title");
      assert.ok(text.includes("initial work"), "Should include first frame");
      assert.ok(text.includes("added tests"), "Should include second frame");
    } finally {
      await teardown();
    }
  });

  test("lex.timeline shows timeline for frames with matching branch", async () => {
    const srv = setup();
    try {
      // Create frames on same branch
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "branch work 1",
            summary_caption: "First commit",
            status_snapshot: {
              next_action: "Continue",
            },
            module_scope: ["cli"],
            branch: "feature/timeline",
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "branch work 2",
            summary_caption: "Second commit",
            status_snapshot: {
              next_action: "Finish",
            },
            module_scope: ["cli"],
            branch: "feature/timeline",
          },
        },
      });

      // Get timeline by branch
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "feature/timeline",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      const text = response.content[0].text;
      assert.ok(text.includes("feature/timeline"), "Should include branch name");
      assert.ok(text.includes("branch work 1"), "Should include first frame");
      assert.ok(text.includes("branch work 2"), "Should include second frame");
    } finally {
      await teardown();
    }
  });

  test("lex.timeline returns helpful message when no frames found", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "NONEXISTENT-999",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      const text = response.content[0].text;
      assert.ok(text.includes("No frames found"), "Should indicate no frames found");
      assert.ok(text.includes("NONEXISTENT-999"), "Should include the query");
    } finally {
      await teardown();
    }
  });

  test("lex.timeline filters frames by date range", async () => {
    const srv = setup();
    try {
      // Create frame in the past
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "old work",
            summary_caption: "Old frame",
            status_snapshot: {
              next_action: "Done",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-456",
          },
        },
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));
      const sinceDate = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create frame in the recent time
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "new work",
            summary_caption: "New frame",
            status_snapshot: {
              next_action: "Continue",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-456",
          },
        },
      });

      // Get timeline with date filter
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "TICKET-456",
            since: sinceDate,
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      const text = response.content[0].text;
      assert.ok(text.includes("new work"), "Should include recent frame");
      assert.ok(!text.includes("old work"), "Should not include old frame");
    } finally {
      await teardown();
    }
  });

  test("lex.timeline returns JSON format when requested", async () => {
    const srv = setup();
    try {
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "json test",
            summary_caption: "JSON format test",
            status_snapshot: {
              next_action: "Verify JSON",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-JSON",
          },
        },
      });

      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "TICKET-JSON",
            format: "json",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      const text = response.content[0].text;

      // Should be valid JSON
      assert.doesNotThrow(() => {
        JSON.parse(text);
      }, "Response should be valid JSON");

      const parsed = JSON.parse(text);
      assert.ok(Array.isArray(parsed), "JSON should be an array");
      assert.ok(parsed.length > 0, "JSON array should have entries");
    } finally {
      await teardown();
    }
  });

  test("lex.timeline fails with missing ticketOrBranch parameter", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {},
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("ticketOrBranch"),
        "Error should mention missing parameter"
      );
    } finally {
      await teardown();
    }
  });

  test("lex.timeline returns message when date filter excludes all frames", async () => {
    const srv = setup();
    try {
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "filtered out",
            summary_caption: "Old frame",
            status_snapshot: {
              next_action: "Done",
            },
            module_scope: ["memory/store"],
            jira: "TICKET-FILTER",
          },
        },
      });

      // Use a future date to filter out all frames
      const futureDate = new Date(Date.now() + 1000000).toISOString();

      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.timeline",
          arguments: {
            ticketOrBranch: "TICKET-FILTER",
            since: futureDate,
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      const text = response.content[0].text;
      assert.ok(text.includes("No frames found in the specified date range"), "Should indicate empty result after filtering");
    } finally {
      await teardown();
    }
  });
});
