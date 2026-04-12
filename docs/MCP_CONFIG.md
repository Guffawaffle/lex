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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEX_WORKSPACE_ROOT` | Project root directory | Current directory |
| `LEX_DB_PATH` | SQLite database path | `.smartergpt/lex/memory.db` |
| `LEX_MEMORY_DB` | Alias for `LEX_DB_PATH` (backwards compat) | — |
| `LEX_DEBUG` | Enable debug logging | Disabled |

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
