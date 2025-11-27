/**
 * SQL Safety Test
 *
 * Ensures that db.prepare() calls only appear in curated SQL modules.
 * This is a guardrail to prevent dynamic SQL from models/prompts.
 *
 * Curated SQL modules (allowed to use db.prepare):
 * - src/memory/store/queries.ts (Frame CRUD)
 * - src/memory/store/code-unit-queries.ts (CodeUnit CRUD)
 * - src/memory/store/db.ts (schema initialization)
 * - src/memory/store/backup.ts (backup utilities)
 * - src/memory/store/code-atlas-runs.ts (CodeAtlas run tracking)
 * - src/memory/store/sqlite/ (SqliteFrameStore implementation)
 * - src/memory/mcp_server/auth/state-storage.ts (OAuth state)
 * - src/memory/mcp_server/routes/*.ts (MCP route handlers)
 * - src/shared/cli/db.ts (CLI database utilities)
 *
 * @see .github/copilot-instructions.md for SQL safety rules
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "child_process";
import { join } from "path";

// Allowed paths for db.prepare() usage (relative to src/)
const ALLOWED_PATTERNS = [
  "memory/store/queries.ts",
  "memory/store/code-unit-queries.ts",
  "memory/store/db.ts",
  "memory/store/backup.ts",
  "memory/store/code-atlas-runs.ts",
  "memory/store/images.ts",
  "memory/store/lexsona-queries.ts",
  "memory/store/sqlite/", // SqliteFrameStore and future sqlite implementations
  "memory/mcp_server/auth/state-storage.ts",
  "memory/mcp_server/routes/",
  "shared/cli/db.ts",
];

describe("SQL Safety", () => {
  it("should only use db.prepare() in curated SQL modules", () => {
    const repoRoot = join(import.meta.dirname, "..");

    // Find all .prepare( calls in src/
    let grepOutput: string;
    try {
      grepOutput = execSync('grep -rn "\\.prepare(" src/ --include="*.ts"', {
        cwd: repoRoot,
        encoding: "utf8",
      });
    } catch (error: unknown) {
      // grep exits with 1 if no matches, which is actually good
      if ((error as { status?: number }).status === 1) {
        return; // No prepare() calls found - pass
      }
      throw error;
    }

    const violations: string[] = [];
    const lines = grepOutput.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      // Extract file path from grep output (format: "path:line:content")
      const match = line.match(/^src\/([^:]+):/);
      if (!match) continue;

      const filePath = match[1];

      // Check if this file is in an allowed path
      const isAllowed = ALLOWED_PATTERNS.some(
        (pattern) => filePath.startsWith(pattern) || filePath === pattern
      );

      if (!isAllowed) {
        violations.push(line);
      }
    }

    if (violations.length > 0) {
      assert.fail(
        `Found db.prepare() calls outside curated SQL modules:\n\n` +
          violations.join("\n") +
          `\n\n` +
          `All SQL must live in curated modules:\n` +
          ALLOWED_PATTERNS.map((p) => `  - src/${p}`).join("\n") +
          `\n\n` +
          `See .github/copilot-instructions.md for SQL safety rules.`
      );
    }
  });

  it("should not have dynamic SQL string interpolation in curated modules", () => {
    const repoRoot = join(import.meta.dirname, "..");

    // Look for dangerous patterns: template literals with variables in SQL
    // This catches: `SELECT * FROM ${table}` or `WHERE ${column} = ?`
    let grepOutput: string;
    try {
      // Look for .prepare(`...${...}...`) pattern - dynamic SQL
      grepOutput = execSync(
        'grep -rn "\\.prepare(\\`[^\\`]*\\${" src/memory/store/ --include="*.ts" || true',
        { cwd: repoRoot, encoding: "utf8" }
      );
    } catch {
      return; // grep error, skip
    }

    const lines = grepOutput.trim().split("\n").filter(Boolean);

    // Filter out legitimate dynamic SQL (e.g., building WHERE clauses with validated columns)
    const dangerous: string[] = [];
    for (const line of lines) {
      // Allow: SET clauses built from validated column names
      // Allow: ORDER BY with validated column names
      // Disallow: Table names, raw user input in WHERE
      if (
        line.includes("${table}") ||
        line.includes("${tableName}") ||
        line.includes("${userInput}") ||
        line.includes("${input}")
      ) {
        dangerous.push(line);
      }
    }

    if (dangerous.length > 0) {
      assert.fail(
        `Found potentially dangerous dynamic SQL:\n\n` +
          dangerous.join("\n") +
          `\n\n` +
          `Dynamic table/input interpolation is forbidden. Use parameterized queries.`
      );
    }
  });
});
