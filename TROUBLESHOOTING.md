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
`better-sqlite3` or other native modules fail to load.

**Solution:**
Rebuild native dependencies:
```bash
npm rebuild better-sqlite3
```

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
`lex check` can't find `lexmap.policy.json`.

**Solution:**
Policy file should be at: `src/policy/policy_spec/lexmap.policy.json`

If you have it elsewhere, specify the path:
```bash
lex check --policy /path/to/lexmap.policy.json
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


