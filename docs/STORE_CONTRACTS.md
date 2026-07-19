# Store Contracts

## Overview

Lex exposes persistence contracts that abstract database operations behind interfaces. The
current normative details, including version domains and Frame record semantics, live in
[`src/memory/store/CONTRACT.md`](../src/memory/store/CONTRACT.md).

| Deployment need | Use |
|---|---|
| One trusted local workspace | Default SQLite store |
| Compatibility shared store without tenant isolation | Explicit unscoped PostgreSQL adapter |
| Trusted multi-workspace or multi-tenant host | Runtime scope, canonical authority, and a scope-bound PostgreSQL store with forced RLS |

The compatibility PostgreSQL adapter is not a tenant authorization boundary.

## FrameStore

`FrameStore` is the persistence contract for Frames (episodic memory snapshots).

### Common operations

- `saveFrame(frame)` — Persist a Frame
- `getFrameById(id)` — Retrieve by ID
- `searchFrames(criteria)` — Full-text search
- `listFrames(options)` — Paginated listing
- `updateFrame(id, updates)` — Atomic partial merge that preserves `id`, `timestamp`, and unrelated
  fields under concurrent updates
- `deleteFrame(id)` / bulk deletion — Remove visible records when authorized
- `close()` — Release resources

### Record Identity and Mutability

Frame `id` values are opaque strings; UUID/ULID formats are conventions rather than validation
requirements. `saveFrame` is an idempotent upsert. Targeted updates, deletion, and
`superseded_by`/`merged_from` consolidation are implemented behavior, so Frames are not described
as blanket-immutable. Frame payloads have no normative `parent_id` or lifecycle-state field.

### Search Semantics

- `query` is an opaque search string
- Semantics vary by driver — query syntax, ranking algorithms, and supported operators are implementation-specific (SQLite uses FTS5)
- Callers SHOULD NOT assume specific query syntax
- MUST support free-text search (substring or full-text matching) over reference_point and summary_caption

### Time Filters

- `since`/`until` filter by Frame timestamp (UTC)
- For "last N frames," use `limit`/`offset` instead

### Backend Selection

SQLite via `SqliteFrameStore` remains the default OSS implementation. PostgreSQL via
`PostgresFrameStore` is an explicit opt-in for shared cross-host storage. The transitional 2.x
`createFrameStore()` factory selects those unscoped adapters from `LEX_STORE=sqlite|postgres`.
Lex 3.0 trusted hosts do not select a backend from ambient environment variables: trusted
composition supplies the authorized `ScopedFrameStoreBinder` after scope resolution.

Trusted MCP attachment input is intentionally unavailable until Lex has a scope-bound attachment
service. Its trusted `tools/list` and help surfaces omit `images`, scoped SQLite reports
`images: false`, and trusted calls reject both `images` and caller-supplied `image_ids` before a
Frame can be stored. The unscoped SQLite compatibility path retains its existing attachment
behavior.

### Access Modes

Both production implementations support explicit `read-write` and `read-only` access modes.
`read-write` remains the default for backward compatibility. Callers that must not initialize,
migrate, or mutate the selected store use:

```typescript
createFrameStore(undefined, { accessMode: "read-only" });
```

`lex context` always requests this hard read-only mode because it is the bounded
session/bootstrap surface. It does not create or migrate either backend. Mutation methods reject
without changing the selected store when the store is read-only.

### SQLite Access Modes

`SqliteFrameStore` makes connection access explicit:

- `new SqliteFrameStore(path)` keeps the existing `read-write` behavior. It may create parent
  directories, initialize a new database, apply migrations, and set writable database pragmas.
- `new SqliteFrameStore(path, { accessMode: "read-only" })` requires an existing filesystem
  database, captures a stable main-file snapshot through filesystem reads, and exposes that
  detached snapshot through a query-only in-memory connection. It never calls database
  initialization or migration. An older or newer schema returns a stable diagnostic instead of
  being changed.

The detached snapshot is intentional. With the bundled SQLite driver, a nominal file-level
read-only open of a WAL-mode database still creates or touches `-wal`/`-shm` sidecars. The snapshot
path avoids all writes beside the canonical database. If a non-empty WAL or rollback journal is
active, Lex reports `STORE_UNAVAILABLE` rather than returning potentially stale/incoherent context.
Encrypted stores are also unavailable through this snapshot path until the driver can deserialize
an encrypted snapshot without first opening the canonical database.

