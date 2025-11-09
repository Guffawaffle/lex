# Legacy Code Audit

**Generated:** 2025-11-09  
**Branch:** merge-weave-2025-11-09  
**Purpose:** Identify and catalog all backwards-compatibility/legacy code for removal

## Executive Summary

This repository has had **no external adopters yet**, so we can safely remove ALL legacy/compatibility layers without breaking external users. This audit identifies:

- **Category 1:** Deprecated class-based APIs (FrameStore)
- **Category 2:** Deprecated sync functions (validateModuleIdsSync)
- **Category 3:** Backward-compatible CLI output exports (json, raw, named exports)
- **Category 4:** Legacy policy path fallbacks (LEGACY_POLICY_PATH)
- **Category 5:** Backward-compatible reporter API (generateReport legacy signature)
- **Category 6:** CommonJS require() usage in db.ts (findRepoRoot)
- **Category 7:** TypeScript interop flags (esModuleInterop, allowSyntheticDefaultImports)
- **Category 8:** Adapter functions (buildPolicyGraph in graph.ts)

**Total Items:** 20+ legacy artifacts identified

---

## Top 20 Legacy Candidates (Inline Review)

### 1. FrameStore Class (ENTIRE FILE)
- **File:** `src/memory/store/framestore.ts`
- **Lines:** 1-132 (entire file)
- **Snippet:** `export class FrameStore` with `@deprecated` tags
- **Category:** Deprecated class-based API
- **Why:** Wraps new modular API (db.ts, queries.ts) for backward compatibility
- **Proposed:** DELETE entire file, migrate all usages to modular API
- **Risk:** HIGH - used in MCP server and tests
- **Tests:** `test/memory/store/images.test.ts`, `test/memory/store/images.perf.test.ts`

### 2. validateModuleIdsSync Function
- **File:** `src/shared/module_ids/validator.ts`
- **Lines:** 226-264
- **Snippet:** `export function validateModuleIdsSync` with `@deprecated` tag
- **Category:** Deprecated sync function
- **Why:** Doesn't support alias resolution, kept for old callers
- **Proposed:** DELETE function, migrate tests to async validateModuleIds
- **Risk:** LOW - only used in tests
- **Tests:** `test/shared/module_ids/validator.test.mjs` (12 test cases)

### 3. Backward-Compatible CLI Output Exports (json, raw)
- **File:** `src/shared/cli/output.ts`
- **Lines:** 153-172
- **Snippet:** `export const info = output.info.bind(output)`, `export function json()`, `export function raw()`
- **Category:** Backward-compatible exports
- **Why:** Named exports for "old" API (pre-wrapper)
- **Proposed:** KEEP - these are NOT legacy, they're the intended API
- **Risk:** NONE - current API, not legacy
- **Tests:** `test/shared/cli/output.behavior.test.ts` (backward-compat tests)

### 4. LEGACY_POLICY_PATH Constant & Fallback
- **File:** `src/shared/policy/loader.ts`
- **Lines:** 24-26, 161-164, 171
- **Snippet:** `const LEGACY_POLICY_PATH = "src/policy/policy_spec/lexmap.policy.json"`
- **Category:** Legacy policy path
- **Why:** Old location before .smartergpt.local migration
- **Proposed:** REMOVE fallback to legacy path, keep only DEFAULT and EXAMPLE
- **Risk:** LOW - new setup uses .smartergpt.local
- **Tests:** None directly affected

### 5. Backward-Compatible generateReport Signature
- **File:** `src/policy/check/reporter.ts`
- **Lines:** 28-60
- **Snippet:** `// Backward-compatible generateReport supporting legacy signature`
- **Category:** Legacy function signature
- **Why:** Old signature: `generateReport(violations, policy, format)`
- **Proposed:** REMOVE legacy signature support, migrate all callers to new API
- **Risk:** LOW - can migrate all callsites
- **Tests:** Check for old signature usage

### 6. CommonJS require() in db.ts (findRepoRoot)
- **File:** `src/memory/store/db.ts`
- **Lines:** 70, 76
- **Snippet:** `const { dirname: parentDir } = require("path")`, `require("fs").readFileSync`
- **Category:** CJS/ESM interop
- **Why:** Mixed require() in ESM file
- **Proposed:** Convert to ESM imports: `import { dirname } from "path"`, `import { readFileSync } from "fs"`
- **Risk:** NONE - straightforward conversion
- **Tests:** Verify db.ts still works after conversion

