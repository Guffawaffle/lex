# ADR-0001: TypeScript-Only Source with NodeNext Module Resolution

**Status**: Accepted

**Date**: 2025-11-08

**Decision Makers**: Core maintainers

---

## Context

### The Problem

Prior to this decision, the repository had a mix of `.ts` and `.js` files in `src/`, creating several issues:

1. **Ambiguity**: It was unclear which `.js` files were:
   - Hand-written source code
   - Compiled build artifacts accidentally committed
   - Intentional JavaScript source for legacy compatibility

2. **Type Safety**: Hand-written `.js` files bypassed TypeScript's type checking, leading to runtime errors that could have been caught at compile time.

3. **Maintenance Burden**: Developers had to remember which files were "real source" vs. build artifacts, causing confusion during refactoring.

4. **CI Complexity**: CI checks had to handle both `.ts` and `.js` files differently, with separate linting rules and unclear ownership.

5. **Import Resolution Confusion**: The mix of ESM and legacy module systems (CommonJS) made it difficult to:
   - Ensure imports worked correctly at runtime
   - Maintain consistency between Node.js resolution and TypeScript resolution
   - Use modern ESM features confidently

### Why This Matters

Lex is a library that needs to:
- Provide strong type safety guarantees to consumers
- Emit clean, predictable ESM modules
- Support modern Node.js (18+) without legacy CommonJS baggage
- Enable deterministic builds via TypeScript project references
- Allow developers to confidently refactor without runtime surprises

---

## Decision

We have decided to:

1. **Keep `src/` TypeScript-only**: No `.js`, `.mjs`, or `.cjs` files under `src/`. Only `.ts` and `.mts` source files.

2. **Use `NodeNext` module resolution**: Set `"moduleResolution": "NodeNext"` in `tsconfig.base.json`.

3. **Emit to single `dist/` output**: All compiled artifacts go to `dist/` (not scattered per-package).

4. **Require explicit `.js` extensions in imports**: Import statements must use `.js` extensions for local files, even though source files are `.ts`.

5. **Enforce via CI guard**: Add `scripts/check-no-js-in-src.mjs` that fails CI if any `.js` files exist in `src/`.

---

## Rationale

### Why TypeScript-Only?

**Clarity**: One file type in `src/` means one source of truth. No guessing, no confusion.

**Type Safety**: All code goes through TypeScript's type checker. No blind spots.

**Tooling**: IDEs, linters, and formatters work consistently across the entire codebase.

**Refactoring Confidence**: Rename a symbol, move a file—TypeScript tells you what breaks.

### Why NodeNext?

**Runtime Correctness**: `NodeNext` mimics Node.js's actual ESM resolution algorithm. What TypeScript accepts will work at runtime.

**Explicit Extensions**: Node.js ESM requires explicit `.js` extensions in imports. `NodeNext` enforces this at compile time, preventing runtime module resolution errors.

**Future-Proof**: `NodeNext` tracks Node.js behavior. As Node.js evolves, TypeScript's `NodeNext` setting stays aligned.

### Why Explicit `.js` Extensions?

This is the controversial part. You write:

```typescript
// In src/foo/bar.ts
import { baz } from "./utils.js"; // Note: .js, not .ts
```

Even though the source file is `utils.ts`, the import says `.js`. Why?

1. **Node.js ESM Requirement**: Node.js requires explicit extensions in ESM imports. At runtime, the code is JavaScript, so imports must point to `.js`.

2. **TypeScript Resolution**: TypeScript with `NodeNext` knows to resolve `./utils.js` imports against `./utils.ts` source files during compilation.

3. **Build Output**: After `tsc`, the emitted code has the same imports:
   ```javascript
   // In dist/foo/bar.js
   import { baz } from "./utils.js"; // Now points to actual .js file
   ```

4. **No Post-Processing**: We don't need Babel, webpack, or custom transformers to rewrite imports. TypeScript handles everything.

This approach follows the principle: **Write imports as they will appear at runtime.**

### Why Single `dist/` Output?

