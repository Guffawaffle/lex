# Subpath Exports Validation

This document validates that all documented subpath exports in README.md are accurate.

## Validation Method

All examples were verified against:
1. `package.json` exports configuration (lines 8-20)
2. Type definition files in `dist/` directory
3. Source files in `src/` directory

## Validated Exports

### Main Entry Point (`lex`)

**Documentation Claims:**
```typescript
import { saveFrame, getDb, closeDb, searchFrames, getFrameById } from 'lex';
```

**Verified in:** `dist/index.d.ts`
```typescript
export { getDb, closeDb, saveFrame, getFrameById, searchFrames } from "./memory/store/index.js";
```

✅ **Status:** VERIFIED

---

### CLI Entry Point (`lex/cli`)

**Documentation Claims:**
```typescript
import { createProgram, run } from 'lex/cli';
```

**Verified in:** `dist/shared/cli/index.d.ts`
```typescript
export declare function createProgram(): Command;
export declare function run(argv?: string[]): Promise<void>;
```

✅ **Status:** VERIFIED

---

### Memory Store (`lex/memory/store`)

**Documentation Claims:**
```typescript
import { getDb, saveFrame, searchFrames } from 'lex/memory/store';
```

**Verified in:** `dist/memory/store/index.d.ts`
```typescript
export { saveFrame, getFrameById, searchFrames, getFramesByBranch, getFramesByJira, 
         getFramesByModuleScope, getAllFrames, deleteFrame, getFrameCount } from "./queries.js";
export function getDb(customPath?: string): Database;
export function closeDb(): void;
```

✅ **Status:** VERIFIED

---

### Policy Utilities (`lex/shared/policy`)

**Documentation Claims:**
```typescript
import { loadPolicy, clearPolicyCache } from 'lex/shared/policy';
```

**Verified in:** `dist/shared/policy/index.d.ts`
```typescript
export { loadPolicy, clearPolicyCache } from "./loader.js";
```

✅ **Status:** VERIFIED

---

### Atlas Frame Generation (`lex/shared/atlas`)

**Documentation Claims:**
```typescript
import { 
  generateAtlasFrame, 
  buildPolicyGraph, 
  computeFoldRadius 
} from 'lex/shared/atlas';
```

**Verified in:** `dist/shared/atlas/index.d.ts`
```typescript
export { buildPolicyGraph, getNeighbors } from "./graph.js";
export { computeFoldRadius } from "./fold-radius.js";
export { generateAtlasFrame } from "./atlas-frame.js";
export { estimateTokens, autoTuneRadius, estimateTokensBeforeGeneration } from "./auto-tune.js";
```

✅ **Status:** VERIFIED

---

## Package.json Exports Configuration

**From package.json:**
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./cli": {
    "types": "./dist/shared/cli/index.d.ts",
    "import": "./dist/shared/cli/index.js"
  },
  "./policy/*": "./dist/policy/*",
  "./memory/*": "./dist/memory/*",
  "./shared/*": "./dist/shared/*"
}
```

All documented subpaths match the package.json exports configuration.

## Runtime Testing Status

**Current Status:** Cannot run smoke tests due to pre-existing build errors.

**Build Errors:** TypeScript compilation fails with missing @types/node declarations in base commit (14bbc4a).

**Example Error:**
```
error TS2307: Cannot find module 'fs' or its corresponding type declarations.
error TS2580: Cannot find name 'process'. Do you need to install type definitions for node?
```

**Impact:** The dist/ folder contains pre-built files that are used for validation, but new builds and npm pack/tarball testing cannot be completed until build errors are resolved.

**Recommendation:** 
1. Fix missing @types/node issue
2. Run `npm run build` successfully
3. Execute `npm run test:smoke` to validate all exports against tarball

## Summary

✅ All documentation examples are **syntactically correct** and **match actual exports**
✅ All examples verified against TypeScript type definitions
✅ All examples verified against package.json exports configuration
⚠️  Runtime validation against tarball blocked by pre-existing build errors

**Documentation Quality:** HIGH - All examples are accurate and match implementation
**Testing Status:** BLOCKED - Awaiting build fix for tarball validation
