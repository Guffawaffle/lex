# FrameStore Contract v1.0.0

> **Status:** Frozen for 1.0.0
> **Last Updated:** 2025-11-27
> **Schema Version:** `1.0.0`

This document defines the persistence contract for Frames. All implementations of `FrameStore` must conform to this specification.

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
