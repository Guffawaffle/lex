#!/bin/bash
# Deprecated launcher tombstone. Existing callers are forwarded to the shared
# agent-readable migration diagnostic; no transport is started here.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[LEX_MCP_LEGACY_ENTRYPOINT_REMOVED] Install Node.js 24+, then replace this launcher with: npx --yes @smartergpt/lex-mcp" >&2
  exit 1
fi

exec "$(command -v node)" "$SCRIPT_DIR/src/memory/mcp_server/frame-mcp.mjs"
