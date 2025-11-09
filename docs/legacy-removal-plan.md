# Legacy Code Removal Plan

**Generated:** 2025-11-09
**Branch:** merge-weave-2025-11-09
**PR:** #173
**Phase:** 2 → 3 (Plan + Execution)

## Executive Summary

This plan documents the safe removal of ALL legacy/backwards-compatibility code from the Lex repository. Since there are **no external adopters yet**, we can aggressively clean up without breaking changes.

**Target Items:** 8 primary legacy artifacts
**Risk Level:** LOW to MEDIUM (careful migration required for FrameStore)
**Approach:** Small, reviewable commits with CI verification after each step

---

## Removal Strategy

### Categories
1. **Interop/CJS** - `require()` usage in ESM files
2. **Policy Loader** - Legacy path fallbacks
3. **Reporter API** - Backward-compatible function signature
4. **FrameStore** - Deprecated class-based API wrapper
5. **Module IDs** - Sync validator (deprecated)
6. **Atlas/Graph** - Adapter functions for old API
7. **Policy Transform** - Legacy "patterns" format support
8. **Config/Docs** - TypeScript interop flags, test names, documentation

### Execution Order
Small commits in dependency order, with full CI validation after each:
```
A) Interop/CJS → B) Policy Loader → C) Reporter → D) FrameStore →
E) Module IDs → F) Atlas/Graph → G) transformPolicy → H) Config → I) Docs
```

---

## Item-by-Item Removal Plan

### 1. CJS Interop (require() in db.ts)

**File:** `src/memory/store/db.ts`
**Lines:** 70, 76
**Current Code:**
```typescript
const { dirname: parentDir } = require("path");
require("fs").readFileSync
```

**Action:** REMOVE - Convert to ESM imports
**Subsystem:** memory/store
**Why Safe:** Straightforward ESM conversion, no API change
**Risk:** NONE

**Migration:**
```typescript
import { dirname } from "path";
import { readFileSync } from "fs";
```

**Tests Impacted:** None (internal implementation detail)

**Commit Message:** `refactor(interop): drop CJS bridges; pure ESM in db.ts`

---

### 2. LEGACY_POLICY_PATH Fallback

**File:** `src/shared/policy/loader.ts`
**Lines:** 24-26, 161-164, 171
**Current Code:**
```typescript
const LEGACY_POLICY_PATH = "src/policy/policy_spec/lexmap.policy.json";
```

**Action:** REMOVE - Delete constant and fallback logic in loadPolicy()
**Subsystem:** shared/policy
**Why Safe:** No production policy files use old location; new setup uses `.smartergpt.local/lex/`
**Risk:** LOW

**Migration:**
- Delete `LEGACY_POLICY_PATH` constant (line 24-26)
- Remove fallback attempt in `loadPolicy()` (lines 161-164)
- Remove from error message (line 171)
- Keep only `DEFAULT_POLICY_PATH` and `EXAMPLE_POLICY_PATH`

**Tests Impacted:** None (no tests verify legacy path)

**Commit Message:** `refactor(policy): remove legacy policy path fallbacks`

---

### 3. generateReport Legacy Signature

**File:** `src/policy/check/reporter.ts`
**Lines:** 28-60
**Current Code:**
```typescript
// Backward-compatible generateReport supporting legacy signature:
//   generateReport(violations, policy, format)
// New preferred signature:
//   generateReport(violations, { policy, format, strict })
export function generateReport(
  violations: Violation[],
  policyOrOpts: Policy | { policy?: Policy; format?: ReportFormat; strict?: boolean } = {},
  legacyFormat?: ReportFormat
): ReportResult
```

**Action:** REPLACE - Enforce modern signature only
**Subsystem:** policy/check
**Why Safe:** Only 1 internal callsite (line 305) already uses modern signature
**Risk:** LOW

**Migration:**
- Simplify function signature to accept only `{ policy?, format?, strict? }` object
- Remove `legacyFormat` parameter
- Remove legacy signature detection logic (lines 32-57)
- Update JSDoc comments to remove "backward-compatible" mentions

**Callsites to Verify:**
- `src/policy/check/reporter.ts:305` - Already uses modern signature ✓

**Tests Impacted:** None (tests already use modern signature)

**Commit Message:** `refactor(reporter): enforce modern signature; remove legacy path`

---

### 4. FrameStore Class (ENTIRE FILE)

**File:** `src/memory/store/framestore.ts`
**Lines:** 1-132 (entire file)
**Current Code:** Deprecated class wrapping modular API

