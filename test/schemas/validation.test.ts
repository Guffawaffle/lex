import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("JSON Schema Validation", () => {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    validateSchema: false, // Disable meta-schema validation for draft-2020-12 compatibility
  });
  addFormats(ajv);

  describe("profile.schema.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/profile.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate a valid profile with required fields only", () => {
      const profile = { role: "development" };
      const valid = validate(profile);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete profile", () => {
      const profile = {
        role: "development",
        name: "Test Profile",
        version: "1.0.0",
        projectType: "nodejs",
        created: "2025-11-09T12:00:00.000Z",
        owner: "testuser",
      };
      const valid = validate(profile);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject profile without required role field", () => {
      const profile = { name: "Test Profile" };
      const valid = validate(profile);
      assert.ok(!valid, "Should reject profile without role");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.message?.includes("required")),
        "Should have required field error"
      );
    });

    it("should reject profile with invalid role", () => {
      const profile = { role: "invalid" };
      const valid = validate(profile);
      assert.ok(!valid, "Should reject profile with invalid role");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "enum"),
        "Should have enum validation error"
      );
    });

    it("should reject profile with additional properties", () => {
      const profile = { role: "development", unknown: "value" };
      const valid = validate(profile);
      assert.ok(!valid, "Should reject profile with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject profile with invalid date-time format", () => {
      const profile = { role: "development", created: "invalid-date" };
      const valid = validate(profile);
      assert.ok(!valid, "Should reject profile with invalid date-time");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "format"),
        "Should have format validation error"
      );
    });

    it("should reject profile with invalid projectType", () => {
      const profile = { role: "development", projectType: "rust" };
      const valid = validate(profile);
      assert.ok(!valid, "Should reject profile with invalid projectType");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "enum"),
        "Should have enum validation error"
      );
    });
  });

  describe("gates.schema.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/gates.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate an empty gates configuration", () => {
      const gates = {};
      const valid = validate(gates);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete gates configuration", () => {
      const gates = {
        version: "1.0.0",
        gates: [
          {
            id: "gate-1",
            type: "validation",
            enabled: true,
            description: "Test gate",
            config: { timeout: 30 },
          },
        ],
      };
      const valid = validate(gates);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject gates with additional properties at top level", () => {
      const gates = { version: "1.0.0", unknown: "value" };
      const valid = validate(gates);
      assert.ok(!valid, "Should reject gates with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject gate item without required fields", () => {
      const gates = {
        gates: [{ id: "gate-1" }],
      };
      const valid = validate(gates);
      assert.ok(!valid, "Should reject gate without required fields");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.message?.includes("required")),
        "Should have required field error"
      );
    });

    it("should reject gate item with invalid type", () => {
      const gates = {
        gates: [{ id: "gate-1", type: "invalid", enabled: true }],
      };
      const valid = validate(gates);
      assert.ok(!valid, "Should reject gate with invalid type");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "enum"),
        "Should have enum validation error"
      );
    });

    it("should reject gate item with additional properties", () => {
      const gates = {
        gates: [{ id: "gate-1", type: "validation", enabled: true, extra: "field" }],
      };
      const valid = validate(gates);
      assert.ok(!valid, "Should reject gate with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should allow config object with any properties (intentionally loose)", () => {
      const gates = {
        gates: [
          {
            id: "gate-1",
            type: "validation",
            enabled: true,
            config: { custom1: "value", custom2: 123, nested: { prop: true } },
          },
        ],
      };
      const valid = validate(gates);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });
  });

  describe("runner.stack.schema.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/runner.stack.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate an empty stack configuration", () => {
      const stack = {};
      const valid = validate(stack);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete stack configuration", () => {
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
      const valid = validate(stack);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject stack with additional properties at top level", () => {
      const stack = { version: "1.0.0", unknown: "value" };
      const valid = validate(stack);
      assert.ok(!valid, "Should reject stack with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject stack item without required fields", () => {
      const stack = {
        stack: [{ name: "runtime" }],
      };
      const valid = validate(stack);
      assert.ok(!valid, "Should reject stack item without required fields");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.message?.includes("required")),
        "Should have required field error"
      );
    });

    it("should reject stack item with additional properties", () => {
      const stack = {
        stack: [{ name: "runtime", type: "nodejs", extra: "field" }],
      };
      const valid = validate(stack);
      assert.ok(!valid, "Should reject stack item with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should allow config object with any properties (intentionally loose)", () => {
      const stack = {
        stack: [
          {
            name: "runtime",
            type: "nodejs",
            config: { version: "20", custom: true, nested: { prop: "value" } },
          },
        ],
      };
      const valid = validate(stack);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });
  });

  describe("runner.scope.schema.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/runner.scope.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate an empty scope configuration", () => {
      const scope = {};
      const valid = validate(scope);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete scope configuration", () => {
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
      const valid = validate(scope);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject scope with additional properties at top level", () => {
      const scope = { version: "1.0.0", unknown: "value" };
      const valid = validate(scope);
      assert.ok(!valid, "Should reject scope with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject scope object with additional properties", () => {
      const scope = {
        scope: {
          modules: ["module1"],
          extra: "field",
        },
      };
      const valid = validate(scope);
      assert.ok(!valid, "Should reject scope object with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject limits object with additional properties", () => {
      const scope = {
        limits: {
          maxFiles: 100,
          extra: "field",
        },
      };
      const valid = validate(scope);
      assert.ok(!valid, "Should reject limits object with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });
  });

  describe("feature-spec-v0.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/feature-spec-v0.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate a minimal feature spec", () => {
      const spec = {
        schemaVersion: "0.1.0",
        title: "Test Feature",
        description: "A test feature",
        repo: "owner/repo",
      };
      const valid = validate(spec);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete feature spec", () => {
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
      const valid = validate(spec);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject spec without required fields", () => {
      const spec = { schemaVersion: "0.1.0", title: "Test" };
      const valid = validate(spec);
      assert.ok(!valid, "Should reject spec without required fields");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.message?.includes("required")),
        "Should have required field error"
      );
    });

    it("should reject spec with additional properties", () => {
      const spec = {
        schemaVersion: "0.1.0",
        title: "Test",
        description: "Test",
        repo: "owner/repo",
        extra: "field",
      };
      const valid = validate(spec);
      assert.ok(!valid, "Should reject spec with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject spec with invalid schemaVersion format", () => {
      const spec = {
        schemaVersion: "invalid",
        title: "Test",
        description: "Test",
        repo: "owner/repo",
      };
      const valid = validate(spec);
      assert.ok(!valid, "Should reject spec with invalid schemaVersion format");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "pattern"),
        "Should have pattern validation error"
      );
    });

    it("should reject spec with invalid date-time format", () => {
      const spec = {
        schemaVersion: "0.1.0",
        title: "Test",
        description: "Test",
        repo: "owner/repo",
        createdAt: "invalid-date",
      };
      const valid = validate(spec);
      assert.ok(!valid, "Should reject spec with invalid date-time");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "format"),
        "Should have format validation error"
      );
    });
  });

  describe("execution-plan-v1.json", () => {
    const schemaPath = join(__dirname, "../../.smartergpt/schemas/execution-plan-v1.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const validate = ajv.compile(schema);

    it("should validate a minimal execution plan", () => {
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
      const valid = validate(plan);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should validate a complete execution plan", () => {
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
            type: "feature",
            acceptanceCriteria: ["CSS variables defined"],
            dependsOn: [],
          },
        ],
        createdAt: "2025-11-09T14:35:00.000Z",
      };
      const valid = validate(plan);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors)}`);
    });

    it("should reject plan without required fields", () => {
      const plan = {
        schemaVersion: "1.0.0",
        epic: { title: "Epic", description: "Desc" },
      };
      const valid = validate(plan);
      assert.ok(!valid, "Should reject plan without required fields");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.message?.includes("required")),
        "Should have required field error"
      );
    });

    it("should reject plan with additional properties", () => {
      const plan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test",
          description: "Test",
          repo: "owner/repo",
        },
        epic: { title: "Epic", description: "Desc" },
        subIssues: [],
        extra: "field",
      };
      const valid = validate(plan);
      assert.ok(!valid, "Should reject plan with additional properties");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "additionalProperties"),
        "Should have additionalProperties error"
      );
    });

    it("should reject sub-issue with invalid type", () => {
      const plan = {
        schemaVersion: "1.0.0",
        sourceSpec: {
          schemaVersion: "0.1.0",
          title: "Test",
          description: "Test",
          repo: "owner/repo",
        },
        epic: { title: "Epic", description: "Desc" },
        subIssues: [
          {
            id: "test",
            title: "Test",
            description: "Test",
            type: "invalid",
            dependsOn: [],
          },
        ],
      };
      const valid = validate(plan);
      assert.ok(!valid, "Should reject sub-issue with invalid type");
      assert.ok(validate.errors);
      assert.ok(
        validate.errors.some((e) => e.keyword === "enum"),
        "Should have enum validation error"
      );
    });
  });
});
