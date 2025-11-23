/**
 * Prompt Template Renderer
 *
 * Provides deterministic, strict rendering of prompt templates with:
 * - Variable substitution: {{variable}}
 * - Conditionals: {{#if condition}}...{{else}}...{{/if}}
 * - Loops: {{#each items}}...{{/each}}
 * - HTML escaping by default
 * - Raw output: {{{raw}}}
 * - Strict mode: throws on unknown variables
 */

import { createHash } from "crypto";
import {
  RenderContext,
  RenderOptions,
  RenderError,
  ValidationResult,
  PromptTemplate,
  RenderedPrompt,
} from "./types.js";

/**
 * HTML escape map for security
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Compute SHA256 hash of a string
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Extract all variable references from a template
 * Matches: {{var}}, {{{var}}}, {{#if var}}, {{#each var}}
 */
function extractVariables(template: string): string[] {
  const variables = new Set<string>();

  // Match control structures: {{#if var}} and {{#each var}}
  const controlRegex = /\{\{#(if|each)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g;
  let match;

  while ((match = controlRegex.exec(template)) !== null) {
    const varName = match[2];
    variables.add(varName.split(".")[0]);
  }

  // Match regular variables: {{var}} and {{{var}}}
  // But NOT inside {{#each}}...{{/each}} blocks where {{this}} is valid
  // Remove {{#each}} blocks first
  let cleanedTemplate = template.replace(
    /\{\{#each\s+[a-zA-Z_][a-zA-Z0-9_\.]*\s*\}\}[\s\S]*?\{\{\/each\}\}/g,
    ""
  );

  const varRegex = /\{\{[\{]?\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*[\}]?\}\}/g;

  while ((match = varRegex.exec(cleanedTemplate)) !== null) {
    const varName = match[1];

    // Skip control keywords and special variables
    if (
      varName.startsWith("#") ||
      varName.startsWith("/") ||
      varName === "else" ||
      varName === "this" ||
      varName.startsWith("@")
    ) {
      continue;
    }

    variables.add(varName.split(".")[0]);
  }

  return Array.from(variables).sort();
}

/**
 * Resolve a dot-notation path in context (e.g., "user.name")
 */
function resolvePath(context: RenderContext, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Validate that all required variables are present in context
 */
export function validateContext(template: string, context: RenderContext): ValidationResult {
  const variables = extractVariables(template);
  const missing: string[] = [];

  for (const varName of variables) {
    if (!(varName in context)) {
      // Check if this variable is ONLY used in {{#if}} conditions
      // {{#each}} variables are always required, {{#if}} variables are optional
      const eachPattern = new RegExp(`\\{\\{#each\\s+${varName}(?:\\s|\\})`);
      const ifConditionPattern = new RegExp(`\\{\\{#if\\s+${varName}(?:\\s|\\})`);
      const otherUsagePattern = new RegExp(`\\{\\{[\\{]?\\s*${varName}(?:\\s|\\}|\\.)`, "g");

      // If used in {{#each}}, it's required
      if (eachPattern.test(template)) {
        missing.push(varName);
        continue;
      }

      const matches = template.match(otherUsagePattern) || [];
      const ifMatches = template.match(ifConditionPattern) || [];

      // If all matches are {{#if varName}}, then it's optional
      if (matches.length > ifMatches.length) {
        missing.push(varName);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/**
 * Render a prompt template with variable substitution and control structures
 *
 * @param template - Template string with {{}} syntax
 * @param context - Variables to substitute
 * @param options - Rendering options (strict mode, escaping)
 * @returns Rendered string
 *
 * @example
 * ```typescript
 * const result = renderPrompt("Hello {{name}}!", { name: "World" });
 * // => "Hello World!"
 * ```
 *
 * @example Conditionals
 * ```typescript
 * const result = renderPrompt(
 *   "{{#if hasError}}Error: {{error}}{{/if}}",
 *   { hasError: true, error: "Not found" }
 * );
 * // => "Error: Not found"
 * ```
 *
 * @example Loops
 * ```typescript
 * const result = renderPrompt(
 *   "{{#each items}}{{this}}, {{/each}}",
 *   { items: ["a", "b", "c"] }
 * );
 * // => "a, b, c, "
 * ```
 */
export function renderPrompt(
  template: string,
  context: RenderContext,
  options: RenderOptions = {}
): string {
  const { strict = true, escapeHtml: shouldEscape = true } = options;

  // Validate context in strict mode
  if (strict) {
    const validation = validateContext(template, context);
    if (!validation.valid) {
      throw new RenderError(
        `Missing required variables: ${validation.missing?.join(", ")}`,
        "MISSING_VARIABLES",
        { missing: validation.missing }
      );
    }
  }

  let result = template;

  // Process control structures first (if/each)
  result = processConditionals(result, context, strict, shouldEscape);
  result = processLoops(result, context, strict, shouldEscape);

  // Process raw variables {{{var}}} (no escaping)
  result = result.replace(/\{\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}\}/g, (match, varName) => {
    const value = resolvePath(context, varName);
    if (value === undefined || value === null) {
      if (strict) {
        throw new RenderError(`Variable "${varName}" is undefined`, "UNDEFINED_VARIABLE", {
          variable: varName,
        });
      }
      return "";
    }
    return String(value);
  });

  // Process regular variables {{var}} (with escaping if enabled)
  result = result.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g, (match, varName) => {
    const value = resolvePath(context, varName);
    if (value === undefined || value === null) {
      if (strict) {
        throw new RenderError(`Variable "${varName}" is undefined`, "UNDEFINED_VARIABLE", {
          variable: varName,
        });
      }
      return "";
    }
    const strValue = String(value);
    return shouldEscape ? escapeHtml(strValue) : strValue;
  });

  return result;
}

/**
 * Process {{#if condition}}...{{else}}...{{/if}} blocks
 */
function processConditionals(
  template: string,
  context: RenderContext,
  _strict: boolean,
  _shouldEscape: boolean
): string {
  // Match nested if/else/endif blocks
  const ifRegex =
    /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

  let result = template;
  let match;
  let maxIterations = 100; // Prevent infinite loops

  // Process from innermost to outermost
  while ((match = ifRegex.exec(result)) !== null && maxIterations-- > 0) {
    const [fullMatch, varName, trueBlock, falseBlock] = match;
    const value = resolvePath(context, varName);

    // Check truthiness (undefined is allowed in conditionals - it's falsy)
    const isTruthy = Boolean(value);
    const replacement = isTruthy ? trueBlock || "" : falseBlock || "";

    result =
      result.substring(0, match.index) +
      replacement +
      result.substring(match.index + fullMatch.length);

    // Reset regex to process nested blocks
    ifRegex.lastIndex = 0;
  }

  return result;
}

/**
 * Process {{#each items}}...{{/each}} blocks
 */
function processLoops(
  template: string,
  context: RenderContext,
  strict: boolean,
  shouldEscape: boolean
): string {
  const eachRegex = /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;

  let result = template;
  let match;
  let maxIterations = 100; // Prevent infinite loops

  while ((match = eachRegex.exec(result)) !== null && maxIterations-- > 0) {
    const [fullMatch, varName, loopBody] = match;
    const items = resolvePath(context, varName);

    if (!Array.isArray(items)) {
      if (strict && items !== undefined && items !== null) {
        throw new RenderError(`Variable "${varName}" is not an array`, "NOT_ARRAY", {
          variable: varName,
          value: items,
        });
      }
      // Replace with empty string if not an array
      result = result.substring(0, match.index) + result.substring(match.index + fullMatch.length);
      eachRegex.lastIndex = 0;
      continue;
    }

    // Render each item
    let loopOutput = "";
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemContext = {
        ...context,
        this: item,
        "@index": i,
        "@first": i === 0,
        "@last": i === items.length - 1,
      };

      // Render loop body with item context
      let itemOutput = loopBody;

      // Replace {{{this}}} with item value (no escaping) - MUST BE FIRST
      itemOutput = itemOutput.replace(/\{\{\{\s*this\s*\}\}\}/g, () => {
        return String(item);
      });

      // Replace {{this}} with item value (with escaping)
      itemOutput = itemOutput.replace(/\{\{\s*this\s*\}\}/g, () => {
        const strValue = String(item);
        return shouldEscape ? escapeHtml(strValue) : strValue;
      });

      // Replace other variables in item context
      itemOutput = itemOutput.replace(/\{\{\s*([a-zA-Z_@][a-zA-Z0-9_\.]*)\s*\}\}/g, (m, v) => {
        if (v === "this") return String(item); // Already handled but just in case
        const val = resolvePath(itemContext, v);
        if (val === undefined || val === null) {
          if (strict && !(v in itemContext)) {
            throw new RenderError(
              `Variable "${v}" is undefined in loop context`,
              "UNDEFINED_VARIABLE",
              { variable: v }
            );
          }
          return "";
        }
        const strValue = String(val);
        return shouldEscape ? escapeHtml(strValue) : strValue;
      });

      loopOutput += itemOutput;
    }

    result =
      result.substring(0, match.index) +
      loopOutput +
      result.substring(match.index + fullMatch.length);
    eachRegex.lastIndex = 0;
  }

  return result;
}

/**
 * Render a prompt template with full metadata and hashing
 */
export function renderPromptTemplate(
  template: PromptTemplate,
  context: RenderContext,
  options: RenderOptions = {}
): RenderedPrompt {
  const rendered = renderPrompt(template.content, context, options);
  const hash = computeHash(rendered);

  return {
    template,
    rendered,
    context,
    hash,
  };
}

/**
 * Compute content hash for a template
 */
export function computeContentHash(content: string): string {
  return computeHash(content);
}
