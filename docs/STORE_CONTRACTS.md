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

## CodeAtlasStore (@experimental)

Experimental interface for Code Atlas data. API may change including breaking changes in 1.0.x releases without semver guarantees. This interface will be stabilized in a future minor release.

## Extension Points

Custom drivers can implement `FrameStore` for alternative backends (e.g., PostgreSQL, in-memory for testing).

## See Also

- `src/memory/store/frame-store.ts` — Interface definition
- `src/memory/store/code-atlas-store.ts` — Experimental Atlas interface
