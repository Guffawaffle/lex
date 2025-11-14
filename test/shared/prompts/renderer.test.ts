/**
 * Tests for prompt template renderer
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  renderPrompt,
  validateContext,
  computeContentHash,
  renderPromptTemplate,
} from "@app/shared/prompts/renderer.js";
import { RenderError, PromptTemplate } from "@app/shared/prompts/types.js";

describe("Prompt Renderer - Variable Substitution", () => {
  test("renders simple variable", () => {
    const result = renderPrompt("Hello {{name}}!", { name: "World" });
    assert.strictEqual(result, "Hello World!");
  });

  test("renders multiple variables", () => {
    const result = renderPrompt("{{greeting}} {{name}}!", {
      greeting: "Hello",
      name: "World",
    });
    assert.strictEqual(result, "Hello World!");
  });

  test("renders variable with whitespace", () => {
    const result = renderPrompt("{{ name }}", { name: "World" });
    assert.strictEqual(result, "World");
  });

  test("renders dot notation path", () => {
    const result = renderPrompt("{{user.name}}", {
      user: { name: "Alice" },
    });
    assert.strictEqual(result, "Alice");
  });

  test("escapes HTML by default", () => {
    const result = renderPrompt("{{html}}", { html: "<script>alert('xss')</script>" });
    assert.strictEqual(result, "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  test("renders raw variable with triple braces", () => {
    const result = renderPrompt("{{{html}}}", { html: "<b>bold</b>" });
    assert.strictEqual(result, "<b>bold</b>");
  });

  test("renders without escaping when disabled", () => {
    const result = renderPrompt("{{html}}", { html: "<b>bold</b>" }, { escapeHtml: false });
    assert.strictEqual(result, "<b>bold</b>");
  });

  test("throws on missing variable in strict mode", () => {
    assert.throws(
      () => renderPrompt("{{missing}}", {}, { strict: true }),
      (err: unknown) => {
        return (
          err instanceof RenderError &&
          err.code === "MISSING_VARIABLES" &&
          err.message.includes("missing")
        );
      }
    );
  });

  test("returns empty string for missing variable in non-strict mode", () => {
    const result = renderPrompt("{{missing}}", {}, { strict: false });
    assert.strictEqual(result, "");
  });

  test("handles number values", () => {
    const result = renderPrompt("Count: {{count}}", { count: 42 });
    assert.strictEqual(result, "Count: 42");
  });

  test("handles boolean values", () => {
    const result = renderPrompt("{{flag}}", { flag: true });
    assert.strictEqual(result, "true");
  });
});

describe("Prompt Renderer - Conditionals", () => {
  test("renders if block when condition is truthy", () => {
    const result = renderPrompt("{{#if show}}visible{{/if}}", { show: true });
    assert.strictEqual(result, "visible");
  });

  test("does not render if block when condition is falsy", () => {
    const result = renderPrompt("{{#if show}}visible{{/if}}", { show: false });
    assert.strictEqual(result, "");
  });

  test("renders else block when condition is falsy", () => {
    const result = renderPrompt("{{#if show}}yes{{else}}no{{/if}}", { show: false });
    assert.strictEqual(result, "no");
  });

  test("renders if block over else when condition is truthy", () => {
    const result = renderPrompt("{{#if show}}yes{{else}}no{{/if}}", { show: true });
    assert.strictEqual(result, "yes");
  });

  test("handles nested variables in if block", () => {
    const result = renderPrompt("{{#if show}}{{name}}{{/if}}", {
      show: true,
      name: "Alice",
    });
    assert.strictEqual(result, "Alice");
  });

  test("treats undefined as falsy", () => {
    const result = renderPrompt("{{#if missing}}yes{{else}}no{{/if}}", {});
    assert.strictEqual(result, "no");
  });

  test("treats null as falsy", () => {
    const result = renderPrompt("{{#if value}}yes{{else}}no{{/if}}", { value: null });
    assert.strictEqual(result, "no");
  });

  test("treats empty string as falsy", () => {
    const result = renderPrompt("{{#if value}}yes{{else}}no{{/if}}", { value: "" });
    assert.strictEqual(result, "no");
  });

  test("treats zero as falsy", () => {
    const result = renderPrompt("{{#if value}}yes{{else}}no{{/if}}", { value: 0 });
    assert.strictEqual(result, "no");
  });

  test("treats non-empty string as truthy", () => {
    const result = renderPrompt("{{#if value}}yes{{else}}no{{/if}}", { value: "text" });
    assert.strictEqual(result, "yes");
  });

  test("treats non-zero number as truthy", () => {
    const result = renderPrompt("{{#if value}}yes{{else}}no{{/if}}", { value: 1 });
    assert.strictEqual(result, "yes");
  });
});

describe("Prompt Renderer - Loops", () => {
  test("renders each item", () => {
    const result = renderPrompt("{{#each items}}{{this}},{{/each}}", {
      items: ["a", "b", "c"],
    });
    assert.strictEqual(result, "a,b,c,");
  });

  test("renders empty string for empty array", () => {
    const result = renderPrompt("{{#each items}}{{this}}{{/each}}", { items: [] });
    assert.strictEqual(result, "");
  });

  test("renders with item context variables", () => {
    const result = renderPrompt("{{#each items}}{{this}},{{/each}}", {
      items: ["a", "b"],
    });
    assert.strictEqual(result, "a,b,");
  });

  test("handles @index in loop", () => {
    const result = renderPrompt("{{#each items}}{{@index}},{{/each}}", {
      items: ["a", "b", "c"],
    });
    assert.strictEqual(result, "0,1,2,");
  });

  test("handles @first in loop", () => {
    const result = renderPrompt("{{#each items}}{{@first}},{{/each}}", {
      items: ["a", "b", "c"],
    });
    assert.strictEqual(result, "true,false,false,");
  });

  test("handles @last in loop", () => {
    const result = renderPrompt("{{#each items}}{{@last}},{{/each}}", {
      items: ["a", "b", "c"],
    });
    assert.strictEqual(result, "false,false,true,");
  });

  test("escapes loop items by default", () => {
    const result = renderPrompt("{{#each items}}{{this}}{{/each}}", {
      items: ["<b>"],
    });
    assert.strictEqual(result, "&lt;b&gt;");
  });

  test("renders raw loop items with triple braces", () => {
    const result = renderPrompt("{{#each items}}{{{this}}}{{/each}}", {
      items: ["<b>bold</b>"],
    });
    assert.strictEqual(result, "<b>bold</b>");
  });

  test("throws when looping over non-array in strict mode", () => {
    assert.throws(
      () => renderPrompt("{{#each items}}{{this}}{{/each}}", { items: "not-array" }),
      (err: unknown) => {
        return err instanceof RenderError && err.code === "NOT_ARRAY";
      }
    );
  });

  test("renders empty string for non-array in non-strict mode", () => {
    const result = renderPrompt(
      "{{#each items}}{{this}}{{/each}}",
      { items: "not-array" },
      { strict: false }
    );
    assert.strictEqual(result, "");
  });

  test("accesses outer context in loop", () => {
    const result = renderPrompt("{{#each items}}{{prefix}}{{this}},{{/each}}", {
      prefix: "item:",
      items: ["a", "b"],
    });
    assert.strictEqual(result, "item:a,item:b,");
  });
});

describe("Prompt Renderer - Validation", () => {
  test("validateContext returns valid for all present variables", () => {
    const result = validateContext("{{name}} {{age}}", { name: "Alice", age: 30 });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.missing, undefined);
  });

  test("validateContext returns missing variables", () => {
    const result = validateContext("{{name}} {{age}}", { name: "Alice" });
    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.missing, ["age"]);
  });

  test("validateContext detects variables in conditionals", () => {
    const result = validateContext("{{#if show}}{{name}}{{/if}}", { show: true });
    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.missing, ["name"]);
  });

  test("validateContext detects variables in loops", () => {
    const result = validateContext("{{#each items}}{{this}}{{/each}}", {});
    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.missing, ["items"]);
  });

  test("validateContext handles dot notation", () => {
    const result = validateContext("{{user.name}}", { user: { name: "Alice" } });
    assert.strictEqual(result.valid, true);
  });
});

describe("Prompt Renderer - Hashing", () => {
  test("computes consistent content hash", () => {
    const hash1 = computeContentHash("test content");
    const hash2 = computeContentHash("test content");
    assert.strictEqual(hash1, hash2);
  });

  test("computes different hashes for different content", () => {
    const hash1 = computeContentHash("content1");
    const hash2 = computeContentHash("content2");
    assert.notStrictEqual(hash1, hash2);
  });

  test("renderPromptTemplate includes hashes", () => {
    const template: PromptTemplate = {
      id: "test",
      content: "Hello {{name}}!",
      metadata: { id: "test", title: "Test" },
      contentHash: computeContentHash("Hello {{name}}!"),
    };

    const result = renderPromptTemplate(template, { name: "World" });
    assert.strictEqual(result.rendered, "Hello World!");
    assert.ok(result.hash);
    assert.strictEqual(result.hash, computeContentHash("Hello World!"));
  });
});

describe("Prompt Renderer - Complex Templates", () => {
  test("renders template with multiple features", () => {
    const template = `
# {{title}}

{{#if hasErrors}}
Errors found:
{{#each errors}}
- {{this}}
{{/each}}
{{else}}
No errors found.
{{/if}}

Status: {{status}}
`;

    const result = renderPrompt(template, {
      title: "Report",
      hasErrors: true,
      errors: ["Error 1", "Error 2"],
      status: "Complete",
    });

    assert.ok(result.includes("# Report"));
    assert.ok(result.includes("Errors found:"));
    assert.ok(result.includes("- Error 1"));
    assert.ok(result.includes("- Error 2"));
    assert.ok(result.includes("Status: Complete"));
  });

  test("renders merge conflict resolution template", () => {
    const template = `# 🔀 Merge Conflict Resolution

Conflicts detected in {{fileName}}

## Resolution Strategy

1. Read the conflict context
2. Use replace_string_in_file
3. Verify with get_errors

Conflict count: {{conflictCount}}
Branch: {{branch}}`;

    const result = renderPrompt(template, {
      fileName: "src/cli.ts",
      conflictCount: 3,
      branch: "feature/new-feature",
    });

    assert.ok(result.includes("src/cli.ts"));
    assert.ok(result.includes("Conflict count: 3"));
    assert.ok(result.includes("Branch: feature/new-feature"));
  });
});
