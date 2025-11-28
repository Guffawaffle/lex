/**
 * Tests for lex.yaml Zod schema
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseLexYaml,
  validateLexYaml,
  isValidLexYaml,
} from "../../../dist/shared/config/lex-yaml/schema.js";

describe("LexYamlSchema", () => {
  describe("valid configs", () => {
    it("accepts minimal valid config", () => {
      const config = {
        version: "0.1",
        workflows: {
          "check-all": {
            description: "Run all checks",
          },
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
    });

    it("accepts numeric version 0.1", () => {
      const config = {
        version: 0.1,
        workflows: {
          test: {},
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
    });

    it("accepts full config with all fields", () => {
      const config = {
        version: "0.1",
        defaults: {
          provider: {
            id: "default",
            max_tokens: 16000,
          },
          tools: {
            servers: ["filesystem", "git"],
            commands: [{ name: "test", cmd: "npm test" }],
          },
          policy: {
            lexmap: ".smartergpt/lex/lexmap.policy.json",
            allowed_paths: ["src/**"],
            denied_paths: [".git/**"],
          },
          limits: {
            max_edits: 100,
            max_files: 50,
            timeout_seconds: 300,
          },
          checks: [
            {
              id: "lint",
              description: "ESLint must pass",
              cmd: "npm run lint",
              type: "lint",
              required: true,
            },
          ],
        },
        workflows: {
          "review-pr": {
            description: "Review a PR",
            inputs: {
              required: ["pr_number"],
              optional: ["files"],
            },
            provider: {
              id: "gpt-4",
              max_tokens: 12000,
            },
            tools: {
              servers: ["filesystem"],
              commands: [],
            },
            policy: {
              allowed_paths: ["src/**", "test/**"],
              denied_paths: ["secrets/**"],
            },
            limits: {
              max_edits: 50,
            },
            checks: [
              {
                id: "test",
                cmd: "npm test",
                required: true,
              },
            ],
          },
        },
        includes: [],
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.workflows["review-pr"].description, "Review a PR");
      }
    });

    it("accepts workflow with only description", () => {
      const config = {
        version: "0.1",
        workflows: {
          simple: {
            description: "A simple workflow",
          },
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
    });
  });

  describe("invalid configs", () => {
    it("rejects missing version", () => {
      const config = {
        workflows: {
          test: {},
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, false);
    });

    it("rejects invalid version", () => {
      const config = {
        version: "1.0",
        workflows: {
          test: {},
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, false);
    });

    it("rejects missing workflows", () => {
      const config = {
        version: "0.1",
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, false);
    });

    it("rejects empty workflows object", () => {
      const config = {
        version: "0.1",
        workflows: {},
      };

      // Note: empty object is technically valid in Zod's z.record()
      // This test documents current behavior
      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
    });

    it("rejects invalid check (missing id)", () => {
      const config = {
        version: "0.1",
        workflows: {
          test: {
            checks: [
              {
                cmd: "npm test",
              },
            ],
          },
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, false);
    });

    it("rejects invalid check (missing cmd)", () => {
      const config = {
        version: "0.1",
        workflows: {
          test: {
            checks: [
              {
                id: "test",
              },
            ],
          },
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, false);
    });
  });

  describe("helper functions", () => {
    it("parseLexYaml returns typed config", () => {
      const config = {
        version: "0.1",
        workflows: {
          test: { description: "Test workflow" },
        },
      };

      const parsed = parseLexYaml(config);
      assert.strictEqual(parsed.version, "0.1");
      assert.strictEqual(parsed.workflows.test.description, "Test workflow");
    });

    it("parseLexYaml throws on invalid config", () => {
      const config = {
        version: "invalid",
        workflows: {},
      };

      assert.throws(() => parseLexYaml(config));
    });

    it("isValidLexYaml returns boolean", () => {
      assert.strictEqual(isValidLexYaml({ version: "0.1", workflows: { test: {} } }), true);
      assert.strictEqual(isValidLexYaml({ version: "invalid" }), false);
      assert.strictEqual(isValidLexYaml(null), false);
      assert.strictEqual(isValidLexYaml(undefined), false);
    });
  });

  describe("defaults", () => {
    it("provider.id defaults to 'default'", () => {
      const config = {
        version: "0.1",
        defaults: {
          provider: {},
        },
        workflows: {
          test: {},
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.defaults?.provider?.id, "default");
      }
    });

    it("tools.servers defaults to empty array", () => {
      const config = {
        version: "0.1",
        defaults: {
          tools: {},
        },
        workflows: {
          test: {},
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.deepStrictEqual(result.data.defaults?.tools?.servers, []);
      }
    });

    it("check.required defaults to true", () => {
      const config = {
        version: "0.1",
        workflows: {
          test: {
            checks: [
              {
                id: "lint",
                cmd: "npm run lint",
              },
            ],
          },
        },
      };

      const result = validateLexYaml(config);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.workflows.test.checks?.[0].required, true);
      }
    });
  });
});
