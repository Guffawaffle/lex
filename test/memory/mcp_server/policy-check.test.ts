/**
 * Tests for lex.policy_check MCP tool
 *
 * Tests the policy validation tool exposed via MCP.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - lex.policy_check", () => {
  let server: MCPServer;
  let testDbPath: string;
  let testDir: string;

  // Setup: create test database and policy file in temp directory
  function setup(policyContent?: string) {
    testDir = mkdtempSync(join(tmpdir(), "lex-policy-test-"));
    testDbPath = join(testDir, "test-frames.db");
    
    // Create a valid policy file if content provided
    if (policyContent) {
      const policyPath = join(testDir, "lexmap.policy.json");
      writeFileSync(policyPath, policyContent, "utf-8");
    }
    
    server = new MCPServer(testDbPath, testDir);
    return server;
  }

  // Teardown: close database and cleanup
  async function teardown() {
    if (server) {
      await server.close();
    }
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  test("lex.policy_check validates a valid policy file", async () => {
    const validPolicy = JSON.stringify({
      version: "1.0.0",
      modules: {
        "core/auth": {
          owns_paths: ["src/auth/**"],
          allowed_callers: ["*"],
          forbidden_callers: [],
        },
        "core/utils": {
          owns_paths: ["src/utils/**"],
          allowed_callers: ["*"],
          forbidden_callers: [],
        },
      },
    });

    const srv = setup(validPolicy);
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "policy_check",
          arguments: {
            path: testDir,
            policyPath: join(testDir, "lexmap.policy.json"),
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(
        response.content[0].text.includes("✅ Policy valid"),
        "Should confirm policy is valid"
      );
      assert.ok(
        response.content[0].text.includes("2 modules defined"),
        "Should report module count"
      );
    } finally {
      await teardown();
    }
  });

  test("lex.policy_check detects invalid policy file", async () => {
    const invalidPolicy = "not valid json at all";

    const srv = setup(invalidPolicy);
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "policy_check",
          arguments: {
            path: testDir,
            policyPath: join(testDir, "lexmap.policy.json"),
          },
        },
      });

      // Should return an error for invalid JSON
      assert.ok(response.error, "Should return an error");
      assert.strictEqual(response.error.code, "POLICY_INVALID", "Should use POLICY_INVALID error code");
      assert.ok(
        response.error.message.includes("Policy validation failed") ||
        response.error.message.includes("JSON"),
        "Error should indicate JSON parsing failure"
      );
    } finally {
      await teardown();
    }
  });

  test("lex.policy_check returns error for missing policy file", async () => {
    const srv = setup(); // No policy file created
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "policy_check",
          arguments: {
            path: testDir,
            policyPath: join(testDir, "nonexistent.json"),
          },
        },
      });

      assert.ok(response.error, "Should return error");
      assert.strictEqual(response.error.code, "POLICY_NOT_FOUND", "Should use POLICY_NOT_FOUND error code");
      assert.ok(
        response.error.message.includes("not found") ||
        response.error.message.includes("ENOENT"),
        "Error should indicate policy file not found"
      );
    } finally {
      await teardown();
    }
  });

  test("lex.policy_check handles strict mode with warnings", async () => {
    // Create a policy that might generate warnings
    const policyWithPotentialWarnings = JSON.stringify({
      version: "1.0.0",
      modules: {
        "core/auth": {
          owns_paths: ["src/auth/**"],
          allowed_callers: ["*"],
          forbidden_callers: [],
        },
      },
    });

    const srv = setup(policyWithPotentialWarnings);
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "policy_check",
          arguments: {
            path: testDir,
            policyPath: join(testDir, "lexmap.policy.json"),
            strict: true,
          },
        },
      });

      assert.ok(response.content, "Response should have content");
      // In strict mode, warnings should not fail validation unless there are actual errors
      // This test just ensures strict parameter is accepted
    } finally {
      await teardown();
    }
  });

  test("lex.policy_check works with default parameters", async () => {
    const validPolicy = JSON.stringify({
      version: "1.0.0",
      modules: {
        "test/module": {
          owns_paths: ["src/test/**"],
          allowed_callers: ["*"],
          forbidden_callers: [],
        },
      },
    });

    const srv = setup(validPolicy);
    try {
      // Call without specifying path or policyPath - should use defaults
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "policy_check",
          arguments: {},
        },
      });

      // Should either succeed with a valid policy or fail gracefully
      assert.ok(
        response.content || response.error,
        "Should return either content or error"
      );
    } finally {
      await teardown();
    }
  });

  test("tools/list includes lex_policy_check", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({ method: "tools/list" });

      assert.ok(response.tools, "Response should have tools array");
      const toolNames = response.tools.map((t: any) => t.name);
      assert.ok(
        toolNames.includes("policy_check"),
        "Should include lex_policy_check tool"
      );

      // Find the policy_check tool and verify its schema
      const policyCheckTool = response.tools.find((t: any) => t.name === "policy_check");
      assert.ok(policyCheckTool, "Should find policy_check tool");
      assert.ok(policyCheckTool.description, "Tool should have description");
      assert.ok(policyCheckTool.inputSchema, "Tool should have input schema");
      assert.ok(
        policyCheckTool.inputSchema.properties.path,
        "Should have path parameter"
      );
      assert.ok(
        policyCheckTool.inputSchema.properties.policyPath,
        "Should have policyPath parameter"
      );
      assert.ok(
        policyCheckTool.inputSchema.properties.strict,
        "Should have strict parameter"
      );
    } finally {
      await teardown();
    }
  });
});
