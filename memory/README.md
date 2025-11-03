# memory/

**LexBrain subsystem: episodic work memory and recall**

This directory contains everything related to capturing and retrieving work session Frames.

## Subdirectories

- **`frames/`** — Frame schema definitions, metadata types, Frame creation/storage logic
- **`store/`** — Local database adapter (SQLite), Frame persistence, query/search, image storage
- **`renderer/`** — Memory card image generation (visual summary of Frame state with embedded images)
- **`mcp_server/`** — Model Context Protocol stdio server exposing `/remember` and `/recall` tools

## Key concepts

A **Frame** is a timestamped snapshot of what you were doing:
- Which modules you touched (`module_scope`)
- What the blocker was (`status_snapshot.merge_blockers`)
- What the next action is (`status_snapshot.next_action`)
- Human-memorable reference point ("that auth deadlock")
- Optional image attachments (`image_ids`)
- Git branch context (auto-detected or specified)

Frames are stored locally (no cloud sync, no telemetry). Retrieval is via MCP tools that assistants can call.

## Image Attachments

Frames support binary image attachments stored in SQLite:
- **Supported formats:** PNG, JPEG, SVG
- **Maximum size:** 10MB per image
- **Multiple images:** Each Frame can have multiple image attachments
- **Storage:** Binary blobs in SQLite with efficient indexing
- **Rendering:** Images are embedded in memory card PNG output

### Using image attachments

When creating a Frame via `lex.remember`, include base64-encoded images:

```json
{
  "reference_point": "authentication bug",
  "summary_caption": "Login page error screenshot",
  "status_snapshot": { "next_action": "Debug auth flow" },
  "module_scope": ["ui/auth"],
  "images": [
    {
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
      "mime_type": "image/png"
    }
  ]
}
```

Images are validated (size, MIME type) and stored with the Frame. They can be retrieved individually or embedded in rendered memory cards.
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
4. Optionally renders a visual memory card with embedded images

This gives context with receipts: "here's what you were doing + here's the policy boundaries that were blocking you."

## THE CRITICAL RULE - Module ID Validation

**All Frame creations enforce module ID validation** (implemented in #23).

When you create a Frame with `/remember`, the system:
1. Loads the policy from `policy/policy_spec/lexmap.policy.json`
2. Validates that each module in `module_scope` exists in the policy
3. Rejects the Frame if validation fails, with clear error messages and suggestions

### Example: Valid Frame Creation

```javascript
{
  "reference_point": "Auth refactoring work",
  "summary_caption": "Extracted password validation",
  "status_snapshot": {
    "next_action": "Add unit tests",
    "blockers": []
  },
  "module_scope": ["indexer", "ts"]  // ✅ Valid modules from policy
}
```

### Example: Invalid Module (with suggestion)

```javascript
{
  "module_scope": ["indexr"]  // ❌ Typo
}

// Error:
// Invalid module IDs in module_scope:
//   • Module 'indexr' not found in policy.
//   Did you mean: indexer?
//
// Available modules: indexer, ts, php, mcp
```

### Example: Multiple Invalid Modules

```javascript
{
  "module_scope": ["invalid1", "ts", "invalid2"]  // ❌ Two invalid
}

// Error:
// Invalid module IDs in module_scope:
//   • Module 'invalid1' not found in policy.
//   • Module 'invalid2' not found in policy.
//
// Available modules: indexer, ts, php, mcp
```

### Why This Matters

Without strict validation, vocabulary drift occurs:
- Frame says `["auth-core"]`
- Policy defines `"services/auth-core"`
- `/recall` fails because Atlas Frame can't find the module in the policy graph

Validation enforces a **single source of truth** for module naming.

### Troubleshooting Validation Errors

**Error: "Module 'X' not found in policy"**

1. Check available modules: `cat policy/policy_spec/lexmap.policy.json | grep -A 5 patterns`
2. Use exact module names (case-sensitive)
3. Check for typos - the error will suggest similar names if available

**Custom Policy Path**

Set `LEX_POLICY_PATH` environment variable to use a different policy file:
```bash
export LEX_POLICY_PATH=/path/to/custom/policy.json
```

**Validation Performance**

Validation adds **<10ms per Frame** (policy is cached in memory after first load).

## Image Storage Performance

The image storage system has been tested with:
- ✅ Individual image sizes up to 10MB
- ✅ Multiple images per Frame
- ✅ Efficient binary blob storage in SQLite
- ✅ Fast retrieval and rendering

For large deployments with 100+ images, consider:
- Enabling SQLite WAL mode (already configured)
- Using SSD storage for the database
- Implementing periodic cleanup of old images

---

**Note:** This code originated from the LexBrain repo during the merge to `lex`.
