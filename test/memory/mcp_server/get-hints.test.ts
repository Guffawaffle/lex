/**
 * Tests for get_hints MCP tool (AX-012)
 *
 * Validates hint retrieval functionality for compact error handling.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { MCPServer } from "../../../src/memory/mcp_server/server.js";
import { MemoryFrameStore } from "../../../src/memory/store/memory/index.js";

describe("get_hints MCP tool (AX-012)", () => {
  describe("Tool definition", () => {
    it("should include get_hints in available tools", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/list",
        };

        const response = await server.handleRequest(request);

        assert.ok(response.tools, "Response should include tools");
        const tools = response.tools as Array<{ name: string }>;
        const getHintsTool = tools.find((t) => t.name === "get_hints");

        assert.ok(getHintsTool, "Should have get_hints tool");
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should have correct tool schema", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/list",
        };

        const response = await server.handleRequest(request);

        const tools = response.tools as Array<{ name: string; inputSchema: any }>;
        const getHintsTool = tools.find((t) => t.name === "get_hints");

        assert.ok(getHintsTool, "Should have get_hints tool");
        assert.ok(getHintsTool.inputSchema, "Tool should have input schema");
        assert.ok(getHintsTool.inputSchema.required, "Schema should have required fields");
        assert.ok(
          getHintsTool.inputSchema.required.includes("hintIds"),
          "hintIds should be required"
        );
        assert.ok(getHintsTool.inputSchema.properties.hintIds, "Should have hintIds property");
        assert.equal(
          getHintsTool.inputSchema.properties.hintIds.type,
          "array",
          "hintIds should be array"
        );
      } finally {
        await server.close();
        await store.close();
      }
    });
  });

  describe("Tool execution", () => {
    it("should retrieve single hint", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: ["hint_mod_invalid_001"],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(!response.error, "Should not have error");
        assert.ok(response.data, "Should have data");
        assert.ok(response.data.hints, "Should have hints in data");

        const hints = response.data.hints as Record<string, any>;
        assert.ok(hints["hint_mod_invalid_001"], "Should have requested hint");
        assert.equal(hints["hint_mod_invalid_001"].action, "Check module ID spelling");
        assert.equal(hints["hint_mod_invalid_001"].tool, "introspect");
        assert.equal(hints["hint_mod_invalid_001"].field, "policy.modules");
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should retrieve multiple hints", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: [
                "hint_mod_invalid_001",
                "hint_policy_not_found_001",
                "hint_frame_not_found_001",
              ],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(!response.error, "Should not have error");
        assert.ok(response.data, "Should have data");

        const hints = response.data.hints as Record<string, any>;
        assert.equal(Object.keys(hints).length, 3, "Should have 3 hints");
        assert.ok(hints["hint_mod_invalid_001"]);
        assert.ok(hints["hint_policy_not_found_001"]);
        assert.ok(hints["hint_frame_not_found_001"]);
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should handle invalid hint IDs", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: ["hint_mod_invalid_001", "invalid_hint_id", "hint_policy_not_found_001"],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(!response.error, "Should not have error");
        assert.ok(response.data, "Should have data");

        const hints = response.data.hints as Record<string, any>;
        assert.equal(Object.keys(hints).length, 2, "Should have 2 valid hints");
        assert.ok(hints["hint_mod_invalid_001"]);
        assert.ok(hints["hint_policy_not_found_001"]);
        assert.ok(!hints["invalid_hint_id"], "Invalid hint ID should not be in results");

        const notFound = response.data.notFound as string[];
        assert.ok(notFound, "Should have notFound array");
        assert.ok(notFound.includes("invalid_hint_id"), "Invalid ID should be in notFound");
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should return empty hints for all invalid IDs", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: ["invalid1", "invalid2"],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(!response.error, "Should not have error");
        assert.ok(response.data, "Should have data");

        const hints = response.data.hints as Record<string, any>;
        assert.equal(Object.keys(hints).length, 0, "Should have no hints");

        const notFound = response.data.notFound as string[];
        assert.equal(notFound.length, 2, "Should have 2 IDs in notFound");
      } finally {
        await server.close();
        await store.close();
      }
    });
  });

  describe("Error handling", () => {
    it("should error when hintIds is missing", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {},
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(response.error, "Should have error");
        assert.equal(response.error.code, "VALIDATION_REQUIRED_FIELD");
        assert.ok(response.error.message.includes("hintIds"));
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should error when hintIds is not an array", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: "not-an-array",
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(response.error, "Should have error");
        assert.equal(response.error.code, "VALIDATION_REQUIRED_FIELD");
      } finally {
        await server.close();
        await store.close();
      }
    });

    it("should error when hintIds is empty array", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: [],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(response.error, "Should have error");
        assert.equal(response.error.code, "VALIDATION_INVALID_FORMAT");
        assert.ok(response.error.message.includes("cannot be empty"));
      } finally {
        await server.close();
        await store.close();
      }
    });
  });

  describe("Response format", () => {
    it("should include hints in both content and data", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "get_hints",
            arguments: {
              hintIds: ["hint_mod_invalid_001"],
            },
          },
        };

        const response = await server.handleRequest(request);

        assert.ok(response.content, "Should have content");
        assert.ok(response.data, "Should have data");

        // Content should be JSON text
        const content = response.content as Array<{ type: string; text: string }>;
        assert.equal(content[0].type, "text");
        const parsed = JSON.parse(content[0].text);
        assert.ok(parsed.hints);

        // Data should be structured
        assert.ok(response.data.hints);
      } finally {
        await server.close();
        await store.close();
      }
    });
  });
});
