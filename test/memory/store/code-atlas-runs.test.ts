/**
 * Tests for Code Atlas Runs storage (Migration V5)
 *
 * Run with: npm test
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  saveCodeAtlasRun,
  getCodeAtlasRunById,
  getCodeAtlasRunsByRepo,
  getAllCodeAtlasRuns,
  deleteCodeAtlasRun,
  getCodeAtlasRunCount,
} from "@app/memory/store/index.js";
import type { CodeAtlasRun } from "@app/atlas/schemas/code-atlas-run.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-code-atlas-runs-${Date.now()}.db`);

// Sample test CodeAtlasRuns
const testRun1: CodeAtlasRun = {
  runId: "run-001",
  repoId: "repo-test-1",
  filesRequested: ["src/index.ts", "src/utils.ts"],
  filesScanned: ["src/index.ts"],
  unitsEmitted: 42,
  limits: {
    maxFiles: 100,
    maxBytes: 1048576,
  },
  truncated: false,
  strategy: "static",
  createdAt: "2025-11-26T14:00:00.000Z",
  schemaVersion: "code-atlas-run-v0",
};

const testRun2: CodeAtlasRun = {
  runId: "run-002",
  repoId: "repo-test-1",
  filesRequested: ["src/main.ts"],
  filesScanned: ["src/main.ts"],
  unitsEmitted: 15,
  limits: {},
  truncated: true,
  strategy: "llm-assisted",
  createdAt: "2025-11-26T15:00:00.000Z",
  schemaVersion: "code-atlas-run-v0",
};

const testRun3: CodeAtlasRun = {
  runId: "run-003",
  repoId: "repo-test-2",
  filesRequested: ["lib/parser.ts"],
  filesScanned: ["lib/parser.ts"],
  unitsEmitted: 8,
  limits: { maxFiles: 50 },
  truncated: false,
  strategy: "mixed",
  createdAt: "2025-11-26T16:00:00.000Z",
  schemaVersion: "code-atlas-run-v0",
};

describe("Code Atlas Runs Storage Tests", () => {
  let db: ReturnType<typeof getDb>;

  before(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = getDb(TEST_DB_PATH);
  });

  after(() => {
    closeDb();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Database Migration V5", () => {
    test("should create code_atlas_runs table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_atlas_runs'")
        .all();
      assert.strictEqual(tables.length, 1, "code_atlas_runs table should exist");
    });

    test("should have repo_id index", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_atlas_runs_repo'"
        )
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_atlas_runs_repo index should exist");
    });

    test("should have created_at index", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_atlas_runs_created'"
        )
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_atlas_runs_created index should exist");
    });

    test("should have schema version 5 recorded", () => {
      const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as {
        version: number;
      };
      assert.ok(versionRow.version >= 5, "Schema version should be at least 5");
    });
  });

  describe("CRUD Operations", () => {
    test("should save a CodeAtlasRun successfully", () => {
      saveCodeAtlasRun(db, testRun1);
      const count = getCodeAtlasRunCount(db);
      assert.strictEqual(count, 1, "CodeAtlasRun count should be 1 after insert");
    });

    test("should retrieve CodeAtlasRun by ID", () => {
      const run = getCodeAtlasRunById(db, "run-001");
      assert.ok(run, "CodeAtlasRun should be found");
      assert.strictEqual(run!.runId, testRun1.runId);
      assert.strictEqual(run!.repoId, testRun1.repoId);
      assert.deepStrictEqual(run!.filesRequested, testRun1.filesRequested);
      assert.deepStrictEqual(run!.filesScanned, testRun1.filesScanned);
      assert.strictEqual(run!.unitsEmitted, testRun1.unitsEmitted);
      assert.deepStrictEqual(run!.limits, testRun1.limits);
      assert.strictEqual(run!.truncated, testRun1.truncated);
      assert.strictEqual(run!.strategy, testRun1.strategy);
      assert.strictEqual(run!.createdAt, testRun1.createdAt);
      assert.strictEqual(run!.schemaVersion, testRun1.schemaVersion);
    });

    test("should return null for non-existent CodeAtlasRun ID", () => {
      const run = getCodeAtlasRunById(db, "non-existent");
      assert.strictEqual(run, null, "Should return null for non-existent ID");
    });

    test("should update existing CodeAtlasRun (upsert)", () => {
      const updatedRun = {
        ...testRun1,
        unitsEmitted: 100,
      };
      saveCodeAtlasRun(db, updatedRun);
      const run = getCodeAtlasRunById(db, "run-001");
      assert.strictEqual(run!.unitsEmitted, 100);
      const count = getCodeAtlasRunCount(db);
      assert.strictEqual(count, 1, "CodeAtlasRun count should still be 1 after update");
    });

    test("should delete CodeAtlasRun by ID", () => {
      saveCodeAtlasRun(db, testRun2);
      const deleted = deleteCodeAtlasRun(db, "run-002");
      assert.strictEqual(deleted, true, "Delete should return true");
      const run = getCodeAtlasRunById(db, "run-002");
      assert.strictEqual(run, null, "CodeAtlasRun should not exist after delete");
    });

    test("should handle CodeAtlasRun with empty limits", () => {
      const runWithEmptyLimits: CodeAtlasRun = {
        runId: "run-empty-limits",
        repoId: "repo-test",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T17:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      saveCodeAtlasRun(db, runWithEmptyLimits);
      const retrieved = getCodeAtlasRunById(db, "run-empty-limits");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved!.limits, {});
      assert.strictEqual(retrieved!.strategy, undefined);
      deleteCodeAtlasRun(db, "run-empty-limits");
    });

    test("should handle CodeAtlasRun with only maxFiles in limits", () => {
      const runWithMaxFiles: CodeAtlasRun = {
        runId: "run-max-files-only",
        repoId: "repo-test",
        filesRequested: ["src/test.ts"],
        filesScanned: ["src/test.ts"],
        unitsEmitted: 5,
        limits: { maxFiles: 50 },
        truncated: false,
        createdAt: "2025-11-26T17:30:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      saveCodeAtlasRun(db, runWithMaxFiles);
      const retrieved = getCodeAtlasRunById(db, "run-max-files-only");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.limits.maxFiles, 50);
      assert.strictEqual(retrieved!.limits.maxBytes, undefined);
      deleteCodeAtlasRun(db, "run-max-files-only");
    });

    test("should handle CodeAtlasRun with only maxBytes in limits", () => {
      const runWithMaxBytes: CodeAtlasRun = {
        runId: "run-max-bytes-only",
        repoId: "repo-test",
        filesRequested: ["src/test.ts"],
        filesScanned: ["src/test.ts"],
        unitsEmitted: 3,
        limits: { maxBytes: 2048 },
        truncated: true,
        createdAt: "2025-11-26T17:45:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      saveCodeAtlasRun(db, runWithMaxBytes);
      const retrieved = getCodeAtlasRunById(db, "run-max-bytes-only");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.limits.maxFiles, undefined);
      assert.strictEqual(retrieved!.limits.maxBytes, 2048);
      assert.strictEqual(retrieved!.truncated, true);
      deleteCodeAtlasRun(db, "run-max-bytes-only");
    });
  });

  describe("Query Operations", () => {
    before(() => {
      // Clean slate for query tests
      const runs = getAllCodeAtlasRuns(db);
      for (const run of runs) {
        deleteCodeAtlasRun(db, run.runId);
      }
      // Insert test runs
      saveCodeAtlasRun(db, testRun1);
      saveCodeAtlasRun(db, testRun2);
      saveCodeAtlasRun(db, testRun3);
    });

    test("should get CodeAtlasRuns by repo_id", () => {
      const results = getCodeAtlasRunsByRepo(db, "repo-test-1");
      assert.strictEqual(results.length, 2, "Should find 2 runs for repo-test-1");
      assert.ok(
        results.some((r) => r.runId === "run-001"),
        "Should include run-001"
      );
      assert.ok(
        results.some((r) => r.runId === "run-002"),
        "Should include run-002"
      );
    });

    test("should return empty array for non-existent repo_id", () => {
      const results = getCodeAtlasRunsByRepo(db, "non-existent-repo");
      assert.strictEqual(results.length, 0, "Should return empty array for non-existent repo");
    });

    test("should get all CodeAtlasRuns in descending created_at order", () => {
      const results = getAllCodeAtlasRuns(db);
      assert.strictEqual(results.length, 3, "Should get all 3 runs");
      // Runs should be ordered newest first
      assert.ok(
        results[0].createdAt >= results[1].createdAt,
        "Results should be in descending created_at order"
      );
      assert.ok(
        results[1].createdAt >= results[2].createdAt,
        "Results should be in descending created_at order"
      );
    });

    test("should limit results when requested", () => {
      const results = getAllCodeAtlasRuns(db, 2);
      assert.strictEqual(results.length, 2, "Should return only 2 runs");
    });

    test("should get correct count", () => {
      const count = getCodeAtlasRunCount(db);
      assert.strictEqual(count, 3, "Should count 3 runs");
    });
  });

  describe("Strategy enum validation", () => {
    test("should store and retrieve static strategy", () => {
      const run = getCodeAtlasRunById(db, "run-001");
      assert.strictEqual(run!.strategy, "static");
    });

    test("should store and retrieve llm-assisted strategy", () => {
      const run = getCodeAtlasRunById(db, "run-002");
      assert.strictEqual(run!.strategy, "llm-assisted");
    });

    test("should store and retrieve mixed strategy", () => {
      const run = getCodeAtlasRunById(db, "run-003");
      assert.strictEqual(run!.strategy, "mixed");
    });
  });

  describe("Boolean handling", () => {
    test("should correctly store and retrieve truncated=true", () => {
      const run = getCodeAtlasRunById(db, "run-002");
      assert.strictEqual(run!.truncated, true);
    });

    test("should correctly store and retrieve truncated=false", () => {
      const run = getCodeAtlasRunById(db, "run-001");
      assert.strictEqual(run!.truncated, false);
    });
  });

  describe("JSON array storage", () => {
    test("should correctly store and retrieve files_requested array", () => {
      const run = getCodeAtlasRunById(db, "run-001");
      assert.deepStrictEqual(run!.filesRequested, ["src/index.ts", "src/utils.ts"]);
    });

    test("should correctly store and retrieve files_scanned array", () => {
      const run = getCodeAtlasRunById(db, "run-001");
      assert.deepStrictEqual(run!.filesScanned, ["src/index.ts"]);
    });

    test("should handle empty arrays", () => {
      const runWithEmptyArrays: CodeAtlasRun = {
        runId: "run-empty-arrays",
        repoId: "repo-test",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T18:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      saveCodeAtlasRun(db, runWithEmptyArrays);
      const retrieved = getCodeAtlasRunById(db, "run-empty-arrays");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved!.filesRequested, []);
      assert.deepStrictEqual(retrieved!.filesScanned, []);
      deleteCodeAtlasRun(db, "run-empty-arrays");
    });
  });
});

console.log(
  "\n✅ Code Atlas Runs Storage Tests - covering Migration V5, CRUD, queries, and data type handling\n"
);
