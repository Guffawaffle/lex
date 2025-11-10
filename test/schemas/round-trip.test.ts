/**
 * Tests for Zod ↔ JSON Schema round-trip compatibility
 *
 * Run with: npx tsx --test test/schemas/round-trip.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProfileSchema } from "../../.smartergpt/schemas/profile.schema.js";
import { GatesSchema } from "../../.smartergpt/schemas/gates.schema.js";
import { RunnerStackSchema } from "../../.smartergpt/schemas/runner.stack.schema.js";
import { RunnerScopeSchema } from "../../.smartergpt/schemas/runner.scope.schema.js";
import { FeatureSpecV0Schema } from "../../.smartergpt/schemas/feature-spec-v0.js";
import { ExecutionPlanV1Schema } from "../../.smartergpt/schemas/execution-plan-v1.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

function loadSchema(filename: string) {
  const schemaPath = join(__dirname, "../../.smartergpt/schemas", filename);
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

describe("Zod ↔ JSON Schema Round-Trip", () => {
  describe("ProfileSchema round-trip", () => {
    const jsonSchema = loadSchema("profile.schema.json");
    const validate = ajv.compile(jsonSchema);

    test("minimal profile", () => {
      const profile = {
        role: "development" as const,
      };

      // Zod parse
      const zodResult = ProfileSchema.parse(profile);

      // JSON Schema validate
      assert.ok(validate(profile), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, profile);
    });

    test("full profile", () => {
      const profile = {
        role: "ci" as const,
        name: "CI Profile",
        version: "1.0.0",
        projectType: "nodejs" as const,
        created: "2025-11-10T05:56:33.973Z",
        owner: "test-owner",
      };

      // Zod parse
      const zodResult = ProfileSchema.parse(profile);

      // JSON Schema validate
      assert.ok(validate(profile), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, profile);
    });

    test("rejects additional properties in both", () => {
      const profile = {
        role: "development" as const,
        unknown: "value",
      };

      // Zod should reject
      const zodResult = ProfileSchema.safeParse(profile);
      assert.ok(!zodResult.success);

      // JSON Schema should reject
      assert.ok(!validate(profile));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });

  describe("GatesSchema round-trip", () => {
    const jsonSchema = loadSchema("gates.schema.json");
    const validate = ajv.compile(jsonSchema);

    test("empty gates", () => {
      const gates = {};

      // Zod parse
      const zodResult = GatesSchema.parse(gates);

      // JSON Schema validate
      assert.ok(validate(gates), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, gates);
    });

    test("gates with configuration", () => {
      const gates = {
        version: "1.0.0",
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            description: "Test gate",
            config: { key: "value" },
          },
        ],
      };

      // Zod parse
      const zodResult = GatesSchema.parse(gates);

      // JSON Schema validate
      assert.ok(validate(gates), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, gates);
    });
  });

  describe("RunnerStackSchema round-trip", () => {
    const jsonSchema = loadSchema("runner.stack.schema.json");
    const validate = ajv.compile(jsonSchema);

    test("empty stack", () => {
      const stack = {};

      // Zod parse
      const zodResult = RunnerStackSchema.parse(stack);

      // JSON Schema validate
      assert.ok(validate(stack), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, stack);
    });

    test("stack with components", () => {
      const stack = {
        version: "1.0.0",
        stack: [
          {
            name: "runtime",
            type: "nodejs",
            enabled: true,
            config: { version: "20" },
          },
        ],
        timeout: 300,
        retries: 3,
      };

      // Zod parse
      const zodResult = RunnerStackSchema.parse(stack);

      // JSON Schema validate
      assert.ok(validate(stack), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, stack);
    });
  });

  describe("RunnerScopeSchema round-trip", () => {
    const jsonSchema = loadSchema("runner.scope.schema.json");
    const validate = ajv.compile(jsonSchema);

    test("empty scope", () => {
      const scope = {};

      // Zod parse
      const zodResult = RunnerScopeSchema.parse(scope);

      // JSON Schema validate
      assert.ok(validate(scope), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, scope);
    });

    test("scope with all fields", () => {
      const scope = {
        version: "1.0.0",
        scope: {
          modules: ["module1"],
          directories: ["src"],
          files: ["file1.ts"],
          exclude: ["*.test.ts"],
        },
        permissions: ["read", "write"],
        limits: {
          maxFiles: 100,
          maxLines: 1000,
          maxDuration: 300,
        },
      };

      // Zod parse
      const zodResult = RunnerScopeSchema.parse(scope);

      // JSON Schema validate
      assert.ok(validate(scope), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, scope);
    });
  });

  describe("FeatureSpecV0Schema round-trip", () => {
    const jsonSchema = loadSchema("feature-spec-v0.json");
    const validate = ajv.compile(jsonSchema);

    test("minimal feature spec", () => {
      const spec = {
        schemaVersion: "0.1.0" as const,
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1", "AC2"],
        repo: "owner/repo",
        createdAt: "2025-11-10T05:56:33.973Z",
      };

      // Zod parse
      const zodResult = FeatureSpecV0Schema.parse(spec);

      // JSON Schema validate
      assert.ok(validate(spec), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, spec);
    });

    test("feature spec with optional fields", () => {
      const spec = {
        schemaVersion: "0.1.0" as const,
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1", "AC2"],
        technicalContext: "Technical details",
        constraints: "Some constraints",
        repo: "owner/repo",
        createdAt: "2025-11-10T05:56:33.973Z",
      };

      // Zod parse
      const zodResult = FeatureSpecV0Schema.parse(spec);

      // JSON Schema validate
      assert.ok(validate(spec), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, spec);
    });

    test("rejects additional properties in both", () => {
      const spec = {
        schemaVersion: "0.1.0" as const,
        title: "Test Feature",
        description: "Test description",
        acceptanceCriteria: ["AC1"],
        repo: "owner/repo",
        createdAt: "2025-11-10T05:56:33.973Z",
        unknown: "value",
      };

      // Zod should reject
      const zodResult = FeatureSpecV0Schema.safeParse(spec);
      assert.ok(!zodResult.success);

      // JSON Schema should reject
      assert.ok(!validate(spec));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });

  describe("ExecutionPlanV1Schema round-trip", () => {
    const jsonSchema = loadSchema("execution-plan-v1.json");
    const validate = ajv.compile(jsonSchema);

    test("valid execution plan", () => {
      const plan = {
        schemaVersion: "1.0.0" as const,
        sourceSpec: {
          schemaVersion: "0.1.0" as const,
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
            type: "feature" as const,
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
      };

      // Zod parse
      const zodResult = ExecutionPlanV1Schema.parse(plan);

      // JSON Schema validate
      assert.ok(validate(plan), JSON.stringify(validate.errors));

      // Verify equivalence
      assert.deepStrictEqual(zodResult, plan);
    });

    test("rejects additional properties in epic", () => {
      const plan = {
        schemaVersion: "1.0.0" as const,
        sourceSpec: {
          schemaVersion: "0.1.0" as const,
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
            type: "feature" as const,
            acceptanceCriteria: ["AC1"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-10T05:56:33.973Z",
      };

      // Zod should reject
      const zodResult = ExecutionPlanV1Schema.safeParse(plan);
      assert.ok(!zodResult.success);

      // JSON Schema should reject
      assert.ok(!validate(plan));
      assert.ok(
        validate.errors?.some((e) => e.keyword === "additionalProperties")
      );
    });
  });
});