The other current SQLite-backed CLI paths—`recall`,
`timeline`, `export`, `introspect`, `remember`, `import`, `dedupe`, `check-contradictions`, `wave`,
`turncost`, and `db` operations—still obtain writable stores/connections and therefore may
initialize or migrate the selected database. Callers that require a non-mutating read must use
the explicit read-only constructor or `openDatabaseReadOnly(path)`.

`lex db repair` is the exception among `db` operations: it inspects the same detached snapshot and
does not mutate by default. `--write` is required to apply a recognized additive repair, and Lex
creates an adjacent recovery backup before opening the maintenance connection. Ordinary store
initialization refuses divergent schema 13 and current-version structural mismatches rather than
repairing them implicitly.

### PostgreSQL Access Modes

Lex 3.0 normal PostgreSQL consumers use `PostgresScopedFrameStoreBackend`, not the transitional
unscoped factory. The runtime adapter requires an explicit connection/pool, verifies a non-owner
and non-`BYPASSRLS` role, binds an `AuthorizedScope`, and runs every operation in a transaction
with transaction-local tenant/workspace/principal context. Explicit predicates and forced RLS
both fail closed. Migration and ownership inspection are available only through the separately
constructed `PostgresFrameStoreAdministration` boundary. See
[PostgreSQL Scope Security](./POSTGRES_SCOPE_SECURITY.md) for role grants, pool-reset behavior,
legacy-row quarantine, and integration verification.

All Lex 3 scope-bound adapters validate the complete Frame produced by a partial update. Adapters
that read and replace serialize that merge with an immediate transaction or row lock so concurrent
partial updates cannot erase unrelated fields.

The following behavior describes the transitional unscoped 2.x adapter. It must not be wired to
Lex 3.0 trusted CLI/MCP dispatch. The compatibility and scope-bound PostgreSQL stores may use the
same database and schema name, but they use separate physical contracts:

| Contract | Relations | Migration ledger | Current version |
|---|---|---|---:|
| Unscoped compatibility | `lex_compat_frames` and `lex_compat_*` support objects | `lex_compat_frame_store_migrations` | 2 |
| Scope-bound/RLS | `frames` and scoped support objects | `lex_frame_store_migrations` | 3 |

The compatibility adapter therefore neither bypasses RLS on the scoped relation nor interprets
scoped ownership as unscoped data. Its credential-free backend identity includes this physical
contract, so a launcher cannot report false parity with the former shared relation.

`new PostgresFrameStore(url)` keeps the default `read-write` behavior and may apply PostgreSQL
schema migrations before serving operations. The compatibility target defaults to `public`; an
alternate lower-case schema must be supplied explicitly as `{ schema: "lex_store" }`. Every
operation and migration is bound to that validated target instead of ambient `search_path`.
`new PostgresFrameStore(url, { accessMode: "read-only", schema: "lex_store" })` checks that the
existing target schema is exactly the supported version and never starts a migration transaction.
Missing, older, or newer schemas fail with a diagnostic instead of being changed.
The transitional `createFrameStore()` factory forwards the same explicit `schema` option when
PostgreSQL is selected.

When upgrading directly from an unscoped Lex 2.x schema at migration version 1, the compatibility
migration copies legacy Frames transactionally into `lex_compat_frames` without deleting or
changing the source relation. It adopts only a source with no tenant ownership columns. A Lex 3
scoped relation—and any quarantined legacy rows—are never adopted automatically because doing so
would invent tenant/workspace ownership. Moving those records requires an explicit administrative
inventory and ownership decision.

PostgreSQL read-only mode is an application-level no-write contract rather than a replacement for
database permissions.

## CodeAtlasStore (@experimental)

Experimental interface for Code Atlas data. It does not yet carry the stability guarantees of the
Frame and scope-bound store contracts.

## Extension Points

Custom drivers can implement `FrameStore` for alternative backends (for example, in-memory stores
for testing).

## See Also

- `src/memory/store/frame-store.ts` — Interface definition
- `src/memory/store/code-atlas-store.ts` — Experimental Atlas interface
