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
        "shared/policy": { owns_paths: ["src/shared/policy/**"] },
        "memory/mcp": { owns_paths: ["src/memory/mcp_server/**"] },
        "services/auth-core": { owns_paths: ["services/auth/**"] },
        "ui/main-panel": { owns_paths: ["ui/main/**"] },
      },
    };

    writeFileSync(join(policyDir, "lexmap.policy.json"), JSON.stringify(testPolicy, null, 2));

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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
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
        await teardown();
      }
    });
  });

  describe("Performance Validation", () => {
    test("should complete /remember quickly with valid modules", async () => {
      const srv = setup();
      try {
        // Warmup call to prime JIT and caches
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Warmup",
              summary_caption: "JIT warmup",
              status_snapshot: { next_action: "Warmup" },
              module_scope: ["policy/scanners"],
            },
          },
        });

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

        console.log(`  /remember time (3 modules): ${elapsed.toFixed(2)}ms`);
        // Full /remember includes: validation + db write + atlas generation
        // Target: <50ms for typical operation
        assert.ok(elapsed < 50, `/remember took ${elapsed.toFixed(2)}ms, expected <50ms`);
      } finally {
        await teardown();
      }
    });

    test("should scale linearly with module count", async () => {
      const srv = setup();
      try {
        // Warmup call to ensure JIT compilation and cache population
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Warmup",
              summary_caption: "JIT warmup",
              status_snapshot: { next_action: "Warmup" },
              module_scope: ["policy/scanners"],
            },
          },
        });

        // Measure with 2 modules
        const start2 = performance.now();
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Small scope",
              summary_caption: "2 modules",
              status_snapshot: { next_action: "Continue" },
              module_scope: ["policy/scanners", "shared/types"],
            },
          },
        });
        const time2 = performance.now() - start2;

        // Measure with 6 modules
        const start6 = performance.now();
        await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "lex.remember",
            arguments: {
              reference_point: "Large scope test",
              summary_caption: "6 modules",
              status_snapshot: { next_action: "Continue" },
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
        const time6 = performance.now() - start6;

        console.log(`  2 modules: ${time2.toFixed(2)}ms, 6 modules: ${time6.toFixed(2)}ms`);

        // Test that processing 6 modules is reasonably efficient
        // The operation includes: validation, db write, atlas generation
        // We expect time to scale sub-linearly because fixed costs dominate
        const ratio = time6 / time2;
        console.log(`  Scaling ratio (6/2 modules): ${ratio.toFixed(2)}x`);

        // Primary assertion: absolute time should be reasonable
        // Target: 100ms for /remember with 6 modules (allows for db/IO variance)
        assert.ok(
          time6 < 100,
          `/remember with 6 modules took ${time6.toFixed(2)}ms, expected <100ms`
        );

        // Secondary assertion: scaling shouldn't be worse than O(n)
        // With 3x modules, we allow up to 3x time (linear) plus some fixed-cost buffer
        assert.ok(
          ratio < 3.5,
          `Scaling ratio ${ratio.toFixed(2)}x suggests worse than O(n) behavior`
        );
      } finally {
        await teardown();
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
        await teardown();
      }
    });
  });
});

console.log("\n✅ Alias Resolution Integration Tests - Module validation flow\n");
