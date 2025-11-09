#!/bin/bash
# Lex MCP Server Launcher
# This script initializes the environment and runs the Frame MCP server
# Uses absolute path to node to ensure it works in WSL environments

set -e

# Try to find node in various locations
if [ -x "/home/guff/.nvm/versions/node/v22.20.0/bin/node" ]; then
  NODE_BIN="/home/guff/.nvm/versions/node/v22.20.0/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  echo "[LEX] Error: node not found in PATH or expected locations" >&2
  echo "[LEX] Searched: /home/guff/.nvm/versions/node/v22.20.0/bin/node" >&2
  echo "[LEX] PATH: $PATH" >&2
  exit 1
fi

# Verify node exists and is executable
if [ ! -x "$NODE_BIN" ]; then
  echo "[LEX] Error: node found but not executable: $NODE_BIN" >&2
  exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Default database path (can be overridden by LEX_MEMORY_DB env var)
DEFAULT_DB_PATH="$SCRIPT_DIR/.smartergpt.local/lex/memory.db"
LEX_MEMORY_DB="${LEX_MEMORY_DB:-$DEFAULT_DB_PATH}"
export LEX_MEMORY_DB

# Log startup info when debug is enabled
if [ "$LEX_DEBUG" = "true" ] || [ "$LEX_DEBUG" = "1" ]; then
  echo "[LEX] Starting MCP server" >&2
  echo "[LEX] Node: $NODE_BIN" >&2
  echo "[LEX] Script dir: $SCRIPT_DIR" >&2
  echo "[LEX] DB path: $LEX_MEMORY_DB" >&2
fi

# Run the MCP server with absolute path
exec "$NODE_BIN" "$SCRIPT_DIR/memory/mcp_server/frame-mcp.mjs"
