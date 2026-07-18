# Frame Storage

Backend-neutral Frame storage with SQLite as the default and opt-in PostgreSQL for shared stores.

> **📋 Contract:** See [CONTRACT.md](./CONTRACT.md) for the FrameStore persistence contract (frozen for 1.0.0).

## Features

- **Backward-compatible default**: SQLite at `.smartergpt/lex/memory.db`
- **Shared storage**: PostgreSQL via `LEX_STORE=postgres` and `LEX_DATABASE_URL`
- **Full-text search parity**: Fuzzy/exact and all/any matching across SQLite FTS5 and PostgreSQL text search
- **All Frame fields**: Supports all fields from `src/shared/types/frame.ts`
- **Migration support**: Schema versioning for database upgrades
- **Performant queries**: Indexed searches by branch, jira, module_scope
- **Concurrent access**: WAL mode for better concurrent read/write
- **Graceful shutdown**: Automatic connection cleanup

## Usage (Internal)

This module is part of the Lex single package. It's not installed separately.

### Basic CRUD Operations

The existing CLI and MCP currently use the shared asynchronous `FrameStore`
factory as a transitional 2.x compatibility path:

```typescript
import { createFrameStore } from "../../memory/store/index.js";

const store = createFrameStore();
await store.saveFrame(frame);
const saved = await store.getFrameById(frame.id);
await store.close();
```

Lex 3.0 normal consumers must instead receive a `ScopedFrameStore` created from
an immutable `AuthorizedScope`. The additive in-memory reference backend shows
the binding contract while physical SQLite and PostgreSQL adapters are migrated:

```typescript
import { MemoryScopedFrameStoreBackend } from "@smartergpt/lex/store";

const backend = new MemoryScopedFrameStoreBackend();
const scopedStore = backend.bind(authorizedScope);
await scopedStore.saveFrame(frame);
```

Normal scoped operations cannot accept tenant, workspace, or principal filters.
Migration, repair, and lifecycle work belongs to the separately authorized
`FrameStoreAdmin` boundary. Trusted CLI/MCP bootstrap replaces the transitional
factory wiring; normal code must not bind itself from environment variables or
`process.cwd()`.

`LEX_STORE` defaults to `sqlite`. When it is `postgres`, `LEX_DATABASE_URL` is required and `LEX_DB_PATH` is not consulted. PostgreSQL images are intentionally unsupported until image persistence no longer requires a raw SQLite connection.

The functions below are the legacy raw-SQLite API and remain available for compatibility.

```typescript
import { getDb, saveFrame, getFrameById, deleteFrame } from '../../memory/store/index.js';

const db = getDb(); // Uses ~/.lex/frames.db by default

// Save a Frame
saveFrame(db, {
  id: "frame-001",
  timestamp: "2025-11-01T16:04:12-05:00",
  branch: "feature/auth-fix",
  jira: "TICKET-123",
  module_scope: ["ui/user-admin-panel", "services/auth-core"],
  summary_caption: "Auth handshake timeout",
  reference_point: "that auth deadlock",
  status_snapshot: {
    next_action: "Reroute to user-access-api",
    merge_blockers: ["Direct call to auth-core forbidden by policy"]
  },
  keywords: ["auth", "timeout", "policy-violation"]
});

// Retrieve by ID
const frame = getFrameById(db, "frame-001");

// Delete
deleteFrame(db, "frame-001");
```

### Full-Text Search

```typescript
import { searchFrames } from '../../memory/store/index.js';

// Natural language search across reference_point, keywords, summary_caption
const results = searchFrames(db, "auth deadlock");
const results2 = searchFrames(db, "auth*"); // Wildcard search
const results3 = searchFrames(db, "auth timeout"); // Multiple terms
```

### Query by Filters

```typescript
import { 
  getFramesByBranch,
  getFramesByJira,
  getFramesByModuleScope 
} from '../../memory/store/index.js';

// Get all Frames for a branch
const branchFrames = getFramesByBranch(db, "feature/auth-fix");

// Get all Frames for a Jira ticket
const jiraFrames = getFramesByJira(db, "TICKET-123");

// Get all Frames touching a specific module
const moduleFrames = getFramesByModuleScope(db, "services/auth-core");
```

### Custom Database Path

```typescript
import { getDb } from '../../memory/store/index.js';

// Use custom database path
const db = getDb("/path/to/custom/frames.db");
```

### Connection Management

```typescript
import { closeDb } from '../../memory/store/index.js';

// Graceful shutdown (usually not needed - handled automatically)
closeDb();
```

## Database Schema

### frames table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Unique Frame ID |
| timestamp | TEXT NOT NULL | ISO 8601 timestamp |
| branch | TEXT NOT NULL | Git branch name |
| jira | TEXT | Optional ticket ID |
| module_scope | TEXT NOT NULL | JSON array of module IDs |
| summary_caption | TEXT NOT NULL | One-line summary |
| reference_point | TEXT NOT NULL | Human-memorable anchor phrase |
| status_snapshot | TEXT NOT NULL | JSON object with next_action, blockers |
| keywords | TEXT | JSON array of keywords |
| atlas_frame_id | TEXT | Link to Atlas Frame |
| feature_flags | TEXT | JSON array of feature flags |
| permissions | TEXT | JSON array of permissions |

### Indexes

- `idx_frames_timestamp` - Descending timestamp for recent frames
- `idx_frames_branch` - Branch queries
- `idx_frames_jira` - Jira/ticket queries
- `idx_frames_atlas_frame_id` - Atlas Frame links

### FTS5 Virtual Table

`frames_fts` - Full-text search on:
- `reference_point`
- `summary_caption`
- `keywords`

## Testing

```bash
npm test
```

Tests cover:
- Database initialization and migration
- CRUD operations
- FTS5 full-text search
- Query filters (branch, jira, module_scope)
- Concurrent access
- Optional field handling

## Files

- **`db.ts`** - Database initialization, schema, migrations
- **`queries.ts`** - CRUD and search operations
- **`index.ts`** - Main export interface with connection pooling
- **`store.test.ts`** - Comprehensive test suite (22 tests)
- **`framestore.ts`** - Legacy implementation (deprecated)

## Migration Notes

The storage system uses schema versioning via the `schema_version` table. Canonical migrations are
applied automatically on database initialization. Structurally inconsistent current stores and
the recognized divergent SQLite schema 13 fail closed; operators diagnose them with
`lex db repair` and must pass `--write` to create a mandatory backup and apply a safe repair.

SQLite and PostgreSQL maintain separate explicit migration tables. The selected backend reports its live schema version through `FrameStore.getHealth()` and CLI/MCP introspection.

## Privacy & Security

- **Local-first by default**: SQLite makes no storage network calls; PostgreSQL is used only when explicitly selected
- **No telemetry**: No tracking or analytics
- **User-controlled**: Database stored at `~/.lex/frames.db` or custom path
- **SQLite security**: Uses WAL mode, proper pragmas for data integrity

## Performance

- **WAL mode**: Better concurrent read/write performance
- **Indexed queries**: Fast lookups by timestamp, branch, jira
- **FTS5**: Efficient full-text search with BM25 ranking
- **Connection pooling**: Singleton database instance
- **Cache**: 10,000 page cache size

## License

MIT
