# Type and Lint Status — Lex Repository

**Date:** 2025-11-22
**Branch:** `merge-weave/umbrella-20251122-2155`
**Author:** Claude (via GitHub Copilot)

---

## Commands

### Canonical Type Check Command
```bash
npm run type-check
# Executes: tsc -p tsconfig.build.json --noEmit
```

**Status:** ✅ **PASSING** (0 errors)

### Canonical Lint Command
```bash
npm run lint
# Executes: eslint .
```

**Status:** ⚠️ **116 warnings, 0 errors**

---

## Summary

### Type Errors
- **Total:** 0
- **Status:** All TypeScript compilation passes successfully

### Lint Warnings
- **Total:** 116 warnings
- **Errors:** 0

**Breakdown by Rule:**

| Rule ID | Count | Category |
|---------|-------|----------|
| `@typescript-eslint/no-unused-vars` | 55 | Unused code |
| `@typescript-eslint/no-explicit-any` | 26 | Type safety |
| `@typescript-eslint/no-unsafe-member-access` | 18 | Type safety |
| `@typescript-eslint/no-unsafe-assignment` | 10 | Type safety |
| `@typescript-eslint/no-unsafe-call` | 3 | Type safety |
| `@typescript-eslint/no-unsafe-return` | 3 | Type safety |
| `@typescript-eslint/restrict-template-expressions` | 1 | Type safety |

---

## Buckets

### Bucket 1: Unused Variables and Imports (55 warnings)
**Rule:** `@typescript-eslint/no-unused-vars`

**Pattern:** Variables, imports, and function parameters defined but never used.

**Affected Areas:**
- **Test files:** Majority of unused vars are in test files (`test/**/*.test.ts`, `test/**/*.spec.mjs`)
  - Unused test lifecycle hooks (`before`, `after`)
  - Unused imports from test utilities
  - Unused error variables in catch blocks
- **Renderer modules:** `src/memory/renderer/` (card.ts, graph.ts, layouts.ts, syntax.ts, timeline.example.ts)
- **Shared modules:** Unused type imports in `src/shared/aliases/`, `src/shared/atlas/`

**Examples:**
```typescript
// test/memory/mcp_server/alias-benchmarks.test.ts:22
const { before, after } = require('node:test'); // 'after' never used

// src/memory/renderer/card.ts:16
function wrapText(...) { ... } // Defined but never used

// test/shared/aliases/resolution.spec.mjs:11
import { strict as assert } from "assert"; // 'assert' never used
```

---

### Bucket 2: Explicit `any` Types (26 warnings)
**Rule:** `@typescript-eslint/no-explicit-any`

**Pattern:** Direct use of `any` type annotations, bypassing type safety.

**Affected Areas:**
- **MCP Server:** `src/memory/mcp_server/server.ts` (14 occurrences)
- **CLI commands:** `src/shared/cli/{check,recall,remember,timeline}.ts`
- **Store queries:** `src/memory/store/queries.ts`
- **Aliases resolver:** `src/shared/aliases/resolver.ts`
- **Other modules:** `src/memory/mcp_server/{routes/frames,tools}.ts`, `src/memory/renderer/syntax.ts`

**Examples:**
```typescript
// src/memory/mcp_server/server.ts:35
function handler(req: any, res: any) { ... } // Express handlers using any

// src/shared/cli/check.ts:117
} catch (error: any) { ... } // Error handling with any

// src/memory/store/queries.ts:126
export function handleDbError(err: any): void { ... }
```

---

### Bucket 3: Unsafe `any` Operations (34 warnings)
**Rules:**
- `@typescript-eslint/no-unsafe-member-access` (18)
- `@typescript-eslint/no-unsafe-assignment` (10)
- `@typescript-eslint/no-unsafe-call` (3)
- `@typescript-eslint/no-unsafe-return` (3)

**Pattern:** Operations on values typed as `any`, which could cause runtime errors.

**Affected Areas:**
- **Templates/Renderers:** `src/memory/renderer/templates.ts` (12 unsafe member accesses)
  - Accessing properties on `any` typed frame data
