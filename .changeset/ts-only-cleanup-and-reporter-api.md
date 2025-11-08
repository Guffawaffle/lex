---
"lex": minor
---

Add TS-only source enforcement (removed redundant hand-authored .js siblings) and enhance policy reporter API:

- Refactor generateReport to accept an options object `{ policy?, format?, strict? }` for forward compatibility.
- Inject optional policy header (text/markdown) with derived module count identifier.
- Add reporter unit tests covering text/json/markdown variants with and without policy.
- Maintain existing printReport behavior (backward compatibility) while enabling future extension (e.g., severity levels, output targets).

This is a minor version bump due to public API surface change (signature flexibility) and developer ergonomics improvements.
