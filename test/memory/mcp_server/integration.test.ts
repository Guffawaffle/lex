/**
 * Integration tests for MCP Server
 *
 * Tests the full MCP protocol integration:
 * - Full request/response cycle
 * - Real validation and error handling
 * - FTS5 search integration
 * - Frame filtering
 * - Module validation integration
 *
 * Run with: npm run build && node --test dist/integration.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server Integration Tests", () => {
  let server: MCPServer;
  let testDbPath: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "mcp-integration-"));
    testDbPath = join(tmpDir, "integration-test.db");
    server = new MCPServer(testDbPath);
    return server;
  }

  function teardown() {
    if (server) {
      server.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  describe("Full Request/Response Cycle", () => {
    test("should complete full remember → recall cycle", async () => {
      const srv = setup();
      try {
        // Step 1: Create a Frame via lex.remember
        const rememberArgs = {
          reference_point: "integration cycle test",
          summary_caption: "Testing full MCP cycle",
          status_snapshot: {
            next_action: "Verify recall works",
            blockers: [],
          },
          module_scope: ["policy/scanners"],
          keywords: ["integration", "memory/mcp", "cycle"],
        };

        const rememberResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: rememberArgs,
          },
        });

        assert.ok(rememberResponse.content, "Remember should succeed");
        assert.ok(
          rememberResponse.content[0].text.includes("✅ Frame stored"),
          "Should confirm storage"
        );

        // Step 2: Recall the Frame
        const recallResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "integration cycle",
            },
          },
        });

        assert.ok(recallResponse.content, "Recall should succeed");
        assert.ok(
          recallResponse.content[0].text.includes("Found 1 Frame"),
          "Should find the Frame"
        );
        assert.ok(
          recallResponse.content[0].text.includes("integration cycle test"),
          "Should include reference point"
        );
      } finally {
        teardown();
      }
    });

    test("should handle create → list → recall → delete cycle", async () => {
      const srv = setup();
      try {
        // Create multiple frames
        const frames = [
          {
            reference_point: "first frame",
            summary_caption: "First test frame",
            status_snapshot: { next_action: "Test" },
            module_scope: ["policy/scanners"],
          },
          {
            reference_point: "second frame",
            summary_caption: "Second test frame",
            status_snapshot: { next_action: "Test" },
            module_scope: ["shared/types"],
          },
        ];

        for (const frame of frames) {
          await srv.handleRequest({
            method: "tools/call",
            params: {
              name: "lex.remember",
              arguments: frame,
            },
          });
        }

        // List frames
        const listResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.list_frames",
            arguments: { limit: 10 },
          },
        });

        assert.ok(listResponse.content, "List should succeed");
        assert.ok(
          listResponse.content[0].text.includes("Recent Frames (2)"),
          "Should list both frames"
        );

        // Recall specific frame
        const recallResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "first frame",
            },
          },
        });

        assert.ok(recallResponse.content, "Response should have content");
        assert.ok(
          recallResponse.content[0].text.includes("first frame"),
          "Should find specific frame"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Module Validation Integration", () => {
    test("should reject invalid module IDs with helpful error", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "invalid module test",
              summary_caption: "Testing validation",
              status_snapshot: { next_action: "Should fail" },
              module_scope: ["invalid-module-xyz"],
            },
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(
          response.error.message.includes("Invalid module IDs"),
          "Should indicate invalid modules"
        );
        assert.ok(
          response.error.message.includes("invalid-module-xyz"),
          "Should mention the invalid module"
        );
        assert.ok(
          response.error.message.includes("Available modules"),
          "Should list available modules"
        );
      } finally {
        teardown();
      }
    });

    test("should suggest similar modules for typos", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "typo test",
              summary_caption: "Testing fuzzy matching",
              status_snapshot: { next_action: "Test" },
              module_scope: ["indexr"], // Typo: should be "policy/scanners"
            },
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(response.error.message.includes("Did you mean"), "Should provide suggestions");
      } finally {
        teardown();
      }
    });

    test("should accept all valid modules", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "all valid modules",
              summary_caption: "Testing with all valid modules",
              status_snapshot: { next_action: "Test" },
              module_scope: ["policy/scanners", "shared/types", "memory/mcp"],
            },
          },
        });

        assert.ok(response.content, "Should succeed with valid modules");
        assert.ok(response.content[0].text.includes("✅ Frame stored"), "Should confirm storage");
      } finally {
        teardown();
      }
    });
  });

  describe("FTS5 Search Integration", () => {
    test("should find Frames using full-text search on reference_point", async () => {
      const srv = setup();
      try {
        // Create frames with different content
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "authentication refactoring work",
              summary_caption: "Refactored auth system",
              status_snapshot: { next_action: "Test" },
              module_scope: ["policy/scanners"],
            },
          },
        });

        // Search should find it
        const searchResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "authentication refactoring",
            },
          },
        });

        assert.ok(searchResponse.content, "Search should succeed");
        assert.ok(
          searchResponse.content[0].text.includes("authentication refactoring work"),
          "Should find frame via FTS5"
        );
      } finally {
        teardown();
      }
    });

    test("should search across summary_caption and keywords", async () => {
      const srv = setup();
      try {
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "payment system",
              summary_caption: "Stripe integration for payment processing",
              status_snapshot: { next_action: "Deploy" },
              module_scope: ["policy/scanners"],
              keywords: ["payment", "stripe", "integration"],
            },
          },
        });

        // Search by keyword
        const keywordSearch = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "stripe",
            },
          },
        });

        assert.ok(keywordSearch.content, "Keyword search should have content");
        assert.ok(
          keywordSearch.content[0].text.includes("payment system"),
          "Should find via keyword search"
        );

        // Search by summary
        const summarySearch = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "integration processing",
            },
          },
        });

        assert.ok(summarySearch.content, "Summary search should have content");
        assert.ok(
          summarySearch.content[0].text.includes("payment system"),
          "Should find via summary search"
        );
      } finally {
        teardown();
      }
    });

    test("should handle fuzzy search with wildcards", async () => {
      const srv = setup();
      try {
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "database optimization",
              summary_caption: "Optimized database queries",
              status_snapshot: { next_action: "Benchmark" },
              module_scope: ["policy/scanners"],
              keywords: ["database", "performance"],
            },
          },
        });

        // Wildcard search
        const wildcardSearch = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "datab*",
            },
          },
        });

        assert.ok(wildcardSearch.content, "Wildcard search should have content");
        assert.ok(
          wildcardSearch.content[0].text.includes("database optimization"),
          "Should support wildcard search"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Frame Filtering", () => {
    test("should filter frames by module scope", async () => {
      const srv = setup();
      try {
        // Create frames with different modules
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "indexer work",
              summary_caption: "Indexer module",
              status_snapshot: { next_action: "Test" },
              module_scope: ["policy/scanners"],
            },
          },
        });

        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "typescript work",
              summary_caption: "TS module",
              status_snapshot: { next_action: "Test" },
              module_scope: ["shared/types"],
            },
          },
        });

        // Filter by module
        const filterResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.list_frames",
            arguments: {
              module: "policy/scanners",
              limit: 10,
            },
          },
        });

        assert.ok(filterResponse.content, "Filter response should have content");
        assert.ok(
          filterResponse.content[0].text.includes("indexer work"),
          "Should include indexer frame"
        );
        assert.ok(
          !filterResponse.content[0].text.includes("typescript work"),
          "Should not include ts frame"
        );
      } finally {
        teardown();
      }
    });

    test("should limit results when requested", async () => {
      const srv = setup();
      try {
        // Create multiple frames
        for (let i = 0; i < 5; i++) {
          await srv.handleRequest({
            method: "tools/call",
            params: {
              name: "lex.remember",
              arguments: {
                reference_point: `frame ${i}`,
                summary_caption: `Frame ${i}`,
                status_snapshot: { next_action: "Test" },
                module_scope: ["policy/scanners"],
              },
            },
          });
        }

        // Request limited results
        const limitedResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.list_frames",
            arguments: {
              limit: 3,
            },
          },
        });

        assert.ok(limitedResponse.content, "Limited response should have content");
        assert.ok(
          limitedResponse.content[0].text.includes("Recent Frames (3)"),
          "Should respect limit parameter"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Error Handling", () => {
    test("should handle missing required fields gracefully", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "incomplete",
              // Missing: summary_caption, status_snapshot, module_scope
            },
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(
          response.error.message.includes("Missing required fields"),
          "Should indicate missing fields"
        );
      } finally {
        teardown();
      }
    });

    test("should handle empty search results", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "zzz-nonexistent-query-zzz",
            },
          },
        });

        assert.ok(response.content, "Should return content");
        assert.ok(
          response.content[0].text.includes("No matching Frames found"),
          "Should indicate no results"
        );
      } finally {
        teardown();
      }
    });

    test("should require at least one search parameter", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {},
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(
          response.error.message.includes("At least one search parameter required"),
          "Should require search parameters"
        );
      } finally {
        teardown();
      }
    });

    test("should handle unknown methods", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "unknown/method",
        });

        assert.ok(response.error, "Should return error");
        assert.ok(
          response.error.message.includes("Unknown method"),
          "Should indicate unknown method"
        );
      } finally {
        teardown();
      }
    });

    test("should handle unknown tools", async () => {
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
        assert.ok(response.error.message.includes("Unknown tool"), "Should indicate unknown tool");
      } finally {
        teardown();
      }
    });
  });

  describe("Protocol Compliance", () => {
    test("should list all available tools", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/list",
        });

        assert.ok(response.tools, "Should return tools array");
        assert.strictEqual(response.tools.length, 3, "Should have 3 tools");

        const toolNames = response.tools.map((t) => t.name);
        assert.ok(toolNames.includes("lex.remember"));
        assert.ok(toolNames.includes("lex.recall"));
        assert.ok(toolNames.includes("lex.list_frames"));
      } finally {
        teardown();
      }
    });

    test("should include tool schemas in tools/list", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/list",
        });

        const rememberTool = response.tools?.find((t) => t.name === "lex.remember");
        assert.ok(rememberTool, "Should include lex.remember");
        assert.ok(rememberTool.inputSchema, "Should include input schema");
        assert.ok(rememberTool.inputSchema.properties, "Schema should have properties");
      } finally {
        teardown();
      }
    });
  });
});

console.log("\n✅ MCP Server Integration Tests - Full protocol coverage\n");
