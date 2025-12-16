/**
 * Policy Add-Module CLI Command Tests
 *
 * Tests for the `lex policy add-module` command functionality.
 */

import { strict as assert } from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import { tmpdir } from "os";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";

describe("lex policy add-module command", () => {
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
    const dir = mkdtempSync(join(tmpdir(), "lex-policy-add-module-test-"));
    testDir = dir;
    return dir;
  }

  function createTestPolicy(dir: string, modules: Record<string, unknown> = {}): string {
    const policyPath = join(dir, "policy.json");
    writeFileSync(
      policyPath,
      JSON.stringify(
        {
          modules,
        },
        null,
        2
      ) + "\n"
    );
    return policyPath;
  }

  describe("Happy path", () => {
    test("adds a new module to an empty policy", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("cli/new-feature", { policyPath });

      assert.equal(result.success, true);
      assert.equal(result.moduleId, "cli/new-feature");
      assert.equal(result.alreadyExists, false);

      // Verify the policy file was updated
      const updatedPolicy = JSON.parse(readFileSync(policyPath, "utf-8"));
      assert.ok(updatedPolicy.modules["cli/new-feature"]);
      assert.deepEqual(updatedPolicy.modules["cli/new-feature"], { owns_paths: [] });
    });

    test("adds a new module to a policy with existing modules", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir, {
        "existing/module": {
          owns_paths: ["src/existing/**"],
        },
      });

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("new/module", { policyPath });

      assert.equal(result.success, true);
      assert.equal(result.moduleId, "new/module");

      // Verify both modules exist
      const updatedPolicy = JSON.parse(readFileSync(policyPath, "utf-8"));
      assert.ok(updatedPolicy.modules["existing/module"]);
      assert.ok(updatedPolicy.modules["new/module"]);
      assert.deepEqual(updatedPolicy.modules["new/module"], { owns_paths: [] });
    });

    test("preserves JSON formatting with newline at end", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await policyAddModule("test/module", { policyPath });

      const content = readFileSync(policyPath, "utf-8");
      // Check that it ends with a newline
      assert.ok(content.endsWith("\n"));
      // Check that it's properly formatted
      assert.ok(content.includes("  "));
    });
  });

  describe("Module ID validation", () => {
    test("accepts valid module IDs with slashes", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("cli/new-feature", { policyPath });
      assert.equal(result.success, true);
    });

    test("accepts valid module IDs with underscores", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("test_module", { policyPath });
      assert.equal(result.success, true);
    });

    test("accepts valid module IDs with hyphens", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("test-module", { policyPath });
      assert.equal(result.success, true);
    });

    test("accepts valid module IDs with numbers", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("module123", { policyPath });
      assert.equal(result.success, true);
    });

    test("rejects module IDs with uppercase letters", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("INVALID/MODULE", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("Invalid module ID format");
        }
      );
    });

    test("rejects module IDs with spaces", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("invalid module", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("Invalid module ID format");
        }
      );
    });

    test("rejects module IDs with special characters", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("invalid@module", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("Invalid module ID format");
        }
      );
    });

    test("rejects empty module ID", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("Module ID cannot be empty");
        }
      );
    });

    test("trims whitespace from module ID", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("  test/module  ", { policyPath });

      assert.equal(result.success, true);
      assert.equal(result.moduleId, "test/module");

      const updatedPolicy = JSON.parse(readFileSync(policyPath, "utf-8"));
      assert.ok(updatedPolicy.modules["test/module"]);
      assert.ok(!updatedPolicy.modules["  test/module  "]);
    });
  });

  describe("Duplicate module handling", () => {
    test("detects when module already exists", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir, {
        "existing/module": {
          owns_paths: ["src/existing/**"],
        },
      });

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("existing/module", { policyPath });

      assert.equal(result.success, true);
      assert.equal(result.alreadyExists, true);
      assert.ok(result.message.includes("already exists"));
    });

    test("does not modify policy when module already exists", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir, {
        "existing/module": {
          owns_paths: ["src/existing/**"],
          description: "Original description",
        },
      });

      const originalContent = readFileSync(policyPath, "utf-8");

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await policyAddModule("existing/module", { policyPath });

      const updatedContent = readFileSync(policyPath, "utf-8");
      assert.equal(updatedContent, originalContent);
    });
  });

  describe("Error handling", () => {
    test("throws error when policy file doesn't exist", async () => {
      const dir = createTestDir();
      const nonExistentPath = join(dir, "nonexistent.json");

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("test/module", { policyPath: nonExistentPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("Policy file not found");
        }
      );
    });

    test("throws error when policy file has invalid JSON", async () => {
      const dir = createTestDir();
      const policyPath = join(dir, "invalid.json");
      writeFileSync(policyPath, "{ invalid json ");

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("test/module", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("parse") || err.message.includes("JSON");
        }
      );
    });

    test("throws error when policy file has invalid structure", async () => {
      const dir = createTestDir();
      const policyPath = join(dir, "invalid.json");
      writeFileSync(policyPath, JSON.stringify({ noModulesField: {} }));

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      await assert.rejects(
        async () => {
          await policyAddModule("test/module", { policyPath });
        },
        (error: unknown) => {
          const err = error as { message: string };
          return err.message.includes("modules");
        }
      );
    });
  });

  describe("JSON output mode", () => {
    test("returns structured result for successful addition", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir);

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("test/module", { policyPath, json: true });

      assert.ok("success" in result);
      assert.ok("moduleId" in result);
      assert.ok("policyPath" in result);
      assert.ok("message" in result);
      assert.equal(result.success, true);
      assert.equal(result.moduleId, "test/module");
    });

    test("returns structured result for existing module", async () => {
      const dir = createTestDir();
      const policyPath = createTestPolicy(dir, {
        "existing/module": { owns_paths: [] },
      });

      const { policyAddModule } = await import("@app/shared/cli/policy-add-module.js");

      const result = await policyAddModule("existing/module", { policyPath, json: true });

      assert.equal(result.success, true);
      assert.equal(result.alreadyExists, true);
    });
  });
});
