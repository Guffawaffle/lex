/**
 * Tests for code_units migration (V5)
 *
 * Verifies the code_units table schema and indexes are created correctly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb, closeDb } from "@app/memory/store/index.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-code-units-migration-${Date.now()}.db`);

describe("code_units Migration (V5) Tests", () => {
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

  describe("Table Schema", () => {
    test("should have code_units table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_units'")
        .all();
      assert.strictEqual(tables.length, 1, "code_units table should exist");
    });

    test("should have all required columns", () => {
      const columns = db.prepare("PRAGMA table_info(code_units)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      const columnMap = new Map(columns.map((c) => [c.name, c]));

      // Primary key
      assert.ok(columnMap.has("id"), "id column should exist");
      assert.strictEqual(columnMap.get("id")!.pk, 1, "id should be primary key");
      assert.strictEqual(columnMap.get("id")!.type, "TEXT", "id should be TEXT");

      // Required columns
      const requiredColumns = [
        { name: "repo_id", type: "TEXT" },
        { name: "file_path", type: "TEXT" },
        { name: "language", type: "TEXT" },
        { name: "kind", type: "TEXT" },
        { name: "symbol_path", type: "TEXT" },
        { name: "name", type: "TEXT" },
        { name: "start_line", type: "INTEGER" },
        { name: "end_line", type: "INTEGER" },
        { name: "discovered_at", type: "TEXT" },
        { name: "schema_version", type: "TEXT" },
        { name: "created_at", type: "TEXT" },
        { name: "updated_at", type: "TEXT" },
      ];

      for (const col of requiredColumns) {
        assert.ok(columnMap.has(col.name), `${col.name} column should exist`);
        assert.strictEqual(
          columnMap.get(col.name)!.type,
          col.type,
          `${col.name} should be ${col.type}`
        );
        assert.strictEqual(columnMap.get(col.name)!.notnull, 1, `${col.name} should be NOT NULL`);
      }

      // Optional columns
      const optionalColumns = [
        { name: "tags", type: "TEXT" },
        { name: "doc_comment", type: "TEXT" },
      ];

      for (const col of optionalColumns) {
        assert.ok(columnMap.has(col.name), `${col.name} column should exist`);
        assert.strictEqual(
          columnMap.get(col.name)!.type,
          col.type,
          `${col.name} should be ${col.type}`
        );
        assert.strictEqual(columnMap.get(col.name)!.notnull, 0, `${col.name} should be nullable`);
      }
    });

    test("should have schema_version default value", () => {
      const columns = db.prepare("PRAGMA table_info(code_units)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;

      const schemaVersionCol = columns.find((c) => c.name === "schema_version");
      assert.ok(schemaVersionCol, "schema_version column should exist");
      assert.strictEqual(
        schemaVersionCol!.dflt_value,
        "'code-unit-v0'",
        "schema_version should default to 'code-unit-v0'"
      );
    });

    test("should have created_at and updated_at default values", () => {
      const columns = db.prepare("PRAGMA table_info(code_units)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;

      const createdAtCol = columns.find((c) => c.name === "created_at");
      const updatedAtCol = columns.find((c) => c.name === "updated_at");

      assert.ok(createdAtCol, "created_at column should exist");
      assert.ok(updatedAtCol, "updated_at column should exist");
      assert.ok(
        createdAtCol!.dflt_value?.includes("datetime"),
        "created_at should have datetime default"
      );
      assert.ok(
        updatedAtCol!.dflt_value?.includes("datetime"),
        "updated_at should have datetime default"
      );
    });
  });

  describe("Indexes", () => {
    test("should have idx_code_units_repo index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_units_repo'")
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_units_repo index should exist");
    });

    test("should have idx_code_units_file index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_units_file'")
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_units_file index should exist");
    });

    test("should have idx_code_units_kind index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_units_kind'")
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_units_kind index should exist");
    });

    test("should have idx_code_units_symbol index", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_units_symbol'"
        )
        .all();
      assert.strictEqual(indexes.length, 1, "idx_code_units_symbol index should exist");
    });
  });

  describe("Schema Version", () => {
    test("should have applied migration V5", () => {
      const versionRow = db
        .prepare("SELECT version FROM schema_version WHERE version = 5")
        .get() as { version: number } | undefined;
      assert.ok(versionRow, "Schema version 5 should be recorded");
      assert.strictEqual(versionRow!.version, 5, "Version should be 5");
    });
  });

  describe("Kind Constraint", () => {
    test("should accept valid kind values", () => {
      const validKinds = ["module", "class", "function", "method"];

      for (const kind of validKinds) {
        const codeUnit = {
          id: `test-${kind}`,
          repo_id: "repo-1",
          file_path: "src/test.ts",
          language: "ts",
          kind,
          symbol_path: `src/test.ts::${kind}`,
          name: kind,
          start_line: 1,
          end_line: 10,
          discovered_at: new Date().toISOString(),
        };

        // Should not throw
        db.prepare(
          `INSERT INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          codeUnit.id,
          codeUnit.repo_id,
          codeUnit.file_path,
          codeUnit.language,
          codeUnit.kind,
          codeUnit.symbol_path,
          codeUnit.name,
          codeUnit.start_line,
          codeUnit.end_line,
          codeUnit.discovered_at
        );

        // Clean up
        db.prepare("DELETE FROM code_units WHERE id = ?").run(codeUnit.id);
      }
    });

    test("should reject invalid kind values", () => {
      const invalidCodeUnit = {
        id: "test-invalid",
        repo_id: "repo-1",
        file_path: "src/test.ts",
        language: "ts",
        kind: "invalid_kind",
        symbol_path: "src/test.ts::invalid",
        name: "invalid",
        start_line: 1,
        end_line: 10,
        discovered_at: new Date().toISOString(),
      };

      assert.throws(
        () => {
          db.prepare(
            `INSERT INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            invalidCodeUnit.id,
            invalidCodeUnit.repo_id,
            invalidCodeUnit.file_path,
            invalidCodeUnit.language,
            invalidCodeUnit.kind,
            invalidCodeUnit.symbol_path,
            invalidCodeUnit.name,
            invalidCodeUnit.start_line,
            invalidCodeUnit.end_line,
            invalidCodeUnit.discovered_at
          );
        },
        /CHECK constraint failed/,
        "Should reject invalid kind value"
      );
    });
  });

  describe("CRUD Operations", () => {
    test("should insert and retrieve code unit with all fields", () => {
      const codeUnit = {
        id: "cu-001",
        repo_id: "repo-1",
        file_path: "src/foo/bar.ts",
        language: "ts",
        kind: "method",
        symbol_path: "src/foo/bar.ts::MyClass.myMethod",
        name: "myMethod",
        start_line: 10,
        end_line: 20,
        tags: JSON.stringify(["test", "ui"]),
        doc_comment: "This is a test method",
        discovered_at: "2025-11-26T14:00:00Z",
      };

      db.prepare(
        `INSERT INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, tags, doc_comment, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        codeUnit.id,
        codeUnit.repo_id,
        codeUnit.file_path,
        codeUnit.language,
        codeUnit.kind,
        codeUnit.symbol_path,
        codeUnit.name,
        codeUnit.start_line,
        codeUnit.end_line,
        codeUnit.tags,
        codeUnit.doc_comment,
        codeUnit.discovered_at
      );

      const retrieved = db
        .prepare("SELECT * FROM code_units WHERE id = ?")
        .get(codeUnit.id) as Record<string, unknown>;

      assert.ok(retrieved, "Code unit should be retrieved");
      assert.strictEqual(retrieved.id, codeUnit.id);
      assert.strictEqual(retrieved.repo_id, codeUnit.repo_id);
      assert.strictEqual(retrieved.file_path, codeUnit.file_path);
      assert.strictEqual(retrieved.language, codeUnit.language);
      assert.strictEqual(retrieved.kind, codeUnit.kind);
      assert.strictEqual(retrieved.symbol_path, codeUnit.symbol_path);
      assert.strictEqual(retrieved.name, codeUnit.name);
      assert.strictEqual(retrieved.start_line, codeUnit.start_line);
      assert.strictEqual(retrieved.end_line, codeUnit.end_line);
      assert.strictEqual(retrieved.tags, codeUnit.tags);
      assert.strictEqual(retrieved.doc_comment, codeUnit.doc_comment);
      assert.strictEqual(retrieved.discovered_at, codeUnit.discovered_at);
      assert.strictEqual(retrieved.schema_version, "code-unit-v0");
      assert.ok(retrieved.created_at, "created_at should be set");
      assert.ok(retrieved.updated_at, "updated_at should be set");

      // Clean up
      db.prepare("DELETE FROM code_units WHERE id = ?").run(codeUnit.id);
    });

    test("should insert code unit with only required fields", () => {
      const minimalCodeUnit = {
        id: "cu-minimal",
        repo_id: "repo-2",
        file_path: "src/utils.ts",
        language: "ts",
        kind: "function",
        symbol_path: "src/utils.ts::helper",
        name: "helper",
        start_line: 1,
        end_line: 5,
        discovered_at: "2025-11-26T15:00:00Z",
      };

      db.prepare(
        `INSERT INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        minimalCodeUnit.id,
        minimalCodeUnit.repo_id,
        minimalCodeUnit.file_path,
        minimalCodeUnit.language,
        minimalCodeUnit.kind,
        minimalCodeUnit.symbol_path,
        minimalCodeUnit.name,
        minimalCodeUnit.start_line,
        minimalCodeUnit.end_line,
        minimalCodeUnit.discovered_at
      );

      const retrieved = db
        .prepare("SELECT * FROM code_units WHERE id = ?")
        .get(minimalCodeUnit.id) as Record<string, unknown>;

      assert.ok(retrieved, "Code unit should be retrieved");
      assert.strictEqual(retrieved.tags, null, "tags should be null");
      assert.strictEqual(retrieved.doc_comment, null, "doc_comment should be null");
      assert.strictEqual(retrieved.schema_version, "code-unit-v0");

      // Clean up
      db.prepare("DELETE FROM code_units WHERE id = ?").run(minimalCodeUnit.id);
    });

    test("should support upsert with INSERT OR REPLACE", () => {
      const codeUnit = {
        id: "cu-upsert",
        repo_id: "repo-3",
        file_path: "src/main.ts",
        language: "ts",
        kind: "class",
        symbol_path: "src/main.ts::Main",
        name: "Main",
        start_line: 1,
        end_line: 100,
        discovered_at: "2025-11-26T16:00:00Z",
      };

      // Initial insert
      db.prepare(
        `INSERT OR REPLACE INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at, schema_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'code-unit-v0', datetime('now'), datetime('now'))`
      ).run(
        codeUnit.id,
        codeUnit.repo_id,
        codeUnit.file_path,
        codeUnit.language,
        codeUnit.kind,
        codeUnit.symbol_path,
        codeUnit.name,
        codeUnit.start_line,
        codeUnit.end_line,
        codeUnit.discovered_at
      );

      // Update with new end_line
      db.prepare(
        `INSERT OR REPLACE INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at, schema_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'code-unit-v0', datetime('now'), datetime('now'))`
      ).run(
        codeUnit.id,
        codeUnit.repo_id,
        codeUnit.file_path,
        codeUnit.language,
        codeUnit.kind,
        codeUnit.symbol_path,
        codeUnit.name,
        codeUnit.start_line,
        150, // Updated end_line
        codeUnit.discovered_at
      );

      const retrieved = db
        .prepare("SELECT * FROM code_units WHERE id = ?")
        .get(codeUnit.id) as Record<string, unknown>;

      assert.strictEqual(retrieved.end_line, 150, "end_line should be updated");

      // Count should still be 1
      const count = db
        .prepare("SELECT COUNT(*) as count FROM code_units WHERE id = ?")
        .get(codeUnit.id) as { count: number };
      assert.strictEqual(count.count, 1, "Should have exactly one record");

      // Clean up
      db.prepare("DELETE FROM code_units WHERE id = ?").run(codeUnit.id);
    });
  });

  describe("Query Performance (Index Usage)", () => {
    before(() => {
      // Insert test data for query tests
      const testData = [
        { id: "q1", repo_id: "repo-a", file_path: "src/a.ts", kind: "module" },
        { id: "q2", repo_id: "repo-a", file_path: "src/b.ts", kind: "class" },
        { id: "q3", repo_id: "repo-a", file_path: "src/a.ts", kind: "function" },
        { id: "q4", repo_id: "repo-b", file_path: "src/c.ts", kind: "method" },
        { id: "q5", repo_id: "repo-b", file_path: "src/d.ts", kind: "function" },
      ];

      for (const item of testData) {
        db.prepare(
          `INSERT INTO code_units (id, repo_id, file_path, language, kind, symbol_path, name, start_line, end_line, discovered_at)
           VALUES (?, ?, ?, 'ts', ?, ?, ?, 1, 10, datetime('now'))`
        ).run(item.id, item.repo_id, item.file_path, item.kind, `${item.file_path}::Test`, "Test");
      }
    });

    after(() => {
      // Clean up test data
      db.prepare("DELETE FROM code_units WHERE id LIKE 'q%'").run();
    });

    test("should query by repo_id", () => {
      const results = db
        .prepare("SELECT * FROM code_units WHERE repo_id = ?")
        .all("repo-a") as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 3, "Should find 3 code units in repo-a");
    });

    test("should query by repo_id and file_path", () => {
      const results = db
        .prepare("SELECT * FROM code_units WHERE repo_id = ? AND file_path = ?")
        .all("repo-a", "src/a.ts") as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 2, "Should find 2 code units in repo-a/src/a.ts");
    });

    test("should query by repo_id and kind", () => {
      const results = db
        .prepare("SELECT * FROM code_units WHERE repo_id = ? AND kind = ?")
        .all("repo-b", "function") as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 1, "Should find 1 function in repo-b");
    });

    test("should query by symbol_path", () => {
      const results = db
        .prepare("SELECT * FROM code_units WHERE symbol_path = ?")
        .all("src/a.ts::Test") as Array<Record<string, unknown>>;
      assert.ok(results.length > 0, "Should find code units by symbol_path");
    });
  });
});
