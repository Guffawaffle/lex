# Code Atlas API Reference

**Version:** v0  
**Base URL:** `http://localhost:3000` (default)

---

## Overview

Code Atlas provides two API interfaces:

1. **MCP (Model Context Protocol)** — For AI assistant integration via stdio
2. **HTTP REST API** — For programmatic access from external tools

Both interfaces use the same underlying storage and validation logic.

---

## Authentication

### HTTP API

All HTTP endpoints require Bearer token authentication:

```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Configure via environment variable:
```bash
export LEX_API_KEY="your-secure-api-key"
```

### MCP Protocol

MCP over stdio does not require authentication (runs locally).

---

## HTTP Endpoints

### Create Frame with Atlas Context

`POST /api/frames`

Creates a new Frame with module scope for Atlas Frame generation.

**Request:**
```json
{
  "reference_point": "auth handshake timeout",
  "summary_caption": "Fixed timeout in auth service",
  "module_scope": ["services/auth", "lib/networking"],
  "status_snapshot": {
    "next_action": "Deploy to staging",
    "blockers": ["Waiting for QA approval"]
  },
  "branch": "feature/auth-fix",
  "jira": "TICKET-123"
}
```

**Response (201 Created):**
```json
{
  "id": "frame-1699564800-abc123",
  "status": "created"
}
```

**Required Fields:**
- `reference_point` — Human-memorable anchor phrase
- `summary_caption` — One-line summary
- `module_scope` — Array of module IDs (must match policy)
- `status_snapshot.next_action` — What needs to happen next

**Optional Fields:**
- `status_snapshot.blockers` — General blockers
- `status_snapshot.merge_blockers` — Specific merge blockers
- `status_snapshot.tests_failing` — Failing test names
- `branch` — Git branch (defaults to "main")
- `jira` — Ticket ID
- `keywords` — Search tags

**curl Example:**
```bash
curl -X POST http://localhost:3000/api/frames \
  -H "Authorization: Bearer $LEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reference_point": "implementing JWT validation",
    "summary_caption": "Added token parsing and signature verification",
    "module_scope": ["services/auth", "api/middleware"],
    "status_snapshot": {
      "next_action": "Add refresh token support",
      "blockers": []
    },
    "jira": "AUTH-456"
  }'
```

### Health Check

`GET /health`

Check server status.

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

**curl Example:**
```bash
curl http://localhost:3000/health
```

---

## MCP Tools

### lex.remember

Store a new Frame with Atlas context.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "lex.remember",
    "arguments": {
      "reference_point": "that auth deadlock",
      "summary_caption": "Auth handshake timeout; Add User button disabled",
      "status_snapshot": {
        "next_action": "Reroute user-admin-panel to call user-access-api",
        "merge_blockers": ["Direct call to auth-core forbidden by policy"],
        "tests_failing": ["test_add_user_button_enabled"]
      },
      "module_scope": ["ui/user-admin-panel", "services/auth-core"],
      "jira": "TICKET-123",
      "keywords": ["auth", "timeout", "policy-violation"]
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Frame stored successfully!\n\n📌 Reference: that auth deadlock\n📝 Summary: Auth handshake timeout; Add User button disabled\n🔧 Next: Reroute user-admin-panel to call user-access-api\n📦 Modules: ui/user-admin-panel, services/auth-core\n🎫 Jira: TICKET-123"
    }
  ]
}
```

### lex.recall

Search Frames and return with Atlas Frame context.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "lex.recall",
    "arguments": {
      "reference_point": "auth",
      "limit": 5
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 2 frames matching 'auth':\n\n📌 Frame: that auth deadlock\n   📅 2025-11-26T14:30:00Z\n   📝 Auth handshake timeout; Add User button disabled\n   🔧 Next: Reroute user-admin-panel to call user-access-api\n   📦 Modules: ui/user-admin-panel, services/auth-core\n\n📊 Atlas Frame (fold radius: 1)\n🌱 Seed modules: ui/user-admin-panel, services/auth-core\n📦 Total modules in neighborhood: 3\n\n🔗 Edges:\n  ui/user-admin-panel → services/user-access-api [✅ Allowed]\n  ui/user-admin-panel → services/auth-core [🚫 Forbidden] - forbidden_caller"
    }
  ]
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference_point` | string | ❌* | Fuzzy search on reference point |
| `jira` | string | ❌* | Exact match on Jira ticket |
| `branch` | string | ❌ | Filter by git branch |
| `limit` | number | ❌ | Max results (default: 10) |

*At least one of `reference_point` or `jira` is required.

### lex.list_frames

List recent Frames with optional filtering.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "lex.list_frames",
    "arguments": {
      "module": "services/auth",
      "limit": 10
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 frames with module 'services/auth':\n\n1. 📌 that auth deadlock (2025-11-26T14:30:00Z)\n2. 📌 JWT refresh flow (2025-11-25T10:15:00Z)\n3. 📌 password reset bug (2025-11-24T16:45:00Z)"
    }
  ]
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branch` | string | ❌ | Filter by git branch |
| `module` | string | ❌ | Filter by module ID in scope |
| `limit` | number | ❌ | Max results (default: 10) |
| `since` | string | ❌ | ISO 8601 timestamp (only return after) |