### 7. esModuleInterop & allowSyntheticDefaultImports in tsconfig
- **File:** `tsconfig.base.json`
- **Lines:** 9-10
- **Snippet:** `"allowSyntheticDefaultImports": true, "esModuleInterop": true`
- **Category:** TS interop flags
- **Why:** Often added for CJS compatibility
- **Proposed:** EVALUATE if needed - may be required for better-sqlite3
- **Risk:** MEDIUM - may break imports if removed incorrectly
- **Tests:** Run full build/test after removal attempt

### 8. buildPolicyGraph Adapter Function
- **File:** `src/shared/atlas/graph.ts`
- **Lines:** 321-355
- **Snippet:** `* Adapter function for backward compatibility with fold-radius.ts`
- **Category:** Adapter/compatibility layer
- **Why:** Bridges old fold-radius API
- **Proposed:** EVALUATE usage - if unused, DELETE
- **Risk:** LOW - check for references
- **Tests:** Check list_code_usages for buildPolicyGraph

### 9. FrameStore Usage in MCP Server
- **File:** `src/memory/mcp_server/server.ts`
- **Lines:** 2, 47, 53, 54
- **Snippet:** `import { FrameStore }`, `private frameStore: FrameStore`, `new FrameStore(dbPath)`
- **Category:** Legacy API usage
- **Why:** Depends on deprecated FrameStore class
- **Proposed:** Migrate to modular API (getDb, saveFrame, etc.)
- **Risk:** MEDIUM - critical code path
- **Tests:** Ensure MCP server tests pass

### 10. FrameStore Usage in Tests
- **File:** `test/memory/store/images.test.ts`
- **Lines:** 10, 17, 25-26
- **Snippet:** `import { FrameStore }`, `frameStore: FrameStore`, `new FrameStore(testDbPath)`
- **Category:** Legacy API usage in tests
- **Why:** Tests use deprecated class
- **Proposed:** Migrate tests to modular API
- **Risk:** LOW - test code
- **Tests:** Update test setup/teardown

### 11. getDatabase() Method on FrameStore
- **File:** `src/memory/store/framestore.ts`
- **Lines:** 128-130
- **Snippet:** `getDatabase(): Database.Database { return this.db; }`
- **Category:** Legacy API accessor
- **Why:** Exposes internal db for ImageManager
- **Proposed:** Pass db directly in modular API
- **Risk:** LOW - part of FrameStore removal
- **Tests:** Part of FrameStore migration

### 12. validateModuleIdsSync Test Suite
- **File:** `test/shared/module_ids/validator.test.mjs`
- **Lines:** 45-152 (entire describe block)
- **Snippet:** `describe("validateModuleIdsSync (legacy - no alias resolution)")`
- **Category:** Tests for deprecated function
- **Why:** Tests legacy sync validator
- **Proposed:** DELETE entire test suite, covered by async tests
- **Risk:** NONE - removing tests for removed function
- **Tests:** Ensure async tests have equivalent coverage

### 13. Backward-Compatible Test Names
- **File:** `test/shared/cli/output.behavior.test.ts`
- **Lines:** 32, 286, 300, 314, 328, 342, 356
- **Snippet:** `test("backward-compatible function exports exist")`
- **Category:** Tests for backward-compat layer
- **Why:** Tests named exports (info, success, warn, etc.)
- **Proposed:** KEEP - these test current API, rename tests to remove "backward-compatible"
- **Risk:** NONE - just rename tests
- **Tests:** Rename test descriptions

### 14. Legacy Policy Path in Error Message
- **File:** `src/shared/policy/loader.ts`
- **Lines:** 171
- **Snippet:** `` `  3. ${legacyPath}\n\n` ``
- **Category:** Legacy path reference
- **Why:** Mentions legacy path in error
- **Proposed:** Remove from error message
- **Risk:** NONE - just error message
- **Tests:** None

### 15. json() Export Documentation
- **File:** `docs/CLI_OUTPUT.md`
- **Lines:** 170-178, 304-342, 416-447
- **Snippet:** `### Backward-Compatible Exports`, `### Backward Compatibility`
- **Category:** Documentation references
- **Why:** Calls exports "backward-compatible"
- **Proposed:** RENAME to "Legacy-Free API" or "Current API"
- **Risk:** NONE - documentation only
- **Tests:** None

### 16. transformPolicy Function in loader.ts
- **File:** `src/shared/policy/loader.ts`
- **Lines:** 62-91
- **Snippet:** `function transformPolicy(rawPolicy: any): Policy`
- **Category:** Format compatibility layer
- **Why:** Transforms "patterns" format to "modules" format
- **Proposed:** EVALUATE - if lexmap.policy.json always uses modules format, DELETE
- **Risk:** MEDIUM - check all policy files
- **Tests:** Verify all policy files use modules format

