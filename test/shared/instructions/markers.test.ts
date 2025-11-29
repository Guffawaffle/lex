/**
 * Tests for the Marker System
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  LEX_BEGIN,
  LEX_END,
  wrapWithMarkers,
  extractMarkedContent,
  replaceMarkedContent,
  hasValidMarkers,
} from "../../../src/shared/instructions/markers.js";

describe("Marker System", () => {
  describe("wrapWithMarkers", () => {
    it("wraps content with BEGIN and END markers", () => {
      const content = "## Lex Section\n\nSome content here.";
      const wrapped = wrapWithMarkers(content);

      assert.ok(wrapped.startsWith(LEX_BEGIN), "Should start with LEX_BEGIN");
      assert.ok(wrapped.includes(content.trim()), "Should include original content");
      assert.ok(wrapped.endsWith(LEX_END), "Should end with LEX_END");
    });

    it("includes header comment after BEGIN marker", () => {
      const wrapped = wrapWithMarkers("test");
      const lines = wrapped.split("\n");

      assert.equal(lines[0], LEX_BEGIN);
      assert.ok(lines[1].includes("auto-generated"), "Second line should be header comment");
    });

    it("trims content before wrapping", () => {
      const content = "\n\n  Some content  \n\n";
      const wrapped = wrapWithMarkers(content);

      assert.ok(wrapped.includes("Some content"), "Should include trimmed content");
      assert.ok(!wrapped.includes("  Some content  "), "Should not have extra whitespace");
    });
  });

  describe("extractMarkedContent", () => {
    it("extracts content between markers", () => {
      const file = `# Human Header

${LEX_BEGIN}
Lex content here
${LEX_END}

# Human Footer`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("Lex content here"));
      assert.ok(result.before.includes("Human Header"));
      assert.ok(result.after.includes("Human Footer"));
    });

    it("returns null lex when no markers found", () => {
      const file = "# Just a normal file\n\nNo markers here.";
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
      assert.equal(result.lex, null);
      assert.equal(result.before, file);
      assert.equal(result.after, "");
    });

    it("handles malformed markers (END before BEGIN)", () => {
      const file = `${LEX_END}\nBroken\n${LEX_BEGIN}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
      assert.equal(result.lex, null);
    });

    it("handles markers at file boundaries", () => {
      const file = `${LEX_BEGIN}\nContent\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.equal(result.before, "");
      assert.equal(result.after, "");
    });
  });

  describe("replaceMarkedContent", () => {
    it("replaces existing marked section", () => {
      const existing = `# Header

${LEX_BEGIN}
Old content
${LEX_END}

# Footer`;

      const newContent = "## New Lex Section";
      const result = replaceMarkedContent(existing, newContent);

      assert.ok(result.includes("# Header"), "Should preserve header");
      assert.ok(result.includes("# Footer"), "Should preserve footer");
      assert.ok(result.includes("New Lex Section"), "Should have new content");
      assert.ok(!result.includes("Old content"), "Should not have old content");
    });

    it("appends to file with no markers", () => {
      const existing = "# Existing Content\n\nSome text.";
      const newContent = "## Lex Section";
      const result = replaceMarkedContent(existing, newContent);

      assert.ok(result.startsWith("# Existing Content"));
      assert.ok(result.includes(LEX_BEGIN));
      assert.ok(result.includes("Lex Section"));
      assert.ok(result.includes(LEX_END));
    });

    it("handles empty existing file", () => {
      const result = replaceMarkedContent("", "## Lex Content");

      assert.ok(result.includes(LEX_BEGIN));
      assert.ok(result.includes("Lex Content"));
      assert.ok(result.includes(LEX_END));
    });

    it("is idempotent when content unchanged", () => {
      const content = "## Same Content";
      const first = replaceMarkedContent("# Header", content);
      const second = replaceMarkedContent(first, content);

      // Extract the lex sections and compare
      const firstExtract = extractMarkedContent(first);
      const secondExtract = extractMarkedContent(second);

      assert.equal(firstExtract.lex, secondExtract.lex);
    });
  });

  describe("hasValidMarkers", () => {
    it("returns true for valid markers", () => {
      const content = `${LEX_BEGIN}\nContent\n${LEX_END}`;
      assert.equal(hasValidMarkers(content), true);
    });

    it("returns false when BEGIN missing", () => {
      const content = `Content\n${LEX_END}`;
      assert.equal(hasValidMarkers(content), false);
    });

    it("returns false when END missing", () => {
      const content = `${LEX_BEGIN}\nContent`;
      assert.equal(hasValidMarkers(content), false);
    });

    it("returns false when END comes before BEGIN", () => {
      const content = `${LEX_END}\nContent\n${LEX_BEGIN}`;
      assert.equal(hasValidMarkers(content), false);
    });
  });
});