**Action:** DELETE file + migrate all usages
**Subsystem:** memory/store
**Why Safe:** Wrapper around existing modular API (db.ts, queries.ts)
**Risk:** MEDIUM - Used in MCP server (critical path) and tests

**Migration Path:**

**Usages Found:**
1. `src/memory/mcp_server/server.ts` (lines 1, 46, 52-54)
2. `test/memory/store/images.test.ts` (lines 10, 17, 25-26)
3. `test/memory/store/images.perf.test.ts` (similar pattern)

**MCP Server Migration (server.ts):**
```typescript
// OLD:
import { FrameStore } from '../store/framestore.js';
private frameStore: FrameStore;
this.frameStore = new FrameStore(dbPath);
const db = this.frameStore.getDatabase();

// NEW:
import { getDb } from '../store/db.js';
import { saveFrame, getFrame, listRecentFrames } from '../store/queries.js';
private db: Database.Database;
this.db = getDb(dbPath);
// Use saveFrame(db, ...), getFrame(db, ...), listRecentFrames(db, ...) directly
```

**Test Migration (images.test.ts):**
```typescript
// OLD:
import { FrameStore } from '../../src/memory/store/framestore.js';
const frameStore = new FrameStore(testDbPath);
const db = frameStore.getDatabase();

// NEW:
import { getDb } from '../../src/memory/store/db.js';
const db = getDb(testDbPath);
// Use modular API directly
```

**Tests Impacted:**
- `test/memory/store/images.test.ts` - Convert to modular API
- `test/memory/store/images.perf.test.ts` - Convert to modular API
- MCP server tests (if any) - Verify functionality

**Commit Message:** `refactor(memory): remove FrameStore; migrate to modular API`

---

### 5. validateModuleIdsSync Function

**File:** `src/shared/module_ids/validator.ts`
**Lines:** 226-264
**Current Code:**
```typescript
/**
 * @deprecated Use validateModuleIds (async) for full alias resolution support
 */
export function validateModuleIdsSync(...)
```

**Action:** DELETE function
**Subsystem:** shared/module_ids
**Why Safe:** Only used in tests; async version exists with better features
**Risk:** LOW

**Migration:**
- Delete `validateModuleIdsSync` function (lines 226-264)
- Delete test suite: `test/shared/module_ids/validator.test.mjs` describe block "validateModuleIdsSync (legacy - no alias resolution)" (lines 45-152)
- Verify async `validateModuleIds` tests have equivalent coverage

**Tests Impacted:**
- `test/shared/module_ids/validator.test.mjs` - DELETE 12 legacy test cases

**Commit Message:** `refactor(module-ids): delete sync validator; use async`

---

### 6. buildPolicyGraph Adapter

**File:** `src/shared/atlas/graph.ts`
**Lines:** 321-355
**Current Code:**
```typescript
/**
 * Adapter function for backward compatibility with fold-radius.ts
 */
export function buildPolicyGraph(...)
```

**Action:** EVALUATE usage, then REMOVE if unused
**Subsystem:** shared/atlas
**Why Safe:** Adapter layer for old fold-radius API
**Risk:** LOW

**Usages Found:**
1. `src/shared/atlas/fold-radius.ts:8, 27` - Imports and uses
2. `src/shared/atlas/index.ts:18` - Re-exports

**Migration Decision:**
- Check if `fold-radius.ts` itself is legacy
- If `fold-radius.ts` is still needed, inline the adapter logic
- Otherwise, remove both adapter and fold-radius.ts

**Action Plan:**
1. Verify `fold-radius.ts` is not used externally
2. If unused: DELETE both `buildPolicyGraph` and `fold-radius.ts`
3. If used: Migrate fold-radius.ts to use canonical graph API directly

**Tests Impacted:** Check for fold-radius tests

**Commit Message:** `refactor(atlas): drop legacy adapters; canonicalize imports`

---

### 7. transformPolicy Function

**File:** `src/shared/policy/loader.ts`
**Lines:** 62-91
**Current Code:**
```typescript
/**
 * Transform lexmap.policy.json format to Policy type format
 * lexmap.policy.json uses a "patterns" array, but the Policy type expects
 * modules to be a Record<string, PolicyModule>
 */
function transformPolicy(rawPolicy: any): Policy
```

**Action:** DELETE - No policy files use "patterns" format
**Subsystem:** shared/policy
**Why Safe:** Policy schema requires "modules" (not "patterns"); no files use old format
**Risk:** LOW