### 17. Backward-Compatible Frames (v2 fields optional)
- **File:** `src/shared/types/frame.ts`, `src/memory/store/queries.ts`
- **Lines:** 84 (frame.ts), 52 (queries.ts)
- **Snippet:** `// Validate v2 fields (optional, backward compatible)`, `// Merge-weave metadata (v2) - backward compatible`
- **Category:** Schema versioning
- **Why:** v2 fields (runId, planHash, spend) are optional
- **Proposed:** KEEP - schema evolution, not legacy
- **Risk:** NONE - proper versioning
- **Tests:** None

### 18. Legacy Test Frame (v1 without v2 fields)
- **File:** `test/memory/store/store.test.ts`
- **Lines:** 468-477
- **Snippet:** `test("should maintain backward compatibility with legacy frames")`
- **Category:** Test for old schema
- **Why:** Tests frames without v2 fields
- **Proposed:** KEEP - validates schema evolution
- **Risk:** NONE - important compatibility test
- **Tests:** Keep as-is

### 19. workflow require() in ci.yml
- **File:** `.github/workflows/ci.yml`
- **Lines:** 143
- **Snippet:** `const fs = require('fs');`
- **Category:** CJS in GitHub Actions
- **Why:** Inline script uses CJS
- **Proposed:** KEEP - GitHub Actions convention
- **Risk:** NONE - not part of application code
- **Tests:** None

### 20. lint-baseline.json Snapshot
- **File:** `lint-baseline.json`
- **Lines:** Multiple
- **Snippet:** Contains snapshots of all legacy code
- **Category:** Lint baseline
- **Why:** Frozen snapshot of warnings
- **Proposed:** REGENERATE after removals
- **Risk:** NONE - will be updated
- **Tests:** Run lint:baseline:update

---

## Detailed Inventory Table

| # | File | Line(s) | Snippet | Category | Why Exists | Proposed Action | Risk | Tests Affected |
|---|------|---------|---------|----------|------------|-----------------|------|----------------|
| 1 | `src/memory/store/framestore.ts` | 1-132 | `export class FrameStore` | Deprecated class API | Backward compat for old API | DELETE file, migrate usages | HIGH | images.test.ts, images.perf.test.ts |
| 2 | `src/shared/module_ids/validator.ts` | 226-264 | `validateModuleIdsSync` | Deprecated sync function | No alias resolution | DELETE function | LOW | validator.test.mjs (12 tests) |
| 3 | `src/shared/cli/output.ts` | 153-172 | `export const info`, `json()`, `raw()` | Named exports | **NOT LEGACY** - current API | **KEEP** | NONE | output.behavior.test.ts |
| 4 | `src/shared/policy/loader.ts` | 24-26, 161-164, 171 | `LEGACY_POLICY_PATH` | Legacy path fallback | Old location pre-.smartergpt.local | REMOVE fallback | LOW | None |
| 5 | `src/policy/check/reporter.ts` | 28-60 | `generateReport` legacy signature | Old function signature | Three-arg call pattern | REMOVE legacy branch | LOW | Check callsites |
| 6 | `src/memory/store/db.ts` | 70, 76 | `require("path")`, `require("fs")` | CJS in ESM | Mixed require/import | Convert to ESM imports | NONE | db.ts tests |
| 7 | `tsconfig.base.json` | 9-10 | `esModuleInterop`, `allowSyntheticDefaultImports` | TS interop flags | CJS compatibility | EVALUATE need | MEDIUM | All builds |
| 8 | `src/shared/atlas/graph.ts` | 321-355 | `buildPolicyGraph` | Adapter function | fold-radius compat | EVALUATE usage, maybe DELETE | LOW | Check references |
| 9 | `src/memory/mcp_server/server.ts` | 2, 47, 53-54 | `import { FrameStore }` | Uses deprecated class | Depends on FrameStore | Migrate to modular API | MEDIUM | MCP tests |
| 10 | `test/memory/store/images.test.ts` | 10, 17, 25-26 | `FrameStore` usage | Test uses deprecated class | Test setup | Migrate to modular API | LOW | Update test |
| 11 | `src/memory/store/framestore.ts` | 128-130 | `getDatabase()` | Accessor for internal db | Exposes db to ImageManager | Pass db directly | LOW | Part of FrameStore removal |
| 12 | `test/shared/module_ids/validator.test.mjs` | 45-152 | `validateModuleIdsSync` tests | Tests deprecated function | Legacy validator tests | DELETE test suite | NONE | Remove 12 tests |
| 13 | `test/shared/cli/output.behavior.test.ts` | 32, 286, 300, 314, 328, 342, 356 | "backward-compatible" test names | Misleading test names | Tests current API | RENAME tests | NONE | Just rename |
| 14 | `src/shared/policy/loader.ts` | 171 | Legacy path in error | Error message text | Mentions old location | Remove from error | NONE | None |
| 15 | `docs/CLI_OUTPUT.md` | 170-178, 304-342, 416-447 | "Backward-Compatible" sections | Documentation | Calls current API "backward-compat" | RENAME sections | NONE | None |
| 16 | `src/shared/policy/loader.ts` | 62-91 | `transformPolicy` | Format transformer | Patterns → modules | EVALUATE need | MEDIUM | Check policy files |
| 17 | `src/shared/types/frame.ts` | 84 | v2 fields optional | Schema versioning | **NOT LEGACY** - evolution | **KEEP** | NONE | None |
| 18 | `test/memory/store/store.test.ts` | 468-477 | Legacy frame test | Tests v1 frames | **KEEP** - validates evolution | **KEEP** | NONE | Keep test |
| 19 | `.github/workflows/ci.yml` | 143 | `require('fs')` | CJS in GH Actions | Inline script | **KEEP** - not app code | NONE | None |
| 20 | `lint-baseline.json` | Multiple | Snapshots of legacy code | Lint baseline | Frozen warnings | REGENERATE after cleanup | NONE | Update baseline |

