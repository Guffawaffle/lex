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

## Current enforcement

When `/remember` is called:
- Validate that each string in `module_scope` is a key in `lexmap.policy.json`
- If validation fails, reject the Frame creation with a clear error:
  ```
  Error: Module "auth-core" not found in policy.
  Did you mean "services/auth-core"?
  ```

This is strict. This is intentional. Loose matching leads to drift.

## Future: Aliasing

See `shared/aliases/` for planned fuzzy matching / historical name support.

The idea: strict enforcement for CI (`lex check`), but relaxed matching for recall (`lex recall`) using an alias table with confidence scores.

This will let humans use shorthand during `/remember` while still maintaining vocabulary alignment under the hood.

## Implementation

**Status: ✅ IMPLEMENTED**

The validation is now executable and available for use:

```typescript
import { validateModuleIds, ModuleNotFoundError } from 'shared/module_ids/index.js';
import type { ValidationResult } from 'shared/module_ids/index.js';

// Example: Validate module IDs before creating a Frame
const result = validateModuleIds(
  ['services/auth-core', 'ui/user-admin-panel'],
  policy
);

if (!result.valid) {
  console.error('Validation failed:', result.errors);
  // [{
  //   module: 'auth-core',
  //   message: "Module 'auth-core' not found in policy. Did you mean 'services/auth-core'?",
  //   suggestions: ['services/auth-core']
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

See `examples/frame-validation-example.mjs` for a complete example of how to use this in Frame creation.

### Tests

Run tests with:
```bash
node shared/module_ids/validator.test.mjs
```

11 test cases covering:
- Valid module IDs
- Invalid module IDs with suggestions
- Empty module scope
- Case sensitivity
- Multiple errors
- Edge cases

---

**Called by:**
- `memory/frames/` when creating a Frame via `/remember`
- `shared/cli/` when validating user input before Frame capture
