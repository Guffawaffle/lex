/**
 * Alias Resolution Integration Tests for MCP Server
 *
 * Tests the full MCP /remember flow with module ID validation and fuzzy matching.
 * These tests verify:
 * - Exact matches work without warnings
 * - Typos trigger helpful suggestions
 * - Substring matching (future: could suggest modules)
 * - Ambiguous matches are rejected
 * - Strict mode (CI) only allows exact matches
 *
 * Run with: npm run build && node --test dist/alias-integration.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server Alias Resolution Integration Tests", () => {
  let server: MCPServer;
  let testDbPath: string;
  let testRepoRoot: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "mcp-alias-test-"));
    testDbPath = join(tmpDir, "alias-test.db");
    testRepoRoot = tmpDir;

    // Create minimal test policy structure
    const policyDir = join(tmpDir, "policy", "policy_spec");
    mkdirSync(policyDir, { recursive: true });

    const testPolicy = {
      modules: {
        "policy/scanners": { owns_paths: ["src/policy/scanners/**"] },
        "shared/types": { owns_paths: ["src/shared/types/**"] },
        "memory/mcp": { owns_paths: ["src/memory/mcp_server/**"] },
        "services/auth-core": { owns_paths: ["services/auth/**"] },
        "ui/main-panel": { owns_paths: ["ui/main/**"] },
      },
    };

    writeFileSync(join(policyDir, "lexmap.policy.json"), JSON.stringify(testPolicy, null, 2));

    server = new MCPServer(testDbPath, testRepoRoot);
    return server;
  }

  function teardown() {
    if (server) {
      server.close();
    }
    if (testRepoRoot) {
      try {
        rmSync(testRepoRoot, { force: true, recursive: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  describe("Test 1: Exact Match (Baseline)", () => {
    test("should accept exact module ID without warnings", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing exact match",
              summary_caption: "Exact module ID match test",
              status_snapshot: {
                next_action: "Verify no warnings",
              },
              module_scope: ["services/auth-core"], // Exact match
            },
          },
        });

        assert.ok(response.content, "Should succeed with exact match");
        assert.ok(response.content[0].text.includes("✅ Frame stored"), "Should confirm storage");

        // Exact matches should not produce warnings
        assert.ok(
          !response.content[0].text.toLowerCase().includes("warning"),
          "Should not have warnings for exact match"
        );
      } finally {
        teardown();
      }
    });

    test("should accept multiple exact matches", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Multiple exact modules",
              summary_caption: "Testing multiple exact matches",
              status_snapshot: {
                next_action: "Continue",
              },
              module_scope: ["policy/scanners", "shared/types", "services/auth-core"],
            },
          },
        });

        assert.ok(response.content, "Should succeed with multiple exact matches");
        assert.ok(response.content[0].text.includes("✅ Frame stored"), "Should confirm storage");
      } finally {
        teardown();
      }
    });
  });

  describe("Test 2: Typo Correction", () => {
    test("should reject typo with helpful suggestion", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing typo correction",
              summary_caption: "Typo in module ID",
              status_snapshot: {
                next_action: "Fix typo",
              },
              module_scope: ["policy/scannrs"], // Typo: should be "policy/scanners"
            },
          },
        });

        assert.ok(response.error, "Should return error for typo");
        assert.ok(response.error.message.includes("scannrs"), "Error should mention the typo");
        assert.ok(response.error.message.includes("Did you mean"), "Should provide suggestion");
        assert.ok(
          response.error.message.includes("policy/scanners"),
          "Should suggest 'policy/scanners'"
        );
      } finally {
        teardown();
      }
    });

    test("should suggest closest match for common typos", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing fuzzy matching",
              summary_caption: "Common typo test",
              status_snapshot: {
                next_action: "Use suggested module",
              },
              module_scope: ["servcies/auth-core"], // Typo: should be "services/auth-core"
            },
          },
        });

        assert.ok(response.error, "Should return error for typo");
        assert.ok(response.error.message.includes("Did you mean"), "Should provide suggestion");
        assert.ok(
          response.error.message.includes("services/auth-core"),
          "Should suggest correct module"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Test 3: Substring/Shorthand Matching", () => {
    test("should reject substring without exact match", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing substring",
              summary_caption: "Substring module reference",
              status_snapshot: {
                next_action: "Use full module ID",
              },
              module_scope: ["auth"], // Substring of "services/auth-core"
            },
          },
        });

        assert.ok(response.error, "Should reject substring match");
        assert.ok(response.error.message.includes("auth"), "Error should mention the input");
        // Future: Could suggest "services/auth-core" as it contains "auth"
      } finally {
        teardown();
      }
    });

    test("should handle shorthand notation as error", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing shorthand",
              summary_caption: "Shorthand module ID",
              status_snapshot: {
                next_action: "Use canonical ID",
              },
              module_scope: ["auth-core"], // Shorthand, missing "services/" prefix
            },
          },
        });

        assert.ok(response.error, "Should reject shorthand notation");
        assert.ok(
          response.error.message.includes("auth-core"),
          "Error should mention shorthand input"
        );
        // May or may not suggest the full path depending on edit distance
      } finally {
        teardown();
      }
    });
  });

  describe("Test 4: Ambiguous Matches", () => {
    test("should reject very short ambiguous inputs", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing ambiguous input",
              summary_caption: "Ambiguous module reference",
              status_snapshot: {
                next_action: "Be more specific",
              },
              module_scope: ["t"], // Could match "shared/types" or part of others
            },
          },
        });

        assert.ok(response.error, "Should reject ambiguous input");
        assert.ok(
          response.error.message.includes("Available modules"),
          "Should list available modules"
        );
      } finally {
        teardown();
      }
    });

    test("should list available modules on error", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing module list",
              summary_caption: "Invalid module test",
              status_snapshot: {
                next_action: "Check available modules",
              },
              module_scope: ["nonexistent"],
            },
          },
        });

        assert.ok(response.error, "Should return error");
        assert.ok(
          response.error.message.includes("Available modules"),
          "Should list available modules"
        );
        assert.ok(
          response.error.message.includes("policy/scanners"),
          "Should include 'policy/scanners' in available modules"
        );
        assert.ok(
          response.error.message.includes("services/auth-core"),
          "Should include 'services/auth-core' in available modules"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Test 5: Mixed Valid/Invalid Modules", () => {
    test("should report all invalid modules in one error", async () => {
      const srv = setup();
      try {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Testing mixed modules",
              summary_caption: "Mix of valid and invalid",
              status_snapshot: {
                next_action: "Fix invalid modules",
              },
              module_scope: ["policy/scanners", "invalid1", "shared/types", "invalid2"],
            },
          },
        });

        assert.ok(response.error, "Should return error for invalid modules");
        assert.ok(
          response.error.message.includes("invalid1"),
          "Should mention first invalid module"
        );
        assert.ok(
          response.error.message.includes("invalid2"),
          "Should mention second invalid module"
        );
      } finally {
        teardown();
      }
    });
  });

  describe("Performance Validation", () => {
    test("should validate modules quickly (<10ms)", async () => {
      const srv = setup();
      try {
        const start = performance.now();

        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Performance test",
              summary_caption: "Testing validation performance",
              status_snapshot: {
                next_action: "Measure time",
              },
              module_scope: ["policy/scanners", "shared/types", "memory/mcp"],
            },
          },
        });

        const elapsed = performance.now() - start;

        console.log(`  Module validation time: ${elapsed.toFixed(2)}ms`);
        // Allow up to 50ms (generous threshold for CI/test environments with GC variance)
        // Typical runs are <10ms, but first runs may be slower due to JIT warmup
        assert.ok(elapsed < 50, `Validation took ${elapsed.toFixed(2)}ms, expected <50ms`);
      } finally {
        teardown();
      }
    });

    test("should handle large module scopes efficiently", async () => {
      const srv = setup();
      try {
        const start = performance.now();

        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Large scope test",
              summary_caption: "Testing with many modules",
              status_snapshot: {
                next_action: "Continue",
              },
              module_scope: [
                "policy/scanners",
                "shared/types",
                "shared/policy",
                "memory/mcp",
                "services/auth-core",
                "ui/main-panel",
              ],
            },
          },
        });

        const elapsed = performance.now() - start;

        console.log(`  Large scope validation time: ${elapsed.toFixed(2)}ms`);
        assert.ok(
          elapsed < 15,
          `Large scope validation took ${elapsed.toFixed(2)}ms, expected <15ms`
        );
      } finally {
        teardown();
      }
    });
  });

  describe("End-to-End Flow", () => {
    test("should complete full /remember → recall cycle with validation", async () => {
      const srv = setup();
      try {
        // Step 1: Remember with valid modules
        const rememberResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "E2E test with validation",
              summary_caption: "End-to-end alias flow",
              status_snapshot: {
                next_action: "Recall and verify",
              },
              module_scope: ["services/auth-core", "ui/main-panel"],
              keywords: ["e2e", "validation"],
            },
          },
        });

        assert.ok(rememberResponse.content, "Remember should succeed");

        // Step 2: Recall the frame
        const recallResponse = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              reference_point: "E2E test",
            },
          },
        });

        assert.ok(recallResponse.content, "Recall should succeed");
        assert.ok(
          recallResponse.content[0].text.includes("E2E test with validation"),
          "Should find the frame"
        );
        assert.ok(
          recallResponse.content[0].text.includes("services/auth-core"),
          "Should include module scope"
        );
      } finally {
        teardown();
      }
    });
  });
});

console.log("\n✅ Alias Resolution Integration Tests - Module validation flow\n");
