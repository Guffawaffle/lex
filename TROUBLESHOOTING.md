# Lex Troubleshooting Guide

This guide helps you diagnose and fix common issues with Lex.

---

## ✅ Single-Package Structure (2025-11-06)

**Status:** Repository consolidated to single package (PR #91)

**Current Structure:**
- Single root `package.json`
- All source in `src/` directory
- Relative imports (no `lex/*` package names)
- Single build command: `npm run build`
- Subpath exports for external consumers

**Key Changes from Monorepo:**
- No more cross-package `dist/` imports
- No manual build orchestration
- TypeScript project references simplified
- All dependencies in single package.json

---

## Common Build Issues

## Common Build Issues

### Build Fails with "Cannot find module"

**Problem:**
TypeScript cannot find imported modules.

**Solution:**
1. Ensure dependencies are installed: `npm ci`
2. Clean and rebuild: `npm run clean && npm run build`
3. Check that imports use relative paths from `src/`:
   ```typescript
   // ✅ Correct
   import { Frame } from "../../shared/types/frame.js";

   // ❌ Wrong (old monorepo style)
   import { Frame } from "lex/types";
   ```

### Build Succeeds but Tests Fail

**Problem:**
Tests can't find compiled output or types.

**Solution:**
1. Build first: `npm run build`
2. Run tests: `npm test`
3. Check that test files use correct relative imports

---

## Historical Issues (Fixed in Single-Package Migration)

The following issues existed in the old monorepo structure and have been resolved:

### 1. Build Order Dependency Violation (RESOLVED)

**Old Problem (Monorepo):**
The monorepo build order violated dependency chains. `module_ids` depended on `aliases`, but `aliases` was built after `module_ids`.

**Solution (Single Package):**
TypeScript project references now handle build order automatically with `tsc -b`.

---


### 2. Cross-Package Import Issues (RESOLVED)

**Old Problem (Monorepo):**
Cross-package imports using `lex/*` aliases and `/dist/` paths were fragile.

**Solution (Single Package):**
All code now uses relative imports from `src/`. No package aliases needed.

---

## Testing Issues

### Tests Can't Find Modules

**Problem:**
Tests fail with module not found errors.

**Solution:**
Run tests with the correct command:
```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:all           # All tests
```

### Native Dependencies Fail

**Problem:**
`better-sqlite3-multiple-ciphers` (our SQLite binding) fails to load, often manifesting as mass test failures (100+ tests failing with SQLite-related errors).

**Common Symptoms:**
- Tests that worked yesterday suddenly fail in bulk
- Error messages mentioning `better-sqlite3`, `SQLITE`, or native bindings
- Errors after Node.js version changes or `npm ci`

**Quick Fix:**
```bash
npm run check-sqlite   # Diagnose the problem
npm run rebuild-sqlite # Recompile for current Node
```

**Full Documentation:** See [`docs/dev/sqlite-bindings.md`](docs/dev/sqlite-bindings.md) for:
- Why native bindings break
- Common scenarios and fixes
- CI integration details
- Troubleshooting guide

**Doctrine:** We treat broken bindings as a failing gate, not a shrug.

---

## Aliasing and Module ID Issues

### Ambiguous Substring Error

**Problem:**
A substring matches multiple module IDs and the system cannot determine which one you meant.

**Example Error:**
```
Ambiguous substring 'user' matches:
  - services/user-access-api
  - services/user-profile-service
  - ui/user-admin-panel
```

**Solution:**
1. Use a more specific substring: `lex remember --modules user-access`
2. Use the full module ID: `lex remember --modules services/user-access-api`
3. Add an alias in `src/shared/aliases/aliases.json`
4. Disable substring matching for strict mode: `lex remember --modules user --no-substring`

### Module Not Found with Typo

**Problem:**
You mistyped a module ID and the system suggests similar matches.

**Example Error:**
```
Module 'servcies/auth-core' not found in policy. Did you mean 'services/auth-core'?
```

**Solution:**
1. Use the suggested correction
2. Check available modules: `cat .smartergpt/lex/lexmap.policy.json | jq '.modules | keys'`
3. Add an alias to avoid future typos

### Missing Module ID

**Problem:**
The module ID doesn't exist in the policy.

**Example Error:**
```
Module 'payment-gateway' not found in policy.
```

**Solution:**
1. Verify the module exists in `lexmap.policy.json`
2. Add the module to the policy if it should exist
3. Use the correct module ID from the policy
4. Create an alias once you find the correct name

---

## Runtime Issues

### CLI Command Not Found

**Problem:**
`lex` command doesn't work after installation.

**Solution:**
1. Build the project: `npm run build`
2. Link locally for development: `npm link`
3. Or run directly: `node dist/shared/cli/lex.js`

### Policy File Not Found

**Problem:**
`lex check` can't find the policy file.

**Solution:**
Run the setup script to initialize working files:
```bash
npm run setup-local
```

This creates `.smartergpt/lex/lexmap.policy.json` from the example template.

**Alternative:**
Specify a custom policy path:
```bash
lex check --policy /path/to/custom-policy.json
```

Or use environment variable:
```bash
LEX_POLICY_PATH=/path/to/custom-policy.json lex check
```

---

## Import Pattern Reference

### Correct Import Patterns (Single Package)

```typescript
// Types
import type { Frame } from "../../shared/types/frame.js";
import type { Policy } from "../../shared/types/policy.js";

// Functions
import { validateModuleIds } from "../../shared/module_ids/validation.js";
import { resolveModuleId } from "../../shared/aliases/resolver.js";
import { loadPolicy } from "../../shared/policy/loader.js";

// Store
import { FrameStore } from "../../memory/store/framestore.js";
```

### Old Import Patterns (DO NOT USE)

```typescript
// ❌ These were for the old monorepo structure
import { Frame } from "lex/types";
import { validateModuleIds } from "lex/module-ids";
import { resolveModuleId } from "lex/aliases/resolver";
```

---

## For External Consumers

If you're using Lex as a dependency, use the subpath exports:

```typescript
// Main entry
import { something } from "lex";

// CLI tools
import { cli } from "lex/cli";

// Policy utilities
import { checker } from "lex/policy/check";

// Memory utilities
import { FrameStore } from "lex/memory/store";

// Shared utilities
import { types } from "lex/shared/types";
```

---

## Questions?

If you're still having issues:

1. Check [FAQ](./docs/FAQ.md) for common questions
2. Open an issue on GitHub with:
   - Your Node.js version (`node --version`)
   - Your npm version (`npm --version`)
   - Full error output
   - Steps to reproduce

---

## References

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Package.json Subpath Exports](https://nodejs.org/api/packages.html#subpath-exports)


