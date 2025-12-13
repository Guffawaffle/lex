# Alias Table Maintenance Guide

A practical guide for maintaining module ID alias tables in Lex projects.

## When to Use Alias Tables

Alias tables are a **planned enhancement** (not yet implemented) that will support:

1. **Team shorthand conventions** - `auth` instead of `services/auth-core`
2. **Historical renames** - Old module names that were refactored
3. **Common typos** (optional) - Auto-correction with confidence scores

**Current status:** Fuzzy matching with suggestions is available today. Explicit alias tables are planned.

## Creating Your First Alias Table

### Minimal Setup (Single Project)

Create `.lex/aliases.json` in your repository root:

```json
{
  "$schema": "../shared/aliases/alias-schema.json",
  "version": "1.0",
  "description": "Project shorthand aliases",
  "aliases": {
    "auth": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "team shorthand"
    },
    "ui": {
      "canonical": "ui/main-panel",
      "confidence": 1.0,
      "reason": "team shorthand"
    }
  }
}
```

**Key fields:**
- `canonical` - The exact module ID from `lexmap.policy.json`
- `confidence` - 1.0 for explicit aliases, <1.0 for fuzzy matches
- `reason` - Why this alias exists (for documentation/auditing)

### Team Conventions (Multi-Project)

For organizations with multiple projects, create a shared alias table:

```json
{
  "version": "1.0",
  "description": "Organization-wide conventions",
  "aliases": {
    "auth": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "org convention"
    },
    "auth-core": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "alternate shorthand"
    },
    "db": {
      "canonical": "infrastructure/database",
      "confidence": 1.0,
      "reason": "common abbreviation"
    }
  }
}
```

Reference from your project's `.lex/aliases.json`:

```json
{
  "version": "1.0",
  "extends": "https://cdn.your-org.com/lex-aliases/base.json",
  "aliases": {
    "project-specific-alias": {
      "canonical": "project/module",
      "confidence": 1.0,
      "reason": "project shorthand"
    }
  }
}
```

## Maintenance Workflow

### Adding a New Alias

1. **Check if the module exists in policy:**
   ```bash
   grep "module-name" lexmap.policy.json
   ```

2. **Add to alias table:**
   ```json
   {
     "short": {
       "canonical": "full/module/path",
       "confidence": 1.0,
       "reason": "shorthand for convenience",
       "added_date": "2025-11-05"
     }
   }
   ```

3. **Validate the alias table:**
   ```bash
   lex alias validate .lex/aliases.json
   ```

4. **Test with a Frame:**
   ```bash
   /remember "Test alias" --modules "short"
   # Should store "full/module/path" internally
   ```

### Handling Module Renames

When refactoring renames a module:

**Before (lexmap.policy.json):**
```json
{
  "modules": {
    "services/user-access-api": {
      "owns_paths": ["services/user-access/**"]
    }
  }
}
```

**After refactoring:**
```json
{
  "modules": {
    "api/user-access": {
      "owns_paths": ["services/user-access/**"]
    }
  }
}
```

**Add alias to preserve old Frames:**
```json
{
  "aliases": {
    "services/user-access-api": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "refactored 2025-10-15",
      "deprecated": true
    }
  }
}
```

Now:
- Old Frames with `services/user-access-api` will resolve to `api/user-access`
- New Frames will use `api/user-access` directly
- Users typing the old name get a deprecation warning

### Removing Deprecated Aliases

After a grace period (e.g., 6 months):

1. **Check usage:**
   ```bash
   lex alias usage "services/user-access-api"
   # Shows how many Frames still use this alias
   ```

2. **If usage is zero, remove:**
   ```json
   {
     "aliases": {
       // Remove old alias
       // "services/user-access-api": { ... }
     }
   }
   ```

3. **If usage is non-zero, extend grace period or migrate Frames:**
   ```bash
   lex frames migrate-module \
     --from "services/user-access-api" \
     --to "api/user-access"
   ```

## Best Practices

### DO:

✅ **Use explicit 1.0 confidence for team conventions**
```json
{
  "auth": {
    "canonical": "services/auth-core",
    "confidence": 1.0,
    "reason": "team convention"
  }
}
```

✅ **Document why each alias exists**
```json
{
  "reason": "refactored from old name on 2025-10-15"
}
```

