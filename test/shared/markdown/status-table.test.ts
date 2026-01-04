/**
 * Unit tests for markdown status table parser
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseIssueRef,
  parseStatus,
  formatStatus,
  extractStatusTables,
  updateTableRows,
  updateMarkdownTables,
} from "../../../dist/shared/markdown/status-table.js";

describe("Markdown Status Table Parser", () => {
  describe("parseIssueRef", () => {
    it("should parse repo#number format", () => {
      const ref = parseIssueRef("lexsona#111");
      assert.ok(ref);
      assert.strictEqual(ref.org, undefined);
      assert.strictEqual(ref.repo, "lexsona");
      assert.strictEqual(ref.number, 111);
      assert.strictEqual(ref.fullRef, "lexsona#111");
    });

    it("should parse org/repo#number format", () => {
      const ref = parseIssueRef("Guffawaffle/lex#647");
      assert.ok(ref);
      assert.strictEqual(ref.org, "Guffawaffle");
      assert.strictEqual(ref.repo, "lex");
      assert.strictEqual(ref.number, 647);
      assert.strictEqual(ref.fullRef, "Guffawaffle/lex#647");
    });

    it("should return null for invalid format", () => {
      assert.strictEqual(parseIssueRef("invalid"), null);
      assert.strictEqual(parseIssueRef("123"), null);
      assert.strictEqual(parseIssueRef("repo"), null);
    });
  });

  describe("parseStatus", () => {
    it("should parse open status with emoji", () => {
      assert.strictEqual(parseStatus("🔵 Open"), "open");
    });

    it("should parse closed status with emoji", () => {
      assert.strictEqual(parseStatus("✅ Closed"), "closed");
    });

    it("should parse open status without emoji", () => {
      assert.strictEqual(parseStatus("Open"), "open");
    });

    it("should parse closed status without emoji", () => {
      assert.strictEqual(parseStatus("Closed"), "closed");
    });

    it("should return null for invalid status", () => {
      assert.strictEqual(parseStatus("invalid"), null);
    });
  });

  describe("formatStatus", () => {
    it("should format open status", () => {
      assert.strictEqual(formatStatus("open"), "🔵 Open");
    });

    it("should format closed status", () => {
      assert.strictEqual(formatStatus("closed"), "✅ Closed");
    });
  });

  describe("extractStatusTables", () => {
    it("should extract single status table", () => {
      const markdown = `
### 🔄 Wave 2 — Ready for Assignment

| # | Title | Status |
|---|-------|--------|
| lexsona#111 | Explain Constraint Derivation | 🔵 Open |
| lex#647 | Contradiction Detection | 🔵 Open |
`;

      const tables = extractStatusTables(markdown);
      assert.strictEqual(tables.length, 1);
      assert.strictEqual(tables[0].waveId, "Wave 2");
      assert.strictEqual(tables[0].rows.length, 2);
      assert.strictEqual(tables[0].rows[0].issueRef.fullRef, "lexsona#111");
      assert.strictEqual(tables[0].rows[0].status, "open");
      assert.strictEqual(tables[0].rows[1].issueRef.fullRef, "lex#647");
      assert.strictEqual(tables[0].rows[1].status, "open");
    });

    it("should extract multiple status tables", () => {
      const markdown = `
### Wave 1

| # | Title | Status |
|---|-------|--------|
| lex#100 | Task 1 | ✅ Closed |

### Wave 2

| # | Title | Status |
|---|-------|--------|
| lex#200 | Task 2 | 🔵 Open |
`;

      const tables = extractStatusTables(markdown);
      assert.strictEqual(tables.length, 2);
      assert.strictEqual(tables[0].waveId, "Wave 1");
      assert.strictEqual(tables[1].waveId, "Wave 2");
    });

    it("should return empty array for no tables", () => {
      const markdown = "# Just a regular document\n\nNo tables here.";
      const tables = extractStatusTables(markdown);
      assert.strictEqual(tables.length, 0);
    });
  });

  describe("updateTableRows", () => {
    it("should update row status when changed", () => {
      const rows = [
        {
          issueRef: { repo: "lex", number: 100, fullRef: "lex#100" },
          title: "Task 1",
          status: "open" as const,
          rawLine: "| lex#100 | Task 1 | 🔵 Open |",
        },
      ];

      const issueStates = new Map([["lex#100", "closed" as const]]);
      const updated = updateTableRows(rows, issueStates);

      assert.strictEqual(updated.length, 1);
      assert.strictEqual(updated[0].updated, true);
      assert.strictEqual(updated[0].row.status, "closed");
      assert.ok(updated[0].row.rawLine.includes("✅ Closed"));
    });

    it("should not update row when status unchanged", () => {
      const rows = [
        {
          issueRef: { repo: "lex", number: 100, fullRef: "lex#100" },
          title: "Task 1",
          status: "open" as const,
          rawLine: "| lex#100 | Task 1 | 🔵 Open |",
        },
      ];

      const issueStates = new Map([["lex#100", "open" as const]]);
      const updated = updateTableRows(rows, issueStates);

      assert.strictEqual(updated.length, 1);
      assert.strictEqual(updated[0].updated, false);
      assert.strictEqual(updated[0].row.status, "open");
    });
  });

  describe("updateMarkdownTables", () => {
    it("should update markdown with actual issue states", () => {
      const markdown = `
### Wave 2

| # | Title | Status |
|---|-------|--------|
| lex#100 | Task 1 | 🔵 Open |
| lex#101 | Task 2 | 🔵 Open |
`;

      const issueStates = new Map([
        ["lex#100", "closed" as const],
        ["lex#101", "closed" as const],
      ]);

      const { updatedMarkdown, changes } = updateMarkdownTables(markdown, issueStates);

      assert.ok(updatedMarkdown.includes("✅ Closed"));
      assert.ok(!updatedMarkdown.includes("🔵 Open"));
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].was, "open");
      assert.strictEqual(changes[0].now, "closed");
    });

    it("should return original markdown when no changes", () => {
      const markdown = `
### Wave 2

| # | Title | Status |
|---|-------|--------|
| lex#100 | Task 1 | ✅ Closed |
`;

      const issueStates = new Map([["lex#100", "closed" as const]]);

      const { updatedMarkdown, changes } = updateMarkdownTables(markdown, issueStates);

      assert.strictEqual(updatedMarkdown, markdown);
      assert.strictEqual(changes.length, 0);
    });
  });
});
