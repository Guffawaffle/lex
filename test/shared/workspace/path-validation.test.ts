/**
 * Workspace Path Validation Tests
 *
 * Ensures no hardcoded references to legacy .smartergpt.local paths
 * exist in the codebase after migration to .smartergpt/
 */

import { describe, test } from "node:test";
import { strict as assert } from "assert";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Recursively find all TypeScript source files
 */
function findSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, and hidden directories
      if (!entry.startsWith(".") && entry !== "node_modules" && entry !== "dist") {
        findSourceFiles(fullPath, files);
      }
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Workspace Path Validation", () => {
  test("no hardcoded .smartergpt.local paths in TypeScript source", () => {
    const sourceFiles = findSourceFiles(join(process.cwd(), "src"));
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) {
          return;
        }

        if (line.includes(".smartergpt.local")) {
          violations.push({
            file: file.replace(process.cwd(), ""),
            line: index + 1,
            content: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.content}`).join("\n\n");
      assert.fail(`Found ${violations.length} hardcoded .smartergpt.local path(s):\n\n${report}`);
    }

    assert.strictEqual(violations.length, 0);
  });

  test("no hardcoded .smartergpt.local paths in test files", () => {
    const testFiles = findSourceFiles(join(process.cwd(), "test")).filter(
      (f) => !f.includes("path-validation.test.ts")
    ); // Skip this validation test itself
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const file of testFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Skip comments and string literals that are testing the path itself
        if (
          line.trim().startsWith("//") ||
          line.trim().startsWith("*") ||
          line.includes("path-validation.test.ts") // Skip self-references in this test
        ) {
          return;
        }

        if (line.includes(".smartergpt.local")) {
          violations.push({
            file: file.replace(process.cwd(), ""),
            line: index + 1,
            content: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.content}`).join("\n\n");
      assert.fail(
        `Found ${violations.length} hardcoded .smartergpt.local path(s) in tests:\n\n${report}`
      );
    }

    assert.strictEqual(violations.length, 0);
  });
});
