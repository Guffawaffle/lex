/**
 * Tests for Frame MCP Server
 * 
 * Tests the MCP protocol implementation for Frame storage and recall.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "./server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - Protocol", () => {
  let server;
  let testDbPath;

  // Setup: create test database in temp directory
  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-test-"));
    testDbPath = join(tmpDir, "test-frames.db");
    server = new MCPServer(testDbPath);
    return server;
  }

  // Teardown: close database and cleanup
  function teardown() {
    if (server) {
      server.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  test("tools/list returns all available tools", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({ method: "tools/list" });
      
      assert.ok(response.tools, "Response should have tools array");
      assert.strictEqual(response.tools.length, 3, "Should have 3 tools");
      
      const toolNames = response.tools.map((t) => t.name);
      assert.ok(toolNames.includes("lex.remember"), "Should include lex.remember");
      assert.ok(toolNames.includes("lex.recall"), "Should include lex.recall");
      assert.ok(toolNames.includes("lex.list_frames"), "Should include lex.list_frames");
    } finally {
      teardown();
    }
  });

  test("lex.remember creates a Frame with valid data", async () => {
    const srv = setup();
    try {
      const args = {
        reference_point: "test memory",
        summary_caption: "Testing Frame creation",
        status_snapshot: {
          next_action: "Verify storage",
          blockers: [],
        },
        module_scope: ["test/module"],
      };

      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: args,
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("✅ Frame stored"),
        "Should confirm Frame storage"
      );
      assert.ok(
        response.content[0].text.includes("test memory"),
        "Should include reference point"
      );
      assert.ok(
        response.content[0].text.includes("Atlas Frame"),
        "Should include Atlas Frame"
      );
    } finally {
      teardown();
    }
  });

  test("lex.remember fails with missing required fields", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "incomplete data",
            // Missing: summary_caption, status_snapshot, module_scope
          },
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("Missing required fields"),
        "Error should mention missing fields"
      );
    } finally {
      teardown();
    }
  });

  test("lex.recall finds stored Frames by reference_point", async () => {
    const srv = setup();
    try {
      // First, create a Frame
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "authentication refactoring",
            summary_caption: "Extracted password validation",
            status_snapshot: {
              next_action: "Add unit tests",
              blockers: [],
            },
            module_scope: ["auth/core"],
          },
        },
      });

      // Then, recall it
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.recall",
          arguments: {
            reference_point: "authentication",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("Found 1 Frame"),
        "Should find 1 Frame"
      );
      assert.ok(
        response.content[0].text.includes("authentication refactoring"),
        "Should include reference point"
      );
      assert.ok(
        response.content[0].text.includes("Atlas Frame"),
        "Should include Atlas Frame"
      );
    } finally {
      teardown();
    }
  });

  test("lex.recall returns empty result for non-existent query", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.recall",
          arguments: {
            reference_point: "nonexistent work",
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("No matching Frames found"),
        "Should indicate no results"
      );
    } finally {
      teardown();
    }
  });

  test("lex.recall fails without search parameters", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.recall",
          arguments: {}, // No search parameters
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("At least one search parameter required"),
        "Error should mention missing parameters"
      );
    } finally {
      teardown();
    }
  });

  test("lex.list_frames returns recent Frames", async () => {
    const srv = setup();
    try {
      // Create two Frames
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "frame one",
            summary_caption: "First test frame",
            status_snapshot: { next_action: "Test" },
            module_scope: ["test/module1"],
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "frame two",
            summary_caption: "Second test frame",
            status_snapshot: { next_action: "Test" },
            module_scope: ["test/module2"],
          },
        },
      });

      // List frames
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.list_frames",
          arguments: { limit: 10 },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("Recent Frames (2)"),
        "Should list 2 frames"
      );
      assert.ok(
        response.content[0].text.includes("frame one"),
        "Should include first frame"
      );
      assert.ok(
        response.content[0].text.includes("frame two"),
        "Should include second frame"
      );
      assert.ok(
        response.content[0].text.includes("Atlas Frame"),
        "Should include Atlas Frames"
      );
    } finally {
      teardown();
    }
  });

  test("lex.list_frames filters by module", async () => {
    const srv = setup();
    try {
      // Create two Frames with different modules
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "auth work",
            summary_caption: "Auth module work",
            status_snapshot: { next_action: "Test" },
            module_scope: ["auth/core"],
          },
        },
      });

      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: {
            reference_point: "ui work",
            summary_caption: "UI module work",
            status_snapshot: { next_action: "Test" },
            module_scope: ["ui/components"],
          },
        },
      });

      // List only auth module frames
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.list_frames",
          arguments: { module: "auth/core", limit: 10 },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("Recent Frames (1)"),
        "Should list 1 frame"
      );
      assert.ok(
        response.content[0].text.includes("auth work"),
        "Should include auth frame"
      );
      assert.ok(
        !response.content[0].text.includes("ui work"),
        "Should not include ui frame"
      );
    } finally {
      teardown();
    }
  });

  test("unknown method returns error", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "unknown/method",
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("Unknown method"),
        "Error should mention unknown method"
      );
    } finally {
      teardown();
    }
  });

  test("unknown tool returns error", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.unknown_tool",
          arguments: {},
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("Unknown tool"),
        "Error should mention unknown tool"
      );
    } finally {
      teardown();
    }
  });
});
