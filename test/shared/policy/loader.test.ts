/**
 * Policy loader tests with precedence chain validation
 *
 * Precedence chain:
 * 1. LEX_POLICY_PATH (explicit environment override)
 * 2. Custom path parameter (if provided)
 * 3. .smartergpt/lex/lexmap.policy.json (working file)
 * 4. src/policy/policy_spec/lexmap.policy.json.example (example template)
 *
 * Tests cover:
 * - Basic precedence at each level
 * - Override priority (ENV > custom > working > example)
 * - Caching behavior
 * - Error handling
 * - Edge cases (missing dirs, invalid JSON, concurrent access)
 */

import { strict as assert } from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import { loadPolicy, loadPolicyIfAvailable, clearPolicyCache } from "@app/shared/policy/loader.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Policy Loader Precedence", () => {
  let originalWorkspaceRoot: string | undefined;
  let originalPolicyPath: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
    originalPolicyPath = process.env.LEX_POLICY_PATH;
    delete process.env.LEX_POLICY_PATH;
    clearPolicyCache();
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

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }

    clearPolicyCache();
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-policy-test-"));
    testRepoDir = dir;

    // Create package.json to make it a valid repo
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));

    return dir;
  }

  function createTestPolicy(moduleName: string) {
    return {
      modules: {
        [moduleName]: {
          enabled: true,
          fold_radius: 2,
          rules: {},
        },
      },
    };
  }

  test("loads from LEX_POLICY_PATH when set", () => {
    const repo = createTestRepo();
    const customPolicyDir = join(repo, "custom-policy");
    mkdirSync(customPolicyDir, { recursive: true });

    const policyPath = join(customPolicyDir, "policy.json");
    writeFileSync(policyPath, JSON.stringify(createTestPolicy("env-override")));

    process.env.LEX_WORKSPACE_ROOT = repo;
    process.env.LEX_POLICY_PATH = policyPath;

    const policy = loadPolicy();
    assert.ok(policy.modules["env-override"]);
  });

  test("custom path parameter overrides working file", () => {
    const repo = createTestRepo();

    // Create working file
    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("working"))
    );

    // Create custom path file
    const customPath = join(repo, "custom.json");
    writeFileSync(customPath, JSON.stringify(createTestPolicy("custom-path")));

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicy(customPath);
    assert.ok(policy.modules["custom-path"]);
  });

  test("falls back to working file when no overrides", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("working"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicy();
    assert.ok(policy.modules["working"]);
  });

  test("falls back to example file when working file missing", () => {
    const repo = createTestRepo();

    // Create example file
    const exampleDir = join(repo, "src", "policy", "policy_spec");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(
      join(exampleDir, "lexmap.policy.json.example"),
      JSON.stringify(createTestPolicy("example"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicy();
    assert.ok(policy.modules["example"]);
  });

  test("LEX_POLICY_PATH overrides all other sources", () => {
    const repo = createTestRepo();

    // Create all levels
    const envPath = join(repo, "env.json");
    writeFileSync(envPath, JSON.stringify(createTestPolicy("env")));

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("working"))
    );

    const exampleDir = join(repo, "src", "policy", "policy_spec");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(
      join(exampleDir, "lexmap.policy.json.example"),
      JSON.stringify(createTestPolicy("example"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;
    process.env.LEX_POLICY_PATH = envPath;

    const policy = loadPolicy();
    assert.ok(policy.modules["env"]);
    assert.ok(!policy.modules["working"]);
    assert.ok(!policy.modules["example"]);
  });

  test("working file overrides example file", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("working"))
    );

    const exampleDir = join(repo, "src", "policy", "policy_spec");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(
      join(exampleDir, "lexmap.policy.json.example"),
      JSON.stringify(createTestPolicy("example"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicy();
    assert.ok(policy.modules["working"]);
    assert.ok(!policy.modules["example"]);
  });

  test("caches policy on subsequent loads", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, "lexmap.policy.json"), JSON.stringify(createTestPolicy("test")));

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy1 = loadPolicy();
    const policy2 = loadPolicy();

    // Should return the same cached object
    assert.strictEqual(policy1, policy2);
  });

  test("clearPolicyCache clears the cache", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, "lexmap.policy.json"), JSON.stringify(createTestPolicy("test")));

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy1 = loadPolicy();
    clearPolicyCache();
    const policy2 = loadPolicy();

    // Should be different objects since cache was cleared
    assert.notStrictEqual(policy1, policy2);

    // But content should be the same
    assert.deepEqual(policy1.modules, policy2.modules);
  });

  test("throws error when no policy files exist", () => {
    const repo = createTestRepo();
    process.env.LEX_WORKSPACE_ROOT = repo;

    assert.throws(() => {
      loadPolicy();
    }, /Policy file not found/);
  });

  test("throws error for non-existent custom path", () => {
    assert.throws(() => {
      loadPolicy("/nonexistent/path/policy.json");
    }, /Policy file not found/);
  });
});