**Verification:**
- Grepped all `*.json` files: NO occurrences of `"patterns":` in policy context
- Policy schema (`policy.schema.json`) requires `"modules"` field
- Test policy files use `"modules"` format

**Migration:**
- Delete `transformPolicy()` function (lines 62-91)
- Remove call to `transformPolicy(rawPolicy)` in `loadPolicy()` (line 183)
- Directly parse as `Policy` type

**Tests Impacted:** None (no tests for patterns format)

**Commit Message:** `refactor(policy): remove obsolete transform; require modern schema`

---

### 8. TypeScript Interop Flags

**File:** `tsconfig.base.json`
**Lines:** 9-10
**Current Code:**
```json
"esModuleInterop": true,
"allowSyntheticDefaultImports": true
```

**Action:** EVALUATE - May be needed for better-sqlite3
**Subsystem:** build/config
**Why Exists:** Often added for CJS compatibility
**Risk:** MEDIUM - May break imports

**Evaluation Plan:**
1. Try removing flags temporarily
2. Run `npm run type-check && npm run build`
3. If successful, keep removed; if fails, investigate specific import
4. Document decision in commit message

**Tests Impacted:** ALL (if removed)

**Decision Logic:**
- If better-sqlite3 requires these flags → KEEP with comment explaining why
- If build/tests pass without flags → REMOVE
- Fallback: KEEP (not worth the risk if unclear)

**Commit Message:** `build(tsconfig): evaluate interop flags` OR `build(tsconfig): keep interop flags for better-sqlite3`

---

## Additional Cleanup Items

### 9. Package.json Exports

**File:** `package.json`
**Current Exports:**
```json
{
  ".": {...},
  "./cli": {...},
  "./cli-output": {...},
  "./logger": {...},
  "./policy/*": "./dist/policy/*",
  "./memory/*": "./dist/memory/*",
  "./shared/*": "./dist/shared/*"
}
```

**Action:** KEEP - These are not legacy; they're intentional subpath exports
**Rationale:** `./logger` is critical; wildcard exports are useful for testing/internal use

**Change:** None (already clean)

---

### 10. Test Names & Documentation

**Files:**
- `test/shared/cli/output.behavior.test.ts` (lines 32, 286, 300, 314, 328, 342, 356)
- `docs/CLI_OUTPUT.md` (lines 170-178, 304-342, 416-447)

**Action:** RENAME - Remove "backward-compatible" terminology
**Subsystem:** docs/tests
**Why Safe:** These test the CURRENT API, not legacy
**Risk:** NONE

**Changes:**
1. Rename test: `"backward-compatible function exports exist"` → `"named function exports work correctly"`
2. Update CLI_OUTPUT.md: `### Backward-Compatible Exports` → `### Named Exports API`
3. Remove "backward compatibility" language from docs

**Tests Impacted:** None (just renaming)

**Commit Message:** `docs/tests: remove legacy-only cases; update terminology`

---

## NOT Legacy (Explicitly Keep)

These items are **NOT** legacy and must be preserved:

1. ✅ **CLI Output exports** (`json()`, `raw()`, named exports) - Current API
2. ✅ **Frame v2 fields** (runId, planHash, spend) - Schema evolution (v1 compat is proper versioning)
3. ✅ **`@app/*` path alias** - Modern feature, not legacy
4. ✅ **pino logger subpath** (`lex/logger`) - Critical infrastructure
5. ✅ **Test: "backward compatibility with legacy frames"** - Tests v1 schema support (proper versioning)
6. ✅ **GitHub Actions CJS** (`.github/workflows/ci.yml`) - Not application code
7. ✅ **lint-baseline.json** - Will regenerate after cleanup

---

## Codemod Dry-Run Preview

### Scope
The codemod will perform the following transformations:

1. **require() → ESM imports** (db.ts)
2. **FrameStore API migration** (server.ts, tests)
3. **Remove LEGACY_POLICY_PATH** references
4. **Simplify generateReport** signature
5. **Delete dead exports** (validateModuleIdsSync, FrameStore, transformPolicy, buildPolicyGraph)

