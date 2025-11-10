/**
 * Round-trip Tests: Zod ↔ JSON Schema
 *
 * Tests that verify Zod schemas and JSON schemas validate the same data.
 * This ensures that both schema representations are equivalent.
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
import {
  ProfileSchema,
  GatesSchema,
  RunnerStackSchema,
  RunnerScopeSchema,
} from "../../../.smartergpt/schemas/infrastructure.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load JSON schemas
const schemasDir = join(__dirname, "../../../.smartergpt/schemas");

function loadSchema(filename: string) {
  const content = readFileSync(join(schemasDir, filename), "utf-8");
  return JSON.parse(content);
}

const profileJsonSchema = loadSchema("profile.schema.json");
const gatesJsonSchema = loadSchema("gates.schema.json");
const runnerStackJsonSchema = loadSchema("runner.stack.schema.json");
const runnerScopeJsonSchema = loadSchema("runner.scope.schema.json");

// Create AJV instance with formats support
function createValidator() {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    validateFormats: true,
    validateSchema: false,
  });
  addFormats(ajv);
  return ajv;
}

describe("Profile Schema Round-trip Tests", () => {
  const ajv = createValidator();
  const jsonValidate = ajv.compile(profileJsonSchema);

  const testCases = [
    {
      name: "minimal valid profile",
      data: { role: "development" as const },
      shouldBeValid: true,
    },
    {
      name: "complete valid profile",
      data: {
        role: "development" as const,
        name: "Dev Environment",
        version: "1.0.0",
        projectType: "nodejs" as const,
        created: "2025-11-10T08:00:00Z",
        owner: "developer",
      },
      shouldBeValid: true,
    },
    {
      name: "profile with additional properties",
      data: {
        role: "development" as const,
        unexpectedProperty: "should fail",
      },
      shouldBeValid: false,
    },
    {
      name: "profile without required role",
      data: { name: "Test" },
      shouldBeValid: false,
    },
    {
      name: "profile with invalid date-time",
      data: {
        role: "development" as const,
        created: "not-a-date",
      },
      shouldBeValid: false,
    },
  ];

  for (const testCase of testCases) {
    test(`should agree on validation: ${testCase.name}`, () => {
      const zodResult = ProfileSchema.safeParse(testCase.data);
      const jsonResult = jsonValidate(testCase.data);

      assert.strictEqual(
        zodResult.success,
        testCase.shouldBeValid,
        `Zod validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        jsonResult,
        testCase.shouldBeValid,
        `JSON Schema validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        zodResult.success,
        jsonResult,
        `Zod and JSON Schema disagree on validation for ${testCase.name}`
      );
    });
  }
});

describe("Gates Schema Round-trip Tests", () => {
  const ajv = createValidator();
  const jsonValidate = ajv.compile(gatesJsonSchema);

  const testCases = [
    {
      name: "empty gates configuration",
      data: {},
      shouldBeValid: true,
    },
    {
      name: "gates with version and empty array",
      data: {
        version: "1.0.0",
        gates: [],
      },
      shouldBeValid: true,
    },
    {
      name: "gates with complete gate definition",
      data: {
        version: "1.0.0",
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            description: "Test gate",
            config: { customProp: "allowed" },
          },
        ],
      },
      shouldBeValid: true,
    },
    {
      name: "gates with additional properties at root",
      data: {
        version: "1.0.0",
        unexpectedProperty: "should fail",
      },
      shouldBeValid: false,
    },
    {
      name: "gate without required fields",
      data: {
        gates: [
          {
            id: "gate-1",
          },
        ],
      },
      shouldBeValid: false,
    },
    {
      name: "gate with additional properties",
      data: {
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            unexpectedProp: "should fail",
          },
        ],
      },
      shouldBeValid: false,
    },
    {
      name: "gate config with additional properties (allowed)",
      data: {
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            config: {
              customProp1: "allowed",
              customProp2: 123,
              nested: { prop: "also allowed" },
            },
          },
        ],
      },
      shouldBeValid: true,
    },
  ];

  for (const testCase of testCases) {
    test(`should agree on validation: ${testCase.name}`, () => {
      const zodResult = GatesSchema.safeParse(testCase.data);
      const jsonResult = jsonValidate(testCase.data);

      assert.strictEqual(
        zodResult.success,
        testCase.shouldBeValid,
        `Zod validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        jsonResult,
        testCase.shouldBeValid,
        `JSON Schema validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        zodResult.success,
        jsonResult,
        `Zod and JSON Schema disagree on validation for ${testCase.name}`
      );
    });
  }
});

describe("Runner Stack Schema Round-trip Tests", () => {
  const ajv = createValidator();
  const jsonValidate = ajv.compile(runnerStackJsonSchema);

  const testCases = [
    {
      name: "empty stack configuration",
      data: {},
      shouldBeValid: true,
    },
    {
      name: "complete stack configuration",
      data: {
        version: "1.0.0",
        stack: [
          {
            name: "runtime",
            type: "runtime",
            enabled: true,
            config: { timeout: 30 },
          },
        ],
        timeout: 60,
        retries: 3,
      },
      shouldBeValid: true,
    },
    {
      name: "stack with additional properties",
      data: {
        version: "1.0.0",
        unexpectedProperty: "should fail",
      },
      shouldBeValid: false,
    },
    {
      name: "stack component without required fields",
      data: {
        stack: [{ name: "runtime" }],
      },
      shouldBeValid: false,
    },
    {
      name: "stack component with additional properties",
      data: {
        stack: [
          {
            name: "runtime",
            type: "runtime",
            unexpectedProp: "should fail",
          },
        ],
      },
      shouldBeValid: false,
    },
    {
      name: "component config with additional properties (allowed)",
      data: {
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
      },
      shouldBeValid: true,
    },
  ];

  for (const testCase of testCases) {
    test(`should agree on validation: ${testCase.name}`, () => {
      const zodResult = RunnerStackSchema.safeParse(testCase.data);
      const jsonResult = jsonValidate(testCase.data);

      assert.strictEqual(
        zodResult.success,
        testCase.shouldBeValid,
        `Zod validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        jsonResult,
        testCase.shouldBeValid,
        `JSON Schema validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        zodResult.success,
        jsonResult,
        `Zod and JSON Schema disagree on validation for ${testCase.name}`
      );
    });
  }
});

describe("Runner Scope Schema Round-trip Tests", () => {
  const ajv = createValidator();
  const jsonValidate = ajv.compile(runnerScopeJsonSchema);

  const testCases = [
    {
      name: "empty scope configuration",
      data: {},
      shouldBeValid: true,
    },
    {
      name: "complete scope configuration",
      data: {
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
      },
      shouldBeValid: true,
    },
    {
      name: "scope with additional properties at root",
      data: {
        version: "1.0.0",
        unexpectedProperty: "should fail",
      },
      shouldBeValid: false,
    },
    {
      name: "scope object with additional properties",
      data: {
        scope: {
          modules: ["module-a"],
          unexpectedProperty: "should fail",
        },
      },
      shouldBeValid: false,
    },
    {
      name: "limits with additional properties",
      data: {
        limits: {
          maxFiles: 100,
          unexpectedProperty: "should fail",
        },
      },
      shouldBeValid: false,
    },
    {
      name: "partial scope configuration",
      data: {
        scope: {
          modules: ["module-a"],
        },
      },
      shouldBeValid: true,
    },
    {
      name: "partial limits configuration",
      data: {
        limits: {
          maxFiles: 100,
        },
      },
      shouldBeValid: true,
    },
  ];

  for (const testCase of testCases) {
    test(`should agree on validation: ${testCase.name}`, () => {
      const zodResult = RunnerScopeSchema.safeParse(testCase.data);
      const jsonResult = jsonValidate(testCase.data);

      assert.strictEqual(
        zodResult.success,
        testCase.shouldBeValid,
        `Zod validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        jsonResult,
        testCase.shouldBeValid,
        `JSON Schema validation mismatch for ${testCase.name}`
      );
      assert.strictEqual(
        zodResult.success,
        jsonResult,
        `Zod and JSON Schema disagree on validation for ${testCase.name}`
      );
    });
  }
});
