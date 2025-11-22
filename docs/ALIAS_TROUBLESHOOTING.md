# Alias Resolution: DX Failure Modes and Troubleshooting

This guide documents common failure modes when using Lex's aliasing system and how to resolve them.

## Table of Contents

1. [Ambiguous Substring Matches](#ambiguous-substring-matches)
2. [Module Not Found Errors](#module-not-found-errors)
3. [Typo Detection and Suggestions](#typo-detection-and-suggestions)
4. [Alias Configuration Errors](#alias-configuration-errors)
5. [Strict Mode CI Failures](#strict-mode-ci-failures)
6. [Historical Rename Issues](#historical-rename-issues)
7. [Performance and Caching Problems](#performance-and-caching-problems)

---

## Ambiguous Substring Matches

### Symptom

```
Warning: Substring 'user' matches multiple modules:
  - api/user-access
  - ui/user-admin-panel
  - services/user-management
Please use full module ID or add to alias table.
```

### Cause

You used a shorthand that matches multiple modules in your policy. Lex cannot determine which one you meant.

### Resolution Options

#### Option 1: Use Full Module ID (Quick Fix)

```bash
# Instead of:
lex remember --modules "user"

# Use:
lex remember --modules "api/user-access"
```

#### Option 2: Add Explicit Alias (Permanent Fix)

Edit `.smartergpt.local/lex/aliases.json`:

```json
{
  "aliases": {
    "user": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "team convention: 'user' refers to backend API, not UI"
    }
  }
}
```

Now `user` unambiguously resolves to `api/user-access`.

#### Option 3: Use Different Shorthand

```json
{
  "aliases": {
    "user-api": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "backend user API"
    },
    "user-ui": {
      "canonical": "ui/user-admin-panel",
      "confidence": 1.0,
      "reason": "user admin UI"
    }
  }
}
```

### Prevention

- Choose module IDs with minimal overlap
- Document your team's aliasing conventions
- Add aliases proactively for common shorthands

---

## Module Not Found Errors

### Symptom

```
Error: Module 'auth' not found in policy.
Did you mean 'services/auth-core'?
```

### Cause

The module ID you used doesn't exist in your `lexmap.policy.json`, and no alias is defined for it.

### Resolution

#### If the Suggestion is Correct

Add an alias:

```json
{
  "aliases": {
    "auth": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "team shorthand"
    }
  }
}
```

#### If the Module Actually Doesn't Exist

Check your policy file:

```bash
# List all modules in policy
cat .smartergpt.local/lex/lexmap.policy.json | jq '.modules | keys'
```

Possibilities:
1. **Typo in module ID** → Fix the typo
2. **Module not yet added to policy** → Add it to `lexmap.policy.json`
3. **Module was renamed** → Add historical alias (see [Historical Rename Issues](#historical-rename-issues))

---

## Typo Detection and Suggestions

### Symptom

```
Error: Module 'services/auth-cor' not found in policy.
Did you mean 'services/auth-core'?
```

### Cause

You made a typo in the module ID.

### Resolution

#### Quick Fix: Use Suggested Module

```bash
# Instead of:
lex remember --modules "services/auth-cor"

# Use suggestion:
lex remember --modules "services/auth-core"
```

#### Permanent Fix: Add Typo to Alias Table (Optional)

If this is a **common typo** your team makes:

```json
{
  "aliases": {
    "auth-cor": {
      "canonical": "services/auth-core",
      "confidence": 0.9,
      "reason": "common typo"
    }
  }
}
```

**Note:** Only add common typos. Don't clutter your alias table with every possible mistake.

### How Typo Detection Works

Lex uses:
1. **Substring matching** (confidence 0.9) — "auth-cor" contains "auth-cor"
2. **Edit distance** (future) — Levenshtein distance for close matches
3. **Common prefixes** — "services/auth-cor" vs "services/auth-core"

### Best Practices

- **Don't add aliases for typos** unless they're extremely common
- **Use exact IDs in automation** to avoid typo propagation
- **Enable autocomplete in your editor** to prevent typos

---

## Alias Configuration Errors

### Symptom 1: Alias Points to Nonexistent Module

```
Error: Alias 'auth' points to unknown module 'services/auth-core'
Module 'services/auth-core' not found in policy.
```

**Cause:** Your alias table references a module that doesn't exist.

**Resolution:**

1. Check if the module exists:
   ```bash
   cat .smartergpt.local/lex/lexmap.policy.json | jq '.modules["services/auth-core"]'
   ```

2. If it doesn't exist, either:
   - Add the module to your policy
   - Fix the alias to point to the correct module

### Symptom 2: Circular Alias

```
Error: Circular alias detected: 'auth' → 'auth-core' → 'auth'
```

**Cause:** Aliases reference each other in a loop.

**Resolution:**

Fix the alias table to point directly to canonical IDs:

```json
// ❌ Bad: Circular
{
  "aliases": {
    "auth": { "canonical": "auth-core" },
    "auth-core": { "canonical": "auth" }
  }
}

// ✅ Good: Both point to policy module
{
  "aliases": {
    "auth": { "canonical": "services/auth-core" },
    "auth-core": { "canonical": "services/auth-core" }
  }
}
```

### Symptom 3: Invalid JSON

```
Error: Failed to parse alias table: Unexpected token } in JSON
```

**Cause:** Syntax error in `aliases.json`.

**Resolution:**

1. Validate JSON:
   ```bash
   cat .smartergpt.local/lex/aliases.json | jq .
   ```

2. Fix syntax errors (trailing commas, missing quotes, etc.)

3. Use a JSON validator or linter

---

## Strict Mode CI Failures

### Symptom

```
CI FAILED: Module 'auth-core' not found in policy (strict mode: no fuzzy matching)
```

### Cause

Your CI pipeline runs in strict mode, which only accepts:
- Exact matches (confidence 1.0)
- Explicit aliases (confidence 1.0)

But you used a substring or typo.

### Resolution

#### Option 1: Add Explicit Alias

```json
{
  "aliases": {
    "auth-core": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "team shorthand"
    }
  }
}
```

#### Option 2: Use Exact Module ID

```bash
# In LexRunner config or PR definition
modules: ["services/auth-core"]  # Not "auth-core"
```

#### Option 3: Review PR Before CI

Locally test with strict mode:

```bash
LEX_STRICT_MODE=1 lexrunner validate-pr pr-123.json
```

### Why Strict Mode Exists

- **Prevents typo propagation** — Forces explicit definitions
- **Ensures reproducibility** — No fuzzy matching in prod
- **Catches errors early** — Fails fast on ambiguous input

### When to Use Strict Mode

| Environment | Strict Mode? | Reason |
|-------------|--------------|--------|
| **CI/CD** | ✅ YES | Reproducibility, no ambiguity |
| **Production LexRunner** | ✅ YES | Prevents typos in automation |
| **Local Development** | ❌ NO | DX: allow substring matching |
| **Interactive CLI** | ❌ NO | User-friendly fuzzy matching |

---

## Historical Rename Issues

### Symptom 1: Old Frames Reference Renamed Module

```
Warning: Frame 'frame-abc-123' references module 'services/user-access-api'
Module not found in current policy.
```

### Cause

A module was renamed in your policy, but old frames still reference the old name.

### Resolution

Add historical alias:

```json
{
  "aliases": {
    "services/user-access-api": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "refactored 2025-11-09"
    }
  }
}
```

Now old frames resolve correctly when queried.

### Symptom 2: PR Uses Old Module Name After Rename

```
Error: Module 'services/user-access-api' not found in policy.
This module was renamed to 'api/user-access'.
```

### Cause

Someone is using the old module name in a new PR.

### Resolution

If intentional (backward compat), add alias. If accidental, update the PR:

```bash
# Update PR to use new name
lexrunner update-pr pr-123 --modules "api/user-access"
```

### Best Practices for Renames

1. **Before rename:**
   - Document in README: "Module X will be renamed to Y on DATE"
   - Notify team via Slack/email

2. **During rename:**
   - Update policy file
   - Add historical alias immediately
   - Test old frames still resolve

3. **After rename:**
   - Monitor alias usage: `lex alias usage "old-module-name"`
   - Deprecate alias after 6-12 months if appropriate
   - Optionally migrate old frames (risky, not recommended)

---

## Performance and Caching Problems

### Symptom 1: Slow Resolution

```
Warning: Module resolution took 2500ms (expected < 100ms)
```

### Cause

- Alias table not cached
- Large policy file (1000+ modules)
- Repeated disk reads

### Resolution

1. **Verify caching is working:**
   ```typescript
   import { loadAliasTable } from 'lex/shared/aliases';

   // Table is cached after first load
   const table1 = loadAliasTable(); // Slow (disk read)
   const table2 = loadAliasTable(); // Fast (cached)
   ```

2. **Pre-warm cache in LexRunner:**
   ```typescript
   // At startup, load once
   const aliasTable = loadAliasTable();

   // Pass to all subsequent calls
   await resolveModuleId('auth', policy, aliasTable);
   ```

3. **Profile resolution:**
   ```typescript
   console.time('resolve');
   await resolveModuleId('auth', policy);
   console.timeEnd('resolve'); // Should be < 10ms
   ```

### Symptom 2: Stale Cache After Alias Update

```
Bug: I updated aliases.json but changes aren't reflected
```

### Cause

Alias table is cached in memory. Changes require cache clear or restart.

### Resolution

#### For Long-Running Processes (LexRunner)

```typescript
import { clearAliasTableCache } from 'lex/shared/aliases';

// When alias table changes (e.g., file watch or reload command)
clearAliasTableCache();
const newTable = loadAliasTable(); // Reads fresh from disk
```

#### For CLI

Restart the process. Cache is cleared on exit.

#### For Tests

```typescript
import { clearAliasTableCache } from 'lex/shared/aliases';

beforeEach(() => {
  clearAliasTableCache(); // Fresh table for each test
});
```

---

## Common Resolution Patterns

### Pattern: Debugging Failed Resolution

```typescript
import { resolveModuleId } from 'lex/shared/aliases';

const resolution = await resolveModuleId('auth', policy, aliasTable);

console.log('Original:', resolution.original);
console.log('Canonical:', resolution.canonical);
console.log('Confidence:', resolution.confidence);
console.log('Source:', resolution.source);

if (resolution.confidence < 1.0) {
  console.warn('⚠️  Low confidence resolution!');
  console.warn('Consider adding explicit alias or using exact ID');
}
```

### Pattern: Validating Alias Table

```typescript
import { loadAliasTable } from 'lex/shared/aliases';
import { loadPolicy } from 'lex/shared/policy';

async function validateAliasTable(aliasPath: string, policyPath: string) {
  const table = loadAliasTable(aliasPath);
  const policy = await loadPolicy(policyPath);

  const errors: string[] = [];

  for (const [alias, entry] of Object.entries(table.aliases)) {
    if (!policy.modules[entry.canonical]) {
      errors.push(`Alias '${alias}' points to unknown module '${entry.canonical}'`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Alias table validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('✅ Alias table valid');
}
```

## Summary Table: Error Types and Resolutions

| Error Type | Confidence | Quick Fix | Permanent Fix | CI Impact |
|------------|-----------|-----------|---------------|-----------|
| **Ambiguous substring** | 0.0 | Use full ID | Add alias | Blocks if strict |
| **Module not found** | 0.0 | Fix typo | Add to policy | Blocks always |
| **Typo** | 0.9 (substring) | Use suggestion | Add alias (optional) | Blocks if strict |
| **Invalid alias config** | N/A | Fix JSON | Validate table | Blocks always |
| **Historical rename** | 1.0 (with alias) | Add alias | N/A | No impact |
| **Stale cache** | N/A | Restart | Clear cache | No impact |

---

## Related Documentation

- [Alias System README](../src/shared/aliases/README.md) — Implementation details
- [Migration Guide](../src/shared/aliases/MIGRATION_GUIDE.md) — Handling renames
- [Module ID Validation](../src/shared/module_ids/README.md) — THE CRITICAL RULE

---

## Getting Help

If you encounter an error not covered here:

1. **Check logs:** Enable debug mode with `LEX_DEBUG=1`
2. **Validate inputs:** Test with minimal example
3. **Search issues:** Check if it's a known problem
4. **File a bug:** Include error message, alias table, and policy file (redacted)
