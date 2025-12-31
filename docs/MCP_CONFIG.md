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
| `LEX_MEMORY_DB` | SQLite database path | `.smartergpt/lex/lex.db` |
| `LEX_DEBUG` | Enable debug logging | Disabled |

## Available Tools

Once configured, the following MCP tools are available:

- `lex_frame_create` - Store a memory snapshot
- `lex_frame_search` - Search past snapshots
- `lex_frame_get` - Retrieve a specific frame
- `lex_frame_list` - List recent frames
- `lex_frame_validate` - Validate frame input
- `lex_atlas_analyze` - Analyze code dependencies
- `lex_timeline_show` - Show work timeline
- `lex_hints_get` - Get hint details
- `lex_help` - Get usage guidance
- `lex_policy_check` - Validate against policy
- `lex_system_introspect` - System status

## Quick Test

```bash
# Test the MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx @smartergpt/lex-mcp
```
