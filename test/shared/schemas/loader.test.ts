/**
 * Schema loader tests with precedence chain validation
 *
 * Precedence chain:
 * 1. LEX_SCHEMAS_DIR (explicit environment override)
 * 2. .smartergpt/schemas/ (local untracked overlay)
 * 3. Package schemas/ (published canon from build)
 *
 * Tests cover:
 * - Basic precedence at each level
 * - Override priority (ENV > local > package)
 * - Deduplication in listSchemas()
 * - Error handling
 * - Edge cases (missing dirs, concurrent access)
 */

import { strict as assert } from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import { loadSchema, getSchemaPath, listSchemas } from "@app/shared/schemas/loader.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Schema Loader Precedence", () => {
  let originalDir: string;
  let originalSchemasDir: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalSchemasDir = process.env.LEX_SCHEMAS_DIR;
    delete process.env.LEX_SCHEMAS_DIR;
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (originalSchemasDir !== undefined) {
      process.env.LEX_SCHEMAS_DIR = originalSchemasDir;
    } else {
      delete process.env.LEX_SCHEMAS_DIR;
    }

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-schema-test-"));
    testRepoDir = dir;

    // Create package.json to make it a valid repo
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));

    return dir;
  }

  test("loads from LEX_SCHEMAS_DIR when set", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "schemas"), { recursive: true });
      writeFileSync(join(customCanon, "schemas", "test.json"), JSON.stringify({ source: "env" }));

      process.env.LEX_SCHEMAS_DIR = join(customCanon, "schemas");
      process.chdir(repo);

      const result = loadSchema("test.json");
      assert.deepEqual(result, { source: "env" });
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("falls back to .smartergpt/ when LEX_SCHEMAS_DIR not set", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "test.json"),
      JSON.stringify({ source: "local" })
    );

    process.chdir(repo);

    const result = loadSchema("test.json");
    assert.deepEqual(result, { source: "local" });
  });

  test("falls back to package schemas/ when no overrides exist", () => {
    const repo = createTestRepo();
    process.chdir(repo);

    // Should load from actual package's schemas/ (test-schema.json exists there)
    const result = loadSchema("test-schema.json");
    assert.ok(result);
    assert.equal(typeof result, "object");
  });

  test("LEX_SCHEMAS_DIR overrides .smartergpt/", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "schemas"), { recursive: true });
      writeFileSync(join(customCanon, "schemas", "test.json"), JSON.stringify({ source: "env" }));

      mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
      writeFileSync(
        join(repo, ".smartergpt", "schemas", "test.json"),
        JSON.stringify({ source: "local" })
      );

      process.env.LEX_SCHEMAS_DIR = join(customCanon, "schemas");
      process.chdir(repo);

      const result = loadSchema("test.json");
      assert.deepEqual(result, { source: "env" });
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test(".smartergpt/ overrides package schemas/", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "test-schema.json"),
      JSON.stringify({ source: "local" })
    );

    mkdirSync(join(repo, "schemas"), { recursive: true });
    writeFileSync(join(repo, "schemas", "test-schema.json"), JSON.stringify({ source: "package" }));

    process.chdir(repo);

    const result = loadSchema("test-schema.json");
    assert.deepEqual(result, { source: "local" });
  });

  test("throws when schema not found anywhere", () => {
    const repo = createTestRepo();
    process.chdir(repo);

    assert.throws(() => {
      loadSchema("nonexistent.json");
    }, /Schema file 'nonexistent\.json' not found/);
  });

  test("error message shows all attempted paths", () => {
    const repo = createTestRepo();
    process.chdir(repo);

    try {
      loadSchema("missing.json");
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assert.ok(error.message.includes("Tried:"));
        assert.ok(error.message.includes(".smartergpt"));
      } else {
        assert.fail("Error should be an instance of Error");
      }
    }
  });

  test("listSchemas() deduplicates across all sources", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      // Setup: schema exists in all 3 locations
      mkdirSync(join(customCanon, "schemas"), { recursive: true });
      writeFileSync(join(customCanon, "schemas", "shared.json"), JSON.stringify({ source: "env" }));
      writeFileSync(
        join(customCanon, "schemas", "env-only.json"),
        JSON.stringify({ source: "env" })
      );

      mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
      writeFileSync(
        join(repo, ".smartergpt", "schemas", "shared.json"),
        JSON.stringify({ source: "local" })
      );
      writeFileSync(
        join(repo, ".smartergpt", "schemas", "local-only.json"),
        JSON.stringify({ source: "local" })
      );

      process.env.LEX_SCHEMAS_DIR = join(customCanon, "schemas");
      process.chdir(repo);

      const schemas = listSchemas();

      // Deduplicated: should have unique schemas
      assert.ok(schemas.includes("shared.json"));
      assert.ok(schemas.includes("env-only.json"));
      assert.ok(schemas.includes("local-only.json"));
      // Package schemas come from real lex package
      assert.ok(schemas.includes("test-schema.json")); // From real package

      // Verify shared.json appears only once (despite being in multiple locations)
      assert.strictEqual(
        schemas.filter((s) => s === "shared.json").length,
        1,
        "shared.json should appear once"
      );
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("getSchemaPath() returns correct path for each level", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      mkdirSync(join(customCanon, "schemas"), { recursive: true });
      writeFileSync(join(customCanon, "schemas", "env.json"), JSON.stringify({ source: "env" }));

      mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
      writeFileSync(
        join(repo, ".smartergpt", "schemas", "local.json"),
        JSON.stringify({ source: "local" })
      );

      process.env.LEX_SCHEMAS_DIR = join(customCanon, "schemas");
      process.chdir(repo);

      // Test each level
      const envPath = getSchemaPath("env.json");
      assert.ok(envPath?.includes(join(customCanon, "schemas", "env.json")));

      const localPath = getSchemaPath("local.json");
      assert.ok(localPath?.includes(join(repo, ".smartergpt", "schemas", "local.json")));

      // Package path - should resolve to real package's test-schema.json
      const packagePath = getSchemaPath("test-schema.json");
      assert.ok(packagePath?.includes("schemas"));
      assert.ok(packagePath?.includes("test-schema.json"));

      // Non-existent schema
      const nonExistent = getSchemaPath("nonexistent.json");
      assert.strictEqual(nonExistent, null);
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });
});

