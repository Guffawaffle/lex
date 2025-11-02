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

This will become executable validation (not just documentation):

```typescript
// shared/module_ids/validate.ts
export function validateModuleScope(
  moduleScope: string[],
  policy: Policy
): ValidationResult {
  const policyModuleIds = new Set(Object.keys(policy.modules));
  const missing = moduleScope.filter(id => !policyModuleIds.has(id));

  if (missing.length > 0) {
    return {
      valid: false,
      errors: missing.map(id => ({
        module: id,
        message: `Module "${id}" not found in policy`,
        suggestions: findSimilar(id, policyModuleIds)
      }))
    };
  }

  return { valid: true };
}
```

---

**Called by:**
- `memory/frames/` when creating a Frame via `/remember`
- `shared/cli/` when validating user input before Frame capture
