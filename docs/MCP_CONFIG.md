# MCP Configuration Examples

## VS Code / GitHub Copilot

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "lex": {
      "type": "stdio",
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"],
      "env": {
        "LEX_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "lex": {
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"],
      "env": {
        "LEX_WORKSPACE_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

## Shared store for multi-root workspaces

When several repositories should share continuity, configure every Lex launch path with the same absolute `LEX_DB_PATH`. Keep `LEX_WORKSPACE_ROOT` pointed at the repository whose branch and policy should be active for that server:

```json
{
  "servers": {
    "lex": {
      "type": "stdio",
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"],
      "env": {
        "LEX_WORKSPACE_ROOT": "D:\\dev\\stfc-mod",
        "LEX_DB_PATH": "D:\\dev\\.smartergpt\\lex\\memory.db"
      }
    }
  }
}
```

Use the same `LEX_DB_PATH` for direct CLI commands, Codex MCP configuration, and AXF-routed Lex. Verify alignment with `lex introspect`, `lex --json introspect --format compact`, or `lex context`; each reports the canonical store path and a comparable `path-v1` identity. Lex also warns when other conventional store files exist in the project, its ancestors, or the user home directory.

For a shared PostgreSQL store, configure every surface with the same two variables instead:

```json
{
  "env": {
    "LEX_STORE": "postgres",
    "LEX_DATABASE_URL": "postgresql://lex@127.0.0.1:5432/lex",
    "LEX_POSTGRES_PASSWORD": "<from-secret-configuration>"
  }
}
```

Keep the password in the host environment or secret configuration. A password may alternatively be embedded in `LEX_DATABASE_URL`. PostgreSQL introspection reports a credential-free `postgres-v1` identity, live connection health, schema/server versions, Frame count, and capabilities. Images are reported unsupported on PostgreSQL. `LEX_DB_PATH` remains SQLite-only.

Installed CLI and MCP consumers discover `.lex.config.json` from the caller project root. This provides a file-based alternative when the host does not support environment wiring:

```json
{
  "paths": {
    "appRoot": ".",
    "database": "D:\\dev\\.smartergpt\\lex\\memory.db",
    "policy": ".smartergpt/lex/lexmap.policy.json"
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEX_WORKSPACE_ROOT` | Project root directory | Current directory |
| `LEX_STORE` | Frame backend (`sqlite` or `postgres`) | `sqlite` |
| `LEX_DATABASE_URL` | PostgreSQL URL (required for PostgreSQL) | — |
| `LEX_POSTGRES_PASSWORD` | Optional separate PostgreSQL password | — |
| `LEX_DB_PATH` | SQLite database path | `.smartergpt/lex/memory.db` |
| `LEX_MEMORY_DB` | Alias for `LEX_DB_PATH` (backwards compat) | — |
| `LEX_DEBUG` | Enable debug logging | Disabled |

`LEX_DB_PATH` takes precedence over the compatibility alias `LEX_MEMORY_DB`, then `.lex.config.json`, then the project-local default.

## Available Tools

Once configured, the following MCP tools are available:

- `frame_create` - Store a memory snapshot
- `frame_search` - Search past snapshots
- `frame_get` - Retrieve a specific frame
- `frame_list` - List recent frames
- `frame_validate` - Validate frame input
- `atlas_analyze` - Analyze code dependencies
- `timeline_show` - Show work timeline
- `hints_get` - Get hint details
- `help` - Get usage guidance
- `policy_check` - Validate against policy
- `system_introspect` - System status
- `db_stats` - Database statistics
- `turncost_calculate` - Turn cost metrics
- `contradictions_scan` - Detect conflicting information

## Quick Test

```bash
# Test the MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx @smartergpt/lex-mcp
```
