import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPostgresTextSearchQuery } from "@app/memory/store/postgres/search-query.js";

describe("PostgreSQL text-search query parity", () => {
  test("retains normalized exact tokens and raw compound text", () => {
    assert.deepEqual(
      buildPostgresTextSearchQuery({
        query: "aligned-stack-dogfood-2026-08-28",
        exact: true,
      }),
      {
        normalizedTsQuery: "aligned & stack & dogfood & 2026 & 08 & 28",
        rawPlainQuery: "aligned-stack-dogfood-2026-08-28",
      }
    );
  });

  test("preserves prefix and any-mode normalization", () => {
    assert.deepEqual(buildPostgresTextSearchQuery({ query: "AX-001 release", mode: "any" }), {
      normalizedTsQuery: "ax:* | 001:* | release:*",
      rawPlainQuery: "AX-001 release",
    });
  });

  test("keeps punctuation-only input on the existing no-query path", () => {
    assert.equal(buildPostgresTextSearchQuery({ query: "--- !!!", exact: true }), null);
  });
});
