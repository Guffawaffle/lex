/**
 * Tests for marker system utilities
 *
 * Tests cover:
 * - Wrap new content
 * - Extract from existing file
 * - Replace existing marked section
 * - Handle file with no markers
 * - Handle malformed markers
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  LEX_BEGIN,
  LEX_END,
  wrapWithMarkers,
  extractMarkedContent,
  replaceMarkedContent,
} from "../../../src/shared/instructions/markers.js";

describe("Marker System", () => {
  describe("Marker Constants", () => {
    it("should have correct LEX_BEGIN marker", () => {
      assert.strictEqual(LEX_BEGIN, "<!-- LEX:BEGIN -->");
    });

    it("should have correct LEX_END marker", () => {
      assert.strictEqual(LEX_END, "<!-- LEX:END -->");
    });
  });

  describe("wrapWithMarkers", () => {
    it("should wrap content with markers", () => {
      const content = "# My Section\n\nGenerated content here.";
      const result = wrapWithMarkers(content);

      assert.strictEqual(
        result,
        `${LEX_BEGIN}\n${content}\n${LEX_END}`,
        "Content should be wrapped with markers and newlines"
      );
    });

    it("should wrap empty content", () => {
      const result = wrapWithMarkers("");

      assert.strictEqual(
        result,
        `${LEX_BEGIN}\n\n${LEX_END}`,
        "Empty content should still be wrapped with markers"
      );
    });

    it("should wrap single line content", () => {
      const content = "Single line";
      const result = wrapWithMarkers(content);

      assert.strictEqual(
        result,
        `${LEX_BEGIN}\n${content}\n${LEX_END}`,
        "Single line content should be wrapped correctly"
      );
    });

    it("should preserve multiline content exactly", () => {
      const content = "Line 1\nLine 2\n\nLine 4";
      const result = wrapWithMarkers(content);

      assert.strictEqual(
        result,
        `${LEX_BEGIN}\n${content}\n${LEX_END}`,
        "Multiline content should be preserved exactly"
      );
    });
  });

  describe("extractMarkedContent", () => {
    it("should extract content from file with markers", () => {
      const fileContent = `Human intro
${LEX_BEGIN}
Generated content
${LEX_END}
Human outro`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "Human intro\n", "before should include content before BEGIN marker");
      assert.strictEqual(result.lex, "Generated content", "lex should be content between markers");
      assert.strictEqual(result.after, "\nHuman outro", "after should include content after END marker");
    });

    it("should return null lex for file with no markers", () => {
      const fileContent = "Just human content here";

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, fileContent, "before should contain entire file content");
      assert.strictEqual(result.lex, null, "lex should be null when no markers present");
      assert.strictEqual(result.after, "", "after should be empty when no markers present");
    });

    it("should handle file with only BEGIN marker (malformed)", () => {
      const fileContent = `Human content
${LEX_BEGIN}
Some content after BEGIN only`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, fileContent, "before should contain entire file content");
      assert.strictEqual(result.lex, null, "lex should be null for malformed markers");
      assert.strictEqual(result.after, "", "after should be empty for malformed markers");
    });

    it("should handle file with only END marker (malformed)", () => {
      const fileContent = `Human content
${LEX_END}
Some content after END only`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, fileContent, "before should contain entire file content");
      assert.strictEqual(result.lex, null, "lex should be null for malformed markers");
      assert.strictEqual(result.after, "", "after should be empty for malformed markers");
    });

    it("should handle file with END before BEGIN (malformed)", () => {
      const fileContent = `Human content
${LEX_END}
Middle content
${LEX_BEGIN}
More content`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, fileContent, "before should contain entire file content");
      assert.strictEqual(result.lex, null, "lex should be null when END comes before BEGIN");
      assert.strictEqual(result.after, "", "after should be empty when END comes before BEGIN");
    });

    it("should handle empty content between markers", () => {
      const fileContent = `Before
${LEX_BEGIN}
${LEX_END}
After`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "Before\n", "before should be correct");
      assert.strictEqual(result.lex, "", "lex should be empty string for empty marked section");
      assert.strictEqual(result.after, "\nAfter", "after should be correct");
    });

    it("should handle file starting with markers", () => {
      const fileContent = `${LEX_BEGIN}
Lex content
${LEX_END}
After content`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "", "before should be empty when file starts with marker");
      assert.strictEqual(result.lex, "Lex content", "lex should be extracted correctly");
      assert.strictEqual(result.after, "\nAfter content", "after should be correct");
    });

    it("should handle file ending with markers", () => {
      const fileContent = `Before content
${LEX_BEGIN}
Lex content
${LEX_END}`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "Before content\n", "before should be correct");
      assert.strictEqual(result.lex, "Lex content", "lex should be extracted correctly");
      assert.strictEqual(result.after, "", "after should be empty when file ends with marker");
    });

    it("should handle file with only markers and lex content", () => {
      const fileContent = `${LEX_BEGIN}
Only Lex content here
${LEX_END}`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "", "before should be empty");
      assert.strictEqual(result.lex, "Only Lex content here", "lex should be entire marked content");
      assert.strictEqual(result.after, "", "after should be empty");
    });

    it("should preserve human content exactly (whitespace, formatting)", () => {
      const fileContent = `  Leading spaces
Trailing spaces  
${LEX_BEGIN}
Lex content
${LEX_END}
   More spaces   `;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "  Leading spaces\nTrailing spaces  \n", "before should preserve whitespace");
      assert.strictEqual(result.lex, "Lex content", "lex should be extracted correctly");
      assert.strictEqual(result.after, "\n   More spaces   ", "after should preserve whitespace");
    });

    it("should handle markers without newlines (edge case)", () => {
      // Edge case where markers don't have newlines
      const fileContent = `${LEX_BEGIN}content${LEX_END}`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "", "before should be empty");
      assert.strictEqual(result.lex, "content", "lex should extract content correctly without newlines");
      assert.strictEqual(result.after, "", "after should be empty");
    });

    it("should handle adjacent markers without content", () => {
      // Markers directly adjacent with no content between them
      const fileContent = `${LEX_BEGIN}${LEX_END}`;

      const result = extractMarkedContent(fileContent);

      assert.strictEqual(result.before, "", "before should be empty");
      assert.strictEqual(result.lex, "", "lex should be empty for adjacent markers");
      assert.strictEqual(result.after, "", "after should be empty");
    });
  });

  describe("replaceMarkedContent", () => {
    it("should replace existing marked section", () => {
      const fileContent = `Human intro
${LEX_BEGIN}
Old content
${LEX_END}
Human outro`;

      const result = replaceMarkedContent(fileContent, "New content");

      const expected = `Human intro
${LEX_BEGIN}
New content
${LEX_END}
Human outro`;

      assert.strictEqual(result, expected, "Marked section should be replaced with new content");
    });

    it("should append markers to file with no existing markers", () => {
      const fileContent = "Human content";

      const result = replaceMarkedContent(fileContent, "Generated content");

      assert.ok(result.startsWith("Human content\n\n"), "Original content should be preserved");
      assert.ok(result.includes(LEX_BEGIN), "Result should include BEGIN marker");
      assert.ok(result.includes("Generated content"), "Result should include new content");
      assert.ok(result.includes(LEX_END), "Result should include END marker");
    });

    it("should append with single newline if file ends with newline", () => {
      const fileContent = "Human content\n";

      const result = replaceMarkedContent(fileContent, "Generated content");

      assert.strictEqual(
        result,
        `Human content\n\n${LEX_BEGIN}\nGenerated content\n${LEX_END}`,
        "Should add single newline separator when file ends with newline"
      );
    });

    it("should preserve human content before markers", () => {
      const humanBefore = "# Custom Header\n\nMy custom intro paragraph.\n";
      const fileContent = `${humanBefore}${LEX_BEGIN}
Old lex content
${LEX_END}`;

      const result = replaceMarkedContent(fileContent, "New lex content");

      assert.ok(result.startsWith(humanBefore), "Human content before markers should be preserved exactly");
    });

    it("should preserve human content after markers", () => {
      const humanAfter = "\n\n## Custom Footer\n\nMy custom outro.";
      const fileContent = `${LEX_BEGIN}
Old lex content
${LEX_END}${humanAfter}`;

      const result = replaceMarkedContent(fileContent, "New lex content");

      assert.ok(result.endsWith(humanAfter), "Human content after markers should be preserved exactly");
    });

    it("should produce deterministic output", () => {
      const fileContent = `Before
${LEX_BEGIN}
Old
${LEX_END}
After`;

      const result1 = replaceMarkedContent(fileContent, "New content");
      const result2 = replaceMarkedContent(fileContent, "New content");

      assert.strictEqual(result1, result2, "Multiple calls with same input should produce identical output");
    });

    it("should handle empty new content", () => {
      const fileContent = `Before
${LEX_BEGIN}
Old content
${LEX_END}
After`;

      const result = replaceMarkedContent(fileContent, "");

      const expected = `Before
${LEX_BEGIN}

${LEX_END}
After`;

      assert.strictEqual(result, expected, "Empty content should be wrapped correctly");
    });

    it("should handle replacement with multiline content", () => {
      const fileContent = `Before
${LEX_BEGIN}
Old
${LEX_END}
After`;

      const newContent = "Line 1\nLine 2\nLine 3";
      const result = replaceMarkedContent(fileContent, newContent);

      const expected = `Before
${LEX_BEGIN}
Line 1
Line 2
Line 3
${LEX_END}
After`;

      assert.strictEqual(result, expected, "Multiline replacement should work correctly");
    });
  });

  describe("Idempotent Updates", () => {
    it("should produce same result when replacing with same content", () => {
      const original = `Human content here
${LEX_BEGIN}
Generated section
${LEX_END}
More human content`;

      // Replace with same content
      const result = replaceMarkedContent(original, "Generated section");

      assert.strictEqual(result, original, "Replacing with same content should produce identical file");
    });

    it("should allow repeated updates without accumulating markers", () => {
      const initial = "Initial human content";

      // First update
      const result1 = replaceMarkedContent(initial, "First generation");

      // Second update
      const result2 = replaceMarkedContent(result1, "Second generation");

      // Third update
      const result3 = replaceMarkedContent(result2, "Third generation");

      // Count markers - should only have one pair
      const beginCount = (result3.match(new RegExp(LEX_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [])
        .length;
      const endCount = (result3.match(new RegExp(LEX_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

      assert.strictEqual(beginCount, 1, "Should only have one BEGIN marker after multiple updates");
      assert.strictEqual(endCount, 1, "Should only have one END marker after multiple updates");
      assert.ok(result3.includes("Third generation"), "Should contain latest content");
      assert.ok(!result3.includes("Second generation"), "Should not contain old content");
    });
  });
});
