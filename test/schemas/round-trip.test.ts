import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import { ProfileSchema } from "../../.smartergpt/schemas/profile.schema.js";
import { GatesSchema } from "../../.smartergpt/schemas/gates.schema.js";
import { RunnerStackSchema } from "lex-pr-runner/schemas/runner-stack";
import { RunnerScopeSchema } from "lex-pr-runner/schemas/runner-scope";
import { FeatureSpecV0Schema } from "../../.smartergpt/schemas/feature-spec-v0.js";
import { ExecutionPlanV1Schema } from "../../.smartergpt/schemas/execution-plan-v1.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

describe("Zod ↔ JSON Schema Round-Trip", () => {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    validateSchema: false, // Disable meta-schema validation for draft-2020-12 compatibility
  });
  addFormats(ajv);

  describe("ProfileSchema round-trip", () => {
    const jsonSchemaPath = join(__dirname, "../../.smartergpt/schemas/profile.schema.json");
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate minimal profile through both Zod and JSON Schema", () => {
      const profile = {
        role: "development" as const,
      };

      // Zod parse
      const zodResult = ProfileSchema.parse(profile);

      // JSON Schema validate
      const jsonValid = validateJson(profile);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, profile);
    });

    it("should validate complete profile through both Zod and JSON Schema", () => {
      const profile = {
        role: "development" as const,
        name: "Test Profile",
        version: "1.0.0",
        projectType: "nodejs" as const,
        created: "2025-11-09T12:00:00.000Z",
        owner: "testuser",
      };

      // Zod parse
      const zodResult = ProfileSchema.parse(profile);

      // JSON Schema validate
      const jsonValid = validateJson(profile);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, profile);
    });

    it("should reject additional properties in both Zod and JSON Schema", () => {
      const profile = {
        role: "development",
        extra: "field",
      };

      // Zod should throw
      assert.throws(() => ProfileSchema.parse(profile), /unrecognized/i);

      // JSON Schema should reject
      const jsonValid = validateJson(profile);
      assert.ok(!jsonValid, "JSON Schema should reject additional properties");
    });

    it("should reject invalid data in both Zod and JSON Schema", () => {
      const profile = {
        role: "invalid-role",
      };

      // Zod should throw
      assert.throws(() => ProfileSchema.parse(profile));

      // JSON Schema should reject
      const jsonValid = validateJson(profile);
      assert.ok(!jsonValid, "JSON Schema should reject invalid enum value");
    });
  });

  describe("GatesSchema round-trip", () => {
    const jsonSchemaPath = join(__dirname, "../../.smartergpt/schemas/gates.schema.json");
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate gates configuration through both Zod and JSON Schema", () => {
      const gates = {
        version: "1.0.0",
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            description: "Test gate",
            config: { timeout: 30, custom: "value" },
          },
        ],
      };

      // Zod parse
      const zodResult = GatesSchema.parse(gates);

      // JSON Schema validate
      const jsonValid = validateJson(gates);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, gates);
    });

    it("should allow loose config objects in both schemas", () => {
      const gates = {
        gates: [
          {
            id: "gate-1",
            type: "validation" as const,
            enabled: true,
            config: { anyKey: "anyValue", nested: { prop: true } },
          },
        ],
      };

      // Zod parse
      const zodResult = GatesSchema.parse(gates);

      // JSON Schema validate
      const jsonValid = validateJson(gates);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, gates);
    });
  });

  describe("RunnerStackSchema round-trip", () => {
    const jsonSchemaPath = join(
      dirname(require.resolve("lex-pr-runner/package.json")),
      ".smartergpt/schemas/runner.stack.schema.json"
    );
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate stack configuration through both Zod and JSON Schema", () => {
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
      const jsonValid = validateJson(stack);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, stack);
    });
  });

  describe("RunnerScopeSchema round-trip", () => {
    const jsonSchemaPath = join(
      dirname(require.resolve("lex-pr-runner/package.json")),
      ".smartergpt/schemas/runner.scope.schema.json"
    );
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate scope configuration through both Zod and JSON Schema", () => {
      const scope = {
        version: "1.0.0",
        scope: {
          modules: ["module1", "module2"],
          directories: ["src", "lib"],
          files: ["index.ts"],
          exclude: ["*.test.ts"],
        },
        permissions: ["read", "write"],
        limits: {
          maxFiles: 100,
          maxLines: 5000,
          maxDuration: 300,
        },
      };

      // Zod parse
      const zodResult = RunnerScopeSchema.parse(scope);

      // JSON Schema validate
      const jsonValid = validateJson(scope);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, scope);
    });

    it("should reject additional properties in nested objects", () => {
      const scope = {
        limits: {
          maxFiles: 100,
          extra: "field",
        },
      };

      // Zod should throw
      assert.throws(() => RunnerScopeSchema.parse(scope), /unrecognized/i);

      // JSON Schema should reject
      const jsonValid = validateJson(scope);
      assert.ok(!jsonValid, "JSON Schema should reject additional properties");
    });
  });

  describe("FeatureSpecV0Schema round-trip", () => {
    const jsonSchemaPath = join(__dirname, "../../.smartergpt/schemas/feature-spec-v0.json");
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate feature spec through both Zod and JSON Schema", () => {
      const spec = {
        schemaVersion: "0.1.0",
        title: "Add dark mode support",
        description: "Implement theme switcher with light/dark modes",
        acceptanceCriteria: ["User can toggle between themes", "Theme persists"],
        technicalContext: "Use CSS variables for theming",
        constraints: "Must support IE11+",
        repo: "owner/repo",
        createdAt: "2025-11-09T14:30:00.000Z",
      };

      // Zod parse
      const zodResult = FeatureSpecV0Schema.parse(spec);

      // JSON Schema validate
      const jsonValid = validateJson(spec);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, spec);
    });

    it("should validate minimal feature spec through both schemas", () => {
      const spec = {
        schemaVersion: "0.1.0",
        title: "Test Feature",
        description: "A test feature",
        repo: "owner/repo",
      };

      // Zod parse
      const zodResult = FeatureSpecV0Schema.parse(spec);

      // JSON Schema validate
      const jsonValid = validateJson(spec);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, spec);
    });
  });

  describe("ExecutionPlanV1Schema round-trip", () => {
    const jsonSchemaPath = join(__dirname, "../../.smartergpt/schemas/execution-plan-v1.json");
    const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf-8"));
    const validateJson = ajv.compile(jsonSchema);

    it("should validate execution plan through both Zod and JSON Schema", () => {
      const plan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Add dark mode support",
          description: "Implement theme switcher",
          acceptanceCriteria: ["Toggle themes"],
          technicalContext: "CSS variables",
          repo: "owner/repo",
          createdAt: "2025-11-09T14:30:00.000Z",
        },
        epic: {
          title: "Dark Mode Epic",
          description: "Implement dark mode",
          acceptanceCriteria: ["Toggle themes"],
        },
        subIssues: [
          {
            id: "feature-impl",
            title: "Implement feature",
            description: "Core implementation",
            type: "feature" as const,
            acceptanceCriteria: ["CSS variables defined"],
            dependsOn: [],
          },
          {
            id: "tests",
            title: "Add tests",
            description: "Test coverage",
            type: "testing" as const,
            dependsOn: ["feature-impl"],
          },
        ],
        createdAt: "2025-11-09T14:35:00.000Z",
      };

      // Zod parse
      const zodResult = ExecutionPlanV1Schema.parse(plan);

      // JSON Schema validate
      const jsonValid = validateJson(plan);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, plan);
    });

    it("should validate minimal execution plan through both schemas", () => {
      const plan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test Feature",
          description: "A test feature",
          repo: "owner/repo",
        },
        epic: {
          title: "Epic Title",
          description: "Epic Description",
        },
        subIssues: [],
      };

      // Zod parse
      const zodResult = ExecutionPlanV1Schema.parse(plan);

      // JSON Schema validate
      const jsonValid = validateJson(plan);
      assert.ok(jsonValid, `JSON Schema validation failed: ${JSON.stringify(validateJson.errors)}`);

      // Verify equivalence
      assert.deepStrictEqual(zodResult, plan);
    });
  });
});
