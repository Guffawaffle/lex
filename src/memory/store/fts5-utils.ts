/**
 * FTS5 Query Utilities
 *
 * Utilities for normalizing and handling SQLite FTS5 full-text search queries.
 *
 * FTS5 has special query syntax that can cause unexpected behavior when users
 * search with natural language patterns (like hyphenated terms). These utilities
 * normalize user queries for FTS5 compatibility.
 */

/**
 * Normalize a search query for FTS5 compatibility.
 *
 * FTS5 has special syntax that can cause unexpected behavior:
 * - Hyphens (-) are interpreted as negation operators (NOT)
 * - Colons (:) are used for column-specific searches
 * - Asterisks (*) at the END of a word are valid prefix wildcards (preserved)
 * - Asterisks (*) at the START are invalid (removed)
 * - Quotes (") group phrases
 * - Other special chars can cause syntax errors
 *
 * This function normalizes queries so users can search naturally
 * for hyphenated terms like "senior-dev" or "AX-manifesto-2025".
 *
 * @example
 * normalizeFTS5Query("senior-dev")     // "senior dev"
 * normalizeFTS5Query("AX-001")         // "AX 001"
 * normalizeFTS5Query("datab*")         // "datab*" (preserved - valid prefix query)
 * normalizeFTS5Query("*test")          // "test" (leading asterisk removed)
 * normalizeFTS5Query("merge:weave")    // "merge weave"
 * normalizeFTS5Query("test  search")   // "test search"
 *
 * @param query - User's raw search query
 * @returns Normalized query safe for FTS5 MATCH
 */
export function normalizeFTS5Query(query: string): string {
  return (
    query
      // Replace hyphens with spaces (FTS5 treats hyphens as negation)
      .replace(/-/g, " ")
      // Replace FTS5 special characters with spaces, but preserve trailing asterisks
      // First, temporarily protect trailing asterisks
      .replace(/(\w)\*/g, "$1__ASTERISK__")
      // Now remove all other special chars
      .replace(/[^a-zA-Z0-9\s_]/g, " ")
      // Restore trailing asterisks
      .replace(/__ASTERISK__/g, "*")
      // Collapse multiple spaces to single space
      .replace(/\s+/g, " ")
      // Trim leading/trailing whitespace
      .trim()
  );
}
