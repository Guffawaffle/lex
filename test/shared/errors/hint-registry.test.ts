/**
 * Tests for Hint Registry (AX-012)
 *
 * Validates the hint registry functionality for compact error envelopes.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  HINT_REGISTRY,
  ERROR_CODE_TO_HINT_ID,
  getHint,
  getHints,
  getHintIdForErrorCode,
  isValidHintId,
} from "../../../src/shared/errors/hint-registry.js";
import { LEX_ERROR_CODES } from "../../../src/shared/errors/error-codes.js";

describe("Hint Registry (AX-012)", () => {
  describe("HINT_REGISTRY", () => {
    it("should contain hint definitions", () => {
      assert.ok(Object.keys(HINT_REGISTRY).length > 0, "Registry should not be empty");
    });

    it("should have valid hint structure", () => {
      for (const [hintId, hint] of Object.entries(HINT_REGISTRY)) {
        assert.ok(hintId.startsWith("hint_"), `Hint ID ${hintId} should start with 'hint_'`);
        assert.ok(typeof hint.action === "string", `Hint ${hintId} should have action string`);
        assert.ok(hint.action.length > 0, `Hint ${hintId} action should not be empty`);

        if (hint.tool) {
          assert.ok(typeof hint.tool === "string", `Hint ${hintId} tool should be string`);
        }
        if (hint.field) {
          assert.ok(typeof hint.field === "string", `Hint ${hintId} field should be string`);
        }
      }
    });

    it("should have module validation hints", () => {
      assert.ok(HINT_REGISTRY["hint_mod_invalid_001"]);
      assert.equal(HINT_REGISTRY["hint_mod_invalid_001"].action, "Check module ID spelling");
      assert.equal(HINT_REGISTRY["hint_mod_invalid_001"].tool, "introspect");
      assert.equal(HINT_REGISTRY["hint_mod_invalid_001"].field, "policy.modules");
    });

    it("should have policy hints", () => {
      assert.ok(HINT_REGISTRY["hint_policy_not_found_001"]);
      assert.equal(
        HINT_REGISTRY["hint_policy_not_found_001"].action,
        "Initialize workspace with policy file"
      );
      assert.equal(HINT_REGISTRY["hint_policy_not_found_001"].tool, "lex init");
    });
  });

  describe("ERROR_CODE_TO_HINT_ID", () => {
    it("should map error codes to hint IDs", () => {
      assert.ok(Object.keys(ERROR_CODE_TO_HINT_ID).length > 0, "Mapping should not be empty");
    });

    it("should map VALIDATION_INVALID_MODULE_ID to hint", () => {
      const hintId = ERROR_CODE_TO_HINT_ID[LEX_ERROR_CODES.VALIDATION_INVALID_MODULE_ID];
      assert.ok(hintId, "Should have hint ID for VALIDATION_INVALID_MODULE_ID");
      assert.equal(hintId, "hint_mod_invalid_001");
    });

    it("should map POLICY_NOT_FOUND to hint", () => {
      const hintId = ERROR_CODE_TO_HINT_ID[LEX_ERROR_CODES.POLICY_NOT_FOUND];
      assert.ok(hintId, "Should have hint ID for POLICY_NOT_FOUND");
      assert.equal(hintId, "hint_policy_not_found_001");
    });

    it("should map to valid hint IDs", () => {
      for (const [errorCode, hintId] of Object.entries(ERROR_CODE_TO_HINT_ID)) {
        assert.ok(
          HINT_REGISTRY[hintId],
          `Error code ${errorCode} maps to invalid hint ID ${hintId}`
        );
      }
    });
  });

  describe("getHint", () => {
    it("should retrieve hint by ID", () => {
      const hint = getHint("hint_mod_invalid_001");
      assert.ok(hint);
      assert.equal(hint.action, "Check module ID spelling");
    });

    it("should return undefined for invalid ID", () => {
      const hint = getHint("invalid_hint_id");
      assert.equal(hint, undefined);
    });
  });

  describe("getHints", () => {
    it("should retrieve multiple hints by IDs", () => {
      const hints = getHints(["hint_mod_invalid_001", "hint_policy_not_found_001"]);
      assert.equal(Object.keys(hints).length, 2);
      assert.ok(hints["hint_mod_invalid_001"]);
      assert.ok(hints["hint_policy_not_found_001"]);
    });

    it("should skip invalid IDs", () => {
      const hints = getHints(["hint_mod_invalid_001", "invalid_id", "hint_policy_not_found_001"]);
      assert.equal(Object.keys(hints).length, 2);
      assert.ok(hints["hint_mod_invalid_001"]);
      assert.ok(hints["hint_policy_not_found_001"]);
      assert.ok(!hints["invalid_id"]);
    });

    it("should return empty object for empty array", () => {
      const hints = getHints([]);
      assert.deepEqual(hints, {});
    });

    it("should return empty object for all invalid IDs", () => {
      const hints = getHints(["invalid1", "invalid2"]);
      assert.deepEqual(hints, {});
    });
  });

  describe("getHintIdForErrorCode", () => {
    it("should return hint ID for error code", () => {
      const hintId = getHintIdForErrorCode(LEX_ERROR_CODES.VALIDATION_INVALID_MODULE_ID);
      assert.equal(hintId, "hint_mod_invalid_001");
    });

    it("should return undefined for unmapped error code", () => {
      const hintId = getHintIdForErrorCode("UNKNOWN_ERROR_CODE" as any);
      assert.equal(hintId, undefined);
    });
  });

  describe("isValidHintId", () => {
    it("should return true for valid hint ID", () => {
      assert.ok(isValidHintId("hint_mod_invalid_001"));
    });

    it("should return false for invalid hint ID", () => {
      assert.ok(!isValidHintId("invalid_hint_id"));
    });
  });

  describe("Hint ID stability", () => {
    it("hint IDs should follow naming convention", () => {
      for (const hintId of Object.keys(HINT_REGISTRY)) {
        assert.match(
          hintId,
          /^hint_[a-z_]+_\d{3}$/,
          `Hint ID ${hintId} should follow pattern hint_<name>_<number>`
        );
      }
    });

    it("hint IDs should be unique", () => {
      const ids = Object.keys(HINT_REGISTRY);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, "Hint IDs should be unique");
    });
  });
});
