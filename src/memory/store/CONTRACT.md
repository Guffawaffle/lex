# FrameStore Contract v1.0.0

> **Status:** Frozen for 1.0.0
> **Last Updated:** 2025-11-27
> **Schema Version:** `1.0.0`

This document defines the persistence contract for Frames. All implementations of `FrameStore` must conform to this specification.

## Lex 3.0 Scope-Bound Contract

The v1 contract below describes the legacy physical-adapter surface. Lex 3.0
introduces `ScopedFrameStore` as the only normal CLI, MCP, and SDK boundary:

```typescript
const store = backend.bind(authorizedScope);
await store.saveFrame(frame);
const visible = await store.listFrames();
```

`AuthorizedScope` is required at binding time and is copied into an immutable
view. Normal methods have no tenant, workspace, or principal selector. The
backend stamps `(tenant_id, workspace_id)` ownership and creator attribution
from the trusted scope, while ordinary Frame results omit that authority
metadata. Repository identity remains provenance rather than an ownership
partition.

The scoped contract checks these named capabilities at operation boundaries:

| Capability | Operations |
|---|---|
| `frame:read` | get, recall/search, list/export, count, statistics, and turn-cost metrics |
| `frame:write` | create, batch create, and update |
| `frame:delete` | single and bulk deletion, including superseded cleanup |
| `frame:admin` | the separately typed `FrameStoreAdmin` boundary |

Administrative inspection, migration, repair, and lifecycle operations must
remain absent from `ScopedFrameStore`. They cannot be reached with a special
normal selector or type cast.

`MemoryScopedFrameStoreBackend` is the reference implementation for these
semantics. `SqliteScopedFrameStoreBackend` is the durable per-workspace
implementation and runs the shared normal-operation conformance suite. Its v15
schema binds one SQLite file permanently to one tenant/workspace, stamps every
row with ownership-contract version, creator principal, and authority scope
version, and filters every normal query and mutation by the bound scope.

SQLite schema v14 is the last unowned legacy state. The v15 adapter never opens
it for normal service. Ownership is assigned only through `lex db scope`:

1. `inventory` reads a stable snapshot and returns a path-redacted state;
2. `manifest` records one explicit source hash and canonical UUID mapping;
3. `migrate` validates without mutation unless `--write` is present;
4. write mode captures a mandatory recovery snapshot, rebuilds transactionally,
   records deterministic manifest/receipt evidence, and verifies structure,
   ownership, frame count, FTS, integrity, and foreign keys; and
5. `recover` validates without mutation unless `--write` explicitly restores
   the exact recorded v14 source.

Directory names, environment variables, repository paths, and legacy `userId`
values never supply ownership. Ambiguous, stale, partial, conflicting, malformed,
or newer stores fail closed. The per-workspace file model lets different
workspaces retain equivalent Frame IDs without a shared-file collision.

The exported unscoped `FrameStore` and legacy SQLite adapter coexist temporarily
so trusted-bootstrap wiring and PostgreSQL RLS can land independently. The
legacy adapter rejects v15 as a newer schema and cannot accidentally serve a
scoped file. This compatibility seam is not the Lex 3.0 normal API and must be
removed from normal construction/wiring before issue #759 is complete.

---

## Schema Version

```typescript
export const FRAME_STORE_SCHEMA_VERSION = "1.0.0";
```

Implementations MUST:
- Store this version in the database
- Refuse to open databases with incompatible major versions
- Provide clear error messages for version mismatches

---

## ID Format

- **Type:** ULID (Universally Unique Lexicographically Sortable Identifier)
- **Encoding:** 26-character Crockford Base32
- **Properties:** Lexicographically sortable by creation time

Example: `01ARZ3NDEKTSV4RRFFQ69G5FAV`

---

## Timestamp Format

- **Format:** ISO 8601 UTC
- **Precision:** Milliseconds
- **Example:** `2025-11-27T06:45:14.123Z`

All timestamps MUST be stored and returned in UTC.

---

## Frame Record

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | ULID | Unique identifier |
| `timestamp` | ISO 8601 | Creation time (UTC) |
| `reference_point` | string | What you were working on |
| `summary_caption` | string | One-line summary of progress |
| `status_snapshot` | object | Current state with `next_action` |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `module_scope` | string[] | `[]` | Module IDs from lexmap.policy.json |
| `keywords` | string[] | `[]` | Search tags |
| `jira` | string | `null` | Issue ticket reference |
| `branch` | string | `null` | Git branch |
| `atlas_frame_id` | string | `null` | Reference to Atlas Frame |
| `images` | object[] | `[]` | Base64-encoded image attachments |

---

## Lifecycle States

```
created → active → archived
```

| State | Description | Mutable |
|-------|-------------|---------|
| `created` | Frame saved, not yet referenced | Yes |
| `active` | Frame in use by current session | Yes |
| `archived` | Historical, read-only | No |

### Cross-Repo Mapping (Lex ↔ LexRunner)

| FrameStore | RunStore | Notes |
|------------|----------|-------|
| `created` | `pending` | Initial state |
| `active` | `running` | In-progress work |
| `archived` | `completed` | Terminal success |
| `archived` | `failed` | Terminal failure |
| `archived` | `cancelled` | User-terminated |

---

## Interface Contract

```typescript
interface FrameStore {
  saveFrame(frame: Frame): Promise<void>;
  getFrameById(id: string): Promise<Frame | null>;
  searchFrames(criteria: FrameSearchCriteria): Promise<Frame[]>;
  listFrames(options?: FrameListOptions): Promise<Frame[]>;
  close(): Promise<void>;
}
```

### Invariants

1. `saveFrame` is idempotent (same ID = upsert)
2. `getFrameById` returns `null` for non-existent IDs (no throw)
3. `searchFrames` returns empty array for no matches (no throw)
4. `close` is safe to call multiple times

---

## Change Protocol

Changes to this contract require:

1. [ ] Schema migration plan documented
2. [ ] Version bump (SemVer)
   - Patch: additive optional fields
   - Minor: additive required fields with defaults
   - Major: breaking changes
3. [ ] Cross-repo notification (LexRunner) if shared concept
4. [ ] Chief Architect explicit approval
5. [ ] Migration tested on production-like data

---

## Migration Strategy

For 1.0.0, the migration path is:

1. Check schema version on database open
2. If version < 1.0.0: offer to reset (dev) or fail with clear message (prod)
3. If version > 1.0.0 (future): fail with "upgrade Lex" message

Post-1.0.0: proper migrations via numbered SQL files in `migrations/`.
