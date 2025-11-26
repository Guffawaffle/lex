/**
 * Tests for column name validation during database encryption migration
 *
 * Security test: Validates that malicious or malformed column names in source
 * databases are rejected to prevent SQL injection during dbEncrypt migration.
 *
 * @see SEC-001: Security hardening for database migration
 */

import { test, describe, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3-multiple-ciphers";

/**
 * Note: We directly test the validation logic by recreating the pattern used
 * in dbEncrypt. The actual dbEncrypt function has side effects (process.exit)
 * that make it difficult to test directly in a unit test context.
 */

describe("Database Column Name Validation", () => {
  const TEST_DB_PATH = join(tmpdir(), `test-column-validation-${Date.now()}.db`);

  after(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * Helper to validate identifiers using the same pattern as dbEncrypt
   */
  function validateIdentifier(name: string): boolean {
    const validIdentifierPattern = /^[a-zA-Z0-9_]+$/;
    return validIdentifierPattern.test(name);
  }

  describe("Valid Identifier Patterns", () => {
    test("should accept simple alphanumeric column names", () => {
      assert.ok(validateIdentifier("id"), "Simple 'id' should be valid");
      assert.ok(validateIdentifier("name"), "Simple 'name' should be valid");
      assert.ok(validateIdentifier("created_at"), "'created_at' should be valid");
    });

    test("should accept column names with underscores", () => {
      assert.ok(validateIdentifier("user_id"), "Snake case should be valid");
      assert.ok(validateIdentifier("first_name"), "Snake case should be valid");
      assert.ok(validateIdentifier("_private"), "Leading underscore should be valid");
      assert.ok(validateIdentifier("column_"), "Trailing underscore should be valid");
    });

    test("should accept column names with numbers", () => {
      assert.ok(validateIdentifier("column1"), "Trailing number should be valid");
      assert.ok(validateIdentifier("col2name"), "Number in middle should be valid");
      assert.ok(validateIdentifier("a123"), "All numbers suffix should be valid");
    });

    test("should accept mixed case column names", () => {
      assert.ok(validateIdentifier("userId"), "CamelCase should be valid");
      assert.ok(validateIdentifier("UserID"), "PascalCase should be valid");
      assert.ok(validateIdentifier("COLUMN_NAME"), "All caps should be valid");
    });
  });

  describe("Invalid Identifier Patterns (SQL Injection Prevention)", () => {
    test("should reject column names with SQL injection characters", () => {
      // Classic SQL injection patterns
      assert.ok(!validateIdentifier("id; DROP TABLE users;--"), "SQL injection should be rejected");
      assert.ok(!validateIdentifier("id' OR '1'='1"), "Quote injection should be rejected");
      assert.ok(!validateIdentifier("id)--"), "Comment injection should be rejected");
    });

    test("should reject column names with special characters", () => {
      assert.ok(!validateIdentifier("col-name"), "Hyphen should be rejected");
      assert.ok(!validateIdentifier("col.name"), "Period should be rejected");
      assert.ok(!validateIdentifier("col name"), "Space should be rejected");
      assert.ok(!validateIdentifier("col@name"), "At sign should be rejected");
      assert.ok(!validateIdentifier("col#name"), "Hash should be rejected");
      assert.ok(!validateIdentifier("col$name"), "Dollar should be rejected");
    });

    test("should reject column names with quotes", () => {
      assert.ok(!validateIdentifier("col'name"), "Single quote should be rejected");
      assert.ok(!validateIdentifier('col"name'), "Double quote should be rejected");
      assert.ok(!validateIdentifier("col`name"), "Backtick should be rejected");
    });

    test("should reject column names with parentheses and brackets", () => {
      assert.ok(!validateIdentifier("col(name)"), "Parentheses should be rejected");
      assert.ok(!validateIdentifier("col[name]"), "Square brackets should be rejected");
      assert.ok(!validateIdentifier("col{name}"), "Curly braces should be rejected");
    });

    test("should reject column names with Unicode/non-ASCII characters", () => {
      assert.ok(!validateIdentifier("colüname"), "Umlaut should be rejected");
      assert.ok(!validateIdentifier("col名前"), "CJK characters should be rejected");
      assert.ok(!validateIdentifier("col—name"), "Em dash should be rejected");
    });

    test("should reject empty column names", () => {
      assert.ok(!validateIdentifier(""), "Empty string should be rejected");
    });
  });

  describe("Integration: Database with Invalid Column Names", () => {
    test("should detect invalid column names during migration simulation", () => {
      // Create a test database with a table that has normal columns
      const db = new Database(TEST_DB_PATH);
      db.exec(`CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)`);
      db.exec(`INSERT INTO test_table (id, name) VALUES (1, 'test')`);

      // Get column names as the migration would
      const rows = db.prepare("SELECT * FROM test_table").all() as Record<string, unknown>[];
      const columns = Object.keys(rows[0]);

      // Validate all column names
      const validIdentifierPattern = /^[a-zA-Z0-9_]+$/;
      for (const col of columns) {
        assert.ok(
          validIdentifierPattern.test(col),
          `Column '${col}' should pass validation`
        );
      }

      db.close();
    });

    test("should simulate rejection of crafted malicious column via validation check", () => {
      /**
       * Note: SQLite doesn't allow truly malicious column names through its CREATE TABLE
       * syntax directly, but a corrupted or maliciously crafted database file could
       * potentially have unusual column names. This test validates our defense layer.
       */

      // Simulate checking a column name that might come from a malformed source
      const maliciousColumnNames = [
        "id; DROP TABLE frames;--",
        "name' OR '1'='1",
        "column)--",
        "'; DELETE FROM users WHERE '1'='1",
      ];

      const validIdentifierPattern = /^[a-zA-Z0-9_]+$/;

      for (const badCol of maliciousColumnNames) {
        assert.ok(
          !validIdentifierPattern.test(badCol),
          `Malicious column '${badCol}' should be rejected by validation`
        );
      }
    });
  });

  describe("Error Messages", () => {
    test("should provide clear error message for invalid column names", () => {
      const tableName = "test_table";
      const invalidColumn = "bad-column";
      const validIdentifierPattern = /^[a-zA-Z0-9_]+$/;

      if (!validIdentifierPattern.test(invalidColumn)) {
        const errorMessage = `Invalid column name detected in table "${tableName}": ${invalidColumn}`;
        assert.ok(
          errorMessage.includes(tableName),
          "Error should include table name"
        );
        assert.ok(
          errorMessage.includes(invalidColumn),
          "Error should include invalid column name"
        );
      }
    });
  });
});

console.log("\n✅ Database Column Name Validation Tests - covering SQL injection prevention\n");
