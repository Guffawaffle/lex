# Frame MCP Server & HTTP API

**Model Context Protocol server and HTTP API for Frame storage and recall**

Provides two interfaces:
1. **MCP Server** - Exposes Frame memory to AI assistants via stdio
2. **HTTP API** - RESTful endpoint for programmatic Frame ingestion from external tools

## Features

- ✅ MCP protocol over stdio (line-delimited JSON)
- ✅ HTTP POST /api/frames endpoint for Frame ingestion
- ✅ Content-hash based deduplication (5-minute timestamp buckets)
- ✅ API key authentication for HTTP endpoint
- ✅ SQLite + FTS5 for fuzzy Frame recall
- ✅ Atlas Frame generation (spatial neighborhood context)
- ✅ Module ID validation with fuzzy suggestions (THE CRITICAL RULE)
- ✅ Three MCP tools: `lex.remember`, `lex.recall`, `lex.list_frames`
- ✅ Local-first (no cloud sync, no telemetry)
- ✅ Comprehensive test suite (integration + alias resolution + performance)

## Tools

### `lex.remember`

Store a new Frame (episodic memory snapshot).

**Required Parameters:**
- `reference_point` - What you were working on (human-memorable phrase)
- `summary_caption` - One-line summary of progress
- `status_snapshot.next_action` - What needs to happen next
- `module_scope` - Array of module IDs from `lexmap.policy.json` (validated strictly)

**Optional Parameters:**
- `status_snapshot.blockers` - General blockers
- `status_snapshot.merge_blockers` - Specific merge blockers
- `status_snapshot.tests_failing` - Test names that were failing
- `branch` - Git branch (defaults to "main")
- `jira` - Ticket ID
- `keywords` - Search tags
- `atlas_frame_id` - Reference to existing Atlas Frame

**Example:**
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

### `lex.recall`

Search Frames by reference point, branch, or Jira ticket. Returns Frame + Atlas Frame.

**Parameters (at least one required):**
- `reference_point` - Fuzzy search on what you were working on
- `jira` - Exact match on Jira ticket
- `branch` - Filter by git branch
- `limit` - Max results (default: 10)

**Example:**
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

### `lex.list_frames`

List recent Frames with optional filtering.

**Optional Parameters:**
- `branch` - Filter by git branch
- `module` - Filter by module ID in module_scope
- `limit` - Max results (default: 10)
- `since` - ISO 8601 timestamp (only return Frames after this time)

**Example:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "lex.list_frames",
    "arguments": {
      "module": "auth/core",
      "limit": 10
    }
  }
}
```

## Error Codes (1.0.0 Contract)

MCP tool responses use structured error codes for machine-readable error handling.
Orchestrators can branch on these codes without parsing error messages.

### Error Response Format

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

### Error Code Reference

| Code | Category | Description |
|------|----------|-------------|
| `VALIDATION_REQUIRED_FIELD` | Validation | Required field is missing |
| `VALIDATION_INVALID_FORMAT` | Validation | Field has invalid format or type |
| `VALIDATION_INVALID_MODULE_ID` | Validation | Module ID not in policy |
| `VALIDATION_EMPTY_MODULE_SCOPE` | Validation | module_scope array is empty |
| `VALIDATION_INVALID_STATUS` | Validation | status_snapshot structure is invalid |
| `VALIDATION_INVALID_IMAGE` | Validation | Image data is malformed |
| `STORAGE_WRITE_FAILED` | Storage | Failed to save frame |
| `STORAGE_READ_FAILED` | Storage | Failed to read from database |
| `STORAGE_DELETE_FAILED` | Storage | Failed to delete from database |
| `STORAGE_IMAGE_FAILED` | Storage | Failed to store image attachment |
| `POLICY_NOT_FOUND` | Policy | Policy file not found |
| `POLICY_INVALID` | Policy | Policy file has invalid structure |
| `INTERNAL_UNKNOWN_TOOL` | Internal | Unknown tool name requested |
| `INTERNAL_UNKNOWN_METHOD` | Internal | Unknown MCP method requested |
| `INTERNAL_ERROR` | Internal | Unexpected internal error |

### Handling Errors in Code

```typescript
import { MCPErrorCode } from '@smartergpt/lex/mcp'; // Future export

