/**
 * Tests for Persona Schema
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parsePersona,
  validatePersona,
  type Persona,
} from "../../../dist/shared/schemas/persona.js";

describe("PersonaSchema", () => {
  const validPersona = {
    name: "Test Persona",
    version: "1.0.0",
    triggers: ["test mode", "testing"],
    role: {
      title: "Test Agent",
      scope: "For testing purposes",
    },
    ritual: "TEST READY",
    duties: {
      must_do: ["Run tests", "Be helpful"],
      must_not_do: ["Skip tests", "Be rude"],
    },
    gates: ["lint", "test"],
  };

  describe("parsePersona", () => {
    it("parses valid persona data", () => {
      const result = parsePersona(validPersona);
      assert.strictEqual(result.name, "Test Persona");
      assert.strictEqual(result.version, "1.0.0");
      assert.deepStrictEqual(result.triggers, ["test mode", "testing"]);
      assert.strictEqual(result.role.title, "Test Agent");
      assert.strictEqual(result.ritual, "TEST READY");
    });

    it("applies default version when omitted", () => {
      const dataWithoutVersion = {
        ...validPersona,
        version: undefined,
      };
      const result = parsePersona(dataWithoutVersion);
      assert.strictEqual(result.version, "1.0.0");
    });

    it("accepts persona without optional fields", () => {
      const minimalPersona = {
        name: "Minimal",
        triggers: ["minimal mode"],
        role: {
          title: "Minimal Agent",
          scope: "Testing minimal config",
        },
        duties: {
          must_do: ["Work"],
          must_not_do: ["Fail"],
        },
      };
      const result = parsePersona(minimalPersona);
      assert.strictEqual(result.name, "Minimal");
      assert.strictEqual(result.ritual, undefined);
      assert.strictEqual(result.gates, undefined);
    });

    it("throws on missing required fields", () => {
      const invalidPersona = {
        name: "Missing triggers",
        role: {
          title: "Agent",
          scope: "Testing",
        },
        duties: {
          must_do: [],
          must_not_do: [],
        },
      };
      assert.throws(() => parsePersona(invalidPersona));
    });

    it("throws on empty triggers array", () => {
      const emptyTriggers = {
        ...validPersona,
        triggers: [],
      };
      assert.throws(() => parsePersona(emptyTriggers));
    });
  });

  describe("validatePersona", () => {
    it("returns success for valid data", () => {
      const result = validatePersona(validPersona);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.name, "Test Persona");
      }
    });

    it("returns error for invalid data", () => {
      const result = validatePersona({ name: "only name" });
      assert.strictEqual(result.success, false);
    });

    it("does not throw on invalid data", () => {
      // Should not throw, just return error result
      const result = validatePersona(null);
      assert.strictEqual(result.success, false);
    });
  });

  describe("PersonaSchema type inference", () => {
    it("infers correct types", () => {
      const persona: Persona = parsePersona(validPersona);
      // Type checks at compile time
      const _name: string = persona.name;
      const _triggers: string[] = persona.triggers;
      const _title: string = persona.role.title;
      const _mustDo: string[] = persona.duties.must_do;

      assert.ok(_name);
      assert.ok(_triggers);
      assert.ok(_title);
      assert.ok(_mustDo);
    });
  });
});
