# Lint Budget

This directory contains the lint budget baseline tracking system.

## What is it?

The lint budget prevents **quality erosion** by tracking ESLint warnings/errors and failing CI when new issues are introduced.

## Files

- **`lint-baseline.json`** - ESLint results snapshot (769 warnings, 1 error as of v0.3.0)
- **`scripts/lint-budget.mjs`** - Comparison script that analyzes current vs baseline
- **`.github/workflows/lint-budget.yml`** - CI workflow that enforces the budget

## How it works

1. CI runs ESLint with JSON output
2. Script compares counts against `lint-baseline.json`
3. If warnings/errors increase → ❌ CI fails
4. If warnings/errors decrease → ✅ CI passes (encouraged!)

## Usage

```bash
# Check current state against baseline (what CI runs)
npm run lint:baseline:check

# Update baseline (after fixing issues or with team approval)
npm run lint:baseline:update
git add lint-baseline.json
git commit -m "chore: update lint baseline after fixes"
```

## When to update baseline

- ✅ After fixing lint warnings (lock in improvements)
- ✅ After upgrading ESLint/rules (with team discussion)
- ⚠️ When intentionally adding warnings during refactoring (requires PR approval)
- ❌ To bypass CI failures without fixing issues

## Current Status (v0.3.0)

**Total:** 769 warnings, 1 error

**Top Offenders (files):**
1. `src/policy/scanners/test_scanners.ts` - 134 warnings
2. `src/memory/mcp_server/server.ts` - 77 warnings
3. `src/shared/cli/index.ts` - 65 warnings

**Top Offenders (rules):**
1. `@typescript-eslint/no-unsafe-member-access` - 221
2. `@typescript-eslint/strict-boolean-expressions` - 182
3. `@typescript-eslint/no-unsafe-assignment` - 120

See [Issue #146](https://github.com/Guffawaffle/lex/issues/146) for the tracking issue on reducing these warnings.
