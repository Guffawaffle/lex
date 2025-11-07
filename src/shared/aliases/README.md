# Module ID Aliasing

**✅ Phase 1: Explicit Alias Table - IMPLEMENTED**

This module provides alias resolution for module IDs, allowing humans to use shorthand during `/remember` while maintaining vocabulary alignment with `lexmap.policy.json`.

## Current Status

**Phase 1 (COMPLETE):** Explicit alias table with 1.0 confidence
- ✅ Alias table schema (`aliases.json`)
- ✅ Resolution API (`resolveModuleId()`)
- ✅ Integration with validation
- ✅ MCP server integration
- ✅ Canonical ID storage (aliases never stored)

**Phase 2 (PLANNED):** Auto-correction with confidence scoring  
**Phase 3 (PLANNED):** Substring and fuzzy matching

## Problem

THE CRITICAL RULE (in `shared/module_ids/`) currently requires exact matches between Frame `module_scope` and policy module IDs. This is correct for CI enforcement, but creates friction for humans:

1. **Fat-fingering:** Developer types `auth-core` instead of `services/auth-core` during `/remember`
2. **Refactoring:** Module is renamed from `services/user-access-api` to `api/user-access`, orphaning old Frames

## Phase 1 Solution: Explicit Alias Table

### How It Works

1. Developer runs `/remember` and types `auth-core` in module list
2. `shared/aliases/resolver.ts` checks if input matches policy exactly (fast path)
3. If no exact match, checks `aliases.json` for an alias entry
4. If alias found, resolves to canonical ID with confidence 1.0
5. Frame is saved with **canonical ID only** (never stores aliases)
6. Later `/recall` works because Frame has canonical ID

### Alias Table Format

Located at `shared/aliases/aliases.json`:

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

### API Usage

```typescript
import { resolveModuleId } from '../../shared/aliases/resolver.js';

// Exact match (fast path) - no alias lookup
const result1 = await resolveModuleId('services/auth-core', policy);
// { canonical: 'services/auth-core', confidence: 1.0, source: 'exact' }

// Alias resolution
const result2 = await resolveModuleId('auth-core', policy);
// { canonical: 'services/auth-core', confidence: 1.0, source: 'alias' }

// Unknown module
const result3 = await resolveModuleId('unknown-module', policy);
// { canonical: 'unknown-module', confidence: 0, source: 'fuzzy' }
```

### Integration with Validation

The `validateModuleIds()` function now:
1. Resolves all aliases first
2. Validates canonical IDs against policy
3. Returns canonical IDs for storage

```typescript
import { validateModuleIds } from '../../shared/module_ids/validation.js';

const result = await validateModuleIds(
  ['auth-core', 'services/user-access-api'],  // Input with alias
  policy
);

if (result.valid) {
  console.log(result.canonical);  
  // ['services/auth-core', 'services/user-access-api']
  // Store these in Frame.module_scope
}
```

### MCP Server Integration

The `/remember` tool in `memory/mcp_server/server.ts` now:
1. Accepts module IDs (including aliases) from user
2. Resolves all aliases via `validateModuleIds()`
3. Stores only canonical IDs in `Frame.module_scope`
4. Displays canonical IDs in the response

```typescript
// User input: ['auth-core', 'user-api']
// Frame stores: ['services/auth-core', 'services/user-access-api']
// Never stores the aliases themselves
```

## Future Phases

### Phase 2: Auto-Correction (Planned)
- Edit distance matching with confidence scores
- Suggest corrections for typos
- Confidence threshold for auto-correction

### Phase 3: Substring Matching (Planned)  
- Match partial module IDs
- Handle ambiguous cases
- Return multiple suggestions

## Confidence Scoring

Current implementation:
- **1.0** — Exact match or explicit alias (defined in table)
- **0.0** — Unknown module (no match found)

Future phases will add:
- **0.9** — Fuzzy match on substring (Phase 3)
- **0.7** — Edit distance match (Phase 2)
- **< 0.6** — Multiple possible matches, require user clarification

## Configuration

### Default Alias Table

The default `aliases.json` is empty. To add aliases:

```bash
# Edit shared/aliases/aliases.json
{
  "aliases": {
    "your-alias": {
      "canonical": "your/canonical/module-id",
      "confidence": 1.0,
      "reason": "explanation"
    }
  }
}
```

### Caching

The alias table is loaded once and cached for performance. To reload:
```typescript
import { clearAliasTableCache } from '@lex/aliases';
clearAliasTableCache();  // Force reload on next use
```

## Testing

Run tests with:
```bash
npm run test:aliases
```

Tests cover:
- Exact match bypass (performance)
- Alias resolution with confidence 1.0
- Unknown input handling
- Integration with `/remember` flow

## Files

```
shared/aliases/
├── README.md           # This file
├── aliases.json        # Default alias table (empty)
├── package.json        # Package metadata
├── tsconfig.json       # TypeScript config
├── types.ts           # Type definitions
├── resolver.ts        # Resolution logic
├── resolver.test.mjs  # Tests
└── index.ts           # Public API
```

## Trade-offs

**Pros:**
- Humans can use shorthand without memorizing exact IDs
- Old Frames survive refactoring
- Onboarding friction reduced
- Performance optimized (exact matches bypass alias lookup)

**Cons:**
- Alias table requires manual maintenance
- Could auto-generate from policy history in future

---

**Status:** ✅ Phase 1 complete. Phases 2 and 3 planned for future implementation.
