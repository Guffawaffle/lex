/**
 * Test suite for syntax highlighting
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  highlightCode,
  highlightDiff,
  detectLanguageFromExtension,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
} from "../../../src/memory/renderer/syntax.js";

describe("Syntax Highlighting", () => {
  test("highlightCode - TypeScript", async () => {
    const code = 'function hello() {\n  console.log("world");\n}';
    const result = await highlightCode(code, "typescript");

    assert.ok(result.includes("<pre"), "Should contain pre tag");
    assert.ok(result.includes("function"), "Should contain the code");
  });

  test("highlightCode - Python", async () => {
    const code = 'def hello():\n    print("world")';
    const result = await highlightCode(code, "python");

    assert.ok(result.includes("<pre"), "Should contain pre tag");
    assert.ok(result.includes("def"), "Should contain the code");
  });

  test("highlightCode - fallback on error", async () => {
    const code = "test code";
    // Use an invalid language to trigger fallback
    const result = await highlightCode(code, "invalid-lang" as any);

    assert.ok(result.includes("test code"), "Should contain the code in fallback");
  });

  test("highlightDiff - additions and deletions", async () => {
    const diff = '+ function hello() {\n+   console.log("world");\n+ }';
    const result = await highlightDiff(diff, "typescript");

    assert.ok(result.includes("diff-addition"), "Should mark additions");
    assert.ok(result.includes("function"), "Should contain the code");
  });

  test("detectLanguageFromExtension - TypeScript", () => {
    assert.strictEqual(detectLanguageFromExtension("file.ts"), "typescript");
    assert.strictEqual(detectLanguageFromExtension("file.tsx"), "typescript");
  });

  test("detectLanguageFromExtension - JavaScript", () => {
    assert.strictEqual(detectLanguageFromExtension("file.js"), "javascript");
    assert.strictEqual(detectLanguageFromExtension("file.jsx"), "javascript");
  });

  test("detectLanguageFromExtension - Python", () => {
    assert.strictEqual(detectLanguageFromExtension("file.py"), "python");
  });

  test("detectLanguageFromExtension - default", () => {
    assert.strictEqual(detectLanguageFromExtension("file.unknown"), "typescript");
    assert.strictEqual(detectLanguageFromExtension("noextension"), "typescript");
  });

  test("isLanguageSupported - valid languages", () => {
    assert.ok(isLanguageSupported("typescript"));
    assert.ok(isLanguageSupported("javascript"));
    assert.ok(isLanguageSupported("python"));
  });

  test("isLanguageSupported - invalid language", () => {
    assert.ok(!isLanguageSupported("not-a-language"));
  });

  test("SUPPORTED_LANGUAGES - contains common languages", () => {
    assert.ok(SUPPORTED_LANGUAGES.includes("typescript"));
    assert.ok(SUPPORTED_LANGUAGES.includes("javascript"));
    assert.ok(SUPPORTED_LANGUAGES.includes("python"));
    assert.ok(SUPPORTED_LANGUAGES.includes("java"));
    assert.ok(SUPPORTED_LANGUAGES.includes("go"));
  });
});
