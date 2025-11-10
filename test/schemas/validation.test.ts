/**
 * Tests for JSON Schema validation using AJV
 *
 * Run with: npx tsx --test test/schemas/validation.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize AJV with strict mode and formats
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

function loadSchema(filename: string) {
  const schemaPath = join(__dirname, "../../.smartergpt/schemas", filename);
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

describe("JSON Schema Validation", () => {
  describe("profile.schema.json", () => {
    const schema = loadSchema("profile.schema.json");
    const validate = ajv.compile(schema);

    test("validates valid profile with required fields only", () => {
      const validProfile = { role: "development" };
      assert.ok(validate(validProfile), JSON.stringify(validate.errors));
    });

    test("validates valid profile with all fields", () => {
      const validProfile = {
        role: "ci",
        name: "CI Profile",
        version: "1.0.0",
        projectType: "nodejs",
        created: "2025-11-10T05:56:33.973Z",
        owner: "test-owner",
      };
      assert.ok(validate(validProfile), JSON.stringify(validate.errors));
    });

    test("rejects profile without required role", () => {
      const invalidProfile = { name: "Test" };
      assert.ok(!validate(invalidProfile));
      assert.ok(validate.errors?.some((e) => e.keyword === "required"));
    });

    test("rejects profile with invalid role", () => {
      const invalidProfile = { role: "invalid-role" };
      assert.ok(!validate(invalidProfile));
      assert.ok(validate.errors?.some((e) => e.keyword === "enum"));
    });

    test("rejects profile with additional properties", () => {
      const invalidProfile = { role: "development", unknown: "value" };
      assert.ok(!validate(invalidProfile));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects profile with invalid date-time format", () => {
      const invalidProfile = { role: "development", created: "invalid-date" };
      assert.ok(!validate(invalidProfile));
      assert.ok(validate.errors?.some((e) => e.keyword === "format"));
    });
  });

  describe("gates.schema.json", () => {
    const schema = loadSchema("gates.schema.json");
    const validate = ajv.compile(schema);

    test("validates empty gates configuration", () => {
      const validGates = {};
      assert.ok(validate(validGates), JSON.stringify(validate.errors));
    });

    test("validates gates with valid gate objects", () => {
      const validGates = {
        version: "1.0.0",
        gates: [
          {
            id: "gate-1",
            type: "validation",
            enabled: true,
            description: "Test gate",
            config: { key: "value", nested: { prop: 123 } },
          },
        ],
      };
      assert.ok(validate(validGates), JSON.stringify(validate.errors));
    });

    test("rejects gates with additional properties at root", () => {
      const invalidGates = { version: "1.0.0", unknown: "value" };
      assert.ok(!validate(invalidGates));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects gate without required fields", () => {
      const invalidGates = { gates: [{ id: "gate-1" }] };
      assert.ok(!validate(invalidGates));
      assert.ok(validate.errors?.some((e) => e.keyword === "required"));
    });

    test("rejects gate with invalid type", () => {
      const invalidGates = {
        gates: [{ id: "gate-1", type: "invalid", enabled: true }],
      };
      assert.ok(!validate(invalidGates));
      assert.ok(validate.errors?.some((e) => e.keyword === "enum"));
    });

    test("rejects gate with additional properties in gate object", () => {
      const invalidGates = {
        gates: [
          { id: "gate-1", type: "validation", enabled: true, unknown: "value" },
        ],
      };
      assert.ok(!validate(invalidGates));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });

  describe("runner.stack.schema.json", () => {
    const schema = loadSchema("runner.stack.schema.json");
    const validate = ajv.compile(schema);

    test("validates empty stack configuration", () => {
      const validStack = {};
      assert.ok(validate(validStack), JSON.stringify(validate.errors));
    });

    test("validates stack with components", () => {
      const validStack = {
        version: "1.0.0",
        stack: [
          {
            name: "runtime",
            type: "nodejs",
            enabled: true,
            config: { version: "20", env: "production" },
          },
        ],
        timeout: 300,
        retries: 3,
      };
      assert.ok(validate(validStack), JSON.stringify(validate.errors));
    });

    test("rejects stack with additional properties at root", () => {
      const invalidStack = { version: "1.0.0", unknown: "value" };
      assert.ok(!validate(invalidStack));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects component without required fields", () => {
      const invalidStack = { stack: [{ name: "runtime" }] };
      assert.ok(!validate(invalidStack));
      assert.ok(validate.errors?.some((e) => e.keyword === "required"));
    });

    test("rejects component with additional properties", () => {
      const invalidStack = {
        stack: [{ name: "runtime", type: "nodejs", unknown: "value" }],
      };
      assert.ok(!validate(invalidStack));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });

  describe("runner.scope.schema.json", () => {
    const schema = loadSchema("runner.scope.schema.json");
    const validate = ajv.compile(schema);

    test("validates empty scope configuration", () => {
      const validScope = {};
      assert.ok(validate(validScope), JSON.stringify(validate.errors));
    });

    test("validates scope with all fields", () => {
      const validScope = {
        version: "1.0.0",
        scope: {
          modules: ["module1", "module2"],
          directories: ["src", "test"],
          files: ["file1.ts", "file2.ts"],
          exclude: ["*.test.ts"],
        },
        permissions: ["read", "write"],
        limits: {
          maxFiles: 100,
          maxLines: 1000,
          maxDuration: 300,
        },
      };
      assert.ok(validate(validScope), JSON.stringify(validate.errors));
    });

    test("rejects scope with additional properties at root", () => {
      const invalidScope = { version: "1.0.0", unknown: "value" };
      assert.ok(!validate(invalidScope));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects scope with additional properties in scope object", () => {
      const invalidScope = {
        scope: { modules: ["module1"], unknown: "value" },
      };
      assert.ok(!validate(invalidScope));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects scope with additional properties in limits", () => {
      const invalidScope = {
        limits: { maxFiles: 100, unknown: "value" },
      };
      assert.ok(!validate(invalidScope));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });

  describe("feature-spec-v0.json", () => {
    const schema = loadSchema("feature-spec-v0.json");
    const validate = ajv.compile(schema);

    test("validates valid feature spec", () => {
      const validSpec = {
        schemaVersion: "0.1.0",
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1", "AC2"],
        repo: "owner/repo",
        createdAt: "2025-11-10T05:56:33.973Z",
      };
      assert.ok(validate(validSpec), JSON.stringify(validate.errors));
    });

    test("rejects feature spec with additional properties", () => {
      const invalidSpec = {
        schemaVersion: "0.1.0",
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1"],
        repo: "owner/repo",
        createdAt: "2025-11-10T05:56:33.973Z",
        unknown: "value",
      };
      assert.ok(!validate(invalidSpec));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects invalid date-time format", () => {
      const invalidSpec = {
        schemaVersion: "0.1.0",
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1"],
        repo: "owner/repo",
        createdAt: "invalid-date",
      };
      assert.ok(!validate(invalidSpec));
      assert.ok(validate.errors?.some((e) => e.keyword === "format"));
    });
  });

  describe("execution-plan-v1.json", () => {
    const schema = loadSchema("execution-plan-v1.json");
    const validate = ajv.compile(schema);

    test("validates valid execution plan", () => {
      const validPlan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test Feature",
          description: "Test description",
          acceptanceCriteria: ["AC1"],
          repo: "owner/repo",
          createdAt: "2025-11-10T05:56:33.973Z",
        },
        epic: {
          title: "Epic Title",
          description: "Epic Description",
          acceptanceCriteria: ["AC1"],
        },
        subIssues: [
          {
            id: "sub-1",
            title: "Sub Issue 1",
            description: "Description",
            type: "feature",
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
      };
      assert.ok(validate(validPlan), JSON.stringify(validate.errors));
    });

    test("rejects execution plan with additional properties at root", () => {
      const invalidPlan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test Feature",
          description: "Test description",
          acceptanceCriteria: ["AC1"],
          repo: "owner/repo",
          createdAt: "2025-11-10T05:56:33.973Z",
        },
        epic: {
          title: "Epic Title",
          description: "Epic Description",
          acceptanceCriteria: ["AC1"],
        },
        subIssues: [
          {
            id: "sub-1",
            title: "Sub Issue 1",
            description: "Description",
            type: "feature",
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
        unknown: "value",
      };
      assert.ok(!validate(invalidPlan));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects execution plan with additional properties in epic", () => {
      const invalidPlan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test Feature",
          description: "Test description",
          acceptanceCriteria: ["AC1"],
          repo: "owner/repo",
          createdAt: "2025-11-10T05:56:33.973Z",
        },
        epic: {
          title: "Epic Title",
          description: "Epic Description",
          acceptanceCriteria: ["AC1"],
          unknown: "value",
        },
        subIssues: [
          {
            id: "sub-1",
            title: "Sub Issue 1",
            description: "Description",
            type: "feature",
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
      };
      assert.ok(!validate(invalidPlan));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });

    test("rejects execution plan with additional properties in subIssue", () => {
      const invalidPlan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test Feature",
          description: "Test description",
          acceptanceCriteria: ["AC1"],
          repo: "owner/repo",
          createdAt: "2025-11-10T05:56:33.973Z",
        },
        epic: {
          title: "Epic Title",
          description: "Epic Description",
          acceptanceCriteria: ["AC1"],
        },
        subIssues: [
          {
            id: "sub-1",
            title: "Sub Issue 1",
            description: "Description",
            type: "feature",
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
            unknown: "value",
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
      };
      assert.ok(!validate(invalidPlan));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });
});
