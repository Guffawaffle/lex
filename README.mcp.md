# Lex MCP Server

Episodic memory and architectural policy for AI agents via Model Context Protocol.

## Quick Start

### VS Code / Copilot

Add to your MCP configuration (`.vscode/mcp.json`):

```json
{
  "servers": {
    "lex": {
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"],
      "env": {
        "LEX_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lex": {
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"]
    }
  }
}
```

### Command Line

```bash
# Install globally (optional)
npm install -g @smartergpt/lex-mcp

# Or run directly
npx @smartergpt/lex-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `frame_create` | Store episodic memory snapshot |
| `frame_search` | Search frames by reference, branch, or ticket |
| `frame_get` | Retrieve specific frame by ID |
| `frame_list` | List recent frames with filtering |
| `frame_validate` | Validate frame input (dry-run) |
| `policy_check` | Validate code against policy rules |
| `timeline_show` | Visual timeline of frame evolution |
| `atlas_analyze` | Analyze code structure and dependencies |
| `system_introspect` | Discover Lex capabilities and state |
| `help` | Usage help and examples |
| `hints_get` | Retrieve error recovery hints |

**Note:** Old tool names (`remember`, `recall`, etc.) still work as deprecated aliases. See [ADR-0009](./docs/adr/0009-mcp-tool-naming-convention.md) for details.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEX_WORKSPACE_ROOT` | Workspace root directory | Current directory |
| `LEX_MEMORY_DB` | SQLite database path | `.smartergpt/lex/lex.db` |
| `LEX_DEBUG` | Enable debug logging | Off |

## Architecture

`@smartergpt/lex-mcp` is a thin wrapper that starts the MCP server from `@smartergpt/lex`.

- **Transport:** stdio (JSON-RPC 2.0)
- **Runtime:** Node.js 18+
- **Storage:** SQLite (local, no network)

## Learn More

- [Full Documentation](./README.md)
- [Frame Memory Guide](./docs/MIND_PALACE.md)
- [Atlas Guide](./docs/atlas/README.md)
- [ADR-0009: Tool Naming](./docs/adr/0009-mcp-tool-naming-convention.md)
- [MCP Server Integration](./src/memory/mcp_server/README.md)
