/**
 * LexYaml Loader Tests
 *
 * Tests for lex.yaml configuration file loading.
 * Covers: file in root, file in .smartergpt, no file (auto-detect), invalid YAML
 */

import { strict as assert } from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadLexYaml,
  findLexYamlPath,
  getDefaultLexYaml,
} from "@app/shared/config/lex-yaml-loader.js";

/**
 * Creates a temporary test directory with optional files.
 */
function createTestDir(files?: Record<string, string>): string {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "lex-yaml-loader-test-"));

  if (files) {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(testDir, filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content);
    }
  }

  return testDir;
}

/**
 * Cleans up a test directory.
 */
function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("loadLexYaml", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = "";
  });

  afterEach(() => {
    if (testDir) {
      cleanupTestDir(testDir);
    }
  });

  describe("file in repo root", () => {
    test("loads lex.yaml from repo root", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 1
instructions:
  canonical: custom/path/instructions.md
  projections:
    copilot: true
    cursor: false
`,
      });

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.version, 1);
      assert.strictEqual(result?.instructions?.canonical, "custom/path/instructions.md");
      assert.strictEqual(result?.instructions?.projections?.copilot, true);
      assert.strictEqual(result?.instructions?.projections?.cursor, false);
    });

    test("loads minimal lex.yaml with only version", () => {
      testDir = createTestDir({
        "lex.yaml": "version: 1\n",
      });

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.version, 1);
      assert.strictEqual(result?.instructions, undefined);
    });

    test("applies defaults for missing optional fields", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 1
instructions: {}
`,
      });

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.instructions?.canonical, ".smartergpt/instructions/lex.md");
    });
  });

  describe("file in .smartergpt directory", () => {
    test("loads lex.yaml from .smartergpt directory", () => {
      testDir = createTestDir({
        ".smartergpt/lex.yaml": `
version: 1
instructions:
  canonical: .smartergpt/custom.md
`,
      });

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.version, 1);
      assert.strictEqual(result?.instructions?.canonical, ".smartergpt/custom.md");
    });

    test("repo root takes precedence over .smartergpt", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 1
instructions:
  canonical: root-config.md
`,
        ".smartergpt/lex.yaml": `
version: 1
instructions:
  canonical: smartergpt-config.md
`,
      });

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.instructions?.canonical, "root-config.md");
    });
  });

  describe("no file (auto-detect defaults)", () => {
    test("returns default config when no lex.yaml exists", () => {
      testDir = createTestDir();

      const result = loadLexYaml(testDir);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.version, 1);
      assert.strictEqual(result?.instructions?.canonical, ".smartergpt/instructions/lex.md");
      assert.strictEqual(result?.instructions?.projections?.copilot, true);
      assert.strictEqual(result?.instructions?.projections?.cursor, true);
    });

    test("default config matches getDefaultLexYaml()", () => {
      testDir = createTestDir();

      const result = loadLexYaml(testDir);
      const defaultConfig = getDefaultLexYaml();

      assert.deepStrictEqual(result, defaultConfig);
    });
  });

  describe("invalid YAML", () => {
    test("returns null for malformed YAML syntax", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 1
instructions:
  canonical: test.md
  this is not valid yaml: [
`,
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });

    test("returns null for invalid version", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 2
`,
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });

    test("returns null for missing version", () => {
      testDir = createTestDir({
        "lex.yaml": `
instructions:
  canonical: test.md
`,
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });

    test("returns null for string version instead of number", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: "1"
`,
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });

    test("returns null for invalid projection types", () => {
      testDir = createTestDir({
        "lex.yaml": `
version: 1
instructions:
  projections:
    copilot: "yes"
    cursor: "no"
`,
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });

    test("returns null for empty file", () => {
      testDir = createTestDir({
        "lex.yaml": "",
      });

      const result = loadLexYaml(testDir);

      assert.strictEqual(result, null);
    });
  });
});

describe("findLexYamlPath", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = "";
  });

  afterEach(() => {
    if (testDir) {
      cleanupTestDir(testDir);
    }
  });

  test("returns exists: true and path when lex.yaml in root", () => {
    testDir = createTestDir({
      "lex.yaml": "version: 1\n",
    });

    const result = findLexYamlPath(testDir);

    assert.strictEqual(result.exists, true);
    if (result.exists) {
      assert.strictEqual(result.path, path.join(testDir, "lex.yaml"));
    }
  });

  test("returns exists: true and path when lex.yaml in .smartergpt", () => {
    testDir = createTestDir({
      ".smartergpt/lex.yaml": "version: 1\n",
    });

    const result = findLexYamlPath(testDir);

    assert.strictEqual(result.exists, true);
    if (result.exists) {
      assert.strictEqual(result.path, path.join(testDir, ".smartergpt/lex.yaml"));
    }
  });

  test("returns root path when both locations have config", () => {
    testDir = createTestDir({
      "lex.yaml": "version: 1\n",
      ".smartergpt/lex.yaml": "version: 1\n",
    });

    const result = findLexYamlPath(testDir);

    assert.strictEqual(result.exists, true);
    if (result.exists) {
      assert.strictEqual(result.path, path.join(testDir, "lex.yaml"));
    }
  });

  test("returns exists: false when no config file", () => {
    testDir = createTestDir();

    const result = findLexYamlPath(testDir);

    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.path, null);
  });
});

describe("getDefaultLexYaml", () => {
  test("returns default configuration", () => {
    const config = getDefaultLexYaml();

    assert.strictEqual(config.version, 1);
    assert.strictEqual(config.instructions?.canonical, ".smartergpt/instructions/lex.md");
    assert.strictEqual(config.instructions?.projections?.copilot, true);
    assert.strictEqual(config.instructions?.projections?.cursor, true);
  });

  test("returns a new object each time (not a shared reference)", () => {
    const config1 = getDefaultLexYaml();
    const config2 = getDefaultLexYaml();

    assert.notStrictEqual(config1, config2);
    assert.deepStrictEqual(config1, config2);
  });
});
