/**
 * Tests for Code Unit storage queries (CA-007)
 *
 * Tests for CRUD operations on code_units table.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb, closeDb } from "@app/memory/store/index.js";
import {
  saveCodeUnit,
  insertCodeUnitBatch,
  getCodeUnitById,
  queryCodeUnits,
  listCodeUnitsByRepo,
  listCodeUnitsByFile,
  listCodeUnitsByKind,
  searchCodeUnitsBySymbol,
  deleteCodeUnit,
  deleteCodeUnitsByRepo,
  getCodeUnitCount,
} from "@app/memory/store/code-unit-queries.js";
import type { CodeUnit } from "@app/atlas/schemas/code-unit.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-code-unit-queries-${Date.now()}.db`);

// Sample test CodeUnits
const testUnit1: CodeUnit = {
  id: "cu-001",
  repoId: "repo-test-1",
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
  id: "cu-002",
  repoId: "repo-test-1",
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
  id: "cu-003",
  repoId: "repo-test-2",
  filePath: "src/utils/helper.ts",
  language: "ts",
  kind: "function",
  symbolPath: "src/utils/helper.ts::helperFn",
  name: "helperFn",
  span: { startLine: 1, endLine: 10 },
  discoveredAt: "2025-11-26T14:02:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit4: CodeUnit = {
  id: "cu-004",
  repoId: "repo-test-1",
  filePath: "src/baz/qux.ts",
  language: "ts",
  kind: "method",
  symbolPath: "src/baz/qux.ts::SomeClass.someMethod",
  name: "someMethod",
  span: { startLine: 50, endLine: 60 },
  tags: ["internal"],
  discoveredAt: "2025-11-26T14:03:00.000Z",
  schemaVersion: "code-unit-v0",
};

describe("Code Unit Queries Tests", () => {
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

  describe("Single CRUD Operations", () => {
    test("should save a CodeUnit successfully", () => {
      saveCodeUnit(db, testUnit1);
      const count = getCodeUnitCount(db);
      assert.strictEqual(count, 1, "CodeUnit count should be 1 after insert");
    });

    test("should retrieve CodeUnit by ID", () => {
      const unit = getCodeUnitById(db, "cu-001");
      assert.ok(unit, "CodeUnit should be found");
      assert.strictEqual(unit!.id, testUnit1.id);
      assert.strictEqual(unit!.repoId, testUnit1.repoId);
      assert.strictEqual(unit!.filePath, testUnit1.filePath);
      assert.strictEqual(unit!.language, testUnit1.language);
      assert.strictEqual(unit!.kind, testUnit1.kind);
      assert.strictEqual(unit!.symbolPath, testUnit1.symbolPath);
      assert.strictEqual(unit!.name, testUnit1.name);
      assert.deepStrictEqual(unit!.span, testUnit1.span);
      assert.deepStrictEqual(unit!.tags, testUnit1.tags);
      assert.strictEqual(unit!.docComment, testUnit1.docComment);
      assert.strictEqual(unit!.discoveredAt, testUnit1.discoveredAt);
      assert.strictEqual(unit!.schemaVersion, testUnit1.schemaVersion);
    });

    test("should return null for non-existent CodeUnit ID", () => {
      const unit = getCodeUnitById(db, "non-existent");
      assert.strictEqual(unit, null, "Should return null for non-existent ID");
    });

    test("should update existing CodeUnit (upsert)", () => {
      const updatedUnit = {
        ...testUnit1,
        name: "updatedFunction",
        span: { startLine: 15, endLine: 25 },
      };
      saveCodeUnit(db, updatedUnit);
      const unit = getCodeUnitById(db, "cu-001");
      assert.strictEqual(unit!.name, "updatedFunction");
      assert.deepStrictEqual(unit!.span, { startLine: 15, endLine: 25 });
      const count = getCodeUnitCount(db);
      assert.strictEqual(count, 1, "CodeUnit count should still be 1 after update");

      // Restore original for subsequent tests
      saveCodeUnit(db, testUnit1);
    });

    test("should delete CodeUnit by ID", () => {
      const tempUnit: CodeUnit = {
        id: "cu-temp",
        repoId: "repo-test",
        filePath: "temp.ts",
        language: "ts",
        kind: "function",
        symbolPath: "temp.ts::temp",
        name: "temp",
        span: { startLine: 1, endLine: 5 },
        discoveredAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-unit-v0",
      };
      saveCodeUnit(db, tempUnit);
      const deleted = deleteCodeUnit(db, "cu-temp");
      assert.strictEqual(deleted, true, "Delete should return true");
      const unit = getCodeUnitById(db, "cu-temp");
      assert.strictEqual(unit, null, "CodeUnit should not exist after delete");
    });

    test("should handle CodeUnit without optional fields", () => {
      const minimalUnit: CodeUnit = {
        id: "cu-minimal",
        repoId: "repo-test",
        filePath: "minimal.ts",
        language: "ts",
        kind: "module",
        symbolPath: "minimal.ts::main",
        name: "main",
        span: { startLine: 1, endLine: 100 },
        discoveredAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-unit-v0",
      };
      saveCodeUnit(db, minimalUnit);
      const retrieved = getCodeUnitById(db, "cu-minimal");
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.tags, undefined);
      assert.strictEqual(retrieved!.docComment, undefined);
      deleteCodeUnit(db, "cu-minimal");
    });
  });

  describe("Batch Operations", () => {
    test("should insert multiple CodeUnits in batch", () => {
      const batchUnits: CodeUnit[] = [
        {
          id: "batch-1",
          repoId: "batch-repo",
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
          id: "batch-2",
          repoId: "batch-repo",
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

      const result = insertCodeUnitBatch(db, batchUnits);
      assert.strictEqual(result.inserted, 2);

      // Verify all were inserted
      const unit1 = getCodeUnitById(db, "batch-1");
      const unit2 = getCodeUnitById(db, "batch-2");
      assert.ok(unit1);
      assert.ok(unit2);

      // Cleanup
      deleteCodeUnit(db, "batch-1");
      deleteCodeUnit(db, "batch-2");
    });

    test("should delete all CodeUnits for a repository", () => {
      // Insert units for a specific repo
      const units: CodeUnit[] = [
        {
          id: "del-repo-1",
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
          id: "del-repo-2",
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
      insertCodeUnitBatch(db, units);

      const result = deleteCodeUnitsByRepo(db, "delete-test-repo");
      assert.strictEqual(result.deleted, 2);

      // Verify they were deleted
      const count = getCodeUnitCount(db, "delete-test-repo");
      assert.strictEqual(count, 0);
    });
  });

  describe("Query Operations", () => {
    before(() => {
      // Setup test data for queries
      saveCodeUnit(db, testUnit2);
      saveCodeUnit(db, testUnit3);
      saveCodeUnit(db, testUnit4);
    });

    test("should query all CodeUnits with pagination", () => {
      const result = queryCodeUnits(db, { limit: 10, offset: 0 });
      assert.ok(result.total >= 4, "Should have at least 4 units");
      assert.strictEqual(result.limit, 10);
      assert.strictEqual(result.offset, 0);
    });

    test("should query by repository ID", () => {
      const result = queryCodeUnits(db, { repoId: "repo-test-1" });
      assert.strictEqual(result.total, 3, "Should find 3 units in repo-test-1");
      assert.ok(result.items.every((u) => u.repoId === "repo-test-1"));
    });

    test("should query by kind", () => {
      const result = queryCodeUnits(db, { kind: "function" });
      assert.ok(result.total >= 2, "Should find at least 2 functions");
      assert.ok(result.items.every((u) => u.kind === "function"));
    });

    test("should query by file path (prefix match)", () => {
      const result = queryCodeUnits(db, { filePath: "src/foo" });
      assert.strictEqual(result.total, 2, "Should find 2 units in src/foo/");
      assert.ok(result.items.every((u) => u.filePath.startsWith("src/foo")));
    });

    test("should query by symbol path (contains match)", () => {
      const result = queryCodeUnits(db, { symbol: "MyClass" });
      assert.strictEqual(result.total, 1, "Should find 1 unit with MyClass in symbol");
      assert.strictEqual(result.items[0].name, "MyClass");
    });

    test("should query by tags with AND logic", () => {
      const result = queryCodeUnits(db, { tags: ["test", "api"] });
      assert.strictEqual(result.total, 1, "Should find 1 unit with both test and api tags");
      assert.strictEqual(result.items[0].id, "cu-001");
    });

    test("should combine multiple filters", () => {
      const result = queryCodeUnits(db, { repoId: "repo-test-1", kind: "function" });
      assert.strictEqual(result.total, 1, "Should find 1 function in repo-test-1");
      assert.strictEqual(result.items[0].id, "cu-001");
    });

    test("should support pagination with limit and offset", () => {
      const result = queryCodeUnits(db, { limit: 2, offset: 1 });
      assert.strictEqual(result.limit, 2);
      assert.strictEqual(result.offset, 1);
      assert.ok(result.items.length <= 2, "Should return at most 2 items");
    });

    test("should return empty array for no matches", () => {
      const result = queryCodeUnits(db, { repoId: "nonexistent" });
      assert.strictEqual(result.total, 0);
      assert.strictEqual(result.items.length, 0);
    });
  });

  describe("List Operations", () => {
    test("should list units by repo with pagination", () => {
      const result = listCodeUnitsByRepo(db, "repo-test-1", { limit: 10 });
      assert.strictEqual(result.total, 3);
      assert.ok(result.items.every((u) => u.repoId === "repo-test-1"));
    });

    test("should list units by file", () => {
      const units = listCodeUnitsByFile(db, "repo-test-1", "src/foo/bar.ts");
      assert.strictEqual(units.length, 2);
      assert.ok(units.every((u) => u.filePath === "src/foo/bar.ts"));
      // Should be ordered by start_line
      assert.ok(
        units[0].span.startLine <= units[1].span.startLine,
        "Should be ordered by start_line"
      );
    });

    test("should list units by kind", () => {
      const units = listCodeUnitsByKind(db, "repo-test-1", "function");
      assert.strictEqual(units.length, 1);
      assert.strictEqual(units[0].kind, "function");
    });

    test("should search units by symbol", () => {
      const result = searchCodeUnitsBySymbol(db, "helper");
      assert.ok(result.total >= 1, "Should find at least 1 unit with helper in symbol");
    });
  });

  describe("Count Operations", () => {
    test("should count all CodeUnits", () => {
      const count = getCodeUnitCount(db);
      assert.ok(count >= 4, "Should have at least 4 units");
    });

    test("should count CodeUnits by repo", () => {
      const count = getCodeUnitCount(db, "repo-test-1");
      assert.strictEqual(count, 3);
    });

    test("should return 0 for non-existent repo", () => {
      const count = getCodeUnitCount(db, "nonexistent");
      assert.strictEqual(count, 0);
    });
  });
});
