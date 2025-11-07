# LexMap Scanners

Language-specific code scanners that extract architectural facts for policy enforcement.

## Overview

The scanners are **"dumb by design"** - they observe code and report facts, but do NOT make architectural decisions. Policy enforcement happens later in the `policy/check/` step.

## Scanners

- **`ts_scanner.ts`** - TypeScript/JavaScript scanner
- **`python_scanner.py`** - Python scanner  
- **`php_scanner.py`** - PHP scanner

## Features

All scanners support:

1. **Module Resolution** - Maps files to modules via `owns_paths` patterns
2. **Cross-Module Detection** - Identifies imports/calls that cross module boundaries
3. **Feature Flag Detection** - Finds feature flag checks in code
4. **Permission Detection** - Finds permission/authorization checks

## Usage

### TypeScript Scanner

```bash
# Without policy (basic scanning)
npx tsx ts_scanner.ts <directory> > output.json

# With policy (includes module_scope and module_edges)
npx tsx ts_scanner.ts <directory> policy.json > output.json
```

### Python Scanner

```bash
# Without policy
python3 python_scanner.py <directory> > output.json

# With policy
python3 python_scanner.py <directory> policy.json > output.json
```

### PHP Scanner

```bash
# Without policy
python3 php_scanner.py <directory> > output.json

# With policy
python3 php_scanner.py <directory> policy.json > output.json
```

## Output Format

```json
{
  "language": "typescript",
  "files": [
    {
      "path": "ui/admin/panel.ts",
      "module_scope": "ui/admin",
      "declarations": [
        { "type": "class", "name": "AdminPanel" }
      ],
      "imports": [
        {
          "from": "../../services/auth/service",
          "type": "import_statement",
          "imported": ["AuthService"]
        }
      ],
      "feature_flags": ["admin_panel"],
      "permissions": ["can_manage_users"],
      "warnings": []
    }
  ],
  "module_edges": [
    {
      "from_module": "ui/admin",
      "to_module": "services/auth",
      "from_file": "ui/admin/panel.ts",
      "import_statement": "../../services/auth/service"
    }
  ]
}
```

## Feature Flag Patterns

### TypeScript/JavaScript

- `flags.flag_name` - Property access
- `flags['flag_name']` - Bracket notation
- `featureFlags.isEnabled('flag_name')` - Method call
- `FeatureFlags.enabled('flag_name')` - Static method
- `useFeatureFlag('flag_name')` - Hook pattern

### Python

- `feature_flags.is_enabled('flag_name')`
- `FeatureFlags.enabled('flag_name')`
- `settings.FEATURES['flag_name']`

### PHP

- `FeatureFlags::enabled('flag_name')`
- `$featureFlags->isEnabled('flag_name')`
- `config('features.flag_name')`

## Permission Check Patterns

### TypeScript/JavaScript

- `user.can('permission_name')`
- `hasPermission('permission_name')`
- `usePermission('permission_name')`
- `checkPermission('permission_name')`

### Python

- `user.has_perm('permission_name')`
- `check_permission('permission_name')`
- `@permission_required('permission_name')`

### PHP

- `$user->can('permission_name')`
- `Gate::allows('permission_name')`
- `$this->authorize('permission_name')`

## Module Resolution

When a policy file is provided, scanners:

1. Load the policy's `modules` definition
2. For each file, check if its path matches any module's `owns_paths` patterns
3. If matched, set the `module_scope` field
4. For each import, resolve the target module and create a `module_edge` if it's a cross-module call

Example policy:

```json
{
  "modules": {
    "ui/admin": {
      "owns_paths": ["ui/admin/**"]
    },
    "services/auth": {
      "owns_paths": ["services/auth/**"],
      "owns_namespaces": ["App\\Services\\Auth"]
    }
  }
}
```

## Integration with Pipeline

The scanners are the first step in the LexMap pipeline:

1. **Scan** - Run language scanners on codebase
2. **Merge** - Combine outputs with `policy/merge/lexmap-merge.ts`
3. **Check** - Enforce policy with `policy/check/lexmap-check.ts`

Example:

```bash
# Scan
npx tsx ts_scanner.ts src/ policy.json > ts.json
python3 python_scanner.py backend/ policy.json > py.json

# Merge
npx tsx ../merge/lexmap-merge.ts ts.json py.json > merged.json

# Check
npx tsx ../check/lexmap-check.ts merged.json policy.json
```

## Testing

Run the test suite:

```bash
npx tsx test_scanners.ts
```

Tests verify:
- File-to-module mapping (3 tests)
- Cross-module call detection (2 tests)
- Feature flag detection (3 tests)
- Permission check detection (3 tests)

## Dependencies

### TypeScript Scanner
- `typescript` - AST parsing
- `glob` - File discovery
- `minimatch` - Glob pattern matching

### Python Scanners
- Python 3.7+ standard library (no external deps)

## Common Utilities

The `common.ts` module provides shared functionality:

- `matchesOwnsPaths()` - Glob pattern matching for owns_paths
- `resolveFileToModule()` - Map file path to module ID
- `resolveImportToModule()` - Map import to module ID
- `detectFeatureFlags()` - Extract feature flag references
- `detectPermissions()` - Extract permission checks

These utilities ensure consistent behavior across all scanners.

## Development

When adding support for a new language:

1. Create a new scanner file (e.g., `rust_scanner.py`)
2. Use `common.ts` utilities for module resolution (if TypeScript/Node) or reimplement the logic
3. Follow the output schema (see existing scanners)
4. Add tests to `test_scanners.ts`
5. Update this README

## Philosophy

**Scanners are dumb by design.**

They extract facts from code:
- What classes/functions exist
- What imports are present
- What feature flags are referenced
- What permissions are checked

They do NOT decide:
- Whether an import is allowed
- Whether a boundary is violated
- Whether a pattern should be killed

That's the job of `policy/check/` which compares scanner facts against `lexmap.policy.json`.

This separation keeps scanners simple, focused, and language-specific, while policy logic remains centralized and language-agnostic.
