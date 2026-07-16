# Store Contracts

## Overview

Lex 1.0.0 introduces persistence contracts that abstract database operations behind interfaces.

## FrameStore

`FrameStore` is the persistence contract for Frames (episodic memory snapshots).

### Methods

- `saveFrame(frame)` — Persist a Frame
- `getFrameById(id)` — Retrieve by ID
- `searchFrames(criteria)` — Full-text search
- `listFrames(options)` — Paginated listing
- `close()` — Release resources

### Search Semantics

- `query` is an opaque search string
- Semantics vary by driver — query syntax, ranking algorithms, and supported operators are implementation-specific (SQLite uses FTS5)
- Callers SHOULD NOT assume specific query syntax
- MUST support free-text search (substring or full-text matching) over reference_point and summary_caption

### Time Filters

- `since`/`until` filter by Frame timestamp (UTC)
- For "last N frames," use `limit`/`offset` instead

### Default Implementation

SQLite via `SqliteFrameStore` is the default OSS implementation.

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

`lex context` uses the hard read-only path because it is the bounded session/bootstrap surface.
It does not create or migrate storage. The other current SQLite-backed CLI paths—`recall`,
`timeline`, `export`, `introspect`, `remember`, `import`, `dedupe`, `check-contradictions`, `wave`,
`turncost`, and `db` operations—still obtain writable stores/connections and therefore may
initialize or migrate the selected database. Callers that require a non-mutating read must use
the explicit read-only constructor or `openDatabaseReadOnly(path)`.

## CodeAtlasStore (@experimental)

Experimental interface for Code Atlas data. API may change including breaking changes in 1.0.x releases without semver guarantees. This interface will be stabilized in a future minor release.

## Extension Points

Custom drivers can implement `FrameStore` for alternative backends (e.g., PostgreSQL, in-memory for testing).

## See Also

- `src/memory/store/frame-store.ts` — Interface definition
- `src/memory/store/code-atlas-store.ts` — Experimental Atlas interface