- **Database operations:** `src/memory/store/{db.ts,queries.ts}`
- **Policy/Prompts:** `src/policy/merge/lexmap-merge.ts`, `src/shared/prompts/renderer.ts`
- **Scanners:** `src/policy/scanners/ts_scanner.ts`
- **Schema loader:** `src/shared/schemas/loader.ts` (3 unsafe returns)

**Examples:**
```typescript
// src/memory/renderer/templates.ts:137
const caption = frame.summary_caption; // Unsafe access on any-typed frame

// src/shared/schemas/loader.ts:82
return JSON.parse(content); // Returns any without type assertion

// src/memory/store/db.ts:77
const result = stmt.run(...); // Database result typed as any
```

---

### Bucket 4: Template Expression Type Issues (1 warning)
**Rule:** `@typescript-eslint/restrict-template-expressions`

**Pattern:** Using `unknown` typed values in template literals.

**Affected File:**
- `src/policy/scanners/ts_scanner.ts:108`

**Example:**
```typescript
// Invalid type "unknown" of template literal expression
const message = `Error: ${unknownValue}`;
```

---

## Staged Plan to Reach 0 Errors / 0 Warnings

### Phase 1: Safe and Mostly Automatic Fixes
**Scope:** Unused variables/imports, simple cleanup
**Risk Level:** 🟢 Low
**Estimated Files:** ~35 files
**Effort:** 2-4 hours

#### Sub-phases:

1. **Phase 1a: Test Files Cleanup**
   - **Target:** Remove unused test lifecycle imports (`before`, `after`)
   - **Files:** `test/**/*.test.ts`, `test/**/*.spec.mjs`
   - **Method:** Remove unused imports, or prefix with `_` if semantically needed
   - **Validation:** Run `npm test` to ensure tests still pass

2. **Phase 1b: Dead Code Removal**
   - **Target:** Functions and variables that are clearly unused
   - **Files:** `src/memory/renderer/{card,syntax,timeline.example}.ts`
   - **Method:** Remove or comment out with explanation
   - **Validation:** Run `npm run type-check` and `npm test`

3. **Phase 1c: Catch Block Error Variables**
   - **Target:** Unused error variables in catch blocks
   - **Files:** Various test files
   - **Method:** Prefix with `_` (e.g., `catch (_e)`) to indicate intentional non-use
   - **Validation:** Lint should accept `_`-prefixed variables

**Deliverables:**
- Reduction of ~40-50 unused variable warnings
- No behavior changes
- All tests passing

---

### Phase 2: Mechanical Type Improvements
**Scope:** Add explicit types where obvious, tighten type safety
**Risk Level:** 🟡 Medium
**Estimated Files:** ~20 files
**Effort:** 4-8 hours

#### Sub-phases:

1. **Phase 2a: Type Express Handlers**
   - **Target:** Replace `any` in Express request/response handlers
   - **Files:** `src/memory/mcp_server/server.ts`
   - **Method:** Use `Request`, `Response` from `@types/express`
   - **Validation:** MCP server integration tests

2. **Phase 2b: Type Error Handlers**
   - **Target:** Replace `error: any` in catch blocks with `unknown` + type guards
   - **Files:** CLI commands, database queries, scanners
   - **Method:**
     ```typescript
     catch (error: unknown) {
       const message = error instanceof Error ? error.message : String(error);
     }
     ```
   - **Validation:** Error handling tests

3. **Phase 2c: Type Database Results**
   - **Target:** Add return types for database query functions
   - **Files:** `src/memory/store/{db,queries}.ts`
   - **Method:** Define interfaces for query results, cast `better-sqlite3` results
   - **Validation:** Database tests, type-check

4. **Phase 2d: Type Schema Loader Returns**
   - **Target:** Fix `no-unsafe-return` in schema loader
   - **Files:** `src/shared/schemas/loader.ts`
   - **Method:** Define return types for schema objects, use type assertions
   - **Validation:** Schema validation tests

**Deliverables:**
- Reduction of ~30-40 type safety warnings
- Improved IDE autocomplete and type inference
- Better error messages at development time

---

### Phase 3: Design-Level Type Safety
**Scope:** Refactor `any`-heavy modules, add domain types
**Risk Level:** 🔴 High
**Estimated Files:** ~10 files
**Effort:** 8-16 hours

