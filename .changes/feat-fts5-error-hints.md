# fix(search): FTS5 punctuation hints & empty results

This commit contains the PR description and a small note for #147. It explains the reproduction and the intended hinting behavior when FTS5 returns punctuation-only results.

Acceptance Criteria:
- Draft PR opened and linked to #147
- Local validation: `npm test` and `lex recall "0.3.0"` smoke should produce a helpful stderr hint and exit 0

Notes:
- Small, non-invasive description to trigger CI and gather review feedback.
