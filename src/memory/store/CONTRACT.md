# FrameStore Contracts

> **Status:** Current
> **Record Schema Version:** `FRAME_SCHEMA_VERSION = 7`
> **Scope Contract Version:** `FRAME_STORE_SCOPE_CONTRACT_VERSION = 1`

This document describes the implemented persistence contract. The exported unscoped `FrameStore`
and physical adapters remain available for 2.x migration compatibility, but Lex 3.0 trusted CLI,
MCP, and SDK hosts use `ScopedFrameStore` for normal operations.

## Version domains

These values are independent and must not be substituted for one another:

| Domain | Current value | Meaning |
|---|---:|---|
| Episodic Frame record | `FRAME_SCHEMA_VERSION = 7` | Public Frame metadata evolution |
| Legacy FrameStore interface | `FRAME_STORE_SCHEMA_VERSION = "1.0.0"` | Backend-neutral compatibility contract |
| Scoped ownership contract | `FRAME_STORE_SCOPE_CONTRACT_VERSION = 1` | Scope binding, capability, and ownership semantics |
| Legacy/unowned SQLite | `DATABASE_SCHEMA_VERSION = 14` | Last physical schema accepted by the unscoped adapter |
| Scope-owned SQLite | `SCOPED_SQLITE_SCHEMA_VERSION = 15` | Per-workspace physical schema with immutable ownership |
| Unscoped compatibility PostgreSQL | `POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION = 2` | Dedicated `lex_compat_*` relations without tenant authorization |
| Scope-owned PostgreSQL | `POSTGRES_FRAME_STORE_SCHEMA_VERSION = 3` | Explicit qualified schema with forced RLS |
| Behavioral public contract | `BEHAVIORAL_STORE_CONTRACT_VERSION = 1` | Backend-neutral persona/rule revisions, evidence, and receipts |
| Behavioral SQLite | `SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION = 1` | Dedicated exact-scope behavioral relations |
| Behavioral PostgreSQL | `POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION = 1` | Dedicated exact-scope relations with forced RLS |

Physical migration versions are monotonic backend histories. A recorded version is not sufficient
on its own: adapters also validate required tables, columns, indexes, and ownership invariants.

## Frame record semantics

The runtime accepts `id` as an opaque string. UUID- and `f-`-prefixed generators are conventions,
not validation requirements; ULID syntax is not part of the contract. Stores use `id` as the
logical key inside the bound workspace.

Required Frame fields are:

| Field | Type |
|---|---|
| `id` | string |
| `timestamp` | string |
| `branch` | string |
| `module_scope` | string[] |
| `summary_caption` | string |
| `reference_point` | string |
| `status_snapshot.next_action` | string |

Frame records have no normative `parent_id` or created/active/archived lifecycle field.
`superseded_by` and `merged_from` represent deduplication and consolidation relationships.

Frames are not blanket-immutable:

- `saveFrame` is idempotent by `id` and may upsert the record;
- `updateFrame` atomically applies targeted changes and preserves `id`, `timestamp`, and
  unspecified fields under concurrent updates;
- `deleteFrame` and capability-gated bulk deletion remove records;
- `purgeSuperseded` removes records marked with `superseded_by`;
- SQLite/PostgreSQL ownership columns are never caller-controlled Frame fields.

## Lex 3.0 scope-bound contract

```typescript
const store = backend.bind(authorizedScope);
await store.saveFrame(frame);
const visible = await store.listFrames();
```

`AuthorizedScope` is copied into an immutable store view. Normal methods have no tenant,
workspace, or principal selector. The backend stamps `(tenant_id, workspace_id)` ownership and
creator attribution from the trusted scope while ordinary Frame results omit that authority
metadata. Repository identity remains provenance rather than an ownership partition.

| Capability | Operations |
|---|---|
| `frame:read` | get, search/recall, list/export, count, statistics, and turn-cost metrics |
| `frame:write` | create, batch create, and targeted update |
| `frame:delete` | single and bulk deletion, including superseded cleanup |
| `frame:admin` | separately typed `FrameStoreAdmin` migration/repair/recovery boundary |