const response = await mcpClient.call('lex.remember', args);

if (response.error) {
  switch (response.error.code) {
    case 'VALIDATION_INVALID_MODULE_ID':
      // Show user the suggestions from metadata
      const { suggestions } = response.error.metadata;
      console.log(`Did you mean: ${suggestions.join(', ')}?`);
      break;
    case 'VALIDATION_REQUIRED_FIELD':
      // Highlight missing fields
      const { missingFields } = response.error.metadata;
      console.log(`Missing: ${missingFields.join(', ')}`);
      break;
    default:
      console.error(response.error.message);
  }
}
```

## Running the MCP Server

### Via npm script (from root):
```bash
npm run remember
```

### Directly:
```bash
node dist/memory/mcp_server/frame-mcp.js
```

### Environment Variables:
- `LEX_WORKSPACE_ROOT` - Workspace/project root directory (overrides auto-detection from script location)
- `LEX_MEMORY_DB` - Path to SQLite database (default: `<workspace>/.smartergpt.local/lex/memory.db` or `~/.lex/frames.db`)
- `LEX_POLICY_PATH` - Explicit path to policy file (overrides auto-detection)
- `LEX_DB_PATH` - Alternative to LEX_MEMORY_DB for database path
- `LEX_DEFAULT_BRANCH` - Override git branch detection
- `LEX_DEBUG` - Enable debug logging

**Policy Resolution (in order of priority):**
1. `LEX_POLICY_PATH` environment variable (explicit override)
2. `LEX_WORKSPACE_ROOT` (if set) or auto-detected workspace root: `.smartergpt.local/lex/lexmap.policy.json` (working file)
3. `LEX_WORKSPACE_ROOT` (if set) or auto-detected workspace root: `policy/policy_spec/lexmap.policy.json` (example)
4. Operate without policy enforcement (allows any module IDs)

**Database Path Resolution (in order of priority):**
1. `LEX_MEMORY_DB` or `LEX_DB_PATH` environment variable (explicit override)
2. `LEX_WORKSPACE_ROOT` (if set) or auto-detected workspace root: `.smartergpt.local/lex/memory.db`
3. Home directory fallback: `~/.lex/frames.db`

### Example Usage:
```bash
echo '{"method":"tools/list"}' | LEX_DEBUG=1 node dist/memory/mcp_server/frame-mcp.js
```

## Running the HTTP API Server

### Basic Setup:

```typescript
import { createDatabase } from "lex/memory/store";
import { startHttpServer } from "lex/memory/mcp_server/http-server";

const db = createDatabase("/path/to/frames.db");

await startHttpServer(db, {
  port: 3000,
  apiKey: process.env.LEX_API_KEY,
});
```

### HTTP Endpoints:

#### POST /api/frames
Create a new Frame. Returns `201 Created` with Frame ID on success.

**Authentication:** Requires `Authorization: Bearer <api-key>` header

**Request Body:**
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

**Response (201):**
```json
{
  "id": "frame-1699564800-abc123",
  "status": "created"
}
```

**Error Responses:**
- `400 Bad Request` - Validation failed (missing required fields, invalid types)
- `401 Unauthorized` - Missing or invalid API key
- `409 Conflict` - Duplicate frame (same content hash)
- `500 Internal Server Error` - Database or server error

See [API_ERRORS.md](../../../docs/API_ERRORS.md) for complete error documentation.

#### GET /health
Health check endpoint. Returns `200 OK` with `{"status":"ok"}`.

### Environment Variables:
- `LEX_API_KEY` - API key for authentication (required for security)
- `LEX_DB_PATH` - Path to SQLite database (default: `.smartergpt.local/lex/memory.db`)
- `LEX_API_PORT` - Server port (default: `3000`)

### Example: Starting the Server

```bash
export LEX_API_KEY="your-secure-api-key"
export LEX_API_PORT=3000
node -e "
  import('./dist/memory/store/index.js').then(store => {
    import('./dist/memory/mcp_server/http-server.js').then(server => {
      const db = store.createDatabase();
      server.startHttpServer(db, {
        port: process.env.LEX_API_PORT,
        apiKey: process.env.LEX_API_KEY
      });
    });
  });
