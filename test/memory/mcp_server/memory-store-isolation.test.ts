/**
 * Tests demonstrating MCPServer with MemoryFrameStore for test isolation.
 *
 * These tests verify that:
 * - MCPServer can use MemoryFrameStore via dependency injection
 * - Tests are isolated without needing SQLite setup
 * - All MCP tools work correctly with MemoryFrameStore
 *
 * Note: Image storage is not available with MemoryFrameStore (requires SQLite).
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";

describe("MCP Server with MemoryFrameStore - Test Isolation", () => {
  describe("Dependency Injection", () => {
    test("should accept MemoryFrameStore via constructor options", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        const response = await server.handleRequest({ method: "tools/list" });
        assert.ok(response.tools, "Response should have tools array");
        assert.strictEqual(response.tools.length, 4, "Should have 4 tools");
      } finally {
        await server.close();
      }
    });

    test("should use provided MemoryFrameStore for frame operations", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Store a frame via MCP
        const rememberResponse = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "memory store test",
              summary_caption: "Testing with MemoryFrameStore",
              status_snapshot: { next_action: "Verify isolation" },
              module_scope: ["policy/scanners"],
              branch: "test-branch",
            },
          },
        });

        assert.ok(rememberResponse.content, "Remember should succeed");
        assert.ok(
          rememberResponse.content[0].text.includes("✅ Frame stored"),
          "Should confirm storage"
        );

        // Verify frame is in the MemoryFrameStore
        assert.strictEqual(memoryStore.size(), 1, "MemoryFrameStore should have 1 frame");

        // Recall should find the frame
        const recallResponse = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: { reference_point: "memory store" },
          },
        });

        assert.ok(recallResponse.content, "Recall should succeed");
        assert.ok(
          recallResponse.content[0].text.includes("Found 1 Frame"),
          "Should find the stored frame"
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("Test Isolation", () => {
    test("each test gets isolated store - test A", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "test A unique frame",
              summary_caption: "Frame for test A",
              status_snapshot: { next_action: "Test A action" },
              module_scope: ["shared/types"],
              branch: "test-a-branch",
            },
          },
        });

        // Only test A's frame should be present
        assert.strictEqual(memoryStore.size(), 1, "Store should have exactly 1 frame");

        const frames = await memoryStore.listFrames();
        assert.ok(
          frames[0].reference_point.includes("test A"),
          "Frame should be from test A"
        );
      } finally {
        await server.close();
      }
    });

    test("each test gets isolated store - test B", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Store should start empty (isolated from test A)
        assert.strictEqual(memoryStore.size(), 0, "Store should start empty");

        await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "test B unique frame",
              summary_caption: "Frame for test B",
              status_snapshot: { next_action: "Test B action" },
              module_scope: ["memory/mcp"],
              branch: "test-b-branch",
            },
          },
        });

        // Only test B's frame should be present
        assert.strictEqual(memoryStore.size(), 1, "Store should have exactly 1 frame");

        const frames = await memoryStore.listFrames();
        assert.ok(
          frames[0].reference_point.includes("test B"),
          "Frame should be from test B"
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("All MCP Tools Work with MemoryFrameStore", () => {
    test("lex.remember works with MemoryFrameStore", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "remember test",
              summary_caption: "Testing remember with MemoryFrameStore",
              status_snapshot: {
                next_action: "Verify stored",
                blockers: ["none"],
              },
              module_scope: ["policy/scanners"],
              branch: "feature-branch",
              jira: "TEST-123",
              keywords: ["memory", "test"],
            },
          },
        });

        assert.ok(response.content, "Response should have content");
        assert.ok(
          response.content[0].text.includes("✅ Frame stored"),
          "Should confirm storage"
        );
        assert.ok(
          response.content[0].text.includes("🌿 Branch: feature-branch"),
          "Should show branch"
        );
        assert.ok(
          response.content[0].text.includes("🎫 Jira: TEST-123"),
          "Should show Jira ticket"
        );
      } finally {
        await server.close();
      }
    });

    test("lex.recall works with MemoryFrameStore", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Store some frames first
        await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "searchable recall test",
              summary_caption: "Frame to recall",
              status_snapshot: { next_action: "Be recalled" },
              module_scope: ["shared/types"],
              branch: "main",
            },
          },
        });

        // Recall by reference_point
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: { reference_point: "searchable recall" },
          },
        });

        assert.ok(response.content, "Response should have content");
        assert.ok(
          response.content[0].text.includes("Found 1 Frame"),
          "Should find the frame"
        );
        assert.ok(
          response.content[0].text.includes("searchable recall test"),
          "Should include reference point"
        );
      } finally {
        await server.close();
      }
    });

    test("lex.list_frames works with MemoryFrameStore", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Store multiple frames
        for (let i = 1; i <= 3; i++) {
          await server.handleRequest({
            method: "tools/call",
            params: {
              name: "lex.remember",
              arguments: {
                reference_point: `list frame ${i}`,
                summary_caption: `Frame number ${i}`,
                status_snapshot: { next_action: `Action ${i}` },
                module_scope: ["memory/mcp"],
                branch: "list-test-branch",
              },
            },
          });
        }

        // List frames
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.list_frames",
            arguments: { limit: 10 },
          },
        });

        assert.ok(response.content, "Response should have content");
        assert.ok(
          response.content[0].text.includes("Recent Frames (3)"),
          "Should list all 3 frames"
        );
        assert.ok(
          response.content[0].text.includes("list frame 1"),
          "Should include first frame"
        );
        assert.ok(
          response.content[0].text.includes("list frame 3"),
          "Should include third frame"
        );
      } finally {
        await server.close();
      }
    });

    test("lex.list_frames filters by module with MemoryFrameStore", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Store frames with different modules
        await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "auth module frame",
              summary_caption: "Auth work",
              status_snapshot: { next_action: "Auth work" },
              module_scope: ["policy/scanners"],
              branch: "main",
            },
          },
        });

        await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "ui module frame",
              summary_caption: "UI work",
              status_snapshot: { next_action: "UI work" },
              module_scope: ["memory/mcp"],
              branch: "main",
            },
          },
        });

        // Filter by module
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.list_frames",
            arguments: { module: "policy/scanners", limit: 10 },
          },
        });

        assert.ok(response.content, "Response should have content");
        assert.ok(
          response.content[0].text.includes("Recent Frames (1)"),
          "Should list only 1 frame"
        );
        assert.ok(
          response.content[0].text.includes("auth module frame"),
          "Should include auth frame"
        );
        assert.ok(
          !response.content[0].text.includes("ui module frame"),
          "Should not include ui frame"
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("Pre-populated Store", () => {
    test("should work with pre-populated MemoryFrameStore", async () => {
      // Create store with pre-existing frames
      const memoryStore = new MemoryFrameStore([
        {
          id: "pre-existing-001",
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["policy/scanners"],
          summary_caption: "Pre-existing frame",
          reference_point: "pre-existing reference",
          status_snapshot: { next_action: "Already done" },
        },
      ]);

      const server = new MCPServer({ frameStore: memoryStore });

      try {
        // Should be able to recall pre-existing frame
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: { reference_point: "pre-existing" },
          },
        });

        assert.ok(response.content, "Response should have content");
        assert.ok(
          response.content[0].text.includes("Found 1 Frame"),
          "Should find pre-existing frame"
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("Image Storage Limitation", () => {
    test("should reject image storage when using MemoryFrameStore", async () => {
      const memoryStore = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: memoryStore });

      try {
        const response = await server.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "image test",
              summary_caption: "Testing image with MemoryFrameStore",
              status_snapshot: { next_action: "Should fail" },
              module_scope: ["policy/scanners"],
              branch: "test",
              images: [{ data: "dGVzdA==", mime_type: "image/png" }],
            },
          },
        });

        assert.ok(response.error, "Should return error for image storage");
        assert.ok(
          response.error.message.includes("Image storage is not available"),
          "Error should mention image storage limitation"
        );
      } finally {
        await server.close();
      }
    });
  });
});

console.log("\n✅ MCP Server with MemoryFrameStore - Test Isolation Tests\n");