---

## Additional Findings

### NOT Legacy (Keep These)

1. **CLI Output Wrapper exports** (`json()`, `raw()`, named exports) - These are the **current API**, not backward-compat shims
2. **Frame v2 fields** (runId, planHash, spend) - Proper schema versioning, not legacy
3. **Alias system** - New feature, not legacy
4. **`@app/*` path alias** - Modern path mapping, not legacy
5. **pino logger** - Current logging infrastructure, not legacy

### Actual Legacy (Remove These)

1. **FrameStore class** - Entire deprecated wrapper (132 lines)
2. **validateModuleIdsSync** - Deprecated sync validator (39 lines)
3. **LEGACY_POLICY_PATH** - Old path fallback (4 references)
4. **generateReport legacy signature** - Old function call pattern (32 lines)
5. **require() in db.ts** - Mixed CJS/ESM (2 lines)
6. **buildPolicyGraph adapter** - If unused (35 lines)
7. **transformPolicy** - If policy files use modules format (30 lines)

---

## Risk Assessment

### High Risk (Requires Careful Migration)
- **FrameStore removal**: Used in MCP server (critical path) and tests
- **tsconfig interop flags**: May break builds if removed incorrectly

### Medium Risk (Needs Validation)
- **generateReport signature**: Find all callsites before removal
- **transformPolicy**: Check all policy files use modules format
- **buildPolicyGraph**: Verify no external dependencies

### Low Risk (Safe to Remove)
- **validateModuleIdsSync**: Only used in tests, async version exists
- **LEGACY_POLICY_PATH**: New installs use .smartergpt.local
- **require() in db.ts**: Straightforward ESM conversion

### No Risk (Cosmetic)
- **Test renames**: Just update descriptions
- **Documentation updates**: Just reword sections
- **Lint baseline**: Auto-regenerate

---

## Next Steps

### PHASE 2: Codemod & Plan
1. Draft `scripts/codemod-remove-legacy.mjs` with dry-run mode
2. Create `docs/legacy-removal-plan.md` mapping each item to:
   - Action (remove/replace/rename/keep)
   - Owner subsystem (memory/policy/shared/cli)
   - Codemod step
   - Manual follow-ups
   - Tests to update

### PHASE 3: Execution Order
1. **Module interop** (db.ts require → ESM, evaluate tsconfig flags)
2. **Alias layers** (none found - good!)
3. **CLI legacy** (none - current API is clean)
4. **Path shims** (none found - good!)
5. **Deprecated APIs** (FrameStore, validateModuleIdsSync, generateReport legacy, LEGACY_POLICY_PATH, buildPolicyGraph, transformPolicy)
6. **Config cleanup** (tsconfig interop flags if proven unnecessary)

### PHASE 4: Enforcement
1. Add ESLint rule: disallow importing from removed paths
2. Keep `no-console` globally except output.ts
3. Update CHANGELOG.md, README.md
4. Finalize this audit with "Removed in PR #xxx" column

---

## Validation Commands

Run after each commit:
```bash
npm ci && npm run type-check && npm run build
npm run lint
npm test
npm pack --dry-run
```

---

**Status:** Discovery complete, awaiting approval for PHASE 2
