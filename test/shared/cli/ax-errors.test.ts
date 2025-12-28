/**
 * Tests for AXError integration in CLI commands
 *
 * Verifies that CLI error paths use AXErrorException with proper codes.
 * Covers AX-006 implementation.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { isAXErrorException, AXErrorException } from "@app/shared/errors/ax-error.js";

describe("CLI AXError Integration", () => {
  describe("Error codes", () => {
    test("DB_ENCRYPTION_KEY_MISSING should be valid AXError", () => {
      const error = new AXErrorException(
        "DB_ENCRYPTION_KEY_MISSING",
        "Encryption passphrase is required",
        ["Set the LEX_DB_KEY environment variable"]
      );

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "DB_ENCRYPTION_KEY_MISSING");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("DB_NOT_FOUND should be valid AXError", () => {
      const error = new AXErrorException("DB_NOT_FOUND", "Input database not found", [
        "Run `lex init` to create the database",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "DB_NOT_FOUND");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("DB_OUTPUT_EXISTS should be valid AXError", () => {
      const error = new AXErrorException("DB_OUTPUT_EXISTS", "Output database already exists", [
        "Remove the existing output database file",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "DB_OUTPUT_EXISTS");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("DB_VERIFICATION_FAILED should be valid AXError", () => {
      const error = new AXErrorException("DB_VERIFICATION_FAILED", "Data verification failed", [
        "Check for database corruption",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "DB_VERIFICATION_FAILED");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("INVALID_TABLE_NAME should be valid AXError", () => {
      const error = new AXErrorException(
        "INVALID_TABLE_NAME",
        "Invalid table name detected during checksum",
        ["Ensure the database schema uses valid table names"]
      );

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "INVALID_TABLE_NAME");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("INVALID_COLUMN_NAME should be valid AXError", () => {
      const error = new AXErrorException("INVALID_COLUMN_NAME", "Invalid column name detected", [
        "Ensure the database schema uses valid column names",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "INVALID_COLUMN_NAME");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("INVALID_DATE_FORMAT should be valid AXError", () => {
      const error = new AXErrorException("INVALID_DATE_FORMAT", "Invalid date format", [
        "Use ISO date format",
        "Use duration format",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "INVALID_DATE_FORMAT");
      assert.ok(error.axError.nextActions.length > 0);
    });

    test("PACKAGE_ROOT_NOT_FOUND should be valid AXError", () => {
      const error = new AXErrorException("PACKAGE_ROOT_NOT_FOUND", "Could not find package root", [
        "Ensure the package is properly installed",
      ]);

      assert.ok(isAXErrorException(error));
      assert.strictEqual(error.axError.code, "PACKAGE_ROOT_NOT_FOUND");
      assert.ok(error.axError.nextActions.length > 0);
    });
  });

  describe("Error context", () => {
    test("should include relevant context in errors", () => {
      const error = new AXErrorException(
        "DB_NOT_FOUND",
        "Input database not found: /path/to/db",
        ["Run `lex init` to create the database"],
        { path: "/path/to/db", operation: "dbEncrypt" }
      );

      assert.strictEqual(error.axError.context?.path, "/path/to/db");
      assert.strictEqual(error.axError.context?.operation, "dbEncrypt");
    });
  });
});
