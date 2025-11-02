# memory/

**LexBrain subsystem: episodic work memory and recall**

This directory contains everything related to capturing and retrieving work session Frames.

## Subdirectories

- **`frames/`** — Frame schema definitions, metadata types, Frame creation/storage logic
- **`store/`** — Local database adapter (SQLite), Frame persistence, query/search
- **`renderer/`** — Memory card image generation (visual summary of Frame state)
- **`mcp_server/`** — Model Context Protocol stdio server exposing `/remember` and `/recall` tools

## Key concepts

A **Frame** is a timestamped snapshot of what you were doing:
- Which modules you touched (`module_scope`)
- What the blocker was (`status_snapshot.merge_blockers`)
- What the next action is (`status_snapshot.next_action`)
- Human-memorable reference point ("that auth deadlock")
- Git branch context (auto-detected or specified)

Frames are stored locally (no cloud sync, no telemetry). Retrieval is via MCP tools that assistants can call.

## Configuration

### Branch Detection

The Frame system automatically detects the current git branch when creating Frames. This can be overridden:

- **Auto-detection**: If no branch is specified when calling `lex.remember`, the system automatically detects the current git branch using `git rev-parse --abbrev-ref HEAD`
- **Environment variable**: Set `LEX_DEFAULT_BRANCH` to override auto-detection with a custom default
- **Explicit parameter**: Pass `branch` parameter to `lex.remember` to override auto-detection for specific Frames

Branch detection handles edge cases gracefully:
- **Detached HEAD**: Returns `"detached"` when HEAD is not on a branch
- **Non-git repository**: Returns `"unknown"` when not in a git repository
- **Git errors**: Falls back to `"unknown"` on any git command failures

Example:
```bash
# Use auto-detection (recommended)
lex remember ...

# Override with environment variable
LEX_DEFAULT_BRANCH=feature-branch lex remember ...

# Override with explicit parameter
lex remember --branch custom-branch ...
```

## Integration with policy/

When you `/recall` a Frame, the system:
1. Retrieves the Frame from `store/`
2. Calls `shared/atlas/` to get the fold-radius neighborhood for `module_scope`
3. Returns both the Frame (temporal anchor) and Atlas Frame (spatial anchor)

This gives context with receipts: "here's what you were doing + here's the policy boundaries that were blocking you."

---

**Note:** This code originated from the LexBrain repo during the merge to `lex`.
