/**
 * Tests for Code Unit storage queries (CA-005)
 *
 * Unit tests for CRUD and search operations for CodeUnit records.
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
  insertCodeUnit,
  getCodeUnitById,
  updateCodeUnit,
  deleteCodeUnit,
  insertCodeUnitBatch,
  deleteCodeUnitsByRepo,
  listCodeUnitsByRepo,
  listCodeUnitsByFile,
  listCodeUnitsByKind,
  searchCodeUnitsBySymbol,
  getCodeUnitCount,
  getCodeUnitCountByRepo,
} from "@app/memory/store/index.js";
import type { CodeUnit } from "@app/atlas/schemas/code-unit.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-code-unit-queries-${Date.now()}.db`);

// Sample test CodeUnits
const testUnit1: CodeUnit = {
  id: "cu-001",
  repoId: "repo-test-1",
  filePath: "src/utils.ts",
  language: "ts",
  kind: "function",
  symbolPath: "src/utils.ts::helper",
  name: "helper",
  span: { startLine: 10, endLine: 25 },
  tags: ["utility", "helper"],
  docComment: "A helper function",
  discoveredAt: "2025-11-26T14:00:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit2: CodeUnit = {
  id: "cu-002",
  repoId: "repo-test-1",
  filePath: "src/utils.ts",
  language: "ts",
  kind: "function",
  symbolPath: "src/utils.ts::format",
  name: "format",
  span: { startLine: 30, endLine: 45 },
  discoveredAt: "2025-11-26T14:30:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit3: CodeUnit = {
  id: "cu-003",
  repoId: "repo-test-1",
  filePath: "src/models/User.ts",
  language: "ts",
  kind: "class",
  symbolPath: "src/models/User.ts::User",
  name: "User",
  span: { startLine: 1, endLine: 100 },
  tags: ["model"],
  discoveredAt: "2025-11-26T15:00:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit4: CodeUnit = {
  id: "cu-004",
  repoId: "repo-test-1",
  filePath: "src/models/User.ts",
  language: "ts",
  kind: "method",
  symbolPath: "src/models/User.ts::User.save",
  name: "save",
  span: { startLine: 50, endLine: 60 },
  docComment: "Saves the user to the database",
  discoveredAt: "2025-11-26T15:30:00.000Z",
  schemaVersion: "code-unit-v0",
};

const testUnit5: CodeUnit = {
  id: "cu-005",
  repoId: "repo-test-2",
  filePath: "lib/parser.ts",
  language: "ts",
  kind: "module",
  symbolPath: "lib/parser.ts",
  name: "parser",
  span: { startLine: 1, endLine: 200 },
  discoveredAt: "2025-11-26T16:00:00.000Z",
  schemaVersion: "code-unit-v0",
};

describe("Code Unit Storage Queries Tests (CA-005)", () => {
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

  describe("Single Operations", () => {
    describe("insertCodeUnit", () => {
      test("should insert a CodeUnit with all fields", () => {
        insertCodeUnit(db, testUnit1);
        const retrieved = getCodeUnitById(db, testUnit1.id);

        assert.ok(retrieved, "CodeUnit should be found");
        assert.strictEqual(retrieved!.id, testUnit1.id);
        assert.strictEqual(retrieved!.repoId, testUnit1.repoId);
        assert.strictEqual(retrieved!.filePath, testUnit1.filePath);
        assert.strictEqual(retrieved!.language, testUnit1.language);
        assert.strictEqual(retrieved!.kind, testUnit1.kind);
        assert.strictEqual(retrieved!.symbolPath, testUnit1.symbolPath);
        assert.strictEqual(retrieved!.name, testUnit1.name);
        assert.deepStrictEqual(retrieved!.span, testUnit1.span);
        assert.deepStrictEqual(retrieved!.tags, testUnit1.tags);
        assert.strictEqual(retrieved!.docComment, testUnit1.docComment);
        assert.strictEqual(retrieved!.discoveredAt, testUnit1.discoveredAt);
        assert.strictEqual(retrieved!.schemaVersion, testUnit1.schemaVersion);
      });

      test("should insert a CodeUnit with only required fields", () => {
        insertCodeUnit(db, testUnit2);
        const retrieved = getCodeUnitById(db, testUnit2.id);

        assert.ok(retrieved, "CodeUnit should be found");
        assert.strictEqual(retrieved!.id, testUnit2.id);
        assert.strictEqual(retrieved!.tags, undefined);
        assert.strictEqual(retrieved!.docComment, undefined);
      });

      test("should upsert existing CodeUnit", () => {
        const updatedUnit = {
          ...testUnit1,
          name: "updatedHelper",
        };
        insertCodeUnit(db, updatedUnit);
        const retrieved = getCodeUnitById(db, testUnit1.id);

        assert.strictEqual(retrieved!.name, "updatedHelper");
        const count = getCodeUnitCount(db);
        assert.strictEqual(count, 2, "Should still have 2 units after upsert");
      });
    });

    describe("getCodeUnitById", () => {
      test("should return null for non-existent ID", () => {
        const result = getCodeUnitById(db, "non-existent-id");
        assert.strictEqual(result, null);
      });

      test("should retrieve CodeUnit by ID", () => {
        const result = getCodeUnitById(db, testUnit1.id);
        assert.ok(result);
        assert.strictEqual(result!.id, testUnit1.id);
      });
    });

    describe("updateCodeUnit", () => {
      test("should update single field", () => {
        const updated = updateCodeUnit(db, testUnit1.id, { name: "renamedHelper" });
        assert.strictEqual(updated, true, "Update should return true");

        const retrieved = getCodeUnitById(db, testUnit1.id);
        assert.strictEqual(retrieved!.name, "renamedHelper");
      });

      test("should update multiple fields", () => {
        const updated = updateCodeUnit(db, testUnit1.id, {
          name: "multiUpdate",
          docComment: "Updated doc",
          tags: ["new", "tags"],
        });
        assert.strictEqual(updated, true);

        const retrieved = getCodeUnitById(db, testUnit1.id);
        assert.strictEqual(retrieved!.name, "multiUpdate");
        assert.strictEqual(retrieved!.docComment, "Updated doc");
        assert.deepStrictEqual(retrieved!.tags, ["new", "tags"]);
      });

      test("should update span", () => {
        const updated = updateCodeUnit(db, testUnit1.id, {
          span: { startLine: 100, endLine: 150 },
        });
        assert.strictEqual(updated, true);

        const retrieved = getCodeUnitById(db, testUnit1.id);
        assert.deepStrictEqual(retrieved!.span, { startLine: 100, endLine: 150 });
      });

      test("should return false for non-existent ID", () => {
        const updated = updateCodeUnit(db, "non-existent", { name: "test" });
        assert.strictEqual(updated, false);
      });

      test("should return false when no fields provided", () => {
        const updated = updateCodeUnit(db, testUnit1.id, {});
        assert.strictEqual(updated, false);
      });

      test("should not update fields when set to undefined", () => {
        // First ensure tags are set
        updateCodeUnit(db, testUnit1.id, { tags: ["some", "tags"] });
        let retrieved = getCodeUnitById(db, testUnit1.id);
        assert.deepStrictEqual(retrieved!.tags, ["some", "tags"]);

        // Passing undefined means "don't update this field"
        // This is different from null which would clear it
        updateCodeUnit(db, testUnit1.id, { name: "newName" }); // Update another field without touching tags

        // Verify tags are unchanged
        retrieved = getCodeUnitById(db, testUnit1.id);
        assert.deepStrictEqual(retrieved!.tags, ["some", "tags"]);
        assert.strictEqual(retrieved!.name, "newName");
      });
    });

    describe("deleteCodeUnit", () => {
      test("should delete existing CodeUnit", () => {
        insertCodeUnit(db, {
          ...testUnit1,
          id: "to-delete",
        });
        const deleted = deleteCodeUnit(db, "to-delete");
        assert.strictEqual(deleted, true);

        const retrieved = getCodeUnitById(db, "to-delete");
        assert.strictEqual(retrieved, null);
      });

      test("should return false for non-existent ID", () => {
        const deleted = deleteCodeUnit(db, "non-existent");
        assert.strictEqual(deleted, false);
      });
    });
  });

  describe("Batch Operations", () => {
    before(() => {
      // Clean slate for batch tests
      deleteCodeUnitsByRepo(db, "repo-test-1");
      deleteCodeUnitsByRepo(db, "repo-test-2");
    });

    describe("insertCodeUnitBatch", () => {
      test("should insert multiple CodeUnits in a transaction", () => {
        const units = [testUnit1, testUnit2, testUnit3, testUnit4, testUnit5];
        const result = insertCodeUnitBatch(db, units);

        assert.strictEqual(result.inserted, 5);
        assert.strictEqual(getCodeUnitCount(db), 5);
      });

      test("should handle empty batch", () => {
        const countBefore = getCodeUnitCount(db);
        const result = insertCodeUnitBatch(db, []);
        assert.strictEqual(result.inserted, 0);
        assert.strictEqual(getCodeUnitCount(db), countBefore);
      });

      test("should upsert existing units in batch", () => {
        const updatedUnits = [
          { ...testUnit1, name: "batchUpdated1" },
          { ...testUnit2, name: "batchUpdated2" },
        ];
        const result = insertCodeUnitBatch(db, updatedUnits);
        assert.strictEqual(result.inserted, 2);

        const retrieved1 = getCodeUnitById(db, testUnit1.id);
        const retrieved2 = getCodeUnitById(db, testUnit2.id);
        assert.strictEqual(retrieved1!.name, "batchUpdated1");
        assert.strictEqual(retrieved2!.name, "batchUpdated2");

        // Count should still be 5
        assert.strictEqual(getCodeUnitCount(db), 5);
      });
    });

    describe("deleteCodeUnitsByRepo", () => {
      test("should delete all CodeUnits for a repository", () => {
        // Add some more units to repo-test-2
        insertCodeUnitBatch(db, [
          { ...testUnit1, id: "extra-1", repoId: "repo-test-2" },
          { ...testUnit2, id: "extra-2", repoId: "repo-test-2" },
        ]);

        const countBefore = getCodeUnitCountByRepo(db, "repo-test-2");
        assert.ok(countBefore >= 2, "Should have at least 2 units in repo-test-2");

        const result = deleteCodeUnitsByRepo(db, "repo-test-2");
        assert.strictEqual(result.deleted, countBefore);

        const countAfter = getCodeUnitCountByRepo(db, "repo-test-2");
        assert.strictEqual(countAfter, 0);
      });

      test("should return 0 for non-existent repository", () => {
        const result = deleteCodeUnitsByRepo(db, "non-existent-repo");
        assert.strictEqual(result.deleted, 0);
      });
    });
  });

  describe("Query Operations", () => {
    before(() => {
      // Reset test data
      deleteCodeUnitsByRepo(db, "repo-test-1");
      deleteCodeUnitsByRepo(db, "repo-test-2");
      insertCodeUnitBatch(db, [testUnit1, testUnit2, testUnit3, testUnit4, testUnit5]);
    });

    describe("listCodeUnitsByRepo", () => {
      test("should list all CodeUnits for a repository", () => {
        const units = listCodeUnitsByRepo(db, "repo-test-1");
        assert.strictEqual(units.length, 4);
        // Should be ordered by file_path, start_line
        assert.strictEqual(units[0].filePath, "src/models/User.ts");
        assert.strictEqual(units[0].name, "User"); // start_line 1
        assert.strictEqual(units[1].filePath, "src/models/User.ts");
        assert.strictEqual(units[1].name, "save"); // start_line 50
      });

      test("should return empty array for non-existent repo", () => {
        const units = listCodeUnitsByRepo(db, "non-existent-repo");
        assert.strictEqual(units.length, 0);
      });

      test("should support pagination with limit", () => {
        const units = listCodeUnitsByRepo(db, "repo-test-1", { limit: 2 });
        assert.strictEqual(units.length, 2);
      });

      test("should support pagination with offset", () => {
        const units = listCodeUnitsByRepo(db, "repo-test-1", { limit: 2, offset: 2 });
        assert.strictEqual(units.length, 2);
        // Should skip first 2 and get next 2
        assert.strictEqual(units[0].filePath, "src/utils.ts");
      });
    });

    describe("listCodeUnitsByFile", () => {
      test("should list all CodeUnits for a specific file", () => {
        const units = listCodeUnitsByFile(db, "repo-test-1", "src/utils.ts");
        assert.strictEqual(units.length, 2);
        // Should be ordered by start_line
        assert.ok(units[0].span.startLine < units[1].span.startLine);
      });

      test("should return empty array for non-existent file", () => {
        const units = listCodeUnitsByFile(db, "repo-test-1", "non-existent.ts");
        assert.strictEqual(units.length, 0);
      });
    });

    describe("listCodeUnitsByKind", () => {
      test("should list all CodeUnits of a specific kind", () => {
        const functions = listCodeUnitsByKind(db, "repo-test-1", "function");
        assert.strictEqual(functions.length, 2);
        assert.ok(functions.every((u) => u.kind === "function"));
      });

      test("should list class CodeUnits", () => {
        const classes = listCodeUnitsByKind(db, "repo-test-1", "class");
        assert.strictEqual(classes.length, 1);
        assert.strictEqual(classes[0].name, "User");
      });

      test("should list method CodeUnits", () => {
        const methods = listCodeUnitsByKind(db, "repo-test-1", "method");
        assert.strictEqual(methods.length, 1);
        assert.strictEqual(methods[0].name, "save");
      });

      test("should return empty for non-existent kind in repo", () => {
        const modules = listCodeUnitsByKind(db, "repo-test-1", "module");
        assert.strictEqual(modules.length, 0);
      });

      test("should support pagination", () => {
        const functions = listCodeUnitsByKind(db, "repo-test-1", "function", { limit: 1 });
        assert.strictEqual(functions.length, 1);
      });
    });

    describe("searchCodeUnitsBySymbol", () => {
      test("should search by symbol path substring", () => {
        const results = searchCodeUnitsBySymbol(db, "User");
        assert.ok(results.length >= 2);
        assert.ok(results.some((u) => u.name === "User"));
        assert.ok(results.some((u) => u.name === "save"));
      });

      test("should search with explicit wildcards", () => {
        const results = searchCodeUnitsBySymbol(db, "%helper%");
        assert.ok(results.length >= 1);
        assert.ok(results.some((u) => u.symbolPath.includes("helper")));
      });

      test("should search with prefix pattern", () => {
        const results = searchCodeUnitsBySymbol(db, "src/utils.ts::%");
        assert.strictEqual(results.length, 2);
      });

      test("should return empty for no matches", () => {
        const results = searchCodeUnitsBySymbol(db, "nonexistent_symbol");
        assert.strictEqual(results.length, 0);
      });
    });
  });

  describe("Count Operations", () => {
    test("should count all CodeUnits", () => {
      const count = getCodeUnitCount(db);
      assert.ok(count >= 4, "Should have at least 4 CodeUnits");
    });

    test("should count CodeUnits by repository", () => {
      const count = getCodeUnitCountByRepo(db, "repo-test-1");
      assert.strictEqual(count, 4);
    });

    test("should return 0 for non-existent repository", () => {
      const count = getCodeUnitCountByRepo(db, "non-existent");
      assert.strictEqual(count, 0);
    });
  });

  describe("Data Type Handling", () => {
    test("should correctly serialize and deserialize tags array", () => {
      const unitWithTags: CodeUnit = {
        ...testUnit1,
        id: "tags-test",
        tags: ["tag1", "tag2", "tag3"],
      };
      insertCodeUnit(db, unitWithTags);
      const retrieved = getCodeUnitById(db, "tags-test");

      assert.deepStrictEqual(retrieved!.tags, ["tag1", "tag2", "tag3"]);
      deleteCodeUnit(db, "tags-test");
    });

    test("should handle empty tags array", () => {
      const unitWithEmptyTags: CodeUnit = {
        ...testUnit1,
        id: "empty-tags-test",
        tags: [],
      };
      insertCodeUnit(db, unitWithEmptyTags);
      const retrieved = getCodeUnitById(db, "empty-tags-test");

      assert.deepStrictEqual(retrieved!.tags, []);
      deleteCodeUnit(db, "empty-tags-test");
    });

    test("should handle undefined optional fields", () => {
      const minimalUnit: CodeUnit = {
        id: "minimal-test",
        repoId: "repo-test",
        filePath: "src/test.ts",
        language: "ts",
        kind: "function",
        symbolPath: "src/test.ts::test",
        name: "test",
        span: { startLine: 1, endLine: 5 },
        discoveredAt: "2025-11-26T12:00:00.000Z",
        schemaVersion: "code-unit-v0",
      };
      insertCodeUnit(db, minimalUnit);
      const retrieved = getCodeUnitById(db, "minimal-test");

      assert.strictEqual(retrieved!.tags, undefined);
      assert.strictEqual(retrieved!.docComment, undefined);
      deleteCodeUnit(db, "minimal-test");
    });

    test("should correctly map span fields", () => {
      const unitWithSpan: CodeUnit = {
        ...testUnit1,
        id: "span-test",
        span: { startLine: 100, endLine: 200 },
      };
      insertCodeUnit(db, unitWithSpan);
      const retrieved = getCodeUnitById(db, "span-test");

      assert.strictEqual(retrieved!.span.startLine, 100);
      assert.strictEqual(retrieved!.span.endLine, 200);
      deleteCodeUnit(db, "span-test");
    });

    test("should correctly map CodeUnitKind enum", () => {
      const kinds = ["module", "class", "function", "method"] as const;
      for (const kind of kinds) {
        const unit: CodeUnit = {
          ...testUnit1,
          id: `kind-test-${kind}`,
          kind,
        };
        insertCodeUnit(db, unit);
        const retrieved = getCodeUnitById(db, `kind-test-${kind}`);
        assert.strictEqual(retrieved!.kind, kind);
        deleteCodeUnit(db, `kind-test-${kind}`);
      }
    });
  });
});

console.log(
  "\n✅ Code Unit Queries Tests (CA-005) - covering CRUD, batch, and query operations\n"
);