describe("Policy Loader Edge Cases", () => {
  let originalWorkspaceRoot: string | undefined;
  let originalPolicyPath: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
    originalPolicyPath = process.env.LEX_POLICY_PATH;
    delete process.env.LEX_POLICY_PATH;
    clearPolicyCache();
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

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }

    clearPolicyCache();
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-policy-test-"));
    testRepoDir = dir;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));
    return dir;
  }

  function createTestPolicy(moduleName: string) {
    return {
      modules: {
        [moduleName]: {
          enabled: true,
          fold_radius: 2,
          rules: {},
        },
      },
    };
  }

  test("handles invalid JSON in policy file", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, "lexmap.policy.json"), "{ invalid json }");

    process.env.LEX_WORKSPACE_ROOT = repo;

    assert.throws(() => {
      loadPolicy();
    }, /Failed to load policy/);
  });

  test("handles missing modules field in policy", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, "lexmap.policy.json"), JSON.stringify({ version: "1.0" }));

    process.env.LEX_WORKSPACE_ROOT = repo;

    assert.throws(() => {
      loadPolicy();
    }, /Invalid policy structure/);
  });

  test("handles relative paths in LEX_POLICY_PATH", () => {
    const repo = createTestRepo();
    const originalCwd = process.cwd();

    try {
      const policyPath = join(repo, "custom.json");
      writeFileSync(policyPath, JSON.stringify(createTestPolicy("relative")));

      process.chdir(repo);
      process.env.LEX_WORKSPACE_ROOT = repo;
      process.env.LEX_POLICY_PATH = "./custom.json";

      const policy = loadPolicy();
      assert.ok(policy.modules["relative"]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("handles concurrent loadPolicy() calls", async () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("concurrent"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    // Load policies concurrently
    const [policy1, policy2, policy3] = await Promise.all([
      Promise.resolve(loadPolicy()),
      Promise.resolve(loadPolicy()),
      Promise.resolve(loadPolicy()),
    ]);

    // All should have same content
    assert.deepEqual(policy1.modules, policy2.modules);
    assert.deepEqual(policy2.modules, policy3.modules);
  });

  test("does not cache when using custom path", () => {
    const repo = createTestRepo();

    const path1 = join(repo, "policy1.json");
    const path2 = join(repo, "policy2.json");
    writeFileSync(path1, JSON.stringify(createTestPolicy("policy1")));
    writeFileSync(path2, JSON.stringify(createTestPolicy("policy2")));

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy1 = loadPolicy(path1);
    const policy2 = loadPolicy(path2);

    assert.ok(policy1.modules["policy1"]);
    assert.ok(policy2.modules["policy2"]);
    assert.notStrictEqual(policy1, policy2);
  });

  test("does not cache when using LEX_POLICY_PATH", () => {
    const repo = createTestRepo();

    const path1 = join(repo, "policy1.json");
    const path2 = join(repo, "policy2.json");
    writeFileSync(path1, JSON.stringify(createTestPolicy("policy1")));
    writeFileSync(path2, JSON.stringify(createTestPolicy("policy2")));

    process.env.LEX_WORKSPACE_ROOT = repo;

    process.env.LEX_POLICY_PATH = path1;
    const policy1 = loadPolicy();
    clearPolicyCache();

    process.env.LEX_POLICY_PATH = path2;
    const policy2 = loadPolicy();

    assert.ok(policy1.modules["policy1"]);
    assert.ok(policy2.modules["policy2"]);
  });

  test("handles missing .smartergpt directory gracefully", () => {
    const repo = createTestRepo();

    // Create only example file
    const exampleDir = join(repo, "src", "policy", "policy_spec");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(
      join(exampleDir, "lexmap.policy.json.example"),
      JSON.stringify(createTestPolicy("example"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicy();
    assert.ok(policy.modules["example"]);
  });

  test("error message includes helpful setup instructions", () => {
    const repo = createTestRepo();
    process.env.LEX_WORKSPACE_ROOT = repo;

    try {
      loadPolicy();
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(message.includes("Policy file not found"));
      assert.ok(message.includes("npm run setup-local"));
    }
  });

  test("loadPolicyIfAvailable returns null when no policy file exists", () => {
    const repo = createTestRepo();
    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicyIfAvailable();
    assert.strictEqual(policy, null, "Should return null when no policy file exists");
  });

  test("loadPolicyIfAvailable returns policy when file exists", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "lexmap.policy.json"),
      JSON.stringify(createTestPolicy("test"))
    );

    process.env.LEX_WORKSPACE_ROOT = repo;

    const policy = loadPolicyIfAvailable();
    assert.ok(policy !== null, "Should return policy when file exists");
    assert.ok(policy.modules["test"], "Should have the test module");
  });

  test("loadPolicyIfAvailable throws on invalid JSON", () => {
    const repo = createTestRepo();

    const workingDir = join(repo, ".smartergpt", "lex");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, "lexmap.policy.json"), "{ invalid json }");

    process.env.LEX_WORKSPACE_ROOT = repo;

    assert.throws(() => {
      loadPolicyIfAvailable();
    }, /Failed to load policy/);
  });
});