**Simplicity**: One place to find all build artifacts. No hunting through nested `dist/` folders.

**Package Exports**: We define `exports` in `package.json` that map to `dist/`. Consumers import from logical paths (e.g., `lex/memory/store`), and we control the physical paths.

**Incremental Builds**: TypeScript's project references enable fast incremental builds without complex per-package output management.

---

## Consequences

### Positive

✅ **Type Safety**: All code is type-checked. No `.js` escape hatches.

✅ **Consistency**: Every file in `src/` follows the same rules.

✅ **CI Confidence**: If TypeScript and the CI guard pass, the code is correctly structured.

✅ **Developer Experience**: Clear errors at compile time instead of mysterious runtime failures.

✅ **Onboarding**: New contributors see a clean, predictable structure.

✅ **Refactoring**: Renaming, moving, and restructuring are safe and fast.

### Negative

⚠️ **Import Syntax**: Developers must remember to use `.js` in imports even though files are `.ts`. This is initially unintuitive.

⚠️ **Migration Effort**: Converting existing `.js` files to `.ts` required one-time effort.

⚠️ **Learning Curve**: Understanding `NodeNext` and ESM import rules requires reading documentation.

### Mitigations

**ESLint Rule**: We added an ESLint rule to enforce `.js` extensions in imports. The linter catches mistakes.

**CI Guard**: `scripts/check-no-js-in-src.mjs` prevents accidental `.js` commits.

**Documentation**: This ADR explains the rationale. The main README includes a "Why TypeScript-Only + NodeNext?" section.

**Examples**: We provide examples in `examples/consumer/` showing correct import patterns.

---

## Alternatives Considered

### 1. Allow Hand-Written `.js` in `src/`

**Rejected**: Loses type safety, increases confusion, fragments the codebase.

### 2. Use `Node16` Instead of `NodeNext`

**Rejected**: `Node16` locks us to Node 16's behavior. `NodeNext` tracks the latest Node.js ESM semantics.

### 3. Use Relative Imports Without Extensions

**Rejected**: Breaks at runtime with Node.js ESM. Would require post-processing to add extensions.

### 4. Use Babel or Bundler to Transform Imports

**Rejected**: Adds complexity, tooling dependencies, and build fragility. TypeScript alone can handle this.

### 5. Keep Per-Package `dist/` Outputs

**Rejected**: Complicates package exports, makes incremental builds harder, scatters artifacts.

---

## Implementation

### Steps Taken

1. ✅ Removed all `.js` files from `src/` (converted to `.ts` or deleted if build artifacts)
2. ✅ Set `"moduleResolution": "NodeNext"` in `tsconfig.base.json`
3. ✅ Added `"type": "module"` to `package.json` (pure ESM)
4. ✅ Updated all imports to use `.js` extensions for local files
5. ✅ Created `scripts/check-no-js-in-src.mjs` CI guard
6. ✅ Added guard to CI pipeline (`npm run guard:no-js-src`)
7. ✅ Updated ESLint config to enforce import extensions
8. ✅ Documented rationale in README and this ADR

### Verification

```bash
# Ensure no .js files in src/
npm run guard:no-js-src

# Ensure types check correctly
npm run type-check

# Ensure linting passes
npm run lint

# Ensure runtime works
npm run build
node dist/shared/cli/lex.js --version
```

---

## Monitoring

We will monitor:
- Developer feedback on import syntax
- CI failures related to module resolution
- Issues reported by consumers of the package

If `NodeNext` causes significant problems, we can revisit. However, the benefits (type safety, runtime correctness) strongly outweigh the costs.

---

## Related

- [TypeScript Handbook: Modules](https://www.typescriptlang.org/docs/handbook/modules.html)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [TypeScript 4.7 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#esm-nodejs) (introduced `NodeNext`)

---

## Status

**Accepted** - This decision is in effect and should not be changed without another ADR.

---

## Approval

- **Proposed**: 2025-11-08
- **Accepted**: 2025-11-08
- **Implemented**: 2025-11-08

---

## Superseded By

None
