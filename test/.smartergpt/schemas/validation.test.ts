/**
 * AJV Validation Tests for Infrastructure JSON Schemas
 *
 * Tests that all infrastructure schemas (profile, gates, runner.stack, runner.scope)
 * are valid and properly enforce strict validation rules.
 *
 * Run with: npm test
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load schemas
const schemasDir = join(__dirname, "../../../.smartergpt/schemas");

function loadSchema(filename: string) {
  const content = readFileSync(join(schemasDir, filename), "utf-8");
  return JSON.parse(content);
}

const profileSchema = loadSchema("profile.schema.json");
const gatesSchema = loadSchema("gates.schema.json");
const runnerStackSchema = loadSchema("runner.stack.schema.json");
const runnerScopeSchema = loadSchema("runner.scope.schema.json");

// Create AJV instance with formats support
function createValidator() {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    validateFormats: true,
    validateSchema: false, // Disable meta-schema validation to avoid draft-2020-12 issues
  });
  addFormats(ajv);
  return ajv;
}

describe("Profile Schema Validation", () => {
  const ajv = createValidator();
  const validate = ajv.compile(profileSchema);

  test("should have correct $id with full URL", () => {
    assert.strictEqual(
      profileSchema.$id,
      "https://github.com/Guffawaffle/lex/schemas/profile.schema.json",
      "Schema should have proper $id URL"
    );
  });

  test("should validate a minimal valid profile", () => {
    const validProfile = {
      role: "development",
    };
    const isValid = validate(validProfile);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate a complete valid profile", () => {
    const validProfile = {
      role: "development",
      name: "Dev Environment",
      version: "1.0.0",
      projectType: "nodejs",
      created: "2025-11-10T08:00:00Z",
      owner: "developer",
    };
    const isValid = validate(validProfile);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should reject profile with additional properties", () => {
    const invalidProfile = {
      role: "development",
      unexpectedProperty: "should fail",
    };
    const isValid = validate(invalidProfile);
    assert.strictEqual(isValid, false, "Should reject additional properties");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should reject profile without required role", () => {
    const invalidProfile = {
      name: "Test",
    };
    const isValid = validate(invalidProfile);
    assert.strictEqual(isValid, false, "Should reject missing required field");
    assert.ok(validate.errors?.some((e) => e.keyword === "required"));
  });

  test("should validate date-time format", () => {
    const profileWithInvalidDate = {
      role: "development",
      created: "not-a-date",
    };
    const isValid = validate(profileWithInvalidDate);
    assert.strictEqual(isValid, false, "Should reject invalid date-time format");
    assert.ok(validate.errors?.some((e) => e.keyword === "format"));
  });

  test("should accept valid date-time format", () => {
    const profileWithValidDate = {
      role: "development",
      created: "2025-11-10T08:20:54.967Z",
    };
    const isValid = validate(profileWithValidDate);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });
});

describe("Gates Schema Validation", () => {
  const ajv = createValidator();
  const validate = ajv.compile(gatesSchema);

  test("should have correct $id with full URL", () => {
    assert.strictEqual(
      gatesSchema.$id,
      "https://github.com/Guffawaffle/lex/schemas/gates.schema.json",
      "Schema should have proper $id URL"
    );
  });

  test("should validate an empty gates configuration", () => {
    const validGates = {};
    const isValid = validate(validGates);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate gates with version", () => {
    const validGates = {
      version: "1.0.0",
      gates: [],
    };
    const isValid = validate(validGates);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate gates with complete gate definitions", () => {
    const validGates = {
      version: "1.0.0",
      gates: [
        {
          id: "gate-1",
          type: "validation",
          enabled: true,
          description: "Test gate",
          config: {
            customProp: "allowed",
          },
        },
      ],
    };
    const isValid = validate(validGates);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should reject gates object with additional properties", () => {
    const invalidGates = {
      version: "1.0.0",
      unexpectedProperty: "should fail",
    };
    const isValid = validate(invalidGates);
    assert.strictEqual(isValid, false, "Should reject additional properties on root");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should reject gate without required fields", () => {
    const invalidGates = {
      gates: [
        {
          id: "gate-1",
          // missing type and enabled
        },
      ],
    };
    const isValid = validate(invalidGates);
    assert.strictEqual(isValid, false, "Should reject gate missing required fields");
    assert.ok(validate.errors?.some((e) => e.keyword === "required"));
  });

  test("should reject gate with additional properties at gate level", () => {
    const invalidGates = {
      gates: [
        {
          id: "gate-1",
          type: "validation",
          enabled: true,
          unexpectedProp: "should fail",
        },
      ],
    };
    const isValid = validate(invalidGates);
    assert.strictEqual(isValid, false, "Should reject additional properties on gate");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should allow additional properties in gate config", () => {
    const validGates = {
      gates: [
        {
          id: "gate-1",
          type: "validation",
          enabled: true,
          config: {
            customProp1: "allowed",
            customProp2: 123,
            nested: { prop: "also allowed" },
          },
        },
      ],
    };
    const isValid = validate(validGates);
    assert.strictEqual(
      isValid,
      true,
      `Config should allow additional properties: ${JSON.stringify(validate.errors)}`
    );
  });
});

describe("Runner Stack Schema Validation", () => {
  const ajv = createValidator();
  const validate = ajv.compile(runnerStackSchema);

  test("should have correct $id with full URL", () => {
    assert.strictEqual(
      runnerStackSchema.$id,
      "https://github.com/Guffawaffle/lex/schemas/runner.stack.schema.json",
      "Schema should have proper $id URL"
    );
  });

  test("should validate an empty stack configuration", () => {
    const validStack = {};
    const isValid = validate(validStack);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate a complete stack configuration", () => {
    const validStack = {
      version: "1.0.0",
      stack: [
        {
          name: "runtime",
          type: "runtime",
          enabled: true,
          config: {
            timeout: 30,
          },
        },
      ],
      timeout: 60,
      retries: 3,
    };
    const isValid = validate(validStack);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should reject stack with additional properties", () => {
    const invalidStack = {
      version: "1.0.0",
      unexpectedProperty: "should fail",
    };
    const isValid = validate(invalidStack);
    assert.strictEqual(isValid, false, "Should reject additional properties");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should reject stack component without required fields", () => {
    const invalidStack = {
      stack: [
        {
          name: "runtime",
          // missing type
        },
      ],
    };
    const isValid = validate(invalidStack);
    assert.strictEqual(isValid, false, "Should reject component missing required fields");
    assert.ok(validate.errors?.some((e) => e.keyword === "required"));
  });

  test("should reject stack component with additional properties", () => {
    const invalidStack = {
      stack: [
        {
          name: "runtime",
          type: "runtime",
          unexpectedProp: "should fail",
        },
      ],
    };
    const isValid = validate(invalidStack);
    assert.strictEqual(isValid, false, "Should reject additional properties on component");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should allow additional properties in component config", () => {
    const validStack = {
      stack: [
        {
          name: "runtime",
          type: "runtime",
          config: {
            customProp1: "allowed",
            customProp2: 123,
          },
        },
      ],
    };
    const isValid = validate(validStack);
    assert.strictEqual(
      isValid,
      true,
      `Config should allow additional properties: ${JSON.stringify(validate.errors)}`
    );
  });
});

describe("Runner Scope Schema Validation", () => {
  const ajv = createValidator();
  const validate = ajv.compile(runnerScopeSchema);

  test("should have correct $id with full URL", () => {
    assert.strictEqual(
      runnerScopeSchema.$id,
      "https://github.com/Guffawaffle/lex/schemas/runner.scope.schema.json",
      "Schema should have proper $id URL"
    );
  });

  test("should validate an empty scope configuration", () => {
    const validScope = {};
    const isValid = validate(validScope);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate a complete scope configuration", () => {
    const validScope = {
      version: "1.0.0",
      scope: {
        modules: ["module-a", "module-b"],
        directories: ["src/", "test/"],
        files: ["README.md"],
        exclude: ["*.test.ts"],
      },
      permissions: ["read", "write"],
      limits: {
        maxFiles: 100,
        maxLines: 1000,
        maxDuration: 300,
      },
    };
    const isValid = validate(validScope);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should reject scope with additional properties at root", () => {
    const invalidScope = {
      version: "1.0.0",
      unexpectedProperty: "should fail",
    };
    const isValid = validate(invalidScope);
    assert.strictEqual(isValid, false, "Should reject additional properties");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should reject scope object with additional properties", () => {
    const invalidScope = {
      scope: {
        modules: ["module-a"],
        unexpectedProperty: "should fail",
      },
    };
    const isValid = validate(invalidScope);
    assert.strictEqual(isValid, false, "Should reject additional properties in scope");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should reject limits with additional properties", () => {
    const invalidScope = {
      limits: {
        maxFiles: 100,
        unexpectedProperty: "should fail",
      },
    };
    const isValid = validate(invalidScope);
    assert.strictEqual(isValid, false, "Should reject additional properties in limits");
    assert.ok(validate.errors?.some((e) => e.keyword === "additionalProperties"));
  });

  test("should validate partial scope configuration", () => {
    const validScope = {
      scope: {
        modules: ["module-a"],
      },
    };
    const isValid = validate(validScope);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });

  test("should validate partial limits configuration", () => {
    const validScope = {
      limits: {
        maxFiles: 100,
      },
    };
    const isValid = validate(validScope);
    assert.strictEqual(isValid, true, `Validation failed: ${JSON.stringify(validate.errors)}`);
  });
});
