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
  hasVariantMarkers,
  removeMarkedContent,
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

  /**
   * Edge Case Tests - Issue #448
   * These tests document behavior for "tattered" instruction files
   * with non-standard markers, multiple blocks, etc.
   */
  describe("Edge Cases - Variant Marker Formats", () => {
    it("DETECTS variant marker with trailing comment", () => {
      // This was the bug we hit during dogfooding - NOW FIXED
      const file = `# Header

<!-- LEX:BEGIN - Lex owns this section. Do not edit manually. -->
Old content
<!-- LEX:END -->

# Footer`;

      const result = extractMarkedContent(file);

      // NEW behavior: regex detects variant formats
      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("Old content"));
      assert.equal(result.hasVariantMarkers, true);
      assert.ok(result.before.includes("# Header"));
      assert.ok(result.after.includes("# Footer"));
    });

    it("DETECTS marker without spaces", () => {
      const file = `<!--LEX:BEGIN-->\nContent\n<!--LEX:END-->`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.equal(result.hasVariantMarkers, true);
      assert.ok(result.lex?.includes("Content"));
    });

    it("DETECTS marker with extra spaces", () => {
      const file = `<!--  LEX:BEGIN  -->\nContent\n<!--  LEX:END  -->`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.equal(result.hasVariantMarkers, true);
    });

    it("does NOT detect lowercase markers (case-sensitive)", () => {
      const file = `<!-- lex:begin -->\nContent\n<!-- lex:end -->`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
      // Documents: case-sensitive matching is intentional
    });

    it("hasVariantMarkers returns true for non-standard format", () => {
      const file = `<!-- LEX:BEGIN - comment -->\nContent\n<!-- LEX:END -->`;
      assert.equal(hasVariantMarkers(file), true);
    });

    it("hasVariantMarkers returns false for standard format", () => {
      const file = `${LEX_BEGIN}\nContent\n${LEX_END}`;
      assert.equal(hasVariantMarkers(file), false);
    });

    it("replaceMarkedContent normalizes variant markers to standard format", () => {
      const file = `# Header

<!-- LEX:BEGIN - old comment -->
Old content
<!-- LEX:END -->

# Footer`;

      const result = replaceMarkedContent(file, "New content");

      // Should have standard markers now
      assert.ok(result.includes(LEX_BEGIN), "Should have standard BEGIN marker");
      assert.ok(result.includes(LEX_END), "Should have standard END marker");
      assert.ok(!result.includes("old comment"), "Should not have old comment");
      assert.ok(result.includes("New content"));
      assert.ok(result.includes("# Header"));
      assert.ok(result.includes("# Footer"));
    });
  });

  describe("Edge Cases - Remove Command", () => {
    it("removes Lex section and preserves human content", () => {
      const file = `# Header

${LEX_BEGIN}
Lex content to remove
${LEX_END}

# Footer`;

      const result = removeMarkedContent(file);

      assert.equal(result.removed, true);
      assert.ok(result.content.includes("# Header"));
      assert.ok(result.content.includes("# Footer"));
      assert.ok(!result.content.includes("Lex content to remove"));
      assert.ok(!result.content.includes(LEX_BEGIN));
      assert.ok(!result.content.includes(LEX_END));
    });

    it("returns original content when no markers", () => {
      const file = "# Just a file\n\nNo markers here.";
      const result = removeMarkedContent(file);

      assert.equal(result.removed, false);
      assert.equal(result.content, file);
      assert.equal(result.removedContent, null);
    });

    it("handles file with only Lex content", () => {
      const file = `${LEX_BEGIN}\nOnly Lex here\n${LEX_END}`;
      const result = removeMarkedContent(file);

      assert.equal(result.removed, true);
      assert.equal(result.content.trim(), "");
    });

    it("removes variant format markers", () => {
      const file = `# Header
<!-- LEX:BEGIN - comment -->
Content
<!-- LEX:END -->
# Footer`;

      const result = removeMarkedContent(file);

      assert.equal(result.removed, true);
      assert.ok(result.content.includes("# Header"));
      assert.ok(result.content.includes("# Footer"));
      assert.ok(!result.content.includes("LEX:BEGIN"));
    });

    it("returns removed content for inspection", () => {
      const file = `${LEX_BEGIN}\nRemoved content here\n${LEX_END}`;
      const result = removeMarkedContent(file);

      assert.equal(result.removed, true);
      assert.ok(result.removedContent?.includes("Removed content here"));
    });
  });

  describe("Edge Cases - Multiple Marker Blocks", () => {
    it("only processes first marker pair", () => {
      const file = `# Header

${LEX_BEGIN}
First block
${LEX_END}

# Middle section

${LEX_BEGIN}
Second block
${LEX_END}

# Footer`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("First block"));
      // Second block ends up in 'after' section
      assert.ok(result.after.includes("Second block"));
      assert.ok(result.after.includes("Middle section"));
    });

    it("replaceMarkedContent only replaces first block", () => {
      const file = `${LEX_BEGIN}\nFirst\n${LEX_END}\n\n${LEX_BEGIN}\nSecond\n${LEX_END}`;

      const result = replaceMarkedContent(file, "New content");

      // First block replaced
      assert.ok(result.includes("New content"));
      // Second block still present in after section
      assert.ok(result.includes("Second"));
    });
  });

  describe("Edge Cases - Nested Markers", () => {
    it("handles BEGIN inside existing block (inner ignored)", () => {
      const file = `${LEX_BEGIN}
Outer content
${LEX_BEGIN}
This BEGIN is just text
${LEX_END}`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      // Content includes the inner BEGIN as literal text
      assert.ok(result.lex?.includes("Outer content"));
      assert.ok(result.lex?.includes(LEX_BEGIN)); // Inner BEGIN is content
    });
  });

  describe("Edge Cases - Partial/Truncated Markers", () => {
    it("handles incomplete BEGIN marker", () => {
      const file = `<!-- LEX:BEG\nContent\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
    });

    it("handles incomplete END marker", () => {
      const file = `${LEX_BEGIN}\nContent\n<!-- LEX:EN`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
    });

    it("handles marker split across lines", () => {
      const file = `<!-- LEX:\nBEGIN -->\nContent\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, false);
    });
  });

  describe("Edge Cases - Whitespace and Line Endings", () => {
    it("handles Windows line endings (CRLF)", () => {
      const file = `# Header\r\n\r\n${LEX_BEGIN}\r\nContent\r\n${LEX_END}\r\n\r\n# Footer`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("Content"));
    });

    it("handles mixed line endings", () => {
      const file = `# Header\n\r\n${LEX_BEGIN}\nContent\r\n${LEX_END}\n# Footer`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
    });

    it("handles tabs around markers", () => {
      const file = `\t${LEX_BEGIN}\n\tContent\n\t${LEX_END}`;
      const result = extractMarkedContent(file);

      // Markers must be exact, tabs before don't break detection
      assert.equal(result.hasMarkers, true);
    });

    it("handles empty content between markers", () => {
      const file = `${LEX_BEGIN}\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.equal(result.lex, ""); // Empty string, not null
    });

    it("handles only whitespace between markers", () => {
      const file = `${LEX_BEGIN}\n\n   \n\t\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.equal(result.lex?.trim(), "");
    });
  });

  describe("Edge Cases - Large Files", () => {
    it("handles markers in middle of large file", () => {
      const beforeContent = "# Line\n".repeat(1000);
      const afterContent = "# Footer\n".repeat(1000);
      const file = `${beforeContent}${LEX_BEGIN}\nLex content\n${LEX_END}\n${afterContent}`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("Lex content"));
      assert.ok(result.before.length > 5000);
      assert.ok(result.after.length > 5000);
    });

    it("handles very long Lex content", () => {
      const lexContent = "## Section\n\nParagraph content.\n".repeat(500);
      const file = `# Header\n\n${LEX_BEGIN}\n${lexContent}\n${LEX_END}\n\n# Footer`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex && result.lex.length > 10000);
    });
  });

  describe("Edge Cases - Special Characters", () => {
    it("handles unicode content between markers", () => {
      const file = `${LEX_BEGIN}\n## 日本語\n\n✓ Check ✗ Cross 🎭 Emoji\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("日本語"));
      assert.ok(result.lex?.includes("🎭"));
    });

    it("handles HTML entities in content", () => {
      const file = `${LEX_BEGIN}\n&lt;div&gt; &amp; &quot;quotes&quot;\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("&lt;"));
    });

    it("handles markdown code blocks with similar syntax", () => {
      const file = `${LEX_BEGIN}
\`\`\`html
<!-- This looks like a marker but isn't -->
<!-- LEX:BEGIN -->
\`\`\`
${LEX_END}`;

      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      // The code block content is preserved, not treated as marker
      assert.ok(result.lex?.includes("```html"));
    });
  });

  describe("Edge Cases - Marker-like Content", () => {
    it("does not confuse similar HTML comments", () => {
      const file = `<!-- BEGIN -->\n${LEX_BEGIN}\nContent\n${LEX_END}\n<!-- END -->`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.before.includes("<!-- BEGIN -->"));
      assert.ok(result.after.includes("<!-- END -->"));
    });

    it("handles LEX in content without markers", () => {
      const file = `${LEX_BEGIN}\nTalk about LEX:BEGIN and LEX:END\n${LEX_END}`;
      const result = extractMarkedContent(file);

      assert.equal(result.hasMarkers, true);
      assert.ok(result.lex?.includes("LEX:BEGIN"));
    });
  });
});
