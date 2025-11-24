/**
 * Integration tests for prompt renderer with token expansion
 *
 * Tests the integration of token expansion with the existing
 * prompt rendering system (variables, conditionals, loops)
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { renderPrompt } from "../../../src/shared/prompts/renderer.js";

describe("Prompt Renderer - Token Expansion Integration", () => {
  test("expands tokens before rendering variables", () => {
    const testDate = new Date("2025-11-09T12:00:00Z");
    const result = renderPrompt(
      "Date: {{today}}, Name: {{name}}",
      { name: "Test" },
      {
        expandTokens: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "Date: 2025-11-09, Name: Test");
  });

  test("expands tokens in conditional blocks", () => {
    const testDate = new Date("2025-11-09T00:00:00Z");
    const result = renderPrompt(
      "{{#if show}}Created on {{today}}{{/if}}",
      { show: true },
      {
        expandTokens: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "Created on 2025-11-09");
  });

  test("expands tokens in loop blocks", () => {
    const testDate = new Date("2025-11-09T00:00:00Z");
    const result = renderPrompt(
      "{{#each items}}{{this}}-{{today}}, {{/each}}",
      { items: ["a", "b"] },
      {
        expandTokens: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "a-2025-11-09, b-2025-11-09, ");
  });

  test("works with all token types in template", () => {
    const testDate = new Date("2025-11-09T15:30:00Z");
    const result = renderPrompt(
      "Repository: {{repo_root}}\nBranch: {{branch}}\nCommit: {{commit}}\nDate: {{today}}\nTime: {{now}}\nWorkspace: {{workspace_root}}",
      {},
      {
        expandTokens: true,
        tokenContext: {
          today: testDate,
          now: testDate,
          repoRoot: "/test/repo",
          workspaceRoot: "/workspace",
          branch: "main",
          commit: "abc1234",
        },
      }
    );
    assert.strictEqual(
      result,
      "Repository: /test/repo\nBranch: main\nCommit: abc1234\nDate: 2025-11-09\nTime: 20251109T153000\nWorkspace: /workspace"
    );
  });

  test("token expansion can be disabled", () => {
    const result = renderPrompt(
      "{{today}} and {{name}}",
      { name: "Test", today: "literal-today" },
      {
        expandTokens: false,
      }
    );
    // {{today}} should be treated as a regular variable (not expanded as a token)
    // {{name}} should also be expanded as a variable
    assert.strictEqual(result, "literal-today and Test");
  });

  test("strict mode does not complain about tokens", () => {
    const testDate = new Date("2025-11-09");
    // This should not throw even though "today" is not in the context
    // because it's a known token
    const result = renderPrompt(
      "{{today}}",
      {},
      {
        strict: true,
        expandTokens: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "2025-11-09");
  });

  test("combines token expansion with HTML escaping", () => {
    const testDate = new Date("2025-11-09");
    const result = renderPrompt(
      "{{today}}: {{html}}",
      { html: "<script>alert('xss')</script>" },
      {
        expandTokens: true,
        escapeHtml: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "2025-11-09: &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  test("tokens work with raw variable syntax", () => {
    const testDate = new Date("2025-11-09");
    const result = renderPrompt(
      "Date: {{today}}, Raw: {{{html}}}",
      { html: "<b>bold</b>" },
      {
        expandTokens: true,
        tokenContext: { today: testDate },
      }
    );
    assert.strictEqual(result, "Date: 2025-11-09, Raw: <b>bold</b>");
  });

  test("real-world example: deliverable path with tokens", () => {
    const testDate = new Date("2025-11-09T12:34:56Z");
    const template = "{{repo_root}}/.smartergpt/deliverables/weave-{{today}}-{{now}}";
    const result = renderPrompt(
      template,
      {},
      {
        expandTokens: true,
        tokenContext: {
          today: testDate,
          now: testDate,
          repoRoot: "/home/user/project",
        },
      }
    );
    assert.strictEqual(
      result,
      "/home/user/project/.smartergpt/deliverables/weave-2025-11-09-20251109T123456"
    );
  });

  test("real-world example: kickoff prompt with tokens", () => {
    const testDate = new Date("2025-11-09T10:00:00Z");
    const template = `UMBRELLA_NAME: umbrella-{{today}}-{{now}}
PROMPT_FILE: {{repo_root}}/.smartergpt/prompts/merge-weave-main.md
BRANCH: {{branch}}
COMMIT: {{commit}}`;

    const result = renderPrompt(
      template,
      {},
      {
        expandTokens: true,
        tokenContext: {
          today: testDate,
          now: testDate,
          repoRoot: "/project",
          branch: "feature",
          commit: "abc1234",
        },
      }
    );

    assert.strictEqual(
      result,
      `UMBRELLA_NAME: umbrella-2025-11-09-20251109T100000
PROMPT_FILE: /project/.smartergpt/prompts/merge-weave-main.md
BRANCH: feature
COMMIT: abc1234`
    );
  });

  test("real-world example: profile.yml with tokens", () => {
    const testDate = new Date("2025-11-09T12:00:00");
    const template = `created: "{{today}}T12:00:00Z"
workspace: "{{workspace_root}}"
branch: "{{branch}}"`;

    const result = renderPrompt(
      template,
      {},
      {
        expandTokens: true,
        escapeHtml: false, // YAML doesn't need HTML escaping
        tokenContext: {
          today: testDate,
          workspaceRoot: "/workspace",
          branch: "main",
        },
      }
    );

    assert.strictEqual(
      result,
      `created: "2025-11-09T12:00:00Z"
workspace: "/workspace"
branch: "main"`
    );
  });
});
