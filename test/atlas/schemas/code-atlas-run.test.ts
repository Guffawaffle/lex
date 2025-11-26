/**
 * CodeAtlasRun Schema Tests
 *
 * Tests for the CodeAtlasRun schema validation
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  CodeAtlasRunSchema,
  parseCodeAtlasRun,
  validateCodeAtlasRun,
  type CodeAtlasRun,
} from "@app/atlas/schemas/code-atlas-run.js";

describe("CodeAtlasRun Schema Validation", () => {
  describe("Valid CodeAtlasRun objects", () => {
    it("should validate a complete CodeAtlasRun with all fields", () => {
      const validRun: CodeAtlasRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts", "src/utils.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 42,
        limits: {
          maxFiles: 100,
          maxBytes: 1048576,
        },
        truncated: false,
        strategy: "static",
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(validRun);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error)}`);
      if (result.success) {
        assert.deepStrictEqual(result.data, validRun);
      }
    });

    it("should validate CodeAtlasRun with empty limits object", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(validRun);
      assert.ok(result.success);
    });

    it("should validate CodeAtlasRun without optional strategy field", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 10,
        limits: { maxFiles: 50 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(validRun);
      assert.ok(result.success);
    });

    it("should validate CodeAtlasRun with llm-assisted strategy", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 5,
        limits: {},
        truncated: false,
        strategy: "llm-assisted",
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(validRun);
      assert.ok(result.success);
    });

    it("should validate CodeAtlasRun with mixed strategy", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 15,
        limits: { maxBytes: 2048 },
        truncated: true,
        strategy: "mixed",
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(validRun);
      assert.ok(result.success);
    });
  });

  describe("Required field validation", () => {
    it("should reject CodeAtlasRun without runId", () => {
      const invalidRun = {
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with empty runId", () => {
      const invalidRun = {
        runId: "",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without repoId", () => {
      const invalidRun = {
        runId: "run-123",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without filesRequested", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without filesScanned", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without unitsEmitted", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without limits", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without truncated", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without createdAt", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun without schemaVersion", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });
  });

  describe("Field type validation", () => {
    it("should reject CodeAtlasRun with negative unitsEmitted", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: -1,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with non-integer unitsEmitted", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 3.14,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with invalid strategy", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        strategy: "invalid-strategy",
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with invalid createdAt format", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "not-a-date",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with wrong schemaVersion", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v1",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with non-array filesRequested", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: "not-an-array",
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject CodeAtlasRun with non-boolean truncated", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: "false",
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });
  });

  describe("Limits validation", () => {
    it("should reject limits with negative maxFiles", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: { maxFiles: -1 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject limits with zero maxFiles", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: { maxFiles: 0 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject limits with negative maxBytes", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: { maxBytes: -100 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });

    it("should reject limits with non-integer maxFiles", () => {
      const invalidRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: { maxFiles: 10.5 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = CodeAtlasRunSchema.safeParse(invalidRun);
      assert.ok(!result.success);
    });
  });

  describe("parseCodeAtlasRun helper", () => {
    it("should successfully parse valid CodeAtlasRun", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 10,
        limits: { maxFiles: 100 },
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const parsed = parseCodeAtlasRun(validRun);
      assert.deepStrictEqual(parsed, validRun);
    });

    it("should throw error for invalid CodeAtlasRun", () => {
      const invalidRun = {
        runId: "run-123",
        // missing required fields
      };

      assert.throws(() => {
        parseCodeAtlasRun(invalidRun);
      });
    });
  });

  describe("validateCodeAtlasRun helper", () => {
    it("should return success for valid CodeAtlasRun", () => {
      const validRun = {
        runId: "run-123",
        repoId: "repo-456",
        filesRequested: ["src/index.ts"],
        filesScanned: ["src/index.ts"],
        unitsEmitted: 10,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = validateCodeAtlasRun(validRun);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.deepStrictEqual(result.data, validRun);
      }
    });

    it("should return error for invalid CodeAtlasRun", () => {
      const invalidRun = {
        runId: "",
        repoId: "repo-456",
        filesRequested: [],
        filesScanned: [],
        unitsEmitted: 0,
        limits: {},
        truncated: false,
        createdAt: "2025-11-26T14:00:00.000Z",
        schemaVersion: "code-atlas-run-v0",
      };

      const result = validateCodeAtlasRun(invalidRun);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error);
      }
    });
  });
});
