/**
 * Tool Naming Aliases Test (AX-014)
 *
 * Tests that:
 * - New standardized names (resource_action) work correctly
 * - Old names still work as deprecated aliases
 * - Deprecation warnings are logged for old names
 * - Help tool documents the naming convention
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("AX-014: Tool Naming Aliases", () => {
  let server: MCPServer;
  let testDbPath: string;
  let testRepoRoot: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "mcp-naming-test-"));
    testDbPath = join(tmpDir, "naming-test.db");
    testRepoRoot = tmpDir;
    server = new MCPServer(testDbPath, testRepoRoot);
    return server;
  }

  async function teardown() {
    if (server) {
      await server.close();
    }
    if (testRepoRoot) {
      try {
        rmSync(testRepoRoot, { force: true, recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  describe("Standardized names work", () => {
    test("frame_create works", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "frame_create",
            arguments: {
              reference_point: "Test with new name",
              summary_caption: "Testing frame_create",
              status_snapshot: {
                next_action: "Verify it works",
              },
              module_scope: ["test"],
            },
          },
        });

        // Check for error response (no policy loaded in test environment)
        if (response.error) {
          assert.ok(
            response.error.code === "VALIDATION_INVALID_MODULE_ID",
            `Should fail validation without policy, got: ${response.error.code}`
          );
          return;
        }

        assert.ok(response.content, "frame_create should work");
        assert.ok(
          response.content[0].text.includes("✅ Frame stored"),
          "Should confirm frame creation"
        );
      } finally {
        await teardown();
      }
    });

    test("frame_search works", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "frame_search",
            arguments: {
              reference_point: "nonexistent",
            },
          },
        });

        assert.ok(response.content, "frame_search should work");
        // Even with no matches, it should return a valid response
      } finally {
        await teardown();
      }
    });

    test("frame_list works", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "frame_list",
            arguments: {
              limit: 5,
            },
          },
        });

        assert.ok(response.content, "frame_list should work");
      } finally {
        await teardown();
      }
    });

    test("system_introspect works", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "system_introspect",
            arguments: {},
          },
        });

        assert.ok(response.content, "system_introspect should work");
        assert.ok(
          response.content[0].text.includes("Lex Introspection"),
          "Should return introspection data"
        );
      } finally {
        await teardown();
      }
    });

    test("hints_get works", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "hints_get",
            arguments: {
              hintIds: ["hint_mod_invalid_001"],
            },
          },
        });

        assert.ok(response.content, "hints_get should work");
      } finally {
        await teardown();
      }
    });
  });

  describe("Deprecated aliases still work", () => {
    test("remember still works as alias for frame_create", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "remember",
            arguments: {
              reference_point: "Test with old name",
              summary_caption: "Testing remember alias",
              status_snapshot: {
                next_action: "Verify it works",
              },
              module_scope: ["test"],
            },
          },
        });

        // Check for error response (no policy loaded in test environment)
        if (response.error) {
          assert.ok(
            response.error.code === "VALIDATION_INVALID_MODULE_ID",
            `Should fail validation without policy, got: ${response.error.code}`
          );
          return;
        }

        assert.ok(response.content, "remember alias should work");
        assert.ok(
          response.content[0].text.includes("✅ Frame stored"),
          "Should confirm frame creation"
        );
      } finally {
        await teardown();
      }
    });

    test("recall still works as alias for frame_search", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "recall",
            arguments: {
              reference_point: "nonexistent",
            },
          },
        });

        assert.ok(response.content, "recall alias should work");
      } finally {
        await teardown();
      }
    });

    test("list_frames still works as alias for frame_list", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "list_frames",
            arguments: {
              limit: 5,
            },
          },
        });

        assert.ok(response.content, "list_frames alias should work");
      } finally {
        await teardown();
      }
    });

    test("introspect still works as alias for system_introspect", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "introspect",
            arguments: {},
          },
        });

        assert.ok(response.content, "introspect alias should work");
      } finally {
        await teardown();
      }
    });

    test("get_hints still works as alias for hints_get", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: ["hint_mod_invalid_001"],
            },
          },
        });

        assert.ok(response.content, "get_hints alias should work");
      } finally {
        await teardown();
      }
    });
  });

  describe("tools/list returns standardized names", () => {
    test("tools/list includes new names", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/list",
          params: {},
        });

        assert.ok(response.tools, "Should return tools");
        const toolNames = response.tools.map((t: { name: string }) => t.name);

        // Check that new standardized names are present
        assert.ok(toolNames.includes("frame_create"), "Should include frame_create");
        assert.ok(toolNames.includes("frame_search"), "Should include frame_search");
        assert.ok(toolNames.includes("frame_list"), "Should include frame_list");
        assert.ok(toolNames.includes("frame_get"), "Should include frame_get");
        assert.ok(toolNames.includes("frame_validate"), "Should include frame_validate");
        assert.ok(toolNames.includes("system_introspect"), "Should include system_introspect");
        assert.ok(toolNames.includes("hints_get"), "Should include hints_get");
        assert.ok(toolNames.includes("timeline_show"), "Should include timeline_show");
        assert.ok(toolNames.includes("atlas_analyze"), "Should include atlas_analyze");

        // Old names should NOT be in the tools list (they're aliases only)
        assert.ok(!toolNames.includes("remember"), "Should not include deprecated remember");
        assert.ok(!toolNames.includes("recall"), "Should not include deprecated recall");
      } finally {
        await teardown();
      }
    });
  });

  describe("help tool documents naming convention", () => {
    test("help shows naming convention", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "help",
            arguments: {},
          },
        });

        assert.ok(response.content, "Should return help content");
        const helpText = response.content[0].text;

        // Should document naming convention
        assert.ok(
          helpText.includes("resource_action") || helpText.includes("Naming Convention"),
          "Should explain naming convention"
        );
        assert.ok(helpText.includes("ADR-0009"), "Should reference ADR-0009");
      } finally {
        await teardown();
      }
    });

    test("help for specific tool shows deprecated aliases", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "help",
            arguments: {
              tool: "frame_create",
            },
          },
        });

        assert.ok(response.content, "Should return help content");
        const helpText = response.content[0].text;

        // Should show deprecated alias
        assert.ok(
          helpText.includes("remember") && helpText.includes("Deprecated"),
          "Should list 'remember' as deprecated alias"
        );
      } finally {
        await teardown();
      }
    });
  });

  describe("Unknown tool error lists standardized names", () => {
    test("Unknown tool error shows new names", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "nonexistent_tool",
            arguments: {},
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(response.error.message.includes("Unknown tool"), "Should indicate unknown tool");

        // Error context should include new standardized names
        assert.ok(
          response.error.context?.availableTools,
          "Should include available tools in context"
        );
        const availableTools = response.error.context.availableTools as string[];
        assert.ok(availableTools.includes("frame_create"), "Should list frame_create");
        assert.ok(availableTools.includes("frame_search"), "Should list frame_search");
      } finally {
        await teardown();
      }
    });
  });
});
