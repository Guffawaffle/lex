# Frame Schema v3 Specification

> **Status:** Stable for AX v0.1 compliance
> **Version:** 3
> **Source of Truth:** `src/shared/types/frame.ts`

This document defines the Frame schema for Lex 2.0.0, the memory unit that runners (like LexRunner) emit to capture work sessions.

---

## Overview

A **Frame** is an immutable episodic context snapshot. It captures:
- What was attempted (`summary_caption`)
- What scope was touched (`module_scope`)
- What happened next (`status_snapshot.next_action`)
- Optional metadata for provenance, tooling, and search

Runners emit Frames. Lex stores them. Agents recall them.

---

## Schema Definition

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (UUID recommended) |
| `timestamp` | `string` | ISO 8601 timestamp of creation |
| `branch` | `string` | Git branch or context identifier |
| `module_scope` | `string[]` | Modules/areas touched (e.g., `["memory/store", "cli"]`) |
| `summary_caption` | `string` | Human-readable summary of what was done |
| `reference_point` | `string` | Unique reference for recall (e.g., `"merge-weave-2025-12-01"`) |
| `status_snapshot` | `StatusSnapshot` | Current status and next action |

### StatusSnapshot (Required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `next_action` | `string` | ✅ | What should happen next |
| `blockers` | `string[]` | ❌ | Current blockers |
| `merge_blockers` | `string[]` | ❌ | Merge-specific blockers |
| `tests_failing` | `string[]` | ❌ | Failing test identifiers |

### Optional Fields (v1)

| Field | Type | Description |
|-------|------|-------------|
| `jira` | `string` | External ticket reference |
| `keywords` | `string[]` | Searchable keywords for recall |
| `atlas_frame_id` | `string` | CodeAtlas reference |
| `feature_flags` | `string[]` | Active feature flags |
| `permissions` | `string[]` | Required permissions |
| `image_ids` | `string[]` | Associated image references |

### v2 Fields (Execution Provenance)

Added in Lex 0.4.0 for runner integration:

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | Unique run/execution identifier |
| `planHash` | `string` | Hash of the plan that was executed |
| `spend` | `SpendMetadata` | Token/prompt usage tracking |

#### SpendMetadata

| Field | Type | Description |
|-------|------|-------------|
| `prompts` | `number` | Number of LLM prompts |
| `tokens_estimated` | `number` | Estimated token usage |

### v3 Fields (LexRunner Integration)

Added in Lex 0.5.0 for LexRunner 1.0.0:

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | OAuth2/JWT user identifier for isolation |
| `executorRole` | `string` | Role that executed (e.g., `"senior-dev"`, `"eager-pm"`) |
| `toolCalls` | `string[]` | MCP/CLI tools invoked during execution |
| `guardrailProfile` | `string` | Safety profile applied |

---

## TypeScript Interface

```typescript
export interface Frame {
  // Required
  id: string;
  timestamp: string;
  branch: string;
  module_scope: string[];
  summary_caption: string;
  reference_point: string;
  status_snapshot: StatusSnapshot;

  // Optional v1
  jira?: string;
  keywords?: string[];
  atlas_frame_id?: string;
  feature_flags?: string[];
  permissions?: string[];
  image_ids?: string[];

  // v2 - Execution Provenance
  runId?: string;
  planHash?: string;
  spend?: SpendMetadata;

  // v3 - LexRunner Integration
  userId?: string;
  executorRole?: string;
  toolCalls?: string[];
  guardrailProfile?: string;
}

export interface StatusSnapshot {
  next_action: string;
  blockers?: string[];
  merge_blockers?: string[];
  tests_failing?: string[];
}

export interface SpendMetadata {
  prompts?: number;
  tokens_estimated?: number;
}
```

---

## Example Frames

### Basic Frame (CLI Remember)

```json
{
  "id": "f-550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-12-01T10:30:00Z",
  "branch": "main",
  "module_scope": ["memory/store"],
  "summary_caption": "Fixed recall FTS5 hyphen handling",
  "reference_point": "ax-002-recall-fix",
  "status_snapshot": {
    "next_action": "Test with compound queries"
  },
  "keywords": ["recall", "FTS5", "search", "hyphen"]
}
```

### Runner Frame (Merge-Weave)

```json
{
  "id": "f-6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": "2025-12-01T14:00:00Z",
  "branch": "integration-2025-12-01",
  "module_scope": ["PR-101", "PR-102", "PR-103"],
  "summary_caption": "Merged 3 PRs into main via merge-weave",
  "reference_point": "merge-weave-2025-12-01-abc123",
  "status_snapshot": {
    "next_action": "Run e2e tests on integration branch",
    "blockers": []
  },
  "keywords": ["merge-weave", "integration", "PR-101", "PR-102", "PR-103"],
  "runId": "run-abc123",
  "planHash": "sha256:def456...",
  "executorRole": "senior-dev",
  "toolCalls": ["mcp_lex-pr-runner_plan_create", "mcp_lex-pr-runner_gates_run"],
  "guardrailProfile": "standard",
  "spend": {
    "prompts": 12,
    "tokens_estimated": 45000
  }
}
```

### Runner Frame (Gate Failure)