---

## Error Codes

### HTTP Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_FAILED` | Request body fails validation |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 409 | `CONFLICT` | Duplicate frame (same content hash) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

**Example Error Response:**
```json
{
  "error": "VALIDATION_FAILED",
  "message": "Field 'module_scope' is required and must be a non-empty array",
  "field": "module_scope",
  "code": 400
}
```

### MCP Errors

| Code | Category | Description |
|------|----------|-------------|
| `VALIDATION_REQUIRED_FIELD` | Validation | Required field is missing |
| `VALIDATION_INVALID_FORMAT` | Validation | Field has invalid format |
| `VALIDATION_INVALID_MODULE_ID` | Validation | Module ID not in policy |
| `VALIDATION_EMPTY_MODULE_SCOPE` | Validation | module_scope array is empty |
| `STORAGE_WRITE_FAILED` | Storage | Failed to save frame |
| `STORAGE_READ_FAILED` | Storage | Failed to read from database |
| `POLICY_NOT_FOUND` | Policy | Policy file not found |
| `POLICY_INVALID` | Policy | Policy file has invalid structure |
| `INTERNAL_UNKNOWN_TOOL` | Internal | Unknown tool name |
| `INTERNAL_ERROR` | Internal | Unexpected error |

**Example MCP Error:**
```json
{
  "error": {
    "code": "VALIDATION_INVALID_MODULE_ID",
    "message": "Invalid module IDs: auth/typo. Did you mean: auth/core?",
    "metadata": {
      "invalidIds": ["auth/typo"],
      "suggestions": ["auth/core"],
      "availableModules": ["auth/core", "auth/password", "ui/dashboard"]
    }
  }
}
```

---

## TypeScript API

### Validation Functions

```typescript
import { 
  parseCodeUnit, 
  validateCodeUnit,
  parseCodeAtlasRun,
  validateCodeAtlasRun 
} from '@smartergpt/lex/atlas';

// Parse with exception on failure
const codeUnit = parseCodeUnit(rawData);

// Safe parse with result object
const result = validateCodeUnit(rawData);
if (result.success) {
  console.log("Valid:", result.data);
} else {
  console.error("Errors:", result.error.issues);
}
```

### Atlas Frame Generation

```typescript
import { 
  generateAtlasFrame,
  getCacheStats,
  resetCache,
  setEnableCache,
  autoTuneRadius,
  estimateTokens
} from '@smartergpt/lex/shared/atlas';

// Generate Atlas Frame
const frame = generateAtlasFrame(
  ['services/auth', 'api/middleware'],  // seed modules
  1,                                     // fold radius
  '/path/to/lexmap.policy.json'         // optional policy path
);

// Auto-tune to fit token limit
const tuned = autoTuneRadius(
  (r) => generateAtlasFrame(seeds, r),
  3,     // requested radius
  5000   // max tokens
);

// Cache management
const stats = getCacheStats();
console.log(`Cache hit rate: ${stats.hits / (stats.hits + stats.misses)}`);
resetCache();
setEnableCache(false);  // Disable caching
```

### Types

```typescript
import type {
  CodeUnit,
  CodeUnitKind,
  CodeUnitSpan,
  CodeAtlasRun,
  Limits,
  AtlasFrame,
  AtlasModule,
  AtlasEdge,
  Policy,
  PolicyModule
} from '@smartergpt/lex/shared/atlas';
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEX_API_KEY` | API key for HTTP authentication | Required |
| `LEX_API_PORT` | HTTP server port | `3000` |
| `LEX_DB_PATH` | SQLite database path | `.smartergpt/lex/memory.db` |
| `LEX_POLICY_PATH` | Policy file path | Auto-detect |
| `LEX_WORKSPACE_ROOT` | Workspace root for policy resolution | Auto-detect |
| `LEX_DEBUG` | Enable debug logging | `false` |
| `LEX_STRICT_MODE` | Disable fuzzy matching in CI | `false` |

---

## Server Setup

### Starting the HTTP Server

```typescript
import { createDatabase } from '@smartergpt/lex/memory/store';
import { startHttpServer } from '@smartergpt/lex/memory/mcp_server/http-server';

const db = createDatabase('/path/to/frames.db');

await startHttpServer(db, {
  port: 3000,
  apiKey: process.env.LEX_API_KEY,
});

console.log('Frame ingestion API running on http://localhost:3000');
```

### Running the MCP Server

```bash
# Via npm script
npm run remember

# Directly
node dist/memory/mcp_server/frame-mcp.js

# With debug logging
LEX_DEBUG=1 node dist/memory/mcp_server/frame-mcp.js
```

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lex-memory": {
      "command": "node",
      "args": ["/path/to/lex/dist/memory/mcp_server/frame-mcp.js"],
      "env": {
        "LEX_MEMORY_DB": "/path/to/lex-memory.db"
      }
    }
  }
}
```

---

## See Also

- [Full Specification](./code-atlas-v0.md) — Schema details and algorithms
- [Examples](./examples.md) — Complete usage examples
- [Error Codes](../API_ERRORS.md) — Full error documentation
- [MCP Server README](../../src/memory/mcp_server/README.md) — Server internals
