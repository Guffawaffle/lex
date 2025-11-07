# Lex CI Troubleshooting Guide

## CI Stabilization (2025-11-06)

This document summarizes the root causes and fixes applied to stabilize the CI pipeline.

## Root Causes Fixed

### 1. Build Order Dependency Violation (P0 - Blocker)

**Problem:**
The monorepo build order violated dependency chains. `module_ids` depends on `aliases`, but `aliases` was built *after* `module_ids`, causing TypeScript compilation errors.

**Error:**
```
error TS6305: Output file '/home/runner/work/lex/lex/shared/aliases/dist/resolver.d.ts'
has not been built from source file '/home/runner/work/lex/lex/shared/aliases/resolver.ts'.
```

**Fix:**
Reordered build script in `package.json`:
```diff
- "build": "npm run build:types && npm run build:module-ids && npm run build:aliases && ..."
+ "build": "npm run build:types && npm run build:aliases && npm run build:module-ids && ..."
```

**Rationale:**
TypeScript composite project builds must respect dependency order. Since `module_ids` imports from `aliases`, we must build `aliases` first.

---

### 2. TypeScript Project References Missing (P0 - Blocker)

**Problem:**
Cross-package imports in the monorepo failed because TypeScript project references weren't properly configured, and some packages weren't marked as `composite`.

**Errors:**
```
error TS2307: Cannot find module '../types/dist/validation.js' or its corresponding type declarations.
error TS6059: File '.../shared/types/validation.ts' is not under 'rootDir' '.../shared/module_ids'.
```

**Fix:**
Added `composite: true` to base packages and configured project references:

- `shared/types/tsconfig.json` - Added `"composite": true`
- `shared/policy/tsconfig.json` - Added `"composite": true` + reference to `types`
- `shared/atlas/tsconfig.json` - Added `"composite": true` + references to `types` and `policy`
- `shared/module_ids/tsconfig.json` - Added reference to `types`

**Rationale:**
TypeScript composite projects enable incremental builds and proper cross-project type checking. The `references` array tells TypeScript about dependencies between packages.

---

### 3. Missing `await` in Async Validation Calls (P1 - High)

**Problem:**
Integration tests called `validateModuleIds()` without `await`, causing TypeScript to see `Promise<ValidationResult>` instead of `ValidationResult`.

**Error:**
```
error TS2339: Property 'valid' does not exist on type 'Promise<ValidationResult>'.
```

**Fix:**
Added `await` to validation calls in `memory/integration.test.ts`:
```typescript
- const validationResult = validateModuleIds(modules, policy);
+ const validationResult = await validateModuleIds(modules, policy);
```

**Rationale:**
`validateModuleIds` is async (returns a Promise) because it performs alias resolution. Must always be awaited.

---

### 4. Possibly Undefined Properties in MCP Tests (P1 - High)

**Problem:**
TypeScript strict mode flagged potentially undefined properties when accessing MCP response content.

**Error:**
```
error TS18048: 'recallResponse.content' is possibly 'undefined'.
```

**Fix:**
Added existence checks before accessing nested properties:
```typescript
+ assert.ok(recallResponse.content, "Response should have content");
  assert.ok(recallResponse.content[0].text.includes("first frame"));
```

Applied to all MCP response assertions in `memory/mcp_server/integration.test.ts`.

**Rationale:**
Defensive programming - always verify optional properties exist before accessing them. Improves test robustness.

---

### 5. Implicit `any` Types in Server Code (P1 - High)

**Problem:**
Anonymous function parameters in map/filter callbacks lacked explicit types, triggering implicit `any` errors.

**Errors:**
```
error TS7006: Parameter 'error' implicitly has an 'any' type.
error TS7006: Parameter 'f' implicitly has an 'any' type.
```

**Fix:**
Added explicit type annotations:
```typescript
- validationResult.errors.map(error => {
+ validationResult.errors.map((error: ModuleIdError) => {

- frames.map((f, idx) => {
+ frames.map((f: Frame, idx: number) => {

- frames.filter((f) => f.module_scope.includes(module))
+ frames.filter((f: Frame) => f.module_scope.includes(module))
```

Also imported required types:
```typescript
import type { Frame } from "../../frames/types.js";
import type { ModuleIdError } from "../../../shared/types/dist/validation.js";
```

**Rationale:**
TypeScript strict mode (`noImplicitAny`) requires all parameters to have explicit types. Improves type safety and IDE autocomplete.

---

### 6. Missing Test Utility Method (P2 - Medium)

**Problem:**
Performance tests expected `FrameStore.getDatabase()` method which didn't exist.

**Error:**
```
error TS2339: Property 'getDatabase' does not exist on type 'FrameStore'.
```

**Fix:**
Added internal accessor method to `memory/store/framestore.ts`:
```typescript
/**
 * Get the underlying database instance (for testing/internal use)
 * @internal
 */
getDatabase(): Database.Database {
  return this.db;
}
```

**Rationale:**
Tests need access to the underlying database for performance benchmarks and direct SQL operations. Marked `@internal` to discourage production use.

---

### 7. Missing CLI Option Type (P2 - Medium)

**Problem:**  
CLI code referenced `noSubstring` option that wasn't defined in `RememberOptions` interface.

**Error:**
```
error TS2353: Object literal may only specify known properties, 
and 'noSubstring' does not exist in type 'RememberOptions'.
```

**Fix:**  
Added missing property to `shared/cli/remember.ts`:
```typescript
export interface RememberOptions {
  // ... existing options ...
  noSubstring?: boolean;
}
```

**Rationale:**  
The `noSubstring` flag controls whether alias resolution should match substrings. This option was implemented but not properly typed.

---

### 8. Native Dependencies with Hermetic Install (P1 - High)

**Problem:**  
Using `npm ci --ignore-scripts` skips postinstall scripts, which prevented `better-sqlite3` from building its native bindings.

**Error:**
```
Could not locate the bindings file. Tried:
 → /node_modules/better-sqlite3/build/better_sqlite3.node
 → ...
```

**Fix:**  
Added explicit rebuild step after hermetic install in CI workflow:
```yaml
- name: Install dependencies (hermetic)
  run: npm ci --ignore-scripts

- name: Build native dependencies  
  run: npm rebuild better-sqlite3
```

**Rationale:**  
Hermetic installs (`--ignore-scripts`) improve security by preventing arbitrary code execution during install, but native modules like `better-sqlite3` require compilation. Explicitly rebuilding only the necessary native dependencies provides the best of both worlds: security and functionality.

---

## TestingAll fixes verified locally:

```bash
npm run build     # ✅ Clean build
npm run type-check  # ✅ No TypeScript errors
npm test          # ✅ All unit tests pass
```

## Future Improvements

### Short-term (Next PR)
- [ ] Standardize workflow installs (use `--ignore-scripts` everywhere or nowhere)
- [ ] Add build caching between CI jobs
- [ ] Pin GitHub Actions to SHAs for security

### Medium-term
- [ ] Add `npm run test:exports` to verify all package exports resolve correctly
- [ ] Move to stricter `egress-policy: block` once dependencies are stable
- [ ] Enable Windows/macOS matrix once Linux is consistently green

### Long-term
- [ ] Migrate to Changesets for version management
- [ ] Add Codecov "patch" status checks (project coverage is informational)
- [ ] Soft-fail security scans (Snyk/npm audit) when secrets aren't configured

---

## References

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Composite Projects](https://www.typescriptlang.org/tsconfig#composite)
- [GitHub Actions Hermetic Builds](https://github.com/actions/runner/issues/1762)

