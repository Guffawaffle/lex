/**
 * AXError Schema Tests
 *
 * Tests the AX-compliant error types per AX v0.1 Contract.
 * @see /docs/specs/AX-CONTRACT.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  AXErrorSchema,
  createAXError,
  wrapAsAXError,
  isAXError,
  AXErrorException,
  isAXErrorException,
  type AXError,
} from "../../../src/shared/errors/ax-error.js";

describe("AXError Schema", () => {
  describe("AXErrorSchema validation", () => {
    it("should validate a minimal AXError", () => {
      const error = {
        code: "FRAME_NOT_FOUND",
        message: "Frame with id 'abc' not found",
        nextActions: ["Try listing frames with 'lex timeline'"],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result)}`);
    });

    it("should validate a complete AXError with context", () => {
      const error = {
        code: "MEMORY_SEARCH_FAILED",
        message: "FTS5 search failed for query",
        context: {
          query: "test query",
          operation: "recall",
        },
        nextActions: [
          "Check that the database exists",
          "Verify FTS5 tables are initialized",
        ],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result)}`);
    });

    it("should reject error without required code", () => {
      const error = {
        message: "Something went wrong",
        nextActions: ["Try again"],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(!result.success, "Should reject error without code");
    });

    it("should reject error without required message", () => {
      const error = {
        code: "UNKNOWN",
        nextActions: ["Try again"],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(!result.success, "Should reject error without message");
    });

    it("should reject error without nextActions", () => {
      const error = {
        code: "UNKNOWN",
        message: "Something went wrong",
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(!result.success, "Should reject error without nextActions");
    });

    it("should reject error with empty nextActions array", () => {
      const error = {
        code: "UNKNOWN",
        message: "Something went wrong",
        nextActions: [],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(!result.success, "Should reject error with empty nextActions");
    });

    it("should reject error code not in UPPER_SNAKE_CASE", () => {
      const error = {
        code: "frame-not-found",
        message: "Frame not found",
        nextActions: ["Try again"],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(!result.success, "Should reject non-UPPER_SNAKE_CASE code");
    });

    it("should allow string-keyed context with unknown values", () => {
      const error = {
        code: "CONFIG_INVALID",
        message: "Invalid configuration",
        context: {
          path: "/path/to/config",
          line: 42,
          nested: { key: "value" },
        },
        nextActions: ["Check config file syntax"],
      };
      const result = AXErrorSchema.safeParse(error);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result)}`);
    });
  });

  describe("createAXError factory", () => {
    it("should create AXError with required fields", () => {
      const error = createAXError(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Run 'lex timeline' to see recent Frames"]
      );

      assert.equal(error.code, "FRAME_NOT_FOUND");
      assert.equal(error.message, "Frame not found");
      assert.deepEqual(error.nextActions, ["Run 'lex timeline' to see recent Frames"]);
      assert.equal(error.context, undefined);
    });

    it("should create AXError with context", () => {
      const error = createAXError(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check the frame ID"],
        { frameId: "abc-123" }
      );

      assert.deepEqual(error.context, { frameId: "abc-123" });
    });

    it("should throw on invalid code format", () => {
      assert.throws(() => {
        createAXError(
          "invalid-code",
          "Test",
          ["Action"]
        );
      });
    });

    it("should throw on empty nextActions", () => {
      assert.throws(() => {
        createAXError(
          "VALID_CODE",
          "Test",
          []
        );
      });
    });

    it("should be valid according to AXErrorSchema", () => {
      const error = createAXError(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Try again"],
        { id: "test" }
      );
      const result = AXErrorSchema.safeParse(error);
      assert.ok(result.success, `Factory output should be valid`);
    });
  });

  describe("wrapAsAXError utility", () => {
    it("should wrap a standard Error", () => {
      const original = new Error("Original error message");
      const wrapped = wrapAsAXError(
        original,
        "UNKNOWN_ERROR",
        ["Check logs for details"]
      );

      assert.equal(wrapped.code, "UNKNOWN_ERROR");
      assert.equal(wrapped.message, "Original error message");
      assert.ok(wrapped.context?.originalError === "Error");
    });

    it("should preserve stack trace in context", () => {
      const original = new Error("Test with stack");
      const wrapped = wrapAsAXError(original, "UNKNOWN_ERROR", ["Check logs"]);

      assert.ok(Array.isArray(wrapped.context?.stack));
    });

    it("should add additional context", () => {
      const original = new Error("Test");
      const wrapped = wrapAsAXError(
        original,
        "UNKNOWN_ERROR",
        ["Try again"],
        { operation: "test-op" }
      );

      assert.equal(wrapped.context?.operation, "test-op");
    });

    it("should be valid according to AXErrorSchema", () => {
      const wrapped = wrapAsAXError(
        new Error("test"),
        "UNKNOWN_ERROR",
        ["Check details"]
      );
      const result = AXErrorSchema.safeParse(wrapped);
      assert.ok(result.success, `Wrapped error should be valid`);
    });
  });

  describe("isAXError type guard", () => {
    it("should return true for valid AXError", () => {
      const error = createAXError(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      assert.ok(isAXError(error));
    });

    it("should return true for manually constructed AXError", () => {
      const error: AXError = {
        code: "UNKNOWN",
        message: "Test",
        nextActions: ["Try again"],
      };
      assert.ok(isAXError(error));
    });

    it("should return false for standard Error", () => {
      const error = new Error("Not an AXError");
      assert.ok(!isAXError(error));
    });

    it("should return false for null", () => {
      assert.ok(!isAXError(null));
    });

    it("should return false for undefined", () => {
      assert.ok(!isAXError(undefined));
    });

    it("should return false for partial object missing nextActions", () => {
      const partial = { code: "UNKNOWN", message: "Test" };
      assert.ok(!isAXError(partial));
    });

    it("should return false for primitive", () => {
      assert.ok(!isAXError("string"));
      assert.ok(!isAXError(42));
      assert.ok(!isAXError(true));
    });
  });

  describe("AXErrorException class", () => {
    it("should extend Error", () => {
      const exception = new AXErrorException(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      assert.ok(exception instanceof Error);
    });

    it("should be throwable and catchable", () => {
      assert.throws(
        () => {
          throw new AXErrorException(
            "FRAME_NOT_FOUND",
            "Frame not found",
            ["Check ID"]
          );
        },
        AXErrorException
      );
    });

    it("should have axError property with valid AXError", () => {
      const exception = new AXErrorException(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"],
        { frameId: "abc" }
      );
      
      const result = AXErrorSchema.safeParse(exception.axError);
      assert.ok(result.success);
      assert.equal(exception.axError.code, "FRAME_NOT_FOUND");
      assert.deepEqual(exception.axError.context, { frameId: "abc" });
    });

    it("should serialize to JSON as AXError", () => {
      const exception = new AXErrorException(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      
      const json = JSON.stringify(exception);
      const parsed = JSON.parse(json);
      
      assert.equal(parsed.code, "FRAME_NOT_FOUND");
      assert.deepEqual(parsed.nextActions, ["Check ID"]);
    });

    it("toAXError should return valid AXError", () => {
      const exception = new AXErrorException(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      
      const axError = exception.toAXError();
      assert.ok(isAXError(axError));
    });
  });

  describe("isAXErrorException type guard", () => {
    it("should return true for AXErrorException", () => {
      const exception = new AXErrorException(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      assert.ok(isAXErrorException(exception));
    });

    it("should return false for standard Error", () => {
      const error = new Error("Not an AXErrorException");
      assert.ok(!isAXErrorException(error));
    });

    it("should return false for AXError (plain object)", () => {
      const error = createAXError(
        "FRAME_NOT_FOUND",
        "Frame not found",
        ["Check ID"]
      );
      assert.ok(!isAXErrorException(error));
    });
  });

  describe("AX Contract Compliance", () => {
    it("should support structured output (AX v0.1 guarantee)", () => {
      // Per AX-CONTRACT.md: "Errors MUST be structured, parseable, and actionable"
      const error = createAXError(
        "MEMORY_SEARCH_FAILED",
        "Search failed",
        ["Retry with simpler query"],
        { query: "test", operation: "recall" }
      );

      // Must be JSON-serializable
      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      // Must be parseable back to valid AXError
      const result = AXErrorSchema.safeParse(parsed);
      assert.ok(result.success, "AXError must round-trip through JSON");
    });

    it("should require nextActions for agent guidance (AX v0.1 guarantee)", () => {
      // Per AX-CONTRACT.md: Errors should suggest next actions
      const error = createAXError(
        "MEMORY_SEARCH_FAILED",
        "Search failed",
        [
          "Retry with simpler query",
          "Check database connection",
          "Verify FTS5 tables exist",
        ],
        { query: "test" }
      );

      assert.ok(Array.isArray(error.nextActions));
      assert.equal(error.nextActions.length, 3);
    });

    it("should enforce UPPER_SNAKE_CASE for stable code parsing", () => {
      // Agents can rely on consistent code format
      const validCodes = [
        "FRAME_NOT_FOUND",
        "DB_CONNECTION_FAILED",
        "POLICY_VIOLATION",
        "A1_B2_C3",
      ];

      for (const code of validCodes) {
        const error = { code, message: "Test", nextActions: ["Action"] };
        const result = AXErrorSchema.safeParse(error);
        assert.ok(result.success, `Code ${code} should be valid`);
      }

      const invalidCodes = [
        "frame-not-found",
        "FrameNotFound",
        "frame_not_found",
        "123_INVALID",
      ];

      for (const code of invalidCodes) {
        const error = { code, message: "Test", nextActions: ["Action"] };
        const result = AXErrorSchema.safeParse(error);
        assert.ok(!result.success, `Code ${code} should be invalid`);
      }
    });
  });
});
