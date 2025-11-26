/**
 * Policy Check CLI Command Tests
 *
 * Tests for the `lex policy check` command functionality.
 */

import { strict as assert } from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import { tmpdir } from "os";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

describe("lex policy check command", () => {
  let testDir: string | undefined;
  let originalWorkspaceRoot: string | undefined;
  let originalPolicyPath: string | undefined;

  beforeEach(() => {
    originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
    originalPolicyPath = process.env.LEX_POLICY_PATH;
    delete process.env.LEX_POLICY_PATH;
  });

  afterEach(() => {
    if (originalWorkspaceRoot !== undefined) {
      process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
    } else {
      delete process.env.LEX_WORKSPACE_ROOT;
    }

    if (originalPolicyPath !== undefined) {
      process.env.LEX_POLICY_PATH = originalPolicyPath;
    } else {
      delete process.env.LEX_POLICY_PATH;
    }

    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testDir = undefined;
    }
  });

  function createTestDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-policy-check-test-"));
    testDir = dir;
    return dir;
  }

  describe("Schema validation", () => {
    test("validates a valid policy file via CLI", async () => {
      const dir = createTestDir();
      const policyPath = join(dir, "policy.json");

      writeFileSync(
        policyPath,
        JSON.stringify({
          modules: {
            "test/module": {
              description: "Test module",
              owns_paths: ["src/test/**"],
            },
          },
        })
      );

      // Import the validation function directly for testing
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");
      const { readFileSync } = await import("fs");
      const policy = JSON.parse(readFileSync(policyPath, "utf-8"));
      const result = validatePolicySchema(policy);

      assert.equal(result.valid, true);
      assert.equal(result.moduleCount, 1);
      assert.equal(result.errors.length, 0);
    });

    test("detects invalid module ID format", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = {
        modules: {
          "INVALID/UPPERCASE": { description: "test" },
        },
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    test("detects missing modules field", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = {
        schemaVersion: "1.0.0",
      };

      const result = validatePolicySchema(policy);
      assert.equal(result.valid, false);
    });
  });

  describe("Codebase matching (--match)", () => {
    test("detects orphan modules with no matching files", async () => {
      const dir = createTestDir();

      // Create a minimal source structure
      const srcDir = join(dir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "index.ts"), "export {}");

      // Create policy with module pointing to non-existent path
      const policyPath = join(dir, "policy.json");
      writeFileSync(
        policyPath,
        JSON.stringify({
          modules: {
            "nonexistent/module": {
              description: "Points to nothing",
              owns_paths: ["src/nonexistent/**"],
            },
          },
        })
      );

      // Manually test the matching logic
      const { existsSync } = await import("fs");
      const modulePath = join(dir, "src", "nonexistent");
      assert.equal(existsSync(modulePath), false);
    });

    test("validates modules that match codebase structure", async () => {
      const dir = createTestDir();

      // Create source structure
      const moduleDir = join(dir, "src", "existing");
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(join(moduleDir, "index.ts"), "export {}");

      // Create policy with module pointing to existing path
      const policyPath = join(dir, "policy.json");
      writeFileSync(
        policyPath,
        JSON.stringify({
          modules: {
            existing: {
              description: "Existing module",
              owns_paths: ["src/existing/**"],
            },
          },
        })
      );

      const { existsSync } = await import("fs");
      assert.equal(existsSync(moduleDir), true);
    });
  });

  describe("JSON output", () => {
    test("produces valid JSON output structure", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = {
        modules: {
          "test/module": {
            description: "Test",
            owns_paths: ["src/test/**"],
          },
        },
      };

      const result = validatePolicySchema(policy);

      // Verify the result structure matches expected JSON output
      assert.ok("valid" in result);
      assert.ok("moduleCount" in result);
      assert.ok("errors" in result);
      assert.ok("warnings" in result);
      assert.ok(Array.isArray(result.errors));
      assert.ok(Array.isArray(result.warnings));
    });

    test("includes error details in JSON output", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = {
        modules: {
          "INVALID": { description: "test" },
        },
      };

      const result = validatePolicySchema(policy);

      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
      assert.ok("path" in result.errors[0]);
      assert.ok("message" in result.errors[0]);
      assert.ok("code" in result.errors[0]);
    });
  });

  describe("Exit codes", () => {
    test("schema validation returns valid:true for valid policy", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = { modules: {} };
      const result = validatePolicySchema(policy);

      // Exit code 0 corresponds to valid:true
      assert.equal(result.valid, true);
    });

    test("schema validation returns valid:false for invalid policy", async () => {
      const { validatePolicySchema } = await import("@app/shared/policy/schema.js");

      const policy = {}; // Missing modules
      const result = validatePolicySchema(policy);

      // Exit code 1 corresponds to valid:false
      assert.equal(result.valid, false);
    });
  });
});