### Output Format
```
┌─────────────────────────────────────────────────────────────────────┐
│ CODEMOD DRY-RUN RESULTS                                             │
├─────────────────────────────────────────────────────────────────────┤
│ File                           │ Action       │ Lines      │ Risk   │
├─────────────────────────────────────────────────────────────────────┤
│ src/memory/store/db.ts         │ ESM import   │ 70, 76     │ LOW    │
│ src/shared/policy/loader.ts   │ Remove const │ 24-26      │ LOW    │
│ src/shared/policy/loader.ts   │ Remove xform │ 62-91, 183 │ LOW    │
│ src/policy/check/reporter.ts  │ Simplify sig │ 28-60      │ LOW    │
│ src/memory/mcp_server/server.ts│ Migrate API │ 1,46,52-54 │ MEDIUM │
│ test/memory/store/images.*.ts │ Migrate API  │ Multiple   │ LOW    │
│ src/memory/store/framestore.ts│ DELETE FILE  │ 1-132      │ HIGH   │
│ src/shared/module_ids/validator│ Delete func  │ 226-264    │ LOW    │
│ test/.../validator.test.mjs    │ Delete tests │ 45-152     │ NONE   │
│ src/shared/atlas/graph.ts      │ Eval/remove  │ 321-355    │ LOW    │
│ tsconfig.base.json             │ Eval flags   │ 9-10       │ MEDIUM │
└─────────────────────────────────────────────────────────────────────┘

Total files affected: 11
Total lines changed: ~400
Estimated risk: LOW-MEDIUM (careful testing required)
```

### Actual Dry-Run Results (2025-11-09)

```
🔧 Legacy Code Removal Codemod (DRY_RUN)

┌─────────────────────────────────────────────────────────────────────┐
│ File                           │ Action       │ Details   │ Risk    │
├─────────────────────────────────────────────────────────────────────┤
│ test/shared/module_ids/validat │ Delete tests │ Lines 45-152: Remove sync vali │ NONE    │
│ src/memory/store/db.ts         │ ESM import   │ Lines 70, 76: require() → impo │ LOW     │
│ src/shared/policy/loader.ts    │ Remove legac │ Lines 24-26, 161-171: LEGACY_P │ LOW     │
│ src/shared/policy/loader.ts    │ Remove trans │ Lines 62-91, 183: transformPol │ LOW     │
│ src/policy/check/reporter.ts   │ Simplify sig │ Lines 28-60: Enforce modern ob │ LOW     │
│ src/shared/module_ids/validato │ Delete funct │ Lines 226-264: validateModuleI │ LOW     │
│ src/memory/mcp_server/server.t │ MANUAL MIGRA │ Replace FrameStore with getDb/ │ MEDIUM  │
│ src/memory/store/framestore.ts │ MANUAL DELET │ Migrate usages to modular API  │ HIGH    │
└─────────────────────────────────────────────────────────────────────┘

Total files affected: 7
Total transformations: 8
Risk distribution:
  - NONE: 1
  - LOW: 5
  - MEDIUM: 1
  - HIGH: 1
```

**Notes:**
- buildPolicyGraph was not found (already removed or misidentified in audit)
- FrameStore migration flagged as MANUAL (complex API surface)
- All automated transformations validated with regex patterns

---

## Validation Commands

Run after **every commit**:
```bash
npm run type-check && npm run build
npm test
npm run lint
npm pack --dry-run
```

Expected result: ALL GREEN ✅

---

## ESLint Enforcement (Post-Cleanup)

Add rule to prevent re-introduction of legacy patterns:

```javascript
// eslint.config.mjs
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/framestore', '**/framestore.js'],
          message: 'FrameStore is removed. Use modular API from db.js and queries.js'
        }
      ]
    }]
  }
}
```

---

## Risk Assessment Summary

| Risk Level | Items | Mitigation |
|------------|-------|------------|
| **HIGH** | FrameStore removal (MCP server) | Careful migration, test MCP endpoints |
| **MEDIUM** | tsconfig flags, generateReport callsites | Verify builds, find all references |
| **LOW** | CJS imports, policy paths, sync validator | Straightforward replacements |
| **NONE** | Test renames, docs updates | Cosmetic changes only |

---

## Success Criteria

- ✅ All CI checks pass (type-check, build, test, lint)
- ✅ No `@deprecated` tags remain in source code
- ✅ `npm pack --dry-run` produces valid package
- ✅ `lex/logger` subpath export still works: `npx tsx -e 'import {getLogger} from "lex/logger"; getLogger("test").info("ok")'`
- ✅ MCP server functionality verified (manual smoke test)
- ✅ ESLint enforcement prevents legacy pattern re-introduction

---

## Next Steps

1. **Phase 2:** Create `scripts/codemod-remove-legacy.mjs` and run DRY_RUN
2. **Phase 3:** Apply removals in commits A → I (as documented above)
3. **Phase 4:** Update PR #173 description with summary
4. **Phase 5:** Regenerate `lint-baseline.json` and update CHANGELOG.md

---

**Status:** ✅ Plan complete, ready for codemod development and execution