#### Sub-phases:

1. **Phase 3a: Frame Type Safety in Templates**
   - **Target:** Remove `any` from frame rendering
   - **Files:** `src/memory/renderer/templates.ts`
   - **Method:**
     - Import `Frame` type from `@app/memory/frames/types`
     - Add type parameter to rendering functions
     - Add runtime validation for optional fields
   - **Risk:** Could expose incorrect assumptions about frame structure
   - **Validation:** Renderer tests, visual inspection of output

2. **Phase 3b: Policy Merge Type Safety**
   - **Target:** Type the `lexmap-merge.ts` module properly
   - **Files:** `src/policy/merge/lexmap-merge.ts`
   - **Method:** Define types for merge operations, policy structures
   - **Risk:** Affects policy merging behavior
   - **Validation:** Policy integration tests

3. **Phase 3c: TypeScript Scanner Type Safety**
   - **Target:** Fix `any` assignments in TS scanner
   - **Files:** `src/policy/scanners/ts_scanner.ts`
   - **Method:** Use `ts-morph` types explicitly
   - **Risk:** Could affect scanner accuracy
   - **Validation:** Scanner tests with various TS patterns

**Deliverables:**
- Removal of remaining `any` types in core logic
- Type-safe domain models
- Reduced risk of runtime type errors

---

### Phase 4: Configuration Tuning (If Needed)
**Scope:** Adjust lint rules based on project patterns
**Risk Level:** 🟡 Medium
**Prerequisites:** Complete Phases 1-3 first

#### Evaluation Criteria:
After completing code fixes, assess whether any rules should be adjusted:

1. **`@typescript-eslint/no-unused-vars`**
   - **Current:** Requires `_` prefix for intentionally unused vars
   - **Evaluation:** Does this align with project style?
   - **Potential Change:** Allow specific patterns in test files

2. **`@typescript-eslint/no-explicit-any`**
   - **Current:** Warning (not error)
   - **Evaluation:** Should this be elevated to error after cleanup?
   - **Potential Change:** Make it an error to prevent regression

3. **Test-specific rules**
   - **Evaluation:** Should test files have relaxed rules?
   - **Potential Change:** Create separate ESLint config for `test/**`

**Process:**
1. Document rationale for any config changes in this file
2. Update `.eslintrc` or `eslint.config.mjs` with clear comments
3. Run full lint suite to verify
4. Update CI to enforce new standards

**Deliverables:**
- Updated lint configuration (if justified)
- Documentation of rule decisions
- No disabled rules without strong justification

---

## Execution Guardrails

### Before Starting Any Phase:
1. ✅ Ensure all tests pass: `npm test`
2. ✅ Ensure type-check passes: `npm run type-check`
3. ✅ Create a feature branch for the phase
4. ✅ Document the baseline warning count

### During Execution:
- ❌ **No giant, repo-wide PRs:** Each sub-phase should be 1-2 PRs max
- ✅ **Themed commits:** e.g., `cleanup: remove unused imports in test files`
- ✅ **Run tests after each file:** Don't accumulate broken state
- ❌ **No config weakening:** Don't disable rules to make numbers green
- ✅ **Explain non-obvious changes:** Add code comments for tricky type casts

### After Each Sub-phase:
1. ✅ Run full test suite: `npm run test:all`
2. ✅ Run type-check: `npm run type-check`
3. ✅ Run lint: `npm run lint` and verify warning count decreased
4. ✅ Update this document with progress

### Red Flags (Stop and Review):
- 🚨 Test failures after "safe" cleanup
- 🚨 New type errors introduced
- 🚨 Runtime behavior changes in dev testing
- 🚨 Need to add `// @ts-ignore` comments

---

## File-by-File Inventory

### Files with Warnings (Grouped by Module)

#### MCP Server (15 warnings)
- `src/memory/mcp_server/server.ts` (14 warnings: `no-explicit-any`)
- `src/memory/mcp_server/routes/frames.ts` (1 warning: `no-explicit-any`)
- `src/memory/mcp_server/tools.ts` (1 warning: `no-explicit-any`)

