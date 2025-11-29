/**
 * LexYaml Schema Tests
 *
 * Tests for lex.yaml configuration schema validation.
 * Covers: valid config, missing fields (defaults), invalid version, extra fields
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
import {
  LexYamlSchema,
  parseLexYaml,
  validateLexYaml,
} from "@app/shared/config/lex-yaml-schema.js";
import type { LexYaml } from "@app/shared/config/lex-yaml-schema.js";

describe("LexYamlSchema", () => {
  describe("valid configurations", () => {
    test("accepts minimal valid config with version only", () => {
      const input = { version: 1 };
      const result = parseLexYaml(input);

      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.instructions, undefined);
    });

    test("accepts full valid config with all fields", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
          projections: {
            copilot: true,
            cursor: true,
          },
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.instructions?.canonical, ".smartergpt/instructions/lex.md");
      assert.strictEqual(result.instructions?.projections?.copilot, true);
      assert.strictEqual(result.instructions?.projections?.cursor, true);
    });

    test("accepts config with instructions but no projections", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: "custom/path/instructions.md",
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.instructions?.canonical, "custom/path/instructions.md");
      assert.strictEqual(result.instructions?.projections, undefined);
    });

    test("accepts config with false projection values", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
          projections: {
            copilot: false,
            cursor: false,
          },
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.projections?.copilot, false);
      assert.strictEqual(result.instructions?.projections?.cursor, false);
    });
  });

  describe("default values", () => {
    test("applies default canonical path when instructions object provided without canonical", () => {
      const input = {
        version: 1,
        instructions: {},
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.canonical, ".smartergpt/instructions/lex.md");
    });

    test("applies default projection values when projections object provided without values", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: "custom/path.md",
          projections: {},
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.projections?.copilot, true);
      assert.strictEqual(result.instructions?.projections?.cursor, true);
    });

    test("applies partial projection defaults", () => {
      const input = {
        version: 1,
        instructions: {
          projections: {
            copilot: false,
          },
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.projections?.copilot, false);
      assert.strictEqual(result.instructions?.projections?.cursor, true);
    });
  });

  describe("invalid configurations", () => {
    test("rejects config without version", () => {
      const input = {
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
        },
      };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with invalid version value", () => {
      const input = { version: 2 };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with string version", () => {
      const input = { version: "1" };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with version 0", () => {
      const input = { version: 0 };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with null version", () => {
      const input = { version: null };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with non-string canonical", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: 123,
        },
      };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test("rejects config with non-boolean projection values", () => {
      const input = {
        version: 1,
        instructions: {
          projections: {
            copilot: "yes",
            cursor: "no",
          },
        },
      };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe("extra fields", () => {
    test("strips unknown top-level fields", () => {
      const input = {
        version: 1,
        unknownField: "should be stripped",
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.version, 1);
      assert.strictEqual((result as Record<string, unknown>).unknownField, undefined);
    });

    test("strips unknown fields in instructions", () => {
      const input = {
        version: 1,
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
          extra: "field",
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.canonical, ".smartergpt/instructions/lex.md");
      assert.strictEqual(
        (result.instructions as Record<string, unknown> | undefined)?.extra,
        undefined
      );
    });

    test("strips unknown fields in projections", () => {
      const input = {
        version: 1,
        instructions: {
          projections: {
            copilot: true,
            cursor: true,
            vscode: true, // Unknown projection
          },
        },
      };
      const result = parseLexYaml(input);

      assert.strictEqual(result.instructions?.projections?.copilot, true);
      assert.strictEqual(result.instructions?.projections?.cursor, true);
      assert.strictEqual(
        (result.instructions?.projections as Record<string, unknown> | undefined)?.vscode,
        undefined
      );
    });
  });

  describe("parseLexYaml error handling", () => {
    test("throws ZodError for invalid input", () => {
      const input = { version: "invalid" };

      assert.throws(() => {
        parseLexYaml(input);
      });
    });

    test("throws for null input", () => {
      assert.throws(() => {
        parseLexYaml(null);
      });
    });

    test("throws for undefined input", () => {
      assert.throws(() => {
        parseLexYaml(undefined);
      });
    });
  });

  describe("validateLexYaml", () => {
    test("returns success true for valid input", () => {
      const input = { version: 1 };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.version, 1);
      }
    });

    test("returns success false for invalid input", () => {
      const input = { version: "invalid" };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error);
        assert.ok(result.error.issues.length > 0);
      }
    });

    test("error contains path to invalid field", () => {
      const input = {
        version: 1,
        instructions: {
          projections: {
            copilot: "not-a-boolean",
          },
        },
      };
      const result = validateLexYaml(input);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        assert.ok(
          paths.some((p) => p.includes("projections")),
          "Error should reference projections path"
        );
      }
    });
  });

  describe("type inference", () => {
    test("LexYaml type is correctly inferred", () => {
      // This is a compile-time check - if this compiles, the type is correct
      const config: LexYaml = {
        version: 1,
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
          projections: {
            copilot: true,
            cursor: false,
          },
        },
      };

      assert.strictEqual(config.version, 1);
    });

    test("inferred type matches schema output", () => {
      const input = { version: 1 as const };
      const result = LexYamlSchema.parse(input);

      // TypeScript should infer result as LexYaml
      const typed: LexYaml = result;
      assert.strictEqual(typed.version, 1);
    });
  });
});
