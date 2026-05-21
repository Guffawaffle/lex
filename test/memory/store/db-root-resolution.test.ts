/**
 * Tests for caller workspace database path resolution.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDefaultDbPath } from "@app/memory/store/db.js";

describe("Database root resolution", () => {
  let testDir: string | undefined;
  const originalEnv = {
    LEX_DB_PATH: process.env.LEX_DB_PATH,
    LEX_MEMORY_DB: process.env.LEX_MEMORY_DB,
    LEX_WORKSPACE_ROOT: process.env.LEX_WORKSPACE_ROOT,
  };
  const originalCwd = process.cwd();

  afterEach(() => {
    restoreEnv();
    process.chdir(originalCwd);

    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
      testDir = undefined;
    }
  });

  function restoreEnv() {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  function createConsumerRepo(): string {
    testDir = mkdtempSync(join(tmpdir(), "lex-db-root-consumer-"));
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "consumer-app" }));
    return testDir;
  }

  test("LEX_DB_PATH takes precedence over LEX_MEMORY_DB", () => {
    const repo = createConsumerRepo();
    const canonical = join(repo, "canonical.db");
    const compat = join(repo, "compat.db");

    process.env.LEX_DB_PATH = canonical;
    process.env.LEX_MEMORY_DB = compat;
    delete process.env.LEX_WORKSPACE_ROOT;

    assert.strictEqual(getDefaultDbPath(), canonical);
  });

  test("LEX_MEMORY_DB remains a compatibility alias", () => {
    const repo = createConsumerRepo();
    const compat = join(repo, "compat.db");

    delete process.env.LEX_DB_PATH;
    process.env.LEX_MEMORY_DB = compat;
    delete process.env.LEX_WORKSPACE_ROOT;

    assert.strictEqual(getDefaultDbPath(), compat);
  });

  test("default path is under caller package root when package is not Lex", () => {
    const repo = createConsumerRepo();
    const nested = join(repo, "nested", "workspace");
    mkdirSync(nested, { recursive: true });

    delete process.env.LEX_DB_PATH;
    delete process.env.LEX_MEMORY_DB;
    delete process.env.LEX_WORKSPACE_ROOT;
    process.chdir(nested);

    assert.strictEqual(getDefaultDbPath(), join(repo, ".smartergpt", "lex", "memory.db"));
  });

  test("LEX_WORKSPACE_ROOT overrides caller package root", () => {
    const repo = createConsumerRepo();
    const explicitRoot = join(repo, "explicit-root");
    mkdirSync(explicitRoot, { recursive: true });

    delete process.env.LEX_DB_PATH;
    delete process.env.LEX_MEMORY_DB;
    process.env.LEX_WORKSPACE_ROOT = explicitRoot;

    assert.strictEqual(getDefaultDbPath(), join(explicitRoot, ".smartergpt", "lex", "memory.db"));
  });
});