✅ **Mark deprecated aliases**
```json
{
  "deprecated": true
}
```

✅ **Use date fields for historical tracking**
```json
{
  "added_date": "2025-11-05",
  "deprecated_date": "2025-12-01"
}
```

### DON'T:

❌ **Don't create ambiguous aliases**
```json
// BAD: "ui" could mean multiple things
{
  "ui": {"canonical": "ui/admin-panel", ...},
  "ui": {"canonical": "ui/main-panel", ...}  // Conflict!
}
```

❌ **Don't use confidence <0.95 for auto-apply**
```json
// BAD: Typos should suggest, not auto-correct
{
  "athentication": {
    "canonical": "services/auth-core",
    "confidence": 0.7,  // Too low for auto-apply
    "reason": "typo"
  }
}
```

❌ **Don't alias to non-existent modules**
```json
// BAD: "fake/module" must exist in lexmap.policy.json
{
  "fake": {
    "canonical": "fake/module",  // Must be in policy!
    ...
  }
}
```

❌ **Don't use alias tables to bypass THE CRITICAL RULE**
```json
// BAD: Aliases should map to valid policy modules
{
  "random-name": {
    "canonical": "not-in-policy",  // Violates THE CRITICAL RULE
    ...
  }
}
```

## Advanced: Typo Tables (Optional)

For teams that want auto-typo-correction:

```json
{
  "$schema": "../alias-schema.json",
  "version": "1.0",
  "description": "Common typos (use with caution)",
  "aliases": {
    "athentication": {
      "canonical": "services/auth-core",
      "confidence": 0.9,
      "reason": "common typo"
    }
  },
  "recommendations": {
    "use_with_warnings": true,
    "min_confidence_for_auto_apply": 0.95,
    "always_prompt_if_below": 0.95
  }
}
```

**Important:** Set `min_confidence_for_auto_apply` high (0.95+) to avoid false corrections.

## Troubleshooting

### "Alias not found" error

```bash
/remember "Work" --modules "auth"
# Error: Module 'auth' not found in policy.
```

**Solution:** Alias tables aren't implemented yet. Use the exact module ID:
```bash
/remember "Work" --modules "services/auth-core"
```

### Circular alias

```json
{
  "alias-a": {"canonical": "alias-b", ...},
  "alias-b": {"canonical": "alias-a", ...}  // Circular!
}
```

**Error:** `Circular alias detected: alias-a -> alias-b -> alias-a`

**Solution:** Aliases must resolve to canonical module IDs from `lexmap.policy.json`, not to other aliases.

### Alias table validation fails

```bash
lex alias validate .lex/aliases.json
# Error: Module 'fake/module' not found in policy
```

**Solution:** Every `canonical` value must exist in `lexmap.policy.json`. Add it to policy first:

```json
// lexmap.policy.json
{
  "modules": {
    "fake/module": {
      "owns_paths": ["fake/**"]
    }
  }
}
```

## CI Integration

### Strict Mode (No Aliases)

For CI pipelines, enforce strict validation:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - name: Run tests with strict module validation
        run: |
          export LEX_STRICT_MODE=1
          npm test
```

In strict mode:
- Only exact module IDs are allowed
- Aliases are rejected
- Fuzzy matching is disabled
- Exit code 1 on any validation failure

### Alias Table Validation

Add a check to validate alias tables in CI:

```yaml
- name: Validate alias table
  run: lex alias validate .lex/aliases.json
```

This ensures:
- All canonical modules exist in policy
- No circular aliases
- JSON schema is valid

## Future Enhancements

The alias system will continue to evolve:

- **Auto-generation** - Suggest aliases based on usage patterns
- **Team sync** - Share alias tables across team members
- **IDE integration** - Auto-complete with aliases in VS Code
- **Migration tools** - Batch update Frames after refactoring
- **Analytics** - Track which aliases are used most

See `shared/aliases/README.md` for implementation status.

## Related Documentation

- [THE CRITICAL RULE](../module_ids/README.md) - Module ID validation
- [Alias Schema](../aliases/alias-schema.json) - JSON Schema for alias tables
- [Example Alias Tables](../aliases/examples/) - Templates for common patterns
- [FAQ](../../docs/FAQ.md) - Common questions about aliases
