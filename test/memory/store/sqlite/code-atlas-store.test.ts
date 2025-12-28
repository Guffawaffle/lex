/**
 * Tests for SqliteCodeAtlasStore (STORE-007)
 *
 * Unit tests for the SQLite implementation of CodeAtlasStore interface.
 * Uses in-memory SQLite for isolation and speed.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createDatabase, closeDb } from "@app/memory/store/index.js";
import { SqliteCodeAtlasStore } from "@app/memory/store/sqlite/code-atlas-store.js";
import type { CodeUnit } from "@app/atlas/schemas/code-unit.js";
import type { CodeAtlasRun } from "@app/atlas/schemas/code-atlas-run.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-sqlite-code-atlas-store-${Date.now()}.db`);

// Sample test CodeUnits
const testUnit1: CodeUnit = {
  id: "sqlite-cu-001",
  repoId: "sqlite-repo-1",
  filePath: "src/foo/bar.ts",
  language: "ts",
  kind: "function",
  symbolPath: "src/foo/bar.ts::myFunction",
  name: "myFunction",
  span: { startLine: 10, endLine: 20 },
  tags: ["test", "api"],
  docComment: "A test function",
  discoveredAt: "2025-11-26T14:00:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit2: CodeUnit = {
  id: "sqlite-cu-002",
  repoId: "sqlite-repo-1",
  filePath: "src/foo/bar.ts",
  language: "ts",
  kind: "class",
  symbolPath: "src/foo/bar.ts::MyClass",
  name: "MyClass",
  span: { startLine: 30, endLine: 100 },
  tags: ["api"],
  discoveredAt: "2025-11-26T14:01:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit3: CodeUnit = {
  id: "sqlite-cu-003",
  repoId: "sqlite-repo-2",
  filePath: "src/utils/helper.ts",
  language: "ts",
  kind: "function",
  symbolPath: "src/utils/helper.ts::helperFn",
  name: "helperFn",
  span: { startLine: 1, endLine: 10 },
  discoveredAt: "2025-11-26T14:02:00.000Z",
  schemaVersion: "code-unit-v0",
};

// Sample test CodeAtlasRuns
const testRun1: CodeAtlasRun = {
  runId: "sqlite-run-001",
  repoId: "sqlite-repo-1",
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
  runId: "sqlite-run-002",
  repoId: "sqlite-repo-1",
  filesRequested: ["src/main.ts"],
  filesScanned: ["src/main.ts"],
  unitsEmitted: 15,
  limits: {},
  truncated: true,
  strategy: "llm-assisted",
  createdAt: "2025-11-26T15:00:00.000Z",
  schemaVersion: "code-atlas-run-v0",
};

describe("SqliteCodeAtlasStore Tests", () => {
  let store: SqliteCodeAtlasStore;

  before(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    const db = createDatabase(TEST_DB_PATH);
    store = new SqliteCodeAtlasStore(db);
  });

  after(async () => {
    await store.close();
    closeDb();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("CodeUnit CRUD Operations", () => {
    test("should insert a CodeUnit successfully", async () => {
      await store.insertCodeUnit(testUnit1);
      const unit = await store.getCodeUnitById(testUnit1.id);
      assert.ok(unit, "CodeUnit should be found");
      assert.strictEqual(unit!.id, testUnit1.id);
      assert.strictEqual(unit!.repoId, testUnit1.repoId);
      assert.strictEqual(unit!.name, testUnit1.name);
    });

    test("should retrieve CodeUnit by ID", async () => {
      const unit = await store.getCodeUnitById("sqlite-cu-001");
      assert.ok(unit, "CodeUnit should be found");
      assert.strictEqual(unit!.id, testUnit1.id);
      assert.strictEqual(unit!.filePath, testUnit1.filePath);
      assert.strictEqual(unit!.language, testUnit1.language);
      assert.strictEqual(unit!.kind, testUnit1.kind);
      assert.strictEqual(unit!.symbolPath, testUnit1.symbolPath);
      assert.deepStrictEqual(unit!.span, testUnit1.span);
      assert.deepStrictEqual(unit!.tags, testUnit1.tags);
      assert.strictEqual(unit!.docComment, testUnit1.docComment);
    });

    test("should return null for non-existent CodeUnit ID", async () => {
      const unit = await store.getCodeUnitById("non-existent");
      assert.strictEqual(unit, null, "Should return null for non-existent ID");
    });

    test("should insert multiple CodeUnits in batch", async () => {
      const result = await store.insertCodeUnitBatch([testUnit2, testUnit3]);
      assert.strictEqual(result.inserted, 2);

      const unit2 = await store.getCodeUnitById(testUnit2.id);
      const unit3 = await store.getCodeUnitById(testUnit3.id);
      assert.ok(unit2, "Unit 2 should exist");
      assert.ok(unit3, "Unit 3 should exist");
    });

    test("should list CodeUnits by repo with pagination", async () => {
      const result = await store.listCodeUnitsByRepo("sqlite-repo-1");
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.items.length, 2);
      assert.ok(result.items.every((u) => u.repoId === "sqlite-repo-1"));
    });

    test("should support limit and offset in listCodeUnitsByRepo", async () => {
      const result = await store.listCodeUnitsByRepo("sqlite-repo-1", { limit: 1, offset: 0 });
      assert.strictEqual(result.items.length, 1);
    });

    test("should delete CodeUnits by repo", async () => {
      // Insert units for a test repo
      const tempUnits: CodeUnit[] = [
        {
          id: "delete-repo-1",
          repoId: "delete-test-repo",
          filePath: "a.ts",
          language: "ts",
          kind: "function",
          symbolPath: "a.ts::a",
          name: "a",
          span: { startLine: 1, endLine: 5 },
          discoveredAt: "2025-11-26T14:00:00.000Z",
          schemaVersion: "code-unit-v0",
        },
        {
          id: "delete-repo-2",
          repoId: "delete-test-repo",
          filePath: "b.ts",
          language: "ts",
          kind: "function",
          symbolPath: "b.ts::b",
          name: "b",
          span: { startLine: 1, endLine: 5 },
          discoveredAt: "2025-11-26T14:01:00.000Z",
          schemaVersion: "code-unit-v0",
        },
      ];
      await store.insertCodeUnitBatch(tempUnits);

      const result = await store.deleteCodeUnitsByRepo("delete-test-repo");
      assert.strictEqual(result.deleted, 2);

      // Verify they were deleted
      const listResult = await store.listCodeUnitsByRepo("delete-test-repo");
      assert.strictEqual(listResult.total, 0);
    });

    test("should handle CodeUnit without optional fields", async () => {
      const minimalUnit: CodeUnit = {
        id: "sqlite-cu-minimal",
        repoId: "sqlite-repo-minimal",
        filePath: "minimal.ts",
        language: "ts",
        kind: "module",
        symbolPath: "minimal.ts::main",
        name: "main",
        span: { startLine: 1, endLine: 100 },
        discoveredAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-unit-v0",
      };
      await store.insertCodeUnit(minimalUnit);
      const retrieved = await store.getCodeUnitById(minimalUnit.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.tags, undefined);
      assert.strictEqual(retrieved!.docComment, undefined);

      // Cleanup
      await store.deleteCodeUnitsByRepo("sqlite-repo-minimal");
    });
  });

  describe("CodeAtlasRun CRUD Operations", () => {
    test("should save a CodeAtlasRun successfully", async () => {
      await store.saveCodeAtlasRun(testRun1);
      const run = await store.getCodeAtlasRunById(testRun1.runId);
      assert.ok(run, "CodeAtlasRun should be found");
      assert.strictEqual(run!.runId, testRun1.runId);
    });

    test("should retrieve CodeAtlasRun by ID", async () => {
      const run = await store.getCodeAtlasRunById("sqlite-run-001");
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

    test("should return null for non-existent CodeAtlasRun ID", async () => {
      const run = await store.getCodeAtlasRunById("non-existent");
      assert.strictEqual(run, null, "Should return null for non-existent ID");
    });

    test("should update existing CodeAtlasRun (upsert)", async () => {
      const updatedRun = {
        ...testRun1,
        unitsEmitted: 100,
      };
      await store.saveCodeAtlasRun(updatedRun);
      const run = await store.getCodeAtlasRunById(testRun1.runId);
      assert.strictEqual(run!.unitsEmitted, 100);

      // Restore original
      await store.saveCodeAtlasRun(testRun1);
    });

    test("should list CodeAtlasRuns with pagination", async () => {
      await store.saveCodeAtlasRun(testRun2);

      const result = await store.listCodeAtlasRuns();
      assert.ok(result.total >= 2, "Should have at least 2 runs");
      assert.ok(result.items.length >= 2, "Should return at least 2 runs");
    });

    test("should support limit in listCodeAtlasRuns", async () => {
      const result = await store.listCodeAtlasRuns({ limit: 1 });
      assert.strictEqual(result.items.length, 1);
    });

    test("should support offset in listCodeAtlasRuns", async () => {
      const allResult = await store.listCodeAtlasRuns();
      const offsetResult = await store.listCodeAtlasRuns({ offset: 1 });

      // With offset 1, we should get one less item
      assert.strictEqual(offsetResult.items.length, allResult.items.length - 1);
      // Total should be the same regardless of offset
      assert.strictEqual(offsetResult.total, allResult.total);
    });

    test("should support both limit and offset in listCodeAtlasRuns", async () => {
      const result = await store.listCodeAtlasRuns({ limit: 1, offset: 1 });
      assert.strictEqual(result.items.length, 1);
    });

    test("should handle CodeAtlasRun with empty limits", async () => {
      const runWithEmptyLimits: CodeAtlasRun = {
        runId: "sqlite-run-empty-limits",
        repoId: "sqlite-repo-test",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T17:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      await store.saveCodeAtlasRun(runWithEmptyLimits);
      const retrieved = await store.getCodeAtlasRunById("sqlite-run-empty-limits");
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved!.limits, {});
      assert.strictEqual(retrieved!.strategy, undefined);
    });

    test("should handle all strategy types", async () => {
      // Test static strategy
      const run1 = await store.getCodeAtlasRunById("sqlite-run-001");
      assert.strictEqual(run1!.strategy, "static");

      // Test llm-assisted strategy
      const run2 = await store.getCodeAtlasRunById("sqlite-run-002");
      assert.strictEqual(run2!.strategy, "llm-assisted");

      // Test mixed strategy
      const mixedRun: CodeAtlasRun = {
        runId: "sqlite-run-mixed",
        repoId: "sqlite-repo-test",
        filesRequested: ["lib/parser.ts"],
        filesScanned: ["lib/parser.ts"],
        unitsEmitted: 8,
        limits: { maxFiles: 50 },
        truncated: false,
        strategy: "mixed",
        createdAt: "2025-11-26T16:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };
      await store.saveCodeAtlasRun(mixedRun);
      const run3 = await store.getCodeAtlasRunById("sqlite-run-mixed");
      assert.strictEqual(run3!.strategy, "mixed");
    });

    test("should correctly handle boolean truncated field", async () => {
      // Check truncated=false
      const run1 = await store.getCodeAtlasRunById("sqlite-run-001");
      assert.strictEqual(run1!.truncated, false);

      // Check truncated=true
      const run2 = await store.getCodeAtlasRunById("sqlite-run-002");
      assert.strictEqual(run2!.truncated, true);
    });

    test("should correctly store and retrieve JSON array fields", async () => {
      const run = await store.getCodeAtlasRunById("sqlite-run-001");
      assert.deepStrictEqual(run!.filesRequested, ["src/index.ts", "src/utils.ts"]);
      assert.deepStrictEqual(run!.filesScanned, ["src/index.ts"]);
    });
  });

  describe("Interface Compliance", () => {
    test("should implement CodeAtlasStore interface methods", () => {
      // Verify all interface methods exist
      assert.strictEqual(typeof store.insertCodeUnit, "function");
      assert.strictEqual(typeof store.insertCodeUnitBatch, "function");
      assert.strictEqual(typeof store.getCodeUnitById, "function");
      assert.strictEqual(typeof store.listCodeUnitsByRepo, "function");
      assert.strictEqual(typeof store.deleteCodeUnitsByRepo, "function");
      assert.strictEqual(typeof store.saveCodeAtlasRun, "function");
      assert.strictEqual(typeof store.getCodeAtlasRunById, "function");
      assert.strictEqual(typeof store.listCodeAtlasRuns, "function");
      assert.strictEqual(typeof store.close, "function");
    });
  });

  describe("Transaction Support", () => {
    test("batch insert should be transactional", async () => {
      const batchUnits: CodeUnit[] = [
        {
          id: "batch-tx-1",
          repoId: "batch-tx-repo",
          filePath: "batch1.ts",
          language: "ts",
          kind: "function",
          symbolPath: "batch1.ts::fn1",
          name: "fn1",
          span: { startLine: 1, endLine: 5 },
          discoveredAt: "2025-11-26T14:00:00.000Z",
          schemaVersion: "code-unit-v0",
        },
        {
          id: "batch-tx-2",
          repoId: "batch-tx-repo",
          filePath: "batch2.ts",
          language: "ts",
          kind: "function",
          symbolPath: "batch2.ts::fn2",
          name: "fn2",
          span: { startLine: 1, endLine: 10 },
          discoveredAt: "2025-11-26T14:01:00.000Z",
          schemaVersion: "code-unit-v0",
        },
      ];

      const result = await store.insertCodeUnitBatch(batchUnits);
      assert.strictEqual(result.inserted, 2);

      // Verify all were inserted
      const unit1 = await store.getCodeUnitById("batch-tx-1");
      const unit2 = await store.getCodeUnitById("batch-tx-2");
      assert.ok(unit1);
      assert.ok(unit2);

      // Cleanup
      await store.deleteCodeUnitsByRepo("batch-tx-repo");
    });
  });
});
