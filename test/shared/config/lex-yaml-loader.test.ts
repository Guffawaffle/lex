/**
 * Tests for the Lex YAML Config Loader
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadLexYaml,
  loadLexYamlStrict,
  getDefaultConfig,
} from "../../../src/shared/config/lex-yaml-loader.js";
import { AXErrorException } from "../../../src/shared/errors/ax-error.js";
import { CONFIG_ERROR_CODES } from "../../../src/shared/errors/error-codes.js";

describe("Lex YAML Config Loader", () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lex-yaml-test-"));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadLexYaml", () => {
    it("loads config from repo root lex.yaml", () => {
      const repoRoot = path.join(tempDir, "root-config");
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, "lex.yaml"),
        `version: 1
instructions:
  canonical: custom/path/lex.md
  projections:
    copilot: true
    cursor: false
`
      );

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.source, "file");
      assert.ok(result.path?.endsWith("lex.yaml"));
      assert.equal(result.config?.version, 1);
      assert.equal(result.config?.instructions?.canonical, "custom/path/lex.md");
      assert.equal(result.config?.instructions?.projections?.cursor, false);
    });

    it("loads config from .smartergpt/lex.yaml when root not found", () => {
      const repoRoot = path.join(tempDir, "smartergpt-config");
      fs.mkdirSync(path.join(repoRoot, ".smartergpt"), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, ".smartergpt", "lex.yaml"),
        `version: 1
instructions:
  canonical: my-instructions.md
`
      );

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.source, "file");
      assert.ok(result.path?.includes(".smartergpt"));
      assert.equal(result.config?.instructions?.canonical, "my-instructions.md");
    });

    it("uses auto-detect defaults when no config file exists", () => {
      const repoRoot = path.join(tempDir, "no-config");
      fs.mkdirSync(repoRoot, { recursive: true });

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.source, "auto-detect");
      assert.equal(result.path, null);
      assert.equal(result.config?.version, 1);
      assert.equal(result.config?.instructions?.canonical, ".smartergpt/instructions/lex.md");
    });

    it("prioritizes root lex.yaml over .smartergpt/lex.yaml", () => {
      const repoRoot = path.join(tempDir, "both-configs");
      fs.mkdirSync(path.join(repoRoot, ".smartergpt"), { recursive: true });

      // Root config
      fs.writeFileSync(
        path.join(repoRoot, "lex.yaml"),
        `version: 1
instructions:
  canonical: from-root.md
`
      );

      // .smartergpt config (should be ignored)
      fs.writeFileSync(
        path.join(repoRoot, ".smartergpt", "lex.yaml"),
        `version: 1
instructions:
  canonical: from-smartergpt.md
`
      );

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.config?.instructions?.canonical, "from-root.md");
      assert.ok(!result.path?.includes(".smartergpt"));
    });

    it("returns error for invalid YAML syntax", () => {
      const repoRoot = path.join(tempDir, "invalid-yaml");
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.writeFileSync(path.join(repoRoot, "lex.yaml"), "invalid: yaml: syntax:");

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, false);
      assert.ok(result.error?.includes("Invalid YAML"));
    });

    it("returns error for schema validation failure", () => {
      const repoRoot = path.join(tempDir, "invalid-schema");
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, "lex.yaml"),
        `version: 999
instructions:
  canonical: 12345
`
      );

      const result = loadLexYaml(repoRoot);

      assert.equal(result.success, false);
      assert.ok(result.error?.includes("Schema validation failed"));
    });
  });

  describe("getDefaultConfig", () => {
    it("returns valid default configuration", () => {
      const config = getDefaultConfig();

      assert.equal(config.version, 1);
      assert.equal(config.instructions?.canonical, ".smartergpt/instructions/lex.md");
      assert.equal(config.instructions?.projections?.copilot, true);
      assert.equal(config.instructions?.projections?.cursor, true);
    });
  });

  describe("loadLexYamlStrict", () => {
    it("returns config when file exists", () => {
      const repoRoot = path.join(tempDir, "strict-with-config");
      fs.mkdirSync(path.join(repoRoot, ".smartergpt"), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, "lex.yaml"),
        `version: 1
instructions:
  canonical: strict-test.md
`
      );

      const result = loadLexYamlStrict(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.source, "file");
      assert.equal(result.config?.instructions?.canonical, "strict-test.md");
    });

    it("returns auto-detect defaults when workspace not initialized", () => {
      const repoRoot = path.join(tempDir, "strict-no-workspace");
      fs.mkdirSync(repoRoot, { recursive: true });
      // No .smartergpt directory

      const result = loadLexYamlStrict(repoRoot);

      assert.equal(result.success, true);
      assert.equal(result.source, "auto-detect");
      assert.equal(result.path, null);
    });

    it("throws AXErrorException when .smartergpt exists but no lex.yaml", () => {
      const repoRoot = path.join(tempDir, "strict-missing-config");
      fs.mkdirSync(path.join(repoRoot, ".smartergpt"), { recursive: true });
      // No lex.yaml files

      assert.throws(
        () => loadLexYamlStrict(repoRoot),
        (err: unknown) => {
          assert.ok(err instanceof AXErrorException, "Should throw AXErrorException");
          const axErr = (err as AXErrorException).axError;
          assert.equal(axErr.code, CONFIG_ERROR_CODES.CONFIG_NOT_FOUND);
          assert.ok(axErr.message.includes("lex.yaml not found"));
          assert.ok(axErr.nextActions.length >= 1);
          assert.ok(
            axErr.nextActions.some((a: string) => a.includes("cp lex.yaml.example")),
            "Should suggest copying template"
          );
          return true;
        }
      );
    });

    it("includes searched paths in error context", () => {
      const repoRoot = path.join(tempDir, "strict-error-context");
      fs.mkdirSync(path.join(repoRoot, ".smartergpt"), { recursive: true });

      try {
        loadLexYamlStrict(repoRoot);
        assert.fail("Should have thrown");
      } catch (err) {
        assert.ok(err instanceof AXErrorException);
        const context = err.axError.context as { searchedPaths?: string[] };
        assert.ok(Array.isArray(context?.searchedPaths));
        assert.equal(context.searchedPaths.length, 2);
      }
    });
  });
});
