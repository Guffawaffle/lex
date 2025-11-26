# Frame Metadata Schema

**Canonical structure for work session snapshots**

A Frame is a timestamped record of what you were doing, stored locally with structured metadata.

## Required fields

- **`id`** (string): Unique identifier for this Frame (e.g., `frame-001` or UUID)
- **`timestamp`** (string): ISO 8601 timestamp when Frame was captured (e.g., `2025-11-01T16:04:12-05:00`)
- **`branch`** (string): Git branch name where work was happening
- **`module_scope`** (array of strings): Module IDs from `lexmap.policy.json` that were touched during this work session
- **`summary_caption`** (string): Human-readable one-line summary of what was happening
- **`reference_point`** (string): Human-memorable anchor phrase for fuzzy recall (e.g., "that auth deadlock", "Add User button still disabled")
- **`status_snapshot`** (object): Current state of work:
  - **`next_action`** (string): What needs to happen next
  - **`blockers`** (array of strings, optional): General blockers
  - **`merge_blockers`** (array of strings, optional): Specific reasons merge is blocked

## Optional fields

- **`jira`** (string): Ticket ID if work is tracked in Jira/Linear/etc.
- **`keywords`** (array of strings): Tags for search/filtering
- **`atlas_frame_id`** (string): Link to associated Atlas Frame (spatial neighborhood)
- **`feature_flags`** (array of strings): Flags that were active during this session
- **`permissions`** (array of strings): Permissions required for this work
- **`tests_failing`** (array of strings): Test names that were failing
- **`image_ids`** (array of strings): Image attachment IDs (references to stored images)
- **`runId`** (string): Execution run identifier for provenance tracking (v2)
- **`planHash`** (string): Hash of the execution plan used (v2)
- **`spend`** (object): Cost tracking metadata for execution (v2)
  - **`prompts`** (number, optional): Number of prompts used
  - **`tokens_estimated`** (number, optional): Estimated token count

## Example

```json
{
  "id": "frame-001",
  "timestamp": "2025-11-01T16:04:12-05:00",
  "branch": "feature/auth-fix",
  "jira": "TICKET-123",
  "module_scope": ["ui/user-admin-panel", "services/auth-core"],
  "summary_caption": "Auth handshake timeout; Add User button disabled",
  "reference_point": "that auth deadlock",
  "status_snapshot": {
    "next_action": "Reroute user-admin-panel to call user-access-api instead of auth-core",
    "merge_blockers": ["Direct call to auth-core forbidden by policy"],
    "tests_failing": ["test_add_user_button_enabled"]
  },
  "keywords": ["auth", "timeout", "policy-violation"],
  "feature_flags": ["beta_user_admin"],
  "permissions": ["can_manage_users"],
  "runId": "lexrunner-20251109-abc123",
  "planHash": "sha256:7f8c9d...",
  "spend": {
    "prompts": 3,
    "tokens_estimated": 1500
  }
}
```

## THE CRITICAL RULE

Every string in `module_scope` MUST be a module ID that exists in `lexmap.policy.json`. This is enforced by `shared/module_ids/` validation.

If vocabulary drifts (Frame uses "auth-core" but policy has "services/auth-core"), recall will fail. Future work: `shared/aliases/` will allow fuzzy matching with confidence scores.

---

## Schema Version History

- **v1** (pre-0.4.0): Initial schema with core fields and optional metadata
- **v2** (0.4.0): Added execution provenance fields: `runId`, `planHash`, `spend`

All v2 fields are optional and backward compatible. Legacy Frames without these fields will continue to work.

---

**Integration points:**
- Created by `memory/frames/` when `/remember` is called
- Stored in `memory/store/` (SQLite with FTS5 for fuzzy search on `reference_point`)
- Retrieved by `memory/recall` which also calls `shared/atlas/` to get the fold-radius neighborhood
