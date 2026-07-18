---
"@smartergpt/lex": major
---

Add the Lex 3.0 PostgreSQL scoped FrameStore runtime and separate administration boundaries.
Protect every normal Frame operation with explicit tenant/workspace/principal predicates,
transaction-local pool context, forced Row-Level Security, runtime-role safety checks, and
credential-free deterministic tests. Bind every relation and helper function to an explicit,
validated PostgreSQL schema, including the transitional adapter, and preserve every Frame v7 field
through a versioned metadata payload.
Migrate schema v1 rows into an admin-only unowned quarantine instead of guessing ownership, and
expose a non-mutating migration plan before schema v3 is applied.
Reject runtime roles with effective `CREATE` on the protected FrameStore schema, including
privileges inherited through `PUBLIC` or group roles.
