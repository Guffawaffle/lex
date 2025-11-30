/**
 * Marker System Module
 *
 * Provides utilities for wrapping and extracting Lex-generated content
 * using HTML comment markers. Enables idempotent updates while preserving
 * human content outside the marked region.
 */

/**
 * Opening marker for Lex-generated content.
 * Uses HTML comment syntax for compatibility with Markdown files.
 */
export const LEX_BEGIN = "<!-- LEX:BEGIN -->";

/**
 * Closing marker for Lex-generated content.
 * Uses HTML comment syntax for compatibility with Markdown files.
 */
export const LEX_END = "<!-- LEX:END -->";

/**
 * Result of extracting marked content from a file.
 */
export interface ExtractedContent {
  /** Content before the LEX:BEGIN marker */
  before: string;
  /** Content between LEX:BEGIN and LEX:END markers, or null if not found */
  lex: string | null;
  /** Content after the LEX:END marker */
  after: string;
}

/**
 * Wrap content with LEX markers for idempotent updates.
 *
 * @param content - The Lex-generated content to wrap
 * @returns Content wrapped with LEX:BEGIN and LEX:END markers
 *
 * @example
 * ```ts
 * const wrapped = wrapWithMarkers("# My Section\n\nGenerated content here.");
 * // Returns:
 * // <!-- LEX:BEGIN -->
 * // # My Section
 * //
 * // Generated content here.
 * // <!-- LEX:END -->
 * ```
 */
export function wrapWithMarkers(content: string): string {
  return `${LEX_BEGIN}\n${content}\n${LEX_END}`;
}

/**
 * Extract marked content from a file, separating human and Lex content.
 *
 * Handles various edge cases:
 * - File with no markers: returns content in `before`, `lex` is null, `after` is empty
 * - Malformed markers (only BEGIN or only END): treats as no markers
 * - Multiple marker pairs: extracts first complete pair only
 *
 * @param fileContent - The full content of the file
 * @returns Object with `before`, `lex` (or null), and `after` content
 *
 * @example
 * ```ts
 * // File with markers
 * const result = extractMarkedContent("Human intro\n<!-- LEX:BEGIN -->\nGenerated\n<!-- LEX:END -->\nHuman outro");
 * // Returns: { before: "Human intro\n", lex: "Generated", after: "\nHuman outro" }
 *
 * // File without markers
 * const result2 = extractMarkedContent("Just human content");
 * // Returns: { before: "Just human content", lex: null, after: "" }
 * ```
 */
export function extractMarkedContent(fileContent: string): ExtractedContent {
  const beginIndex = fileContent.indexOf(LEX_BEGIN);
  const endIndex = fileContent.indexOf(LEX_END);

  // No markers or malformed (missing one of the markers or END before BEGIN)
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    return {
      before: fileContent,
      lex: null,
      after: "",
    };
  }

  // Calculate content boundaries
  const beforeEnd = beginIndex;
  const afterStart = endIndex + LEX_END.length;

  // Calculate lex content boundaries, handling optional newlines
  let lexStart = beginIndex + LEX_BEGIN.length;
  let lexEnd = endIndex;

  // Skip leading newline after BEGIN marker if present
  if (fileContent[lexStart] === "\n") {
    lexStart += 1;
  }

  // Skip trailing newline before END marker if present
  if (lexEnd > lexStart && fileContent[lexEnd - 1] === "\n") {
    lexEnd -= 1;
  }

  // Extract the sections
  const before = fileContent.slice(0, beforeEnd);
  const after = fileContent.slice(afterStart);

  // Extract lex content (may be empty if markers are adjacent)
  const lex = lexStart >= lexEnd ? "" : fileContent.slice(lexStart, lexEnd);

  return {
    before,
    lex,
    after,
  };
}

/**
 * Replace the marked section in a file with new Lex content.
 *
 * If the file has no existing markers, appends the wrapped content at the end.
 *
 * @param fileContent - The full content of the file
 * @param newLexContent - The new Lex-generated content (will be wrapped with markers)
 * @returns The file content with the marked section replaced
 *
 * @example
 * ```ts
 * // Replace existing marked section
 * const result = replaceMarkedContent(
 *   "Human intro\n<!-- LEX:BEGIN -->\nOld content\n<!-- LEX:END -->\nHuman outro",
 *   "New content"
 * );
 * // Returns: "Human intro\n<!-- LEX:BEGIN -->\nNew content\n<!-- LEX:END -->\nHuman outro"
 *
 * // File without markers (appends)
 * const result2 = replaceMarkedContent("Human content", "Generated content");
 * // Returns: "Human content\n\n<!-- LEX:BEGIN -->\nGenerated content\n<!-- LEX:END -->"
 * ```
 */
export function replaceMarkedContent(
  fileContent: string,
  newLexContent: string
): string {
  const extracted = extractMarkedContent(fileContent);

  if (extracted.lex === null) {
    // No existing markers - append at end with a blank line separator
    const separator = fileContent.endsWith("\n") ? "\n" : "\n\n";
    return `${fileContent}${separator}${wrapWithMarkers(newLexContent)}`;
  }

  // Replace existing marked section
  return `${extracted.before}${wrapWithMarkers(newLexContent)}${extracted.after}`;
}
