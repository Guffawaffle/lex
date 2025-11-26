/**
 * Code Units Storage Tests
 *
 * Tests for code unit CRUD operations
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3-multiple-ciphers";
import { initializeDatabase } from "@app/memory/store/db.js";
import {
  saveCodeUnit,
  saveCodeUnitsBatch,
  getCodeUnitById,
  getCodeUnitsByRepo,
  getCodeUnitsByFile,
  getCodeUnitsByKind,
  deleteCodeUnit,
  deleteCodeUnitsByRepo,
  getCodeUnitCount,
} from "@app/memory/store/code-units.js";
import type { CodeUnit } from "@app/atlas/schemas/code-unit.js";

const TEST_DB_PATH = join(tmpdir(), `test-code-units-${Date.now()}.db`);

/**
 * Create a valid CodeUnit for testing
 */
function createTestCodeUnit(overrides: Partial<CodeUnit> = {}): CodeUnit {
  const id = `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    repoId: "test-repo-1",
    filePath: "src/index.ts",
    language: "ts",
    kind: "function",
    symbolPath: "src/index.ts::myFunction",
    name: "myFunction",
    span: { startLine: 1, endLine: 10 },
    discoveredAt: new Date().toISOString(),
    schemaVersion: "code-unit-v0",
    ...overrides,
  };
}

describe("Code Units Storage Tests", () => {
  let db: Database.Database;

  before(() => {
    db = new Database(TEST_DB_PATH);
    initializeDatabase(db);
  });

  after(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("saveCodeUnit", () => {
    test("should save a valid code unit", () => {
      const unit = createTestCodeUnit();
      saveCodeUnit(db, unit);

      const retrieved = getCodeUnitById(db, unit.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, unit.id);
      assert.strictEqual(retrieved.repoId, unit.repoId);
      assert.strictEqual(retrieved.filePath, unit.filePath);
      assert.strictEqual(retrieved.kind, unit.kind);
      assert.strictEqual(retrieved.name, unit.name);
      assert.strictEqual(retrieved.span.startLine, unit.span.startLine);
      assert.strictEqual(retrieved.span.endLine, unit.span.endLine);
    });

    test("should save code unit with optional tags", () => {
      const unit = createTestCodeUnit({
        id: `unit-with-tags-${Date.now()}`,
        tags: ["test", "api", "utility"],
      });
      saveCodeUnit(db, unit);

      const retrieved = getCodeUnitById(db, unit.id);
      assert.ok(retrieved);
      assert.deepStrictEqual(retrieved.tags, ["test", "api", "utility"]);
    });

    test("should save code unit with optional docComment", () => {
      const unit = createTestCodeUnit({
        id: `unit-with-doc-${Date.now()}`,
        docComment: "This is a helper function",
      });
      saveCodeUnit(db, unit);

      const retrieved = getCodeUnitById(db, unit.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.docComment, "This is a helper function");
    });

    test("should update existing code unit on save", () => {
      const unit = createTestCodeUnit({
        id: `unit-to-update-${Date.now()}`,
        name: "originalName",
      });
      saveCodeUnit(db, unit);

      // Update the unit
      const updatedUnit = { ...unit, name: "updatedName" };
      saveCodeUnit(db, updatedUnit);

      const retrieved = getCodeUnitById(db, unit.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.name, "updatedName");
    });
  });

  describe("saveCodeUnitsBatch", () => {
    test("should save multiple code units in batch", () => {
      const repoId = `batch-repo-${Date.now()}`;
      const units = [
        createTestCodeUnit({ id: `batch-1-${Date.now()}`, repoId }),
        createTestCodeUnit({ id: `batch-2-${Date.now()}`, repoId, name: "func2" }),
        createTestCodeUnit({ id: `batch-3-${Date.now()}`, repoId, name: "func3" }),
      ];

      const savedCount = saveCodeUnitsBatch(db, units);
      assert.strictEqual(savedCount, 3);

      const retrieved = getCodeUnitsByRepo(db, repoId);
      assert.strictEqual(retrieved.length, 3);
    });

    test("should handle empty batch", () => {
      const savedCount = saveCodeUnitsBatch(db, []);
      assert.strictEqual(savedCount, 0);
    });
  });

  describe("getCodeUnitById", () => {
    test("should return null for non-existent unit", () => {
      const result = getCodeUnitById(db, "non-existent-id");
      assert.strictEqual(result, null);
    });
  });

  describe("getCodeUnitsByRepo", () => {
    test("should return all units for a repository", () => {
      const repoId = `repo-query-${Date.now()}`;
      const units = [
        createTestCodeUnit({ id: `rq-1-${Date.now()}`, repoId, filePath: "src/a.ts" }),
        createTestCodeUnit({ id: `rq-2-${Date.now()}`, repoId, filePath: "src/b.ts" }),
      ];
      saveCodeUnitsBatch(db, units);

      const retrieved = getCodeUnitsByRepo(db, repoId);
      assert.strictEqual(retrieved.length, 2);
    });

    test("should return empty array for non-existent repo", () => {
      const result = getCodeUnitsByRepo(db, "non-existent-repo");
      assert.deepStrictEqual(result, []);
    });
  });

  describe("getCodeUnitsByFile", () => {
    test("should return units for a specific file", () => {
      const repoId = `file-query-${Date.now()}`;
      const filePath = "src/target.ts";
      const units = [
        createTestCodeUnit({
          id: `fq-1-${Date.now()}`,
          repoId,
          filePath,
          span: { startLine: 1, endLine: 10 },
        }),
        createTestCodeUnit({
          id: `fq-2-${Date.now()}`,
          repoId,
          filePath,
          span: { startLine: 15, endLine: 25 },
        }),
        createTestCodeUnit({
          id: `fq-3-${Date.now()}`,
          repoId,
          filePath: "src/other.ts",
        }),
      ];
      saveCodeUnitsBatch(db, units);

      const retrieved = getCodeUnitsByFile(db, repoId, filePath);
      assert.strictEqual(retrieved.length, 2);
      assert.ok(retrieved.every((u) => u.filePath === filePath));
    });
  });

  describe("getCodeUnitsByKind", () => {
    test("should return units of a specific kind", () => {
      const repoId = `kind-query-${Date.now()}`;
      const units = [
        createTestCodeUnit({ id: `kq-1-${Date.now()}`, repoId, kind: "class" }),
        createTestCodeUnit({ id: `kq-2-${Date.now()}`, repoId, kind: "class" }),
        createTestCodeUnit({ id: `kq-3-${Date.now()}`, repoId, kind: "function" }),
      ];
      saveCodeUnitsBatch(db, units);

      const classes = getCodeUnitsByKind(db, repoId, "class");
      assert.strictEqual(classes.length, 2);
      assert.ok(classes.every((u) => u.kind === "class"));

      const functions = getCodeUnitsByKind(db, repoId, "function");
      assert.strictEqual(functions.length, 1);
    });
  });

  describe("deleteCodeUnit", () => {
    test("should delete an existing code unit", () => {
      const unit = createTestCodeUnit({ id: `to-delete-${Date.now()}` });
      saveCodeUnit(db, unit);

      const deleted = deleteCodeUnit(db, unit.id);
      assert.strictEqual(deleted, true);

      const retrieved = getCodeUnitById(db, unit.id);
      assert.strictEqual(retrieved, null);
    });

    test("should return false for non-existent unit", () => {
      const deleted = deleteCodeUnit(db, "non-existent-id");
      assert.strictEqual(deleted, false);
    });
  });

  describe("deleteCodeUnitsByRepo", () => {
    test("should delete all units for a repository", () => {
      const repoId = `to-delete-repo-${Date.now()}`;
      const units = [
        createTestCodeUnit({ id: `dr-1-${Date.now()}`, repoId }),
        createTestCodeUnit({ id: `dr-2-${Date.now()}`, repoId }),
      ];
      saveCodeUnitsBatch(db, units);

      const deletedCount = deleteCodeUnitsByRepo(db, repoId);
      assert.strictEqual(deletedCount, 2);

      const remaining = getCodeUnitsByRepo(db, repoId);
      assert.deepStrictEqual(remaining, []);
    });
  });

  describe("getCodeUnitCount", () => {
    test("should return count of all units", () => {
      const initialCount = getCodeUnitCount(db);
      const unit = createTestCodeUnit({ id: `count-test-${Date.now()}` });
      saveCodeUnit(db, unit);

      const newCount = getCodeUnitCount(db);
      assert.strictEqual(newCount, initialCount + 1);
    });

    test("should return count for specific repo", () => {
      const repoId = `count-repo-${Date.now()}`;
      const units = [
        createTestCodeUnit({ id: `cr-1-${Date.now()}`, repoId }),
        createTestCodeUnit({ id: `cr-2-${Date.now()}`, repoId }),
      ];
      saveCodeUnitsBatch(db, units);

      const count = getCodeUnitCount(db, repoId);
      assert.strictEqual(count, 2);
    });
  });
});
