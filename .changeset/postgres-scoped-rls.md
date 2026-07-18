---
"@smartergpt/lex": major
---

Add the Lex 3.0 PostgreSQL scoped FrameStore runtime and separate administration boundaries.
Protect every normal Frame operation with explicit tenant/workspace/principal predicates,
transaction-local pool context, forced Row-Level Security, runtime-role safety checks, and
credential-free deterministic tests. Migrate schema v1 rows into an admin-only unowned quarantine
instead of guessing ownership, and expose a non-mutating migration plan before schema v2 is applied.