```json
{
  "id": "f-7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "timestamp": "2025-12-01T14:05:00Z",
  "branch": "integration-2025-12-01",
  "module_scope": ["PR-104"],
  "summary_caption": "Gate failure: lint failed for PR-104",
  "reference_point": "gate-failure-pr104-lint",
  "status_snapshot": {
    "next_action": "Fix lint errors in PR-104",
    "blockers": ["lint gate failed"],
    "tests_failing": ["src/cli.ts:45 - missing semicolon"]
  },
  "keywords": ["gate-failure", "lint", "PR-104"],
  "runId": "run-abc123",
  "executorRole": "senior-dev"
}
```

### Recall Search Frame (Rich Metadata)

This example shows a Frame with comprehensive metadata, typical of results from `lex recall`:

```json
{
  "id": "f-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2025-11-15T09:45:00Z",
  "branch": "feature/auth-refactor",
  "module_scope": ["auth/oauth", "auth/jwt", "policy/permissions"],
  "summary_caption": "Refactored OAuth flow with JWT token validation",
  "reference_point": "auth-refactor-phase-1",
  "status_snapshot": {
    "next_action": "Add integration tests for token refresh",
    "blockers": []
  },
  "jira": "AUTH-456",
  "keywords": ["oauth", "jwt", "authentication", "security", "refactor"],
  "atlas_frame_id": "atlas-f-a1b2c3d4",
  "feature_flags": ["new-auth-flow", "jwt-validation"],
  "permissions": ["auth:read", "auth:write"]
}
```

### Timeline Milestone Frame

This example shows a Frame marking a significant milestone, typical in `lex timeline` output:

```json
{
  "id": "f-9876fedc-ba09-8765-4321-0fedcba98765",
  "timestamp": "2025-12-01T16:30:00Z",
  "branch": "release/v2.0.0",
  "module_scope": ["release", "changelog", "docs"],
  "summary_caption": "Release v2.0.0: Frame v3 schema stable",
  "reference_point": "release-v2.0.0",
  "status_snapshot": {
    "next_action": "Publish to npm and announce",
    "blockers": []
  },
  "jira": "REL-100",
  "keywords": ["release", "v2.0.0", "stable", "frame-v3"],
  "image_ids": ["release-banner-v2.0.0.png"]
}
```

---

## Searchable Fields

For `lex recall` and runner recall, these fields are indexed:

| Field | Search Type | Notes |
|-------|-------------|-------|
| `keywords` | FTS5 full-text | Primary search target |
| `reference_point` | FTS5 full-text | Unique identifier search |
| `summary_caption` | FTS5 full-text | Natural language search |
| `module_scope` | Array contains | Scope filtering |

Search is **case-insensitive** per AX Contract §2.4.

---

## Validation

Use the validator from `src/shared/types/frame.ts`:

```typescript
import { validateFrameMetadata, FRAME_SCHEMA_VERSION } from '@lex/shared/types/frame';

const isValid = validateFrameMetadata(frame);
const version = FRAME_SCHEMA_VERSION; // 3
```

---

## Versioning Commitment

- **v3 is stable** for Lex 2.0.0 and LexRunner 1.0.0
- Fields may be **added** in minor versions (backward compatible)
- Required fields will **not change** without major version bump
- Deprecated fields will be documented for at least one major version

### Frozen Fields (Stable Contract)

These required fields are **frozen** and will not change without a major version bump:

- `id` - Unique identifier
- `timestamp` - ISO 8601 timestamp
- `branch` - Git branch or context
- `module_scope` - Array of module identifiers
- `summary_caption` - Human-readable summary
- `reference_point` - Unique reference for recall
- `status_snapshot.next_action` - Required next action

### Evolutionary Fields (May Be Added)

Optional fields may be added in minor versions without breaking compatibility:

- All v1 optional fields (`jira`, `keywords`, `atlas_frame_id`, etc.)
- All v2 provenance fields (`runId`, `planHash`, `spend`)
- All v3 runner fields (`userId`, `executorRole`, `toolCalls`, `guardrailProfile`)
- Future optional metadata fields

Runners and consumers should **ignore unknown fields** to maintain forward compatibility.

---

## Runner Integration Guide

For LexRunner Frame emission specifications, see issue [lex-pr-runner#484](https://github.com/Guffawaffle/lex-pr-runner/issues/484).

### Emitting Frames from LexRunner

1. **Import the types** (when published to npm):
   ```typescript
   import type { Frame, StatusSnapshot } from 'lex/shared/types/frame';
   ```

2. **Create a Frame** after workflow completion:
   ```typescript
   const frame: Frame = {
     id: crypto.randomUUID(),
     timestamp: new Date().toISOString(),
     branch: getCurrentBranch(),
     module_scope: mergedPRs.map(pr => `PR-${pr.number}`),
     summary_caption: `Merged ${mergedPRs.length} PRs via merge-weave`,
     reference_point: `merge-weave-${Date.now()}`,
     status_snapshot: {
       next_action: 'Run e2e tests'
     },
     runId: currentRunId,
     executorRole: 'senior-dev',
     toolCalls: collectedToolCalls
   };
   ```

3. **Store via Lex MCP** (when available):
   ```typescript
   await lexMCP.remember(frame);
   ```

---

## See Also

- [AX Contract v0.1](./AX-CONTRACT.md) - AX guarantees
- [AXError Schema](../../src/shared/errors/ax-error.ts) - Error shape
- [Frame Store](../../src/memory/store/frame-store.ts) - Storage implementation
