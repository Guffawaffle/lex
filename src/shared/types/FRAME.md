# Frame Metadata Schema

This is the source-adjacent guide to the current public Frame record. The normative behavioral
contract lives in `docs/CONTRACT_SURFACE.md`; the public TypeScript contract and Zod validator live
in `frame.ts` and `frame-schema.ts`.

`FRAME_SCHEMA_VERSION = 7`. The version is package metadata, not a required field on every Frame.

## Required fields

- `id`: opaque non-empty string
- `timestamp`: ISO 8601 creation time
- `branch`: Git branch or context identifier
- `module_scope`: one or more module IDs
- `summary_caption`: human-readable summary
- `reference_point`: recall anchor
- `status_snapshot.next_action`: the next action

`status_snapshot` may also contain `blockers`, `merge_blockers`, and `tests_failing` string arrays.

## Optional fields

- v1: `jira`, `keywords`, `atlas_frame_id`, `feature_flags`, `permissions`, and `image_ids`
- v2 execution provenance: `runId`, `planHash`, and `spend`
- v3 execution metadata: `userId`, `executorRole`, `toolCalls`, and `guardrailProfile`
- v4 coordination metadata: `turnCost`, `capabilityTier`, and `taskComplexity`
- v5 consolidation metadata: `superseded_by` and `merged_from`
- v6 contradiction metadata: `contradiction_resolution`
- v7 module provenance: `module_attribution`

`module_attribution` records whether `module_scope` was explicit, inferred, or a fallback, together
with confidence and evidence. Scope-bound stores derive tenant/workspace ownership and creator
attribution from their authorized binding; callers do not add those authority fields to a Frame.

## Example

```json
{
  "id": "frame-001",
  "timestamp": "2026-07-18T10:00:00Z",
  "branch": "feature/auth-fix",
  "module_scope": ["services/auth-core"],
  "summary_caption": "Resolved the authentication handshake timeout",
  "reference_point": "that auth deadlock",
  "status_snapshot": {
    "next_action": "Run the integration suite",
    "tests_failing": ["auth-handshake"]
  },
  "keywords": ["auth", "timeout"],
  "module_attribution": {
    "mode": "explicit",
    "confidence": "high",
    "evidence": ["caller supplied services/auth-core"]
  }
}
```

Every `module_scope` value must be a module ID accepted by the active `lexmap.policy.json`. This
shared vocabulary is what keeps recall and policy evaluation deterministic.
