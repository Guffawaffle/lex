# LexMap TypeScript Scanner

The official, first-party scanner for TypeScript and JavaScript codebases. This scanner extracts architectural facts for policy enforcement.

## Overview

The TypeScript scanner is **"dumb by design"** - it observes code and reports facts, but does NOT make architectural decisions. Policy enforcement happens later in the `policy/check/` step.

**This is the primary, officially supported scanner for Lex.** It requires only Node.js (no external language runtimes).

For **optional** Python and PHP scanner examples, see `examples/scanners/README.md`.

## Features

The TypeScript scanner supports:

1. **Module Resolution** - Maps files to modules via `owns_paths` patterns
2. **Cross-Module Detection** - Identifies imports/calls that cross module boundaries
3. **Feature Flag Detection** - Finds feature flag checks in code
4. **Permission Detection** - Finds permission/authorization checks

## Usage

```bash
# Without policy (basic scanning)
npx tsx ts_scanner.ts <directory> > output.json

# With policy (includes module_scope and module_edges)
npx tsx ts_scanner.ts <directory> policy.json > output.json
```

**Note:** The `lex check` command consumes scanner JSON output directly. You typically generate scanner output as part of a build/CI pipeline, then pass the JSON to `lex check`.

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

The TypeScript scanner is the first step in the LexMap pipeline:

1. **Scan** - Run TypeScript scanner on codebase
2. **Merge** - (Optional) Combine with other scanner outputs using `policy/merge/lexmap-merge.ts`
3. **Check** - Enforce policy with the `lex check` CLI command

Example (TypeScript-only project):

```bash
# Scan your TypeScript/JavaScript codebase
npx tsx ts_scanner.ts src/ policy.json > scanner-output.json

# Check against policy
lex check scanner-output.json policy.json
```

Example (multi-language project with external scanners):

```bash
# Scan each language
npx tsx ts_scanner.ts src/ policy.json > ts.json
python3 ../../examples/scanners/python_scanner.py backend/ policy.json > py.json

# Merge scanner outputs
node ../merge/lexmap-merge.ts ts.json py.json > merged.json

# Check against policy
lex check merged.json policy.json
```

## Testing

Run the test suite:

```bash
npx tsx test_scanners.ts
```

The TypeScript scanner tests are always executed. Optional external scanner tests (Python/PHP) require:

```bash
LEX_ENABLE_EXTERNAL_SCANNER_TESTS=1 npx tsx test_scanners.ts
```

Tests verify:
- File-to-module mapping
- Cross-module call detection
- Feature flag detection
- Permission check detection

## Dependencies

- `typescript` - AST parsing
- `glob` - File discovery
- `minimatch` - Glob pattern matching (via common utilities)

All dependencies are Node.js packages included with Lex.

## Common Utilities

The `common.ts` module provides shared functionality:

- `matchesOwnsPaths()` - Glob pattern matching for owns_paths
- `resolveFileToModule()` - Map file path to module ID
- `resolveImportToModule()` - Map import to module ID
- `detectFeatureFlags()` - Extract feature flag references
- `detectPermissions()` - Extract permission checks

These utilities ensure consistent behavior across all scanners.

## Development

When adding support for scanner features:

1. Update the TypeScript scanner (`ts_scanner.ts`)
2. Use `common.ts` utilities for module resolution and pattern detection
3. Follow the output schema (see existing implementation)
4. Add tests to `test_scanners.ts`
5. Update this README

For implementing scanners in other languages, see `examples/scanners/README.md`.

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

That's the job of `policy/check/` (via the `lex check` CLI command) which compares scanner facts against `lexmap.policy.json`.

This separation keeps scanners simple, focused, and language-specific, while policy logic remains centralized and language-agnostic.

## External Language Scanners

For Python and PHP scanner examples (optional, require external runtimes), see:
- `examples/scanners/README.md`
- `examples/scanners/python_scanner.py`
- `examples/scanners/php_scanner.py`

These are community-maintained examples of the scanner plugin architecture, not part of the core Lex library.

