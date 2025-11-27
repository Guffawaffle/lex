/**
 * IP Boundary Guardrail Test
 *
 * Ensures Lex (public MIT library) does not import from lex-pr-runner (private).
 * The boundary is:
 * - Lex: Public library, can be used standalone
 * - lex-pr-runner: Private tool that imports FROM Lex, never the reverse
 *
 * This test fails if any Lex source file imports from lex-pr-runner.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

describe("IP Boundary Guardrail", () => {
  it("should not import from lex-pr-runner in any Lex source file", async () => {
    // Find all TypeScript source files in src/
    const srcDir = path.join(process.cwd(), "src");
    const files = await glob("**/*.ts", { cwd: srcDir });

    const violations: string[] = [];

    // Forbidden import patterns
    const forbiddenPatterns = [
      /from\s+["']lex-pr-runner/,
      /from\s+["']@smartergpt\/lex-pr-runner/,
      /import\s+.*\s+from\s+["']\.\.\/.*lex-pr-runner/,
      /require\s*\(\s*["']lex-pr-runner/,
      /require\s*\(\s*["']@smartergpt\/lex-pr-runner/,
    ];

    for (const file of files) {
      const filePath = path.join(srcDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(`${file}: imports from lex-pr-runner`);
        }
      }
    }

    if (violations.length > 0) {
      assert.fail(
        `IP boundary violation: Lex cannot import from lex-pr-runner.\n\n` +
          `Violations found:\n${violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
          `Lex is a public MIT library. lex-pr-runner may import FROM Lex, but not vice versa.\n` +
          `This ensures Lex remains standalone and does not depend on private IP.`
      );
    }
  });

  it("should not reference lex-pr-runner in package.json dependencies", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    const violations: string[] = [];

    for (const dep of Object.keys(deps)) {
      if (dep.includes("lex-pr-runner")) {
        violations.push(dep);
      }
    }

    if (violations.length > 0) {
      assert.fail(
        `IP boundary violation: Lex package.json cannot depend on lex-pr-runner.\n\n` +
          `Forbidden dependencies found:\n${violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
          `Lex is a public MIT library. Remove these dependencies.`
      );
    }
  });
});