#### Memory Renderer (24 warnings)
- `src/memory/renderer/templates.ts` (13 warnings: unsafe operations on `any`)
- `src/memory/renderer/card.ts` (4 warnings: unused vars)
- `src/memory/renderer/graph.ts` (1 warning: unused var)
- `src/memory/renderer/layouts.ts` (2 warnings: unused vars/args)
- `src/memory/renderer/syntax.ts` (2 warnings: unused var + `no-explicit-any`)
- `src/memory/renderer/timeline.example.ts` (1 warning: unused import)

#### Memory Store (18 warnings)
- `src/memory/store/db.ts` (3 warnings: unsafe assignments/member access)
- `src/memory/store/queries.ts` (15 warnings: `no-explicit-any` + unsafe operations)

#### Policy (4 warnings)
- `src/policy/merge/lexmap-merge.ts` (2 warnings: unused var + unsafe assignment)
- `src/policy/scanners/ts_scanner.ts` (3 warnings: unsafe assignment + restrict-template-expressions + unused var)

#### Shared Modules (9 warnings)
- `src/shared/aliases/resolver.ts` (4 warnings: unused imports + `no-explicit-any` + unsafe member access)
- `src/shared/atlas/atlas-frame.ts` (1 warning: unused import)
- `src/shared/atlas/cache.ts` (1 warning: unused type)
- `src/shared/atlas/validate.ts` (2 warnings: unused imports)
- `src/shared/cli/check.ts` (1 warning: `no-explicit-any`)
- `src/shared/cli/recall.ts` (2 warnings: `no-explicit-any`)
- `src/shared/cli/remember.ts` (2 warnings: `no-explicit-any`)
- `src/shared/cli/timeline.ts` (1 warning: `no-explicit-any`)
- `src/shared/git/branch.ts` (1 warning: unused var)
- `src/shared/policy/loader.ts` (1 warning: `no-explicit-any`)
- `src/shared/prompts/renderer.ts` (4 warnings: unused args + unsafe assignments)
- `src/shared/schemas/loader.ts` (3 warnings: `no-unsafe-return`)

#### Test Files (55 warnings)
- Most warnings are unused test utilities and variables
- See Phase 1a for cleanup strategy

---

## Progress Tracking

### Phase 1: Safe Cleanup
- [ ] Phase 1a: Test files (target: -30 warnings)
- [ ] Phase 1b: Dead code (target: -10 warnings)
- [ ] Phase 1c: Catch blocks (target: -10 warnings)
- **Phase 1 Total Target:** -50 warnings

### Phase 2: Type Improvements
- [ ] Phase 2a: Express handlers (target: -14 warnings)
- [ ] Phase 2b: Error handlers (target: -8 warnings)
- [ ] Phase 2c: Database results (target: -15 warnings)
- [ ] Phase 2d: Schema loader (target: -3 warnings)
- **Phase 2 Total Target:** -40 warnings

### Phase 3: Design-Level Safety
- [ ] Phase 3a: Frame templates (target: -13 warnings)
- [ ] Phase 3b: Policy merge (target: -2 warnings)
- [ ] Phase 3c: TS scanner (target: -3 warnings)
- **Phase 3 Total Target:** -18 warnings

### Phase 4: Config Tuning
- [ ] Evaluate rules
- [ ] Document decisions
- [ ] Update config (if justified)

---

## Current Baseline
- **Type Errors:** 0
- **Lint Warnings:** 116
- **Lint Errors:** 0

## Target
- **Type Errors:** 0 ✅ (already achieved)
- **Lint Warnings:** 0 (requires Phases 1-3)
- **Lint Errors:** 0 ✅ (already achieved)

---

## Notes

### Why This Matters
- **Developer Experience:** Fewer warnings = easier to spot real issues
- **Type Safety:** Eliminating `any` catches bugs at compile time
- **Maintainability:** Clean types make refactoring safer
- **Onboarding:** New contributors see a clean, well-typed codebase

### Testing Strategy
- Run `npm test` after every file change
- Run `npm run type-check` after every type change
- Run `npm run lint` to track progress
- Use `npm run test:integration` for critical paths

### Communication
- Update this document after each sub-phase
- Include warning count deltas in commit messages
- Flag any risky changes in PR descriptions

---

**End of Status Document**
