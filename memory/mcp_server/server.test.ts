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

  test("lex.remember stores Frame with image attachments", async () => {
    const srv = setup();
    try {
      // Create a small test image (base64-encoded PNG)
      const testImageData = Buffer.from("fake-png-data").toString("base64");
      
      const args = {
        reference_point: "test with images",
        summary_caption: "Testing image attachment",
        status_snapshot: {
          next_action: "Verify image storage",
        },
        module_scope: ["test/module"],
        images: [
          {
            data: testImageData,
            mime_type: "image/png",
          },
        ],
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
        response.content[0].text.includes("🖼️  Images: 1 attached"),
        "Should indicate image attachment"
      );
    } finally {
      teardown();
    }
  });

  test("lex.remember stores Frame with multiple image attachments", async () => {
    const srv = setup();
    try {
      const image1 = Buffer.from("png-data").toString("base64");
      const image2 = Buffer.from("jpeg-data").toString("base64");
      
      const args = {
        reference_point: "test with multiple images",
        summary_caption: "Testing multiple image attachments",
        status_snapshot: {
          next_action: "Verify multi-image storage",
        },
        module_scope: ["test/module"],
        images: [
          { data: image1, mime_type: "image/png" },
          { data: image2, mime_type: "image/jpeg" },
        ],
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
        response.content[0].text.includes("🖼️  Images: 2 attached"),
        "Should indicate 2 images attached"
      );
    } finally {
      teardown();
    }
  });

  test("lex.remember fails with invalid image MIME type", async () => {
    const srv = setup();
    try {
      const testImageData = Buffer.from("fake-data").toString("base64");
      
      const args = {
        reference_point: "test with invalid image",
        summary_caption: "Testing invalid image type",
        status_snapshot: {
          next_action: "Should fail",
        },
        module_scope: ["test/module"],
        images: [
          {
            data: testImageData,
            mime_type: "application/pdf", // Invalid MIME type
          },
        ],
      };

      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: args,
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("Failed to store image"),
        "Error should mention image storage failure"
      );
    } finally {
      teardown();
    }
  });

  test("lex.remember fails with oversized image", async () => {
    const srv = setup();
    try {
      // Create base64 of a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      const testImageData = largeBuffer.toString("base64");
      
      const args = {
        reference_point: "test with oversized image",
        summary_caption: "Testing oversized image",
        status_snapshot: {
          next_action: "Should fail",
        },
        module_scope: ["test/module"],
        images: [
          {
            data: testImageData,
            mime_type: "image/png",
          },
        ],
      };

      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "lex.remember",
          arguments: args,
        },
      });

      assert.ok(response.error, "Should return error");
      assert.ok(
        response.error.message.includes("exceeds maximum"),
        "Error should mention size limit"
      );
    } finally {
      teardown();
    }
  });
});
