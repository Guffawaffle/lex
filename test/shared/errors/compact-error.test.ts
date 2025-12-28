/**
 * Tests for Compact Error Envelope (AX-012)
 *
 * Validates compact error formatting for token efficiency.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  CompactErrorEnvelopeSchema,
  toCompactError,
  mcpErrorToCompactError,
  createCompactErrorEnvelope,
  axErrorToCompactEnvelope,
  mcpErrorToCompactEnvelope,
} from "../../../src/shared/errors/compact-error.js";
import { createAXError } from "../../../src/shared/errors/ax-error.js";
import { LEX_ERROR_CODES } from "../../../src/shared/errors/error-codes.js";

describe("Compact Error Envelope (AX-012)", () => {
  describe("CompactErrorEnvelopeSchema", () => {
    it("should validate minimal compact error", () => {
      const envelope = {
        err: {
          code: "VALIDATION_INVALID_MODULE_ID",
          msg: "Module not found",
          retry: false,
        },
      };
      const result = CompactErrorEnvelopeSchema.safeParse(envelope);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result)}`);
    });

    it("should validate compact error with hintId", () => {
      const envelope = {
        err: {
          code: "VALIDATION_INVALID_MODULE_ID",
          msg: "Module not found",
          retry: false,
          hintId: "hint_mod_invalid_001",
        },
      };
      const result = CompactErrorEnvelopeSchema.safeParse(envelope);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result)}`);
    });

    it("should reject error without required fields", () => {
      const envelope = {
        err: {
          code: "VALIDATION_INVALID_MODULE_ID",
          msg: "Module not found",
          // missing retry
        },
      };
      const result = CompactErrorEnvelopeSchema.safeParse(envelope);
      assert.ok(!result.success, "Should reject without retry field");
    });

    it("should reject error with wrong field types", () => {
      const envelope = {
        err: {
          code: "VALIDATION_INVALID_MODULE_ID",
          msg: "Module not found",
          retry: "false", // should be boolean
        },
      };
      const result = CompactErrorEnvelopeSchema.safeParse(envelope);
      assert.ok(!result.success, "Should reject with wrong retry type");
    });
  });

  describe("toCompactError", () => {
    it("should convert AXError to compact error", () => {
      const axError = createAXError(
        LEX_ERROR_CODES.VALIDATION_INVALID_MODULE_ID,
        "Module 'auth/invalid' not found",
        ["Check module ID spelling", "Run 'lex introspect' to see available modules"],
        { invalidIds: ["auth/invalid"] }
      );

      const compact = toCompactError(axError);

      assert.equal(compact.code, LEX_ERROR_CODES.VALIDATION_INVALID_MODULE_ID);
      assert.equal(compact.msg, "Module 'auth/invalid' not found");
      assert.equal(compact.retry, false);
      assert.equal(compact.hintId, "hint_mod_invalid_001");
    });

    it("should include hintId when available", () => {
      const axError = createAXError(LEX_ERROR_CODES.POLICY_NOT_FOUND, "Policy file not found", [
        "Run 'lex init'",
      ]);

      const compact = toCompactError(axError);

      assert.equal(compact.hintId, "hint_policy_not_found_001");
    });

    it("should omit hintId when not available", () => {
      const axError = createAXError("CUSTOM_ERROR_CODE", "Custom error message", ["Some action"]);

      const compact = toCompactError(axError);

      assert.equal(compact.hintId, undefined);
    });
  });

  describe("mcpErrorToCompactError", () => {
    it("should convert MCP error to compact error", () => {
      const compact = mcpErrorToCompactError(
        "VALIDATION_INVALID_MODULE_ID",
        "Invalid module IDs: auth/invalid. Did you mean: auth/core? Available modules: auth/core, auth/password, memory/store, ..."
      );

      assert.equal(compact.code, "VALIDATION_INVALID_MODULE_ID");
      assert.ok(compact.msg.length < 100, "Message should be truncated");
      assert.equal(compact.retry, false);
      assert.equal(compact.hintId, "hint_mod_invalid_001");
    });

    it("should mark retryable errors correctly", () => {
      const compact = mcpErrorToCompactError("STORAGE_WRITE_FAILED", "Failed to write to database");

      assert.equal(compact.code, "STORAGE_WRITE_FAILED");
      assert.equal(compact.retry, true, "Storage errors should be retryable");
      assert.equal(compact.hintId, "hint_storage_write_001");
    });

    it("should truncate long messages", () => {
      const longMessage =
        "This is a very long error message that contains multiple sentences and a lot of details about what went wrong. " +
        "It keeps going on and on with information that might be helpful for debugging but is too verbose for compact mode. " +
        "We should truncate this to save tokens.";

      const compact = mcpErrorToCompactError("INTERNAL_ERROR", longMessage);

      assert.ok(compact.msg.length < 105, "Message should be truncated to ~100 chars");
      assert.ok(compact.msg.endsWith("..."), "Truncated message should end with ...");
    });

    it("should keep short messages as-is", () => {
      const shortMessage = "File not found";

      const compact = mcpErrorToCompactError("POLICY_NOT_FOUND", shortMessage);

      assert.equal(compact.msg, shortMessage);
    });

    it("should extract first sentence from multi-sentence messages", () => {
      const message =
        "Module not found. Please check the module ID. Run introspect to list all modules.";

      const compact = mcpErrorToCompactError("VALIDATION_INVALID_MODULE_ID", message);

      assert.equal(compact.msg, "Module not found.");
      assert.ok(compact.msg.length < 100, "First sentence should be short");
    });
  });

  describe("createCompactErrorEnvelope", () => {
    it("should create envelope with err field", () => {
      const error = {
        code: "VALIDATION_INVALID_MODULE_ID",
        msg: "Module not found",
        retry: false,
        hintId: "hint_mod_invalid_001" as const,
      };

      const envelope = createCompactErrorEnvelope(error);

      assert.deepEqual(envelope.err, error);
    });

    it("should validate with schema", () => {
      const error = {
        code: "POLICY_NOT_FOUND",
        msg: "Policy file not found",
        retry: false,
        hintId: "hint_policy_not_found_001" as const,
      };

      const envelope = createCompactErrorEnvelope(error);
      const result = CompactErrorEnvelopeSchema.safeParse(envelope);

      assert.ok(result.success, "Envelope should be valid");
    });
  });

  describe("axErrorToCompactEnvelope", () => {
    it("should create compact envelope from AXError", () => {
      const axError = createAXError(
        LEX_ERROR_CODES.FRAME_NOT_FOUND,
        "Frame with id 'abc123' not found",
        ["Run 'lex timeline' to see recent frames"],
        { frameId: "abc123" }
      );

      const envelope = axErrorToCompactEnvelope(axError);

      assert.ok(envelope.err);
      assert.equal(envelope.err.code, LEX_ERROR_CODES.FRAME_NOT_FOUND);
      assert.equal(envelope.err.msg, "Frame with id 'abc123' not found");
      assert.equal(envelope.err.retry, false);
      assert.equal(envelope.err.hintId, "hint_frame_not_found_001");
    });
  });

  describe("mcpErrorToCompactEnvelope", () => {
    it("should create compact envelope from MCP error", () => {
      const envelope = mcpErrorToCompactEnvelope(
        "VALIDATION_REQUIRED_FIELD",
        "Missing required field: module_scope"
      );

      assert.ok(envelope.err);
      assert.equal(envelope.err.code, "VALIDATION_REQUIRED_FIELD");
      assert.ok(envelope.err.msg.includes("required field"));
      assert.equal(envelope.err.retry, false);
      assert.equal(envelope.err.hintId, "hint_required_field_001");
    });
  });

  describe("Token efficiency", () => {
    it("compact envelope should be much smaller than full AXError", () => {
      const axError = createAXError(
        LEX_ERROR_CODES.VALIDATION_INVALID_MODULE_ID,
        "Module 'auth/invalid' not found in policy. Did you mean 'auth/core'? Available modules: auth/core, auth/password, memory/store, memory/renderer, shared/cli, shared/config",
        [
          "Check module ID spelling",
          "Run 'lex introspect' to see available modules",
          "Verify policy file is up to date",
        ],
        {
          invalidIds: ["auth/invalid"],
          suggestions: ["auth/core"],
          availableModules: [
            "auth/core",
            "auth/password",
            "memory/store",
            "memory/renderer",
            "shared/cli",
            "shared/config",
          ],
        }
      );

      const compactEnvelope = axErrorToCompactEnvelope(axError);

      const fullSize = JSON.stringify(axError).length;
      const compactSize = JSON.stringify(compactEnvelope).length;

      // Compact envelope should be significantly smaller
      // It removes nextActions array, context object, and uses shorter field names
      assert.ok(compactSize < fullSize, "Compact envelope should be smaller than full error");
      assert.ok(compactSize < 250, "Compact envelope should be under 250 characters");

      // Should save at least 30% on a verbose error
      const savingsPercent = ((fullSize - compactSize) / fullSize) * 100;
      assert.ok(
        savingsPercent > 30,
        `Should save at least 30% (saved ${savingsPercent.toFixed(1)}%)`
      );
    });

    it("should use short field names", () => {
      const envelope = mcpErrorToCompactEnvelope("POLICY_NOT_FOUND", "Policy file not found");

      const json = JSON.stringify(envelope);

      // Should use short field names
      assert.ok(json.includes('"err"'), "Should use 'err' field");
      assert.ok(json.includes('"msg"'), "Should use 'msg' field");
      assert.ok(json.includes('"retry"'), "Should use 'retry' field");

      // Should NOT use long field names
      assert.ok(!json.includes('"error"'), "Should not use 'error' field");
      assert.ok(!json.includes('"message"'), "Should not use 'message' field");
      assert.ok(!json.includes('"retryable"'), "Should not use 'retryable' field");
    });
  });
});
