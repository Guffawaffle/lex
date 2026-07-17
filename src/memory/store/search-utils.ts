import type { FrameSearchCriteria } from "./frame-store.js";
import { normalizeFTS5Query } from "./fts5-utils.js";

export interface NormalizedSearchTerm {
  value: string;
  prefix: boolean;
}

/** Normalize user search text once for equivalent backend-specific matching. */
export function normalizeSearchTerms(criteria: FrameSearchCriteria): NormalizedSearchTerm[] {
  if (!criteria.query) return [];
  const normalized = normalizeFTS5Query(criteria.query, criteria.exact, criteria.mode);
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .filter((term) => term !== "OR")
    .map((term) => ({
      value: (term.endsWith("*") ? term.slice(0, -1) : term).toLowerCase(),
      prefix: term.endsWith("*"),
    }))
    .filter((term) => term.value.length > 0);
}
