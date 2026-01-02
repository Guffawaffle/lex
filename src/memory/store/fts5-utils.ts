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
 * Normalize a search query for FTS5 compatibility with automatic prefix matching.
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
 * for hyphenated terms like "senior-dev" or "AX-manifesto-2025",
 * and automatically adds prefix wildcards for fuzzy matching.
 *
 * Fuzzy matching allows "debug" to match "debugging", "AX" to match "AX-006", etc.
 *
 * @example
 * normalizeFTS5Query("senior-dev")                    // "senior* dev*"
 * normalizeFTS5Query("AX-001")                        // "AX* 001*"
 * normalizeFTS5Query("datab*")                        // "datab*" (preserved - already has wildcard)
 * normalizeFTS5Query("debug")                         // "debug*" (adds wildcard for fuzzy matching)
 * normalizeFTS5Query("*test")                         // "test*" (leading asterisk removed, trailing added)
 * normalizeFTS5Query("merge:weave")                   // "merge* weave*"
 * normalizeFTS5Query("test  search")                  // "test* search*"
 * normalizeFTS5Query("credential checking", false, "any")  // "credential* OR checking*"
 * normalizeFTS5Query("api performance", false, "all")      // "api* performance*" (default AND)
 *
 * @param query - User's raw search query
 * @param exact - If true, skip automatic prefix wildcards for exact matching (default: false)
 * @param mode - Search mode: 'all' (AND, default) or 'any' (OR)
 * @returns Normalized query safe for FTS5 MATCH
 */
export function normalizeFTS5Query(
  query: string,
  exact = false,
  mode: "all" | "any" = "all"
): string {
  const normalized = query
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
    .trim();

  // If exact matching is requested, return without adding wildcards but still apply mode
  if (!normalized) {
    return normalized;
  }

  // Split into terms and optionally add wildcards
  const terms = normalized
    .split(" ")
    .map((term) => {
      // Skip empty terms
      if (!term) return "";

      // If exact mode, don't add wildcards (but preserve user-provided ones)
      if (exact) return term;

      // Don't add wildcard if term already has one
      if (term.endsWith("*")) return term;
      // Add prefix wildcard for fuzzy matching
      return term + "*";
    })
    .filter((term) => term.length > 0);

  // Join terms based on search mode
  if (mode === "any") {
    // OR mode: join with " OR " for FTS5
    return terms.join(" OR ");
  } else {
    // AND mode (default): join with space (implicit AND in FTS5)
    return terms.join(" ");
  }
}
