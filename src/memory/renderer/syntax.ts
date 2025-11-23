import { getLogger } from "@smartergpt/lex/logger";
import { codeToHtml } from "shiki";
// Future: createHighlighter for custom syntax themes
// import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";

const logger = getLogger("memory:renderer:syntax");

// Common languages supported
export const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "php",
  "java",
  "go",
  "rust",
  "cpp",
  "c",
  "csharp",
  "ruby",
  "swift",
  "kotlin",
  "sql",
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "bash",
  "shell",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Language detection from file extension or content
const LANGUAGE_EXTENSIONS: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  php: "php",
  java: "java",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  cs: "csharp",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  sql: "sql",
  html: "html",
  css: "css",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
};

/**
 * Detect language from file extension
 */
export function detectLanguageFromExtension(filename: string): BundledLanguage {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && ext in LANGUAGE_EXTENSIONS ? LANGUAGE_EXTENSIONS[ext] : "typescript"; // Default to TypeScript
}

/**
 * Highlight code with syntax highlighting
 *
 * @param code - Code to highlight
 * @param language - Programming language
 * @param theme - Color theme (default: 'dark-plus' to match VS Code)
 * @returns HTML string with syntax highlighting
 */
export async function highlightCode(
  code: string,
  language: BundledLanguage = "typescript",
  theme: "dark-plus" | "light-plus" = "dark-plus"
): Promise<string> {
  try {
    const html = await codeToHtml(code, {
      lang: language,
      theme: theme,
    });
    return html;
  } catch (error) {
    // Fallback to plain text if highlighting fails
    logger.error({ err: error, language }, "Syntax highlighting failed");
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

/**
 * Highlight a diff with syntax highlighting
 * Preserves +/- indicators while applying syntax highlighting
 *
 * @param diff - Unified diff string
 * @param language - Programming language
 * @param theme - Color theme
 * @returns HTML string with syntax highlighted diff
 */
export async function highlightDiff(
  diff: string,
  language: BundledLanguage = "typescript",
  theme: "dark-plus" | "light-plus" = "dark-plus"
): Promise<string> {
  try {
    const lines = diff.split("\n");
    const processedLines: string[] = [];

    for (const line of lines) {
      if (!line) {
        processedLines.push("");
        continue;
      }

      const firstChar = line[0];
      const isAddition = firstChar === "+";
      const isDeletion = firstChar === "-";
      const isUnchanged = firstChar === " ";

      if (isAddition || isDeletion || isUnchanged) {
        // Extract the code without the diff marker
        const code = line.substring(1);

        // Highlight the code
        const highlighted = await codeToHtml(code, {
          lang: language,
          theme: theme,
        });

        // Extract just the highlighted content (remove outer pre/code tags)
        const match = highlighted.match(/<code[^>]*>(.*?)<\/code>/s);
        const highlightedContent = match ? match[1] : escapeHtml(code);

        // Wrap in appropriate styling based on diff type
        let className = "";
        let prefix = "";

        if (isAddition) {
          className = "diff-addition";
          prefix = "+";
        } else if (isDeletion) {
          className = "diff-deletion";
          prefix = "-";
        } else {
          className = "diff-unchanged";
          prefix = " ";
        }

        processedLines.push(
          `<div class="${className}"><span class="diff-marker">${prefix}</span>${highlightedContent}</div>`
        );
      } else {
        // Context line (file headers, line numbers, etc.)
        processedLines.push(`<div class="diff-context">${escapeHtml(line)}</div>`);
      }
    }

    return `<div class="diff-container">${processedLines.join("\n")}</div>`;
  } catch (error) {
    logger.error({ err: error }, "Diff highlighting failed");
    // Fallback to plain diff
    return `<pre class="diff-fallback"><code>${escapeHtml(diff)}</code></pre>`;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): language is BundledLanguage {
  return SUPPORTED_LANGUAGES.includes(language as any);
}
