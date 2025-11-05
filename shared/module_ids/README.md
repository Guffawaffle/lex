# THE CRITICAL RULE Enforcement

**Module ID vocabulary alignment**

This module ensures that module IDs used in Frames match the module IDs defined in `lexmap.policy.json`. Without this alignment, we lose the ability to connect:
- "what you were doing last night" (Frame)
with
- "what the architecture allows" (policy)

## The Rule

Every module ID in a Frame's `module_scope` field MUST exist in `lexmap.policy.json`.

No ad hoc naming. No shorthand. No colloquial terms.

If a Frame says `["auth-core"]` but policy defines `"services/auth-core"`, recall will fail because `shared/atlas/` can't find the module in the policy graph.

## Why this matters

When you `/recall TICKET-123`, the system:
1. Retrieves the Frame from `memory/store/`
2. Extracts `module_scope` from the Frame
3. Calls `shared/atlas/` to get the fold-radius neighborhood from policy
4. Returns both Frame (temporal) + Atlas Frame (spatial)

If `module_scope` references a module that doesn't exist in policy, step 3 fails.

## Enforcement

**Status: ✅ ENFORCED IN PRODUCTION** (as of PR #22)

When `/remember` is called:
- Validate that each string in `module_scope` is a key in `lexmap.policy.json`
- If validation fails, reject the Frame creation with a clear error:
  ```
  Error: Invalid module IDs in module_scope:
    • Module "auth-core" not found in policy.
    Did you mean: indexer?
  
  Available modules: indexer, ts, php, mcp
  ```

This is strict. This is intentional. Loose matching leads to drift.

### Integration Points

The validation is integrated into:
- **`memory/mcp_server/server.ts::handleRemember()`** - Validates before Frame creation
- Uses **`shared/policy/loader.ts`** - Loads and caches policy
- Uses **`shared/module_ids/validator.ts`** - Performs validation with fuzzy matching

### Example Integration

```typescript
import { loadPolicy } from '../../../shared/policy/dist/policy/loader.js';
import { validateModuleIds } from '../../../shared/module_ids/dist/module_ids/validator.js';

// In handleRemember():
const policy = loadPolicy();
const validationResult = validateModuleIds(module_scope, policy);

if (!validationResult.valid && validationResult.errors) {
  // Format error message with suggestions
  const errorMessages = validationResult.errors.map(error => {
    const suggestions = error.suggestions.length > 0
      ? `\n  Did you mean: ${error.suggestions.join(', ')}?`
      : '';
    return `  • ${error.message}${suggestions}`;
  });
  
  throw new Error(
    `Invalid module IDs in module_scope:\n${errorMessages.join('\n')}\n\n` +
    `Module IDs must match those defined in lexmap.policy.json.\n` +
    `Available modules: ${Object.keys(policy.modules).join(', ')}`
  );
}
```

## Future: Aliasing

See `shared/aliases/` for planned fuzzy matching / historical name support.

The idea: strict enforcement for CI (`lex check`), but relaxed matching for recall (`lex recall`) using an alias table with confidence scores.

This will let humans use shorthand during `/remember` while still maintaining vocabulary alignment under the hood.

## Implementation

**Status: ✅ IMPLEMENTED**

The validation is now executable and integrated into Frame creation:

```typescript
import { validateModuleIds, ModuleNotFoundError } from 'shared/module_ids/index.js';
import type { ValidationResult } from 'shared/module_ids/index.js';

// Example: Validate module IDs before creating a Frame
const result = validateModuleIds(
  ['indexer', 'ts'],
  policy
);

if (!result.valid) {
  console.error('Validation failed:', result.errors);
  // [{
  //   module: 'auth-core',
  //   message: "Module 'auth-core' not found in policy. Did you mean 'indexer'?",
  //   suggestions: ['indexer']
  // }]
}
```

### API

#### `validateModuleIds(moduleScope: string[], policy: Policy): ValidationResult`

Validates that all module IDs in `moduleScope` exist in the policy.

**Parameters:**
- `moduleScope`: Array of module IDs to validate (from Frame metadata)
- `policy`: Policy object loaded from `lexmap.policy.json`

**Returns:**
- `ValidationResult` with `valid: boolean` and optional `errors` array

**Features:**
- ✅ Case-sensitive exact matching
- ✅ Fuzzy matching with Levenshtein distance for suggestions
- ✅ Clear, human-readable error messages
- ✅ Up to 3 suggestions per invalid module
- ✅ Empty `module_scope` is allowed

### Error Types

```typescript
class ModuleNotFoundError extends Error {
  module: string;
  suggestions: string[];
}

interface ValidationResult {
  valid: boolean;
  errors?: ModuleIdError[];
}

interface ModuleIdError {
  module: string;
  message: string;
  suggestions: string[];
}
```

### Example Integration

See `memory/mcp_server/server.ts::handleRemember()` for the complete integration.

### Tests

Run tests with:
```bash
npm test
```

**Module ID validation tests:** 11 tests covering validation logic  
**MCP server integration tests:** 15 tests including 5 validation integration tests

Test coverage:
- ✅ Valid module IDs pass validation
- ✅ Invalid module IDs fail with suggestions
- ✅ Empty module scope allowed
- ✅ Case sensitivity enforced
- ✅ Multiple errors reported
- ✅ Mix of valid/invalid modules handled
- ✅ All policy modules accepted

### Performance

Validation adds **<10ms per Frame creation** (policy is cached in memory after first load).

### Custom Policy Path

Set `LEX_POLICY_PATH` environment variable to use a different policy file:
```bash
export LEX_POLICY_PATH=/path/to/custom/policy.json
```

## Auto-Correction for High-Confidence Typos

**Status: ✅ IMPLEMENTED** (Phase 2)

The module resolution system now includes intelligent auto-correction for small typos when there's a single high-confidence match.

### How It Works

When you use `lex remember` and specify module IDs, the system:

1. **Exact Match**: First tries exact match (case-sensitive)
2. **Fuzzy Match**: If no exact match, finds modules within edit distance ≤ 2 (case-insensitive)
3. **Auto-Correct**: Accepts the match if:
   - Exactly 1 candidate found (unambiguous)
   - Edit distance ≤ 2
   - Confidence ≥ 0.8

### Confidence Scoring

```typescript
if (distance === 0) return 1.0;  // Exact match
if (distance === 1) return 0.9;  // 1 char off
if (distance === 2) return 0.8;  // 2 chars off
return 0;                        // Too far, reject
```

### Auto-Correction Threshold

- **Accept**: distance ≤ 2, exactly 1 match, confidence ≥ 0.8
- **Reject**: distance > 2, or multiple matches (ambiguous), or confidence < 0.8
- **Strict Mode**: Only accept confidence === 1.0 (exact match only)

### Warning Output

When auto-correction occurs, you'll see:

```
⚠️  Auto-corrected 'servcies/auth-core' → 'services/auth-core' (1 char typo)
   Original input: 'servcies/auth-core' (confidence: 0.9)
```

### Strict Mode (for CI)

Use `--strict` flag to disable auto-correction:

```bash
# Auto-correction enabled (default)
lex remember --modules "servcies/auth-core" --summary "..." --next "..."

# Strict mode - only exact matches accepted (for CI)
lex remember --strict --modules "services/auth-core" --summary "..." --next "..."
```

In strict mode, typos will cause the command to fail with suggestions:

```
❌ Module resolution failed: Module 'servcies/auth-core' not found in policy. Did you mean 'services/auth-core'?
```

### API Usage

```typescript
import { resolveModuleId } from 'shared/module_ids/index.js';
import type { ResolutionResult } from 'shared/module_ids/index.js';

// Auto-correct single-char typo
const result = resolveModuleId('servcies/auth-core', policy, false);
// {
//   resolved: 'services/auth-core',
//   original: 'servcies/auth-core',
//   confidence: 0.9,
//   corrected: true,
//   editDistance: 1
// }

// Exact match
const result = resolveModuleId('services/auth-core', policy, false);
// {
//   resolved: 'services/auth-core',
//   original: 'services/auth-core',
//   confidence: 1.0,
//   corrected: false,
//   editDistance: 0
// }

// Strict mode rejects typos
const result = resolveModuleId('servcies/auth-core', policy, true);
// throws Error: Module 'servcies/auth-core' not found in policy...
```

### Edge Cases

**Ambiguous corrections** are rejected:
```
❌ Module 'ath-core' is ambiguous. Multiple close matches found: auth-core, path-core
```

**Case sensitivity**: Case differences are auto-corrected with confidence 1.0:
```
Input: 'services/auth-Core'
Output: 'services/auth-core' (auto-corrected)
```

**Audit trail**: All auto-corrections log the original input for transparency.

---

**Called by:**
- `memory/mcp_server/server.ts::handleRemember()` - Enforces THE CRITICAL RULE on Frame creation
- `shared/cli/remember.ts` - Uses `resolveModuleId()` with auto-correction for user input
