# Frame Storage

SQLite-based local storage for Frames with FTS5 full-text search.

## Features

- **Local-first storage**: SQLite database at `~/.lex/frames.db` (configurable)
- **Full-text search**: FTS5 virtual table for fuzzy search on `reference_point`, `keywords`, and `summary_caption`
- **All Frame fields**: Supports all fields from `src/shared/types/frame.ts`
- **Migration support**: Schema versioning for database upgrades
- **Performant queries**: Indexed searches by branch, jira, module_scope
- **Concurrent access**: WAL mode for better concurrent read/write
- **Graceful shutdown**: Automatic connection cleanup

## Usage (Internal)

This module is part of the Lex single package. It's not installed separately.

### Basic CRUD Operations

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

The storage system uses schema versioning via the `schema_version` table. Migrations are applied automatically on database initialization.

Current schema version: **1**

## Privacy & Security

- **Local-only**: No network calls, no cloud sync
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
