/**
 * Test suite for diff formatting
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  parseDiff,
  truncateDiff,
  formatDiff,
  renderDiff,
  getDiffStats,
  type DiffLine,
} from "./diff.js";

describe("Diff Formatting", () => {
  test("parseDiff - additions", () => {
    const diff = "+ added line\n+ another added line";
    const result = parseDiff(diff);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "addition");
    assert.strictEqual(result[0].content, " added line");
    assert.strictEqual(result[1].type, "addition");
    assert.strictEqual(result[1].content, " another added line");
  });

  test("parseDiff - deletions", () => {
    const diff = "- removed line\n- another removed line";
    const result = parseDiff(diff);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "deletion");
    assert.strictEqual(result[0].content, " removed line");
  });

  test("parseDiff - unchanged", () => {
    const diff = " unchanged line";
    const result = parseDiff(diff);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, "unchanged");
    assert.strictEqual(result[0].content, "unchanged line");
  });

  test("parseDiff - context", () => {
    const diff = "@@ -1,3 +1,3 @@";
    const result = parseDiff(diff);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, "context");
  });

  test("parseDiff - mixed", () => {
    const diff = "@@ -1,3 +1,3 @@\n unchanged\n- removed\n+ added";
    const result = parseDiff(diff);

    assert.strictEqual(result.length, 4);
    assert.strictEqual(result[0].type, "context");
    assert.strictEqual(result[1].type, "unchanged");
    assert.strictEqual(result[2].type, "deletion");
    assert.strictEqual(result[3].type, "addition");
  });

  test("truncateDiff - under max lines", () => {
    const lines: DiffLine[] = [
      { type: "addition", content: "line 1" },
      { type: "deletion", content: "line 2" },
    ];

    const result = truncateDiff(lines, { maxLines: 50 });

    assert.strictEqual(result.length, 2);
  });

  test("truncateDiff - collapse unchanged sections", () => {
    const lines: DiffLine[] = [];

    // Add some changed lines
    lines.push({ type: "addition", content: "added line" });

    // Add many unchanged lines
    for (let i = 0; i < 20; i++) {
      lines.push({ type: "unchanged", content: `unchanged ${i}` });
    }

    // Add another change
    lines.push({ type: "deletion", content: "deleted line" });

    const result = truncateDiff(lines, { maxLines: 100, contextLines: 3, collapseThreshold: 10 });

    // Should have: changed line + 3 context + collapse marker + 3 context + changed line
    assert.ok(result.length < lines.length, "Should collapse unchanged sections");
    assert.ok(
      result.some((line) => line.content.includes("lines omitted")),
      "Should have collapse marker"
    );
  });

  test("truncateDiff - preserve context around changes", () => {
    const lines: DiffLine[] = [];

    // Unchanged lines
    for (let i = 0; i < 5; i++) {
      lines.push({ type: "unchanged", content: `before ${i}` });
    }

    // Changed line
    lines.push({ type: "addition", content: "added line" });

    // More unchanged lines
    for (let i = 0; i < 5; i++) {
      lines.push({ type: "unchanged", content: `after ${i}` });
    }

    const result = truncateDiff(lines, { contextLines: 2 });

    // Should include changed line + 2 before + 2 after
    const addedIndex = result.findIndex((line) => line.type === "addition");
    assert.ok(addedIndex >= 2, "Should have context before change");
    assert.ok(result.length - addedIndex > 2, "Should have context after change");
  });

  test("formatDiff - round trip", () => {
    const original = "+ added\n- removed\n unchanged";
    const parsed = parseDiff(original);
    const formatted = formatDiff(parsed);

    assert.strictEqual(formatted, original);
  });

  test("renderDiff - complete workflow", () => {
    const diff = "+ added line\n unchanged line\n- removed line";
    const result = renderDiff(diff, { maxLines: 50 });

    assert.ok(result.includes("+ added line"));
    assert.ok(result.includes(" unchanged line"));
    assert.ok(result.includes("- removed line"));
  });

  test("getDiffStats - count additions", () => {
    const diff = "+ line 1\n+ line 2\n+ line 3";
    const stats = getDiffStats(diff);

    assert.strictEqual(stats.additions, 3);
    assert.strictEqual(stats.deletions, 0);
    assert.strictEqual(stats.unchanged, 0);
  });

  test("getDiffStats - count deletions", () => {
    const diff = "- line 1\n- line 2";
    const stats = getDiffStats(diff);

    assert.strictEqual(stats.additions, 0);
    assert.strictEqual(stats.deletions, 2);
    assert.strictEqual(stats.unchanged, 0);
  });

  test("getDiffStats - mixed", () => {
    const diff = "+ added\n- removed\n unchanged";
    const stats = getDiffStats(diff);

    assert.strictEqual(stats.additions, 1);
    assert.strictEqual(stats.deletions, 1);
    assert.strictEqual(stats.unchanged, 1);
    assert.strictEqual(stats.total, 3);
  });
});
