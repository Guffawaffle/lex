# Frame MCP Server

**Model Context Protocol server for Frame storage and recall**

Exposes Frame episodic memory to AI assistants (Copilot, Claude, etc.) via stdio.

## Features

- ✅ MCP protocol over stdio (line-delimited JSON)
- ✅ SQLite + FTS5 for fuzzy Frame recall
- ✅ Atlas Frame generation (spatial neighborhood context)
- ✅ Module ID validation with fuzzy suggestions (THE CRITICAL RULE)
- ✅ Three tools: `lex.remember`, `lex.recall`, `lex.list_frames`
- ✅ Local-first (no cloud sync, no telemetry)
- ✅ Comprehensive test suite (integration + alias resolution)

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

## Running the Server

### Via npm script (from root):
```bash
npm run remember
```

### Directly:
```bash
node memory/mcp_server/frame-mcp.mjs
```

### Environment Variables:
- `LEX_MEMORY_DB` - Path to SQLite database (default: `lex-memory.db`)
- `LEX_DEBUG` - Enable debug logging

### Example Usage:
```bash
echo '{"method":"tools/list"}' | LEX_DEBUG=1 node memory/mcp_server/frame-mcp.mjs
```

## Integration with AI Assistants

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lex-memory": {
      "command": "node",
      "args": ["/path/to/lex/memory/mcp_server/frame-mcp.mjs"],
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
cd memory/mcp_server
npm test
```

**Test Coverage:**
- **Integration tests** (`integration.test.ts`) - Full MCP protocol flow
  - MCP protocol (tools/list)
  - Frame creation with validation
  - Frame recall (fuzzy search, empty results)
  - Frame listing with filters
  - Error handling (unknown methods and tools)
- **Alias resolution tests** (`alias-integration.test.ts`) - Module validation flow
  - Exact matches (baseline)
  - Typo correction with suggestions
  - Substring/shorthand rejection
  - Ambiguous match handling
  - Performance validation
- **Performance benchmarks** (`alias-benchmarks.test.ts`) - Validation performance
  - Exact match path performance (<0.5ms)
  - Fuzzy match path performance (<2ms)
  - Policy size scaling tests
  - Memory overhead measurements

**Run specific test suites:**
```bash
npm run build
node --test dist/integration.test.js
node --test dist/alias-integration.test.js
node --test dist/alias-benchmarks.test.js
```

## Architecture

```
frame-mcp.mjs          Entry point (stdio protocol handler)
├── dist/server.js     MCPServer class (request routing)
├── dist/tools.js      Tool definitions
├── ../store/          FrameStore (SQLite + FTS5)
└── ../../shared/atlas/ Atlas Frame generation
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

> **Future:** Explicit alias tables will support `auth` → `services/auth-core` mappings. See `shared/aliases/README.md`.

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
