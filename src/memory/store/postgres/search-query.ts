import type { FrameSearchCriteria } from "../frame-store.js";
import { normalizeSearchTerms } from "../search-utils.js";

export interface PostgresTextSearchQuery {
  /** Existing cross-backend token/prefix contract translated to PostgreSQL tsquery syntax. */
  readonly normalizedTsQuery: string;
  /** Raw user text parsed by PostgreSQL exactly as stored search-vector source text is parsed. */
  readonly rawPlainQuery: string;
}

/**
 * Build both sides of PostgreSQL's text-search parity predicate.
 *
 * PostgreSQL preserves signed numeric lexemes in compounds such as AX-001 and
 * 2026-08-28, while the shared SQLite-compatible normalizer intentionally
 * strips punctuation. Searching both parameterized representations preserves
 * normalized exact/prefix semantics and also matches PostgreSQL's stored parser
 * output without a schema rewrite.
 */
export function buildPostgresTextSearchQuery(
  criteria: FrameSearchCriteria
): PostgresTextSearchQuery | null {
  const terms = normalizeSearchTerms(criteria).map((term) =>
    term.prefix ? `${term.value}:*` : term.value
  );
  if (terms.length === 0) return null;
  return Object.freeze({
    normalizedTsQuery: terms.join(criteria.mode === "any" ? " | " : " & "),
    rawPlainQuery: criteria.query?.trim() ?? "",
  });
}
