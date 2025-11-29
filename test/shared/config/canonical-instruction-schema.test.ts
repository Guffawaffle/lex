import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { z } from "zod";
import {
  CanonicalInstructionFrontmatterSchema,
  validateFrontmatter,
  safeParseFrontmatter,
} from "../../../src/shared/config/canonical-instruction-schema.js";

describe("Canonical Instruction Schema", () => {
  describe("CanonicalInstructionFrontmatterSchema", () => {
    it("should validate valid frontmatter with all required fields", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "1",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`);
      assert.strictEqual(result.data?.lex_version, "2.0.0");
      assert.strictEqual(result.data?.generated_by, "lex instructions generate");
      assert.strictEqual(result.data?.schema_version, "1");
    });

    it("should validate frontmatter with optional repo_name", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "1",
        repo_name: "my-repo",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`);
      assert.strictEqual(result.data?.repo_name, "my-repo");
    });

    it("should accept various valid SemVer versions", () => {
      const validVersions = ["1.0.0", "2.0.0", "0.1.0", "10.20.30", "1.0.0-beta.1", "2.0.0-rc.1"];

      for (const version of validVersions) {
        const frontmatter = {
          lex_version: version,
          generated_by: "lex instructions generate",
          schema_version: "1",
        };

        const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
        assert.ok(result.success, `Version ${version} should be valid`);
      }
    });

    it("should reject invalid SemVer versions", () => {
      const invalidVersions = ["2", "2.0", "v2.0.0", "2.0.0.0", "invalid", ""];

      for (const version of invalidVersions) {
        const frontmatter = {
          lex_version: version,
          generated_by: "lex instructions generate",
          schema_version: "1",
        };

        const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
        assert.ok(!result.success, `Version '${version}' should be invalid`);
      }
    });

    it("should reject frontmatter without lex_version", () => {
      const frontmatter = {
        generated_by: "lex instructions generate",
        schema_version: "1",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject frontmatter without lex_version");
    });

    it("should reject frontmatter without generated_by", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        schema_version: "1",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject frontmatter without generated_by");
    });

    it("should reject frontmatter without schema_version", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject frontmatter without schema_version");
    });

    it("should reject empty generated_by", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "",
        schema_version: "1",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject empty generated_by");
    });

    it("should reject empty schema_version", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject empty schema_version");
    });

    it("should reject additional properties (strict mode)", () => {
      const frontmatter = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "1",
        unknown_field: "value",
      };

      const result = CanonicalInstructionFrontmatterSchema.safeParse(frontmatter);
      assert.ok(!result.success, "Should reject additional properties");
    });
  });

  describe("validateFrontmatter", () => {
    it("should return validated data for valid input", () => {
      const input = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "1",
      };

      const result = validateFrontmatter(input);
      assert.strictEqual(result.lex_version, "2.0.0");
      assert.strictEqual(result.generated_by, "lex instructions generate");
      assert.strictEqual(result.schema_version, "1");
    });

    it("should throw ZodError for invalid input", () => {
      const input = {
        lex_version: "invalid",
        generated_by: "lex instructions generate",
        schema_version: "1",
      };

      assert.throws(
        () => validateFrontmatter(input),
        (error: unknown) => error instanceof z.ZodError
      );
    });
  });

  describe("safeParseFrontmatter", () => {
    it("should return success result for valid input", () => {
      const input = {
        lex_version: "2.0.0",
        generated_by: "lex instructions generate",
        schema_version: "1",
      };

      const result = safeParseFrontmatter(input);
      assert.ok(result.success);
      assert.strictEqual(result.data?.lex_version, "2.0.0");
    });

    it("should return error result for invalid input", () => {
      const input = {
        lex_version: "invalid",
      };

      const result = safeParseFrontmatter(input);
      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });
});
