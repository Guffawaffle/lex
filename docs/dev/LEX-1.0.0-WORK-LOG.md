# Lex 1.0.0 Contract Work Log

**Started:** 2025-11-26
**Author:** Opie (LexRunner implementer perspective)

This log tracks surprises, judgment calls, and observations during the LEX-100 through LEX-104 blocking tasks.

---

## LEX-100: Tighten Exports

**Status:** ✅ Complete

### Starting State
- Wildcards: `./policy/*`, `./memory/*`, `./shared/*` allowed arbitrary deep imports
- `./rules` was explicitly exported (should be experimental)

### Changes Made
1. Removed all wildcard exports from `package.json`
2. Added explicit subpath exports:
   - `@smartergpt/lex` → Core types + store API
   - `@smartergpt/lex/types` → All shared types
   - `@smartergpt/lex/store` → Direct database operations
   - `@smartergpt/lex/policy` → Policy loading
   - `@smartergpt/lex/atlas` → Atlas Frame generation
   - `@smartergpt/lex/module-ids` → Module ID validation
   - `@smartergpt/lex/aliases` → Alias resolution
   - `@smartergpt/lex/cli-output` → CLI JSON output
   - `@smartergpt/lex/schemas/*` → JSON schemas
3. Removed `./rules` from public exports (now experimental/internal)
4. Updated `src/index.ts` with comprehensive 1.0.0 contract documentation
5. Marked `rules/` with `@experimental` JSDoc tags
6. Added proper TypeScript references to `src/tsconfig.json`

### Observations
- The TypeScript project references required updating to build correctly
- `@smartergpt/lex/prompts` and `@smartergpt/lex/logger` kept as softer exports (useful but not core contract)

### Judgment Calls
- Kept `prompts` and `logger` exports: They're useful utilities but marked as "API stabilizing" in docs

---

## LEX-101: Document LEX_* Env Vars

**Status:** ✅ Complete

### Changes Made
1. Created `docs/ENVIRONMENT.md` with comprehensive env var documentation
2. Documented 18 environment variables with:
   - Purpose
   - Default values
   - Usage examples
   - Contract status (1.0.0 / Internal / Experimental)
3. Added quick reference table
4. Clarified precedence: CLI flags → env vars → workspace config → defaults

### Observations
- Found legacy aliases (`LEX_BRANCH`, `LEX_COMMIT`) that should be deprecated
- Some env vars are clearly internal (logging), others are experimental (DB encryption)
- The `LEX_GIT_MODE` variable is critical for CI and testing

---

## LEX-102: CLI --json Contract Tests

**Status:** ✅ Complete

### Changes Made
1. Created `test/shared/cli/output.schema-contract.test.ts`
2. Added 14 tests validating CLI output against `cli-output.v1.schema.json`:
   - Schema structure validation
   - All output levels (info, success, warn, error, debug)
   - Data payload validation
   - Code and hint field validation
   - Required fields (v, ts, level)
   - Schema rejects invalid levels and unknown fields
   - Schema version must be exactly 1

### Observations
- The `hint` parameter is only available on `warn` and `error` methods, not `info`
- Schema uses `additionalProperties: false` which is good for contract stability
- The `v` field is `const: 1` which ensures version compliance

---

## LEX-103: MCP Error Code Enum

**Status:** In Progress

### Observations


---

## LEX-102: CLI --json Contract Tests

**Status:** Not Started

### Observations


---

## LEX-103: MCP Error Code Enum

**Status:** Not Started

### Observations


---

## LEX-104: Audit Types for schemaVersion

**Status:** Not Started

### Observations


---

## IP Boundary Notes

Any places where the line between "Lex substrate" and "LexRunner strategy" felt fuzzy:


---

## Post-1.0.0 Watch List

Things to monitor when moving from 1.0.0 to 1.1:


