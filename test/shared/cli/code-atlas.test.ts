/**
 * Code Atlas CLI Command Tests
 *
 * Tests for the 'lex code-atlas' command
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { codeAtlas } from "../../../src/shared/cli/code-atlas.js";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-code-atlas-test-" + Date.now());

function setupTest() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("lex code-atlas command", () => {
  test("extracts classes from TypeScript files", async () => {
    setupTest();
    try {
      // Create a TypeScript file with a class
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "user.ts"),
        `/**
 * User class
 */
export class User {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Get the user name
   */
  getName(): string {
    return this.name;
  }
}
`
      );

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");
      assert.ok(result.output.units.length > 0, "Should extract units");

      // Check for class
      const classUnit = result.output.units.find((u) => u.kind === "class" && u.name === "User");
      assert.ok(classUnit, "Should find User class");
      assert.strictEqual(classUnit.language, "ts", "Should be TypeScript");
      assert.strictEqual(classUnit.schemaVersion, "code-unit-v0", "Should have correct schema version");

      // Check for method
      const methodUnit = result.output.units.find(
        (u) => u.kind === "method" && u.name === "getName"
      );
      assert.ok(methodUnit, "Should find getName method");
    } finally {
      cleanup();
    }
  });

  test("extracts functions from TypeScript files", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "utils.ts"),
        `/**
 * Add two numbers
 */
export function add(a: number, b: number): number {
  return a + b;
}

export const multiply = (a: number, b: number): number => {
  return a * b;
};
`
      );

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");

      // Check for function declaration
      const addFunc = result.output.units.find((u) => u.kind === "function" && u.name === "add");
      assert.ok(addFunc, "Should find add function");

      // Check for arrow function
      const multiplyFunc = result.output.units.find(
        (u) => u.kind === "function" && u.name === "multiply"
      );
      assert.ok(multiplyFunc, "Should find multiply arrow function");
    } finally {
      cleanup();
    }
  });

  test("extracts from JavaScript files", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "helper.js"),
        `/**
 * Helper class
 */
export class Helper {
  help() {
    console.log("helping");
  }
}

export function doSomething() {
  return true;
}
`
      );

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.js",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");

      const classUnit = result.output.units.find((u) => u.kind === "class" && u.name === "Helper");
      assert.ok(classUnit, "Should find Helper class");
      assert.strictEqual(classUnit.language, "js", "Should be JavaScript");
    } finally {
      cleanup();
    }
  });

  test("extracts from Python files", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "model.py"),
        `"""Model module"""

class User:
    """User class"""
    
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        """Get the user name"""
        return self.name


def create_user(name: str) -> User:
    """Create a new user"""
    return User(name)
`
      );

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.py",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");

      const classUnit = result.output.units.find((u) => u.kind === "class" && u.name === "User");
      assert.ok(classUnit, "Should find User class");
      assert.strictEqual(classUnit.language, "py", "Should be Python");

      const funcUnit = result.output.units.find(
        (u) => u.kind === "function" && u.name === "create_user"
      );
      assert.ok(funcUnit, "Should find create_user function");
    } finally {
      cleanup();
    }
  });

  test("respects max-files limit", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // Create multiple files
      for (let i = 0; i < 10; i++) {
        writeFileSync(join(srcDir, `file${i}.ts`), `export const x${i} = ${i};`);
      }

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        maxFiles: 3,
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");
      assert.strictEqual(result.output.run.truncated, true, "Should be truncated");
      assert.strictEqual(result.output.run.filesScanned.length, 3, "Should only scan 3 files");
    } finally {
      cleanup();
    }
  });

  test("writes output to file", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "index.ts"), `export const VERSION = "1.0.0";`);

      const outPath = join(testDir, "output", "atlas.json");

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        out: outPath,
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.strictEqual(result.outputPath, outPath, "Should return output path");
      assert.ok(existsSync(outPath), "Output file should exist");

      const content = JSON.parse(readFileSync(outPath, "utf-8"));
      assert.ok(content.run, "Should have run metadata");
      assert.ok(Array.isArray(content.units), "Should have units array");
    } finally {
      cleanup();
    }
  });

  test("handles non-existent repository directory", async () => {
    const result = await codeAtlas({
      repo: "/nonexistent/path/to/repo",
      json: true,
    });

    assert.strictEqual(result.success, false, "Should fail");
    assert.ok(result.error, "Should have error message");
    assert.match(result.error, /not found/, "Error should mention not found");
  });

  test("excludes node_modules by default", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      const nodeModulesDir = join(testDir, "node_modules", "some-package");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(nodeModulesDir, { recursive: true });

      writeFileSync(join(srcDir, "index.ts"), `export const main = true;`);
      writeFileSync(join(nodeModulesDir, "index.ts"), `export const pkg = true;`);

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");

      // Should only find the src file, not node_modules
      const nodeModuleFile = result.output.run.filesScanned.find((f) =>
        f.includes("node_modules")
      );
      assert.strictEqual(nodeModuleFile, undefined, "Should not include node_modules files");
    } finally {
      cleanup();
    }
  });

  test("respects .gitignore patterns", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      const buildDir = join(testDir, "build");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(buildDir, { recursive: true });

      writeFileSync(join(testDir, ".gitignore"), "build/\n");
      writeFileSync(join(srcDir, "index.ts"), `export const main = true;`);
      writeFileSync(join(buildDir, "output.ts"), `export const built = true;`);

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");

      // Should only find src files, not build
      const buildFile = result.output.run.filesScanned.find((f) => f.includes("build"));
      assert.strictEqual(buildFile, undefined, "Should not include gitignored files");
    } finally {
      cleanup();
    }
  });

  test("generates stable CodeUnit IDs", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "test.ts"),
        `export class TestClass {
  testMethod() {}
}`
      );

      // Run twice and compare IDs
      const result1 = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      const result2 = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result1.success, true, "First run should succeed");
      assert.strictEqual(result2.success, true, "Second run should succeed");

      const class1 = result1.output?.units.find((u) => u.name === "TestClass");
      const class2 = result2.output?.units.find((u) => u.name === "TestClass");

      assert.ok(class1, "Should find class in first run");
      assert.ok(class2, "Should find class in second run");
      assert.strictEqual(class1.id, class2.id, "IDs should be stable across runs");
    } finally {
      cleanup();
    }
  });

  test("run metadata includes correct schema version", async () => {
    setupTest();
    try {
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "index.ts"), `export const x = 1;`);

      const result = await codeAtlas({
        repo: testDir,
        include: "**/*.ts",
        json: true,
      });

      assert.strictEqual(result.success, true, "Should succeed");
      assert.ok(result.output, "Should have output");
      assert.strictEqual(
        result.output.run.schemaVersion,
        "code-atlas-run-v0",
        "Run should have correct schema version"
      );
    } finally {
      cleanup();
    }
  });
});
