# Module ID Aliasing (Future Work)

**Relaxed matching for recall, strict enforcement for CI**

This module will provide fuzzy matching and historical name resolution for module IDs, allowing humans to use shorthand during `/remember` while maintaining vocabulary alignment with `lexmap.policy.json`.

## Problem

THE CRITICAL RULE (in `shared/module_ids/`) currently requires exact matches between Frame `module_scope` and policy module IDs. This is correct for CI enforcement, but creates friction for humans:

1. **Fat-fingering:** Developer types `auth-core` instead of `services/auth-core` during `/remember`
2. **Refactoring:** Module is renamed from `services/user-access-api` to `api/user-access`, orphaning old Frames

## Planned solution: Two-mode system

### Strict mode (CI / policy enforcement)
- Used by `policy/check/` when enforcing boundaries
- Module IDs must match `lexmap.policy.json` exactly
- No fuzzy matching, no aliases
- Exit code 1 on violation

### Loose mode (recall / human-facing)
- Used by `memory/recall` when finding Frames and exporting Atlas Frames
- Allows fuzzy matching via alias table
- Returns confidence scores
- Warns user if confidence < 0.8

## Alias table format

```json
{
  "aliases": {
    "auth-core": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "shorthand"
    },
    "user-access-api": {
      "canonical": "services/user-access-api",
      "confidence": 1.0,
      "reason": "shorthand"
    },
    "services/user-access-api": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "refactored 2025-10-15"
    }
  }
}
```

## Workflow

1. Developer runs `/remember` and types `auth-core` in module list
2. `shared/module_ids/validate.ts` checks policy → not found
3. `shared/aliases/resolve.ts` checks alias table → finds `services/auth-core`
4. Frame is saved with canonical ID, but original input is logged for audit
5. Later `/recall` works because Frame has canonical ID

## Confidence scoring

- **1.0** — Explicit alias (defined in table)
- **0.9** — Fuzzy match on substring (e.g., "auth" → "services/auth-core" if only one match)
- **0.7** — Edit distance match (e.g., "auth-cor" → "services/auth-core")
- **< 0.6** — Multiple possible matches, require user clarification

## Implementation plan

1. Define alias table schema (JSON or inline in policy file)
2. Build `resolve(input: string) -> { canonical: string, confidence: number }`
3. Integrate into `memory/frames/` during Frame creation
4. Add CLI flag: `lex recall --strict` to disable fuzzy matching if needed

## Trade-offs

**Pros:**
- Humans can use shorthand without memorizing exact IDs
- Old Frames survive refactoring
- Onboarding friction reduced

**Cons:**
- Ambiguous names could surface wrong modules (mitigated by confidence threshold)
- Alias table becomes another thing to maintain (could auto-generate from policy history)

---

**Status:** Not yet implemented. This is placeholder documentation for future work.

**Depends on:**
- `shared/module_ids/` validation must work strictly first
- `lexmap.policy.json` versioning (to track historical names)
