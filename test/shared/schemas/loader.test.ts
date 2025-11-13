/**
 * Tests for Schema Loader
 *
 * Run with: npx tsx --test test/shared/schemas/loader.test.ts
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import { loadSchema, getSchemaPath, listSchemas } from "@app/shared/schemas/loader.js";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("loadSchema", () => {
  test("loads schema from package canon", () => {
    const schema = loadSchema("test-schema.json");
    assert.ok(schema);
    assert.equal(typeof schema, "object");
  });

  test("throws error for non-existent schema", () => {
    assert.throws(() => {
      loadSchema("nonexistent-schema.json");
    }, /Schema file 'nonexistent-schema.json' not found/);
  });

  test("error message shows all attempted paths", () => {
    try {
      loadSchema("missing.json");
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assert.ok(error.message.includes("Tried:"));
        assert.ok(error.message.includes(".smartergpt.local"));
      } else {
        assert.fail("Error should be an instance of Error");
      }
    }
  });

  test("local overlay takes precedence over package canon", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const localDir = join(repoRoot, ".smartergpt.local", "schemas");
    const localPath = join(localDir, "test-overlay.json");

    let createdLocalFile = false;

    try {
      // Create local overlay
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }
      writeFileSync(localPath, JSON.stringify({ source: "local-overlay" }));
      createdLocalFile = true;

      const schema = loadSchema("test-overlay.json");
      assert.ok(schema);
      assert.equal((schema as any).source, "local-overlay");
    } finally {
      // Cleanup
      if (createdLocalFile && existsSync(localPath)) {
        unlinkSync(localPath);
      }
    }
  });

  test("environment variable override works", async () => {
    const originalEnv = process.env.LEX_SCHEMAS_DIR;
    const repoRoot = resolve(__dirname, "../../..");
    const envDir = join(repoRoot, ".tmp-schemas-test");
    const envPath = join(envDir, "env-test.json");

    let createdEnvFile = false;

    try {
      // Create env override directory
      if (!existsSync(envDir)) {
        mkdirSync(envDir, { recursive: true });
      }
      writeFileSync(envPath, JSON.stringify({ source: "env-override" }));
      createdEnvFile = true;

      process.env.LEX_SCHEMAS_DIR = envDir;
      const schema = loadSchema("env-test.json");
      assert.ok(schema);
      assert.equal((schema as any).source, "env-override");
    } finally {
      // Cleanup
      if (originalEnv) {
        process.env.LEX_SCHEMAS_DIR = originalEnv;
      } else {
        delete process.env.LEX_SCHEMAS_DIR;
      }
      if (createdEnvFile && existsSync(envPath)) {
        unlinkSync(envPath);
      }
      if (existsSync(envDir)) {
        try {
          const fs = await import("fs");
          fs.rmSync(envDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });
});

describe("getSchemaPath", () => {
  test("returns path for existing schema", () => {
    const path = getSchemaPath("test-schema.json");
    assert.ok(path);
    assert.ok(path.endsWith("test-schema.json"));
  });

  test("returns null for non-existent schema", () => {
    const path = getSchemaPath("nonexistent.json");
    assert.strictEqual(path, null);
  });
});

describe("listSchemas", () => {
  test("lists available schemas", () => {
    const schemas = listSchemas();
    assert.ok(Array.isArray(schemas));
    // Should include at least the test schema
    assert.ok(schemas.includes("test-schema.json"));
  });

  test("returns sorted array", () => {
    const schemas = listSchemas();
    const sorted = [...schemas].sort();
    assert.deepEqual(schemas, sorted);
  });
});
