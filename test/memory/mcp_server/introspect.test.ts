/**
 * Tests for introspect MCP tool
 *
 * Tests the introspection capabilities for AI agents to discover Lex state.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
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

      assert.ok(data.resolution, "Should have runtime resolution data");
      const resolution = data.resolution as Record<string, unknown>;
      assert.ok(resolution.workspaceRoot, "Should include workspace root resolution");
      assert.ok(resolution.database, "Should include database resolution");
      assert.ok(resolution.policy, "Should include policy resolution");
      assert.ok(resolution.branch, "Should include branch resolution");

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
      assert.deepStrictEqual(errorCodes, sortedErrorCodes, "Error codes should be in sorted order");

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
        assert.ok(errorCodeMetadata[code], `Metadata should exist for error code ${code}`);
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
      assert.ok(text.includes("Resolution:"), "Text should include resolution");
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
      assert.ok("ctx" in data, "Should have 'ctx' (runtime context)");
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
      assert.ok(
        errs.some((err) => err.includes("_")),
        "Error codes should be abbreviated"
      );

      // Verify error codes are sorted (deterministic ordering)
      const sortedErrs = [...errs].sort();
      assert.deepStrictEqual(errs, sortedErrs, "Error codes should be in sorted order");

      const ctx = data.ctx as Record<string, unknown>;
      const database = ctx.database as Record<string, unknown>;
      assert.strictEqual(database.path, testDbPath, "Compact context should expose DB path");
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
        assert.strictEqual(modules.length, moduleCount, "Module count should match array length");
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
      assert.ok(toolNames.includes("system_introspect"), "Should include system_introspect tool");

      // Verify tools are sorted (deterministic ordering)
      const sortedToolNames = [...toolNames].sort();
      assert.deepStrictEqual(toolNames, sortedToolNames, "Tools should be in sorted order by name");
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
        assert.deepStrictEqual(modules, sortedModules, "Policy modules should be in sorted order");
      }
    } finally {
      await teardown();
    }
  });

  test("introspect reports workspace and policy provenance for MCP runtime", async () => {
    const originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lex-introspect-workspace-"));
    const policyDir = join(workspaceRoot, ".smartergpt", "lex");
    mkdirSync(policyDir, { recursive: true });
    writeFileSync(
      join(policyDir, "lexmap.policy.json"),
      JSON.stringify(
        {
          modules: {
            "consumer/module": {
              owns_paths: ["src/**"],
              allowed_callers: [],
              forbidden_callers: [],
            },
          },
        },
        null,
        2
      )
    );

    process.env.LEX_WORKSPACE_ROOT = workspaceRoot;
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
      const resolution = data.resolution as Record<string, unknown>;
      const workspace = resolution.workspaceRoot as Record<string, unknown>;
      const policy = resolution.policy as Record<string, unknown>;

      assert.strictEqual(workspace.path, workspaceRoot, "Should expose MCP workspace root");
      assert.strictEqual(
        policy.path,
        join(workspaceRoot, ".smartergpt", "lex", "lexmap.policy.json")
      );
      assert.strictEqual(policy.source, "workspace-working", "Should explain policy source");
      assert.strictEqual(policy.loaded, true, "Should indicate loaded policy");
    } finally {
      if (originalWorkspaceRoot === undefined) {
        delete process.env.LEX_WORKSPACE_ROOT;
      } else {
        process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
      await teardown();
    }
  });

  test("introspect reports MCP runtime provenance for repo root, DB path, and policy path", async () => {
    const originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lex-introspect-root-"));
    const policyDir = join(workspaceRoot, ".smartergpt", "lex");
    mkdirSync(policyDir, { recursive: true });
    writeFileSync(
      join(policyDir, "lexmap.policy.json"),
      JSON.stringify(
        {
          modules: {
            "consumer/module": {
              owns_paths: ["src/**"],
              allowed_callers: [],
              forbidden_callers: [],
            },
          },
        },
        null,
        2
      )
    );

    process.env.LEX_WORKSPACE_ROOT = workspaceRoot;
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
      const resolution = data.resolution as Record<string, unknown>;
      const workspace = resolution.workspaceRoot as Record<string, unknown>;
      const database = resolution.database as Record<string, unknown>;
      const policy = resolution.policy as Record<string, unknown>;

      assert.strictEqual(workspace.path, workspaceRoot, "Should report MCP workspace root");
      assert.strictEqual(database.path, testDbPath, "Should report active MCP DB path");
      assert.strictEqual(
        database.source,
        "constructor.dbPath",
        "Should report constructor DB source"
      );
      assert.strictEqual(
        policy.path,
        join(workspaceRoot, ".smartergpt", "lex", "lexmap.policy.json"),
        "Should report active policy path"
      );
      assert.strictEqual(policy.source, "workspace-working", "Should report working policy source");
    } finally {
      if (originalWorkspaceRoot === undefined) {
        delete process.env.LEX_WORKSPACE_ROOT;
      } else {
        process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
      await teardown();
    }
  });

  test("introspect preserves workspace config provenance when MCP resolves its own store", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lex-introspect-config-"));
    const configuredDb = join(workspaceRoot, "shared", "memory.db");
    writeFileSync(
      join(workspaceRoot, ".lex.config.json"),
      JSON.stringify({ paths: { appRoot: ".", database: "./shared/memory.db" } })
    );
    const configuredServer = new MCPServer({ repoRoot: workspaceRoot });

    try {
      const response = await configuredServer.handleRequest({
        method: "tools/call",
        params: { name: "introspect", arguments: {} },
      });
      const data = response.data as Record<string, unknown>;
      const resolution = data.resolution as Record<string, unknown>;
      const configFile = resolution.configFile as Record<string, unknown>;
      const database = resolution.database as Record<string, unknown>;

      assert.strictEqual(configFile.path, join(workspaceRoot, ".lex.config.json"));
      assert.strictEqual(configFile.source, "caller-workspace");
      assert.strictEqual(database.path, configuredDb);
      assert.strictEqual(database.source, "file:.lex.config.json");
      assert.match(database.identity as string, /^path-v1:[a-f0-9]{16}$/);
    } finally {
      await configuredServer.close();
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