"
```

### Usage Examples:

See [API_USAGE.md](../../../docs/API_USAGE.md) for comprehensive examples including:
- curl commands
- JavaScript/TypeScript examples
- Python examples
- Batch ingestion
- Error handling
- LexRunner integration

## Integration with AI Assistants

### Claude Desktop

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

### GitHub Copilot (via MCP)

Follow GitHub Copilot's MCP configuration for stdio servers.

## Testing

```bash
# From root directory
npm test
```

**Test Coverage:**
- **Integration tests** (`src/memory/integration.test.ts`) - Full MCP protocol flow
  - MCP protocol (tools/list)
  - Frame creation with validation
  - Frame recall (fuzzy search, empty results)
  - Frame listing with filters
  - Error handling (unknown methods and tools)
- **Alias resolution tests** - Module validation flow
  - Exact matches (baseline)
  - Typo correction with suggestions
  - Substring/shorthand rejection
  - Ambiguous match handling
  - Performance validation
- **Performance benchmarks** - Validation performance
  - Exact match path performance (<0.5ms)
  - Fuzzy match path performance (<2ms)
  - Policy size scaling tests
  - Memory overhead measurements

## Architecture

```
src/memory/mcp_server/
├── frame-mcp.mjs          Entry point (stdio protocol handler)
├── server.ts              MCPServer class (request routing)
├── http-server.ts         HTTP API server setup
├── routes/
│   └── frames.ts          POST /api/frames endpoint implementation
├── tools.ts               MCP tool definitions
├── ../store/              FrameStore (SQLite + FTS5)
└── ../../shared/atlas/    Atlas Frame generation
```

## Atlas Frame

Every recall/list response includes an Atlas Frame - the spatial neighborhood around the Frame's modules:

- **Seed modules** - The modules touched in this work session
- **Fold radius** - How many hops expanded (default: 1)
- **Modules** - All modules in the neighborhood with policy metadata
- **Edges** - Allowed/forbidden calls between modules

Currently a stub implementation (returns seed modules only). Full policy graph integration pending.

## Module ID Validation (THE CRITICAL RULE)

Every string in `module_scope` MUST be a module ID that exists in `lexmap.policy.json`. This prevents vocabulary drift between memory and policy subsystems.

### How Validation Works

1. When you call `lex.remember` with `module_scope: ["auth-core"]`
2. The server validates each ID against the loaded policy
3. If validation fails, you get a helpful error with suggestions:

```json
{
  "error": {
    "message": "Invalid module IDs in module_scope:\n  • Module 'auth-core' not found in policy. Did you mean 'services/auth-core'?\n\nAvailable modules: indexer, ts, php, mcp, services/auth-core",
    "code": "INTERNAL_ERROR"
  }
}
```

4. You correct the typo and retry with the exact module ID

### Fuzzy Matching & Suggestions

The validator uses Levenshtein distance to suggest similar module names:

- **Edit distance ≤ 10** → Suggest up to 3 closest matches
- **No close matches** → Show list of all available modules
- **Exact match** → Validation passes instantly (<0.5ms)

### Example Validation Scenarios

#### Scenario 1: Exact Match (Success)
```json
{
  "module_scope": ["services/auth-core", "ui/main-panel"]
}
```
✅ Validation passes, Frame stored

#### Scenario 2: Typo (Helpful Error)
```json
{
  "module_scope": ["servcies/auth-core"]
}
```
❌ Error: "Module 'servcies/auth-core' not found. Did you mean 'services/auth-core'?"

#### Scenario 3: Shorthand Not Allowed (Yet)
```json
{
  "module_scope": ["auth"]
}
```
❌ Error: "Module 'auth' not found."

> **Future:** Explicit alias tables will support `auth` → `services/auth-core` mappings. See `src/shared/aliases/README.md`.

### Performance

- **Exact match:** ~0.5ms (O(1) hash table lookup)
- **Fuzzy suggestions:** ~2ms (only on validation failure)
- **Policy cache:** ~10KB in memory

### Strict Mode (CI)

For CI pipelines, set `LEX_STRICT_MODE=1` to disable fuzzy suggestions:

```bash
export LEX_STRICT_MODE=1
npm test
```

In strict mode:
- Only exact matches pass
- No fuzzy matching or suggestions
- Exit code 1 on any validation failure

This prevents "close enough" matches from sneaking into production.

## License

MIT