Administrative inspection, migration, repair, and lifecycle operations remain absent from
`ScopedFrameStore`. They cannot be reached with a normal selector or type cast.

`MemoryScopedFrameStoreBackend` is the reference implementation.
`SqliteScopedFrameStoreBackend` binds one SQLite v15 file permanently to one tenant/workspace.
`PostgresScopedFrameStoreBackend` applies the same contract to PostgreSQL v3 with explicit scope
predicates and forced RLS. All run the shared normal-operation conformance suite.

The exported unscoped `PostgresFrameStore` uses a separate version-2 compatibility domain:
`lex_compat_frames`, its own migration ledger, and compatibility-specific support objects. It may
coexist with the scoped/RLS domain in one PostgreSQL schema, but it never reads that domain or
assigns ownership to scoped or quarantined records. Its backend identity includes the compatibility
contract version.

### PostgreSQL quarantine recovery

Legacy rows preserved by the PostgreSQL v2 scoped migration remain unowned until an operator
makes an explicit administrative decision. The public quarantine-recovery contract separates the
read-only preparation stages from the later write boundary:

1. trusted database inspection canonicalizes every complete legacy row and supplies only its ID
   and SHA-256 digest to `createQuarantineInventory`;
2. `createQuarantineRecoveryManifest` requires exactly one decision for every inventoried row,
   either canonical scoped ownership or the exact acknowledgement that a compatibility copy is
   not a tenant boundary; and
3. `planQuarantineRecovery` rebinds the manifest to a fresh inventory, requires `frame:admin`, and
   rejects stale sources, incomplete decisions, duplicates, or destination collisions while
   guaranteeing `persistentWriteCount: 0`.

Normal artifacts contain no Frame bodies, legacy user IDs, connection strings, or ambient
authority selectors. Runtime binders and standard MCP tools do not expose this contract. Database
inventory, transactional apply, verification, cleanup, and recovery belong exclusively to the
separately constructed PostgreSQL administration service.

Trusted MCP does not currently expose attachment creation through scoped stores. Until a
scope-bound attachment service exists, trusted tool schemas and help omit `images`, direct
`images` and `image_ids` inputs fail validation, and scoped SQLite advertises `images: false`.
Legacy unscoped SQLite attachment behavior is unchanged.

## SQLite ownership migration

SQLite v14 is the last unowned legacy state. The v15 adapter never opens it for normal scoped
service. Ownership is assigned only through the explicit `lex db scope` flow:

1. `inventory` reads a stable snapshot and returns a path-redacted state;
2. `manifest` records one explicit source hash and canonical UUID ownership mapping;
3. `migrate` validates without mutation unless `--write` is present;
4. write mode captures a mandatory recovery snapshot, rebuilds transactionally, and verifies
   structure, ownership, Frame count, FTS, integrity, and foreign keys; and
5. `recover` validates without mutation unless `--write` restores the exact recorded v14 source.

Directory names, environment variables, repository paths, and legacy `userId` values never supply
ownership. Ambiguous, stale, partial, conflicting, malformed, or newer stores fail closed.

## Normal-operation guarantees

- `getFrameById` returns `null` when the ID is not visible in the bound scope.
- Search and list return empty results rather than leaking a different scope.
- Batch validation is all-or-nothing.
- Scoped updates validate the resulting complete Frame. Read/validate/replace implementations
  serialize that merge with an immediate transaction or row lock so concurrent partial updates
  cannot erase unrelated fields.
- Cursor pagination and operation results are deterministic for the same store state.
- `close` is idempotent.
- Read-only/bootstrap paths never initialize, migrate, repair, or mutate a store.

## Change protocol

Changes to required Frame fields, accepted ID semantics, normal store mutability, ownership,
capability mapping, or exported package paths require a breaking changeset and migration review.
Physical schema changes require a monotonic migration, structural compatibility checks, rollback
or recovery evidence, and cross-backend conformance coverage.
