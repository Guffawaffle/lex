/**
 * Tests for introspect MCP tool
 *
 * Tests the introspection capabilities for AI agents to discover Lex state.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - Introspect Tool", () => {
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

  test("introspect returns version, policy, state, capabilities, and error codes", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: {},
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check schemaVersion
      assert.ok(data.schemaVersion, "Should have schemaVersion");
      assert.strictEqual(typeof data.schemaVersion, "string", "SchemaVersion should be a string");

      // Check version
      assert.ok(data.version, "Should have version");
      assert.strictEqual(typeof data.version, "string", "Version should be a string");

      // Check state
      assert.ok(data.state, "Should have state");
      const state = data.state as Record<string, unknown>;
      assert.ok("frameCount" in state, "State should have frameCount");
      assert.ok("currentBranch" in state, "State should have currentBranch");
      assert.ok("latestFrame" in state, "State should have latestFrame");

      // Check capabilities
      assert.ok(data.capabilities, "Should have capabilities");
      const capabilities = data.capabilities as Record<string, unknown>;
      assert.ok("encryption" in capabilities, "Capabilities should have encryption");
      assert.ok("images" in capabilities, "Capabilities should have images");

      // Check error codes
      assert.ok(data.errorCodes, "Should have error codes");
      assert.ok(Array.isArray(data.errorCodes), "Error codes should be an array");
      const errorCodes = data.errorCodes as string[];
      assert.ok(errorCodes.length > 0, "Should have at least one error code");
      assert.ok(
        errorCodes.includes("VALIDATION_REQUIRED_FIELD"),
        "Should include VALIDATION_REQUIRED_FIELD"
      );

      // Verify error codes are sorted (deterministic ordering)
      const sortedErrorCodes = [...errorCodes].sort();
      assert.deepStrictEqual(
        errorCodes,
        sortedErrorCodes,
        "Error codes should be in sorted order"
      );

      // Check error code metadata
      assert.ok(data.errorCodeMetadata, "Should have error code metadata");
      const errorCodeMetadata = data.errorCodeMetadata as Record<
        string,
        { category: string; retryable: boolean }
      >;
      assert.strictEqual(
        typeof errorCodeMetadata,
        "object",
        "Error code metadata should be an object"
      );

      // Verify metadata exists for all error codes
      for (const code of errorCodes) {
        assert.ok(
          errorCodeMetadata[code],
          `Metadata should exist for error code ${code}`
        );
        assert.ok(
          "category" in errorCodeMetadata[code],
          `Metadata for ${code} should have category`
        );
        assert.ok(
          ["validation", "storage", "policy", "internal"].includes(
            errorCodeMetadata[code].category
          ),
          `Category for ${code} should be valid`
        );
        assert.ok(
          "retryable" in errorCodeMetadata[code],
          `Metadata for ${code} should have retryable`
        );
        assert.strictEqual(
          typeof errorCodeMetadata[code].retryable,
          "boolean",
          `Retryable for ${code} should be boolean`
        );
      }

      // Verify specific examples
      assert.strictEqual(
        errorCodeMetadata["VALIDATION_REQUIRED_FIELD"].category,
        "validation",
        "VALIDATION_REQUIRED_FIELD should be validation category"
      );
      assert.strictEqual(
        errorCodeMetadata["VALIDATION_REQUIRED_FIELD"].retryable,
        false,
        "VALIDATION_REQUIRED_FIELD should not be retryable"
      );
      assert.strictEqual(
        errorCodeMetadata["STORAGE_WRITE_FAILED"].category,
        "storage",
        "STORAGE_WRITE_FAILED should be storage category"
      );
      assert.strictEqual(
        errorCodeMetadata["STORAGE_WRITE_FAILED"].retryable,
        true,
        "STORAGE_WRITE_FAILED should be retryable"
      );

      // Check text output
      const text = response.content[0].text;
      assert.ok(text.includes("Lex Introspection"), "Text should include title");
      assert.ok(text.includes("Schema Version:"), "Text should include schema version");
      assert.ok(text.includes("Version:"), "Text should include version");
      assert.ok(text.includes("State:"), "Text should include state");
      assert.ok(text.includes("Capabilities:"), "Text should include capabilities");
      assert.ok(text.includes("Error Codes"), "Text should include error codes");
      assert.ok(text.includes("VALIDATION"), "Text should include VALIDATION category");
      assert.ok(text.includes("retryable"), "Text should mention retryable count");
    } finally {
      await teardown();
    }
  });

  test("introspect compact format returns abbreviated data", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: { format: "compact" },
        },
      });

      assert.ok(response.content, "Response should have content");
      assert.ok(response.data, "Response should have structured data");

      const data = response.data as Record<string, unknown>;

      // Check compact format fields
      assert.ok("schemaVersion" in data, "Should have 'schemaVersion'");
      assert.ok("v" in data, "Should have 'v' (version)");
      assert.ok("caps" in data, "Should have 'caps' (capabilities)");
      assert.ok("state" in data, "Should have 'state'");
      assert.ok("mods" in data, "Should have 'mods' (module count)");
      assert.ok("errs" in data, "Should have 'errs' (error codes)");

      // Check capabilities are abbreviated and sorted
      const caps = data.caps as string[];
      assert.ok(Array.isArray(caps), "Caps should be an array");
      const sortedCaps = [...caps].sort();
      assert.deepStrictEqual(caps, sortedCaps, "Capabilities should be in sorted order");

      // Check error codes are abbreviated and sorted
      const errs = data.errs as string[];
      assert.ok(Array.isArray(errs), "Errs should be an array");
      assert.ok(errs.length > 0, "Should have at least one abbreviated error code");
      // Should have abbreviated forms like VAL_REQ, VAL_INV, etc.
      assert.ok(errs.some((err) => err.includes("_")), "Error codes should be abbreviated");
      
      // Verify error codes are sorted (deterministic ordering)
      const sortedErrs = [...errs].sort();
      assert.deepStrictEqual(errs, sortedErrs, "Error codes should be in sorted order");
    } finally {
      await teardown();
    }
  });

  test("introspect includes policy information when available", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: {},
        },
      });

      const data = response.data as Record<string, unknown>;

      // Policy might be null if not loaded, or should have modules
      if (data.policy !== null) {
        const policy = data.policy as Record<string, unknown>;
        assert.ok("modules" in policy, "Policy should have modules");
        assert.ok("moduleCount" in policy, "Policy should have moduleCount");

        const modules = policy.modules as string[];
        const moduleCount = policy.moduleCount as number;

        assert.ok(Array.isArray(modules), "Modules should be an array");
        assert.strictEqual(
          modules.length,
          moduleCount,
          "Module count should match array length"
        );
      }
    } finally {
      await teardown();
    }
  });

  test("introspect reports frame count correctly", async () => {
    const srv = setup();
    try {
      // First introspect - should have 0 frames
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: {},
        },
      });

      const data1 = response1.data as Record<string, unknown>;
      const state1 = data1.state as Record<string, unknown>;
      assert.strictEqual(state1.frameCount, 0, "Should start with 0 frames");

      // Create a frame
      await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: {
            reference_point: "test introspect",
            summary_caption: "Testing introspection",
            status_snapshot: {
              next_action: "Verify frame count",
            },
            module_scope: ["cli"],
          },
        },
      });

      // Second introspect - should have 1 frame
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: {},
        },
      });

      const data2 = response2.data as Record<string, unknown>;
      const state2 = data2.state as Record<string, unknown>;
      assert.strictEqual(state2.frameCount, 1, "Should have 1 frame after creating one");
      assert.ok(state2.latestFrame, "Should have latestFrame timestamp");
    } finally {
      await teardown();
    }
  });

  test("introspect is listed in available tools", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({ method: "tools/list" });

      assert.ok(response.tools, "Response should have tools array");
      const toolNames = response.tools.map((t) => t.name);
      assert.ok(toolNames.includes("introspect"), "Should include introspect tool");
      
      // Verify tools are sorted (deterministic ordering)
      const sortedToolNames = [...toolNames].sort();
      assert.deepStrictEqual(
        toolNames,
        sortedToolNames,
        "Tools should be in sorted order by name"
      );
    } finally {
      await teardown();
    }
  });

  test("introspect policy modules are sorted for deterministic ordering", async () => {
    const srv = setup();
    try {
      const response = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "introspect",
          arguments: {},
        },
      });

      const data = response.data as Record<string, unknown>;

      // If policy is loaded, check that modules are sorted
      if (data.policy !== null) {
        const policy = data.policy as Record<string, unknown>;
        const modules = policy.modules as string[];
        
        // Verify modules are sorted (deterministic ordering)
        const sortedModules = [...modules].sort();
        assert.deepStrictEqual(
          modules,
          sortedModules,
          "Policy modules should be in sorted order"
        );
      }
    } finally {
      await teardown();
    }
  });
});
