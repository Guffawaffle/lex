# Module ID Aliasing & Resolution

**Flexible module ID resolution for recall, strict enforcement for CI**

This module provides a multi-phase resolution strategy for module IDs, allowing humans to use shorthand during `/remember` while maintaining vocabulary alignment with `lexmap.policy.json`.

## Problem

THE CRITICAL RULE (in `shared/module_ids/`) currently requires exact matches between Frame `module_scope` and policy module IDs. This is correct for CI enforcement, but creates friction for humans:

1. **Fat-fingering:** Developer types `auth-core` instead of `services/auth-core` during `/remember`
2. **Refactoring:** Module is renamed from `services/user-access-api` to `api/user-access`, orphaning old Frames

## Solution: Multi-Phase Resolution (Phase 3 Implemented)

### Resolution Priority Order

1. **Exact match** (confidence 1.0) - fastest path
2. **Alias table** (confidence 1.0) - explicit mapping (Phase 1 - future)
3. **Fuzzy typo correction** (confidence 0.8-0.9) - single close match (Phase 2 - future)
4. **Unique substring** (confidence 0.9) - unambiguous expansion (Phase 3 - **implemented**)
5. **Reject** (confidence 0) - no match found

## Phase 3: Unique Substring Matching

### Feature Overview

Substring matching allows developers to use unambiguous shorthand for module IDs:

```typescript
import { resolveModuleId } from '@lex/aliases';

// Exact match (highest priority)
const result1 = resolveModuleId('services/auth-core', policy);
// { canonical: 'services/auth-core', confidence: 1.0, source: 'exact' }

// Unique substring match
const result2 = resolveModuleId('auth-core', policy);
// { canonical: 'services/auth-core', confidence: 0.9, source: 'substring',
//   warning: "ℹ️  Expanded substring 'auth-core' → 'services/auth-core' (unique match)" }

// Ambiguous substring - throws error
resolveModuleId('auth', policy);
// Throws AmbiguousSubstringError:
// ❌ Ambiguous substring 'auth' matches:
//    - services/auth-core
//    - services/auth-admin
//    - ui/auth-panel
//    Please use full module ID or add to alias table.
```

### Configuration Options

```typescript
interface ResolverOptions {
  noSubstring?: boolean;        // Disable substring matching (default: false)
  minSubstringLength?: number;  // Minimum substring length (default: 3)
  maxAmbiguousMatches?: number; // Max matches before truncating (default: 5)
}

// Disable substring matching with --no-substring flag
const result = resolveModuleId('auth-core', policy, { noSubstring: true });
// Throws NoMatchFoundError
```

### Warning Format

When a substring match is found, the resolver returns a warning that should be displayed to the user:

```
ℹ️  Expanded substring 'auth-core' → 'services/auth-core' (unique match)
```

### Error Handling

**Ambiguous substring:**
```
❌ Substring 'auth' is ambiguous:
   - services/auth-core
   - services/auth-admin
   - ui/auth-panel
   Please use full module ID or add to alias table.
```

**No match found:**
```
❌ No match found for module ID: 'nonexistent-module'
```

## Risks & Mitigation

### Risk: Future Ambiguity

**Problem:** "auth-core" unique today, but adding "auth-core-admin" tomorrow breaks it.

**Mitigation:**
- Phase 1 aliases are explicit (never break) - coming soon
- Phase 2 typo correction is distance-based (stable) - coming soon
- Phase 3 substring matching has lowest priority
- Clear error message guides user to add explicit alias
- CI runs in strict mode (rejects substring matches with `--no-substring`)

### Risk: Over-Matching

**Problem:** "a" substring matches too many modules.

**Mitigation:**
- Minimum substring length requirement (default: 3 chars)
- Reject if > 5 matches (too ambiguous, configurable)
- Suggest `--no-substring` in error message

## Usage Modes

### Strict mode (CI / policy enforcement)

Used by `policy/check/` when enforcing boundaries:
- Module IDs must match `lexmap.policy.json` exactly
- Use `--no-substring` flag to disable fuzzy matching
- Exit code 1 on violation

```bash
lex check --no-substring
```

### Loose mode (recall / human-facing)

Used by `memory/recall` when finding Frames and exporting Atlas Frames:
- Allows substring matching
- Returns confidence scores
- Emits warnings if confidence < 1.0

```typescript
const result = resolveModuleId('auth-core', policy);
if (result.warning) {
  console.warn(result.warning);
}
```

## Future Work

### Phase 1: Alias Table (Planned)

Explicit alias mapping for common shorthands and historical names:

```json
{
  "aliases": {
    "auth-core": {
      "canonical": "services/auth-core",
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

### Phase 2: Fuzzy Typo Correction (Planned)

Edit distance-based matching for typos:

```typescript
// "auth-cor" → "services/auth-core" (edit distance 1)
const result = resolveModuleId('auth-cor', policy);
// { canonical: 'services/auth-core', confidence: 0.8, source: 'fuzzy' }
```

## Confidence Scoring

- **1.0** — Exact match or explicit alias (Phase 1)
- **0.9** — Unique substring match (Phase 3)
- **0.7-0.8** — Edit distance match (Phase 2)
- **< 0.6** — Multiple possible matches, require user clarification

## Trade-offs

**Pros:**
- Humans can use shorthand without memorizing exact IDs
- Old Frames survive refactoring (with Phase 1 aliases)
- Onboarding friction reduced

**Cons:**
- Ambiguous names could surface wrong modules (mitigated by minimum length & confidence threshold)
- Substring matches can break when new modules are added (clear error guides user to add alias)
- Alias table becomes another thing to maintain (could auto-generate from policy history)

---

**Status:** Phase 3 (unique substring matching) is implemented and tested.

**Depends on:**
- `shared/module_ids/` validation must work strictly first ✓
- `shared/types/policy.ts` for Policy type definitions ✓