describe("Schema Loader Edge Cases", () => {
  let originalDir: string;
  let originalSchemasDir: string | undefined;
  let testRepoDir: string | undefined;

  beforeEach(() => {
    originalDir = process.cwd();
    originalSchemasDir = process.env.LEX_SCHEMAS_DIR;
    delete process.env.LEX_SCHEMAS_DIR;
  });

  afterEach(() => {
    process.chdir(originalDir);

    if (originalSchemasDir !== undefined) {
      process.env.LEX_SCHEMAS_DIR = originalSchemasDir;
    } else {
      delete process.env.LEX_SCHEMAS_DIR;
    }

    if (testRepoDir) {
      try {
        rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      testRepoDir = undefined;
    }
  });

  function createTestRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "lex-schema-test-"));
    testRepoDir = dir;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lex", version: "1.0.0" }));
    return dir;
  }

  test("handles relative paths in LEX_SCHEMAS_DIR", () => {
    const repo = createTestRepo();

    // Create canon directory inside the repo
    mkdirSync(join(repo, "custom-canon", "schemas"), { recursive: true });
    writeFileSync(
      join(repo, "custom-canon", "schemas", "test.json"),
      JSON.stringify({ source: "relative" })
    );

    process.chdir(repo);
    process.env.LEX_SCHEMAS_DIR = "./custom-canon/schemas";

    const result = loadSchema("test.json");
    assert.deepEqual(result, { source: "relative" });
  });

  test("handles missing .smartergpt/ directory gracefully", () => {
    const repo = createTestRepo();
    process.chdir(repo);

    // Should not throw, should fall back to package schemas
    const result = loadSchema("test-schema.json");
    assert.ok(result);
    assert.equal(typeof result, "object");
  });

  test("handles concurrent loadSchema() calls", async () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "concurrent1.json"),
      JSON.stringify({ id: 1 })
    );
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "concurrent2.json"),
      JSON.stringify({ id: 2 })
    );
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "concurrent3.json"),
      JSON.stringify({ id: 3 })
    );

    process.chdir(repo);

    // Load multiple schemas concurrently
    const [result1, result2, result3] = await Promise.all([
      Promise.resolve(loadSchema("concurrent1.json")),
      Promise.resolve(loadSchema("concurrent2.json")),
      Promise.resolve(loadSchema("concurrent3.json")),
    ]);

    assert.deepEqual(result1, { id: 1 });
    assert.deepEqual(result2, { id: 2 });
    assert.deepEqual(result3, { id: 3 });
  });

  test("handles invalid JSON in schema file", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
    writeFileSync(join(repo, ".smartergpt", "schemas", "invalid.json"), "{ invalid json }");

    process.chdir(repo);

    assert.throws(() => {
      loadSchema("invalid.json");
    }, /SyntaxError|JSON/);
  });

  test("listSchemas() includes package schemas when no overrides exist", () => {
    const repo = createTestRepo();
    process.chdir(repo);
    delete process.env.LEX_SCHEMAS_DIR; // Ensure no env override

    const schemas = listSchemas();
    assert.ok(Array.isArray(schemas));
    // Should include schemas from the real package
    assert.ok(schemas.length > 0);
    assert.ok(schemas.includes("test-schema.json")); // From package
  });

  test("listSchemas() filters out non-.json files", () => {
    const repo = createTestRepo();

    mkdirSync(join(repo, ".smartergpt", "schemas"), { recursive: true });
    writeFileSync(
      join(repo, ".smartergpt", "schemas", "valid.json"),
      JSON.stringify({ valid: true })
    );
    writeFileSync(join(repo, ".smartergpt", "schemas", "invalid.txt"), "Not JSON");
    writeFileSync(join(repo, ".smartergpt", "schemas", "README"), "No extension");

    process.chdir(repo);

    const schemas = listSchemas();
    assert.ok(schemas.includes("valid.json"));
    assert.ok(!schemas.includes("invalid.txt"));
    assert.ok(!schemas.includes("README"));
  });

  test("handles LEX_SCHEMAS_DIR with missing schemas subdirectory", () => {
    const customCanon = mkdtempSync(join(tmpdir(), "lex-canon-"));
    const repo = createTestRepo();

    try {
      // Don't create schemas subdirectory
      writeFileSync(join(customCanon, "README.md"), "# Canon");

      process.env.LEX_SCHEMAS_DIR = customCanon;
      process.chdir(repo);

      // Should fall back to package schemas
      const result = loadSchema("test-schema.json");
      assert.ok(result);
      assert.equal(typeof result, "object");
    } finally {
      rmSync(customCanon, { recursive: true, force: true });
    }
  });

  test("returns sorted array from listSchemas()", () => {
    const schemas = listSchemas();
    const sorted = [...schemas].sort();
    assert.deepEqual(schemas, sorted);
  });
});
