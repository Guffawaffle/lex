# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Repository Cleanup

- **Tracked MCP symlink:** `memory/mcp_server/frame-mcp.mjs` now tracked (required by `lex-launcher.sh`)
- **Removed lint baseline:** Deleted empty `lint-baseline.json` from tracking (optional dev tool)
- **CLI cleanup:** Removed commented-out commands for unimplemented features (`db vacuum`, `db backup`, `frames export`)
- **Architecture notes:** Clarified Zod/TypeScript type separation in `src/memory/frames/types.ts`
- **Scanner examples:** Relocated Python/PHP scanners to `examples/scanners/` (not part of TS runtime)

### ⚠️ Breaking Changes

- **REMOVED:** `LEX_PROMPTS_DIR`, `LEX_SCHEMAS_DIR`, `LEX_CONFIG_DIR` environment variables
  - **Use:** `LEX_CANON_DIR=/path/to/canon` (points to directory containing `prompts/` and `schemas/`)
  - **Example:** `export LEX_CANON_DIR=/custom/canon` loads prompts from `/custom/canon/prompts/`

- **REMOVED:** Runtime reads of `.smartergpt/` directory for prompts
  - **Use:** `.smartergpt.local/prompts/` for local overlay prompts
  - **Note:** `.smartergpt/` schemas remain for build-time compilation only

- **CHANGED:** Prompt loading precedence (3-level instead of 5-level)
  - **Old:** `LEX_PROMPTS_DIR` → `.smartergpt.local/prompts` → `.smartergpt/prompts`
  - **New:** `LEX_CANON_DIR/prompts` → `.smartergpt.local/prompts` → `prompts/` (package location)

- **CHANGED:** Zod schemas now use `.loose()` instead of `.passthrough()`
  - Affects: `GateConfigSchema`, `StackComponentConfigSchema` in infrastructure schemas
  - Behavior unchanged, but aligns with Zod 4.x best practices

### Migration Guide

1. **Replace environment variables:**
   ```bash
   # OLD
   export LEX_PROMPTS_DIR=/custom/prompts
   export LEX_SCHEMAS_DIR=/custom/schemas

   # NEW
   export LEX_CANON_DIR=/custom/canon  # containing prompts/ and schemas/
   ```

2. **Move local overrides (if using deprecated .smartergpt/prompts):**
   ```bash
   # Only needed if you were reading from .smartergpt/prompts at runtime
   # (typically you weren't - this was mostly for internal development)
   mkdir -p .smartergpt.local/prompts
   # Add your custom prompt files to .smartergpt.local/prompts/
   ```

3. **Update scripts/configs referencing old environment variables**

4. **Re-test precedence:** `LEX_CANON_DIR` → `.smartergpt.local/` → package

## [0.4.0] - 2025-11-09

### ⚠️ Breaking Changes (Internal APIs)

**Note:** These changes only affect internal APIs. Lex has no external adopters yet (internal dogfooding phase only).

- **Legacy Module ID Validator Removed** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Deleted `validateModuleIdsSync()` function and its test suite
  - **Previous behavior**: Synchronous validator without alias resolution support
  - **New behavior**: Use `validateModuleIds()` (async) which provides full alias resolution
  - **Migration**: Replace all `validateModuleIdsSync(ids, policy)` calls with `await validateModuleIds(ids, policy, aliasTable)`
  - **Why**: Async validator is strictly superior with alias support; sync version was deprecated and unused

- **Policy Reporter Signature Modernized** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Enforced modern `generateReport()` signature
  - **Previous behavior**: Accepted 3 arguments `generateReport(violations, policy, format)` with legacy type detection
  - **New behavior**: Single object parameter `generateReport(violations, { policy, format })`
  - **Migration**: Change `generateReport(violations, policy, "json")` → `generateReport(violations, { policy, format: "json" })`
  - **Why**: Modern signature is clearer, easier to extend, and removes legacy type detection code

- **Legacy Policy Loader Cleanup** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Removed `LEGACY_POLICY_PATH` and `transformPolicy()` fallbacks
  - **Previous behavior**: Attempted to load legacy policy format and transform to current schema
  - **New behavior**: Only loads current "modules" format from standard paths
  - **Migration**: Ensure all policy files use current schema with `"modules"` key
  - **Why**: All policy files already use current format; legacy fallbacks were unused dead code

### Added

- **Structured Logging System** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Pino-based logger with subpath export
  - `lex/logger` subpath provides `getLogger(scope?)` function
  - Respects `LEX_LOG_LEVEL` env var (silent/trace/debug/info/warn/error/fatal)
  - Respects `LEX_LOG_PRETTY` env var for TTY-aware formatting
  - Tests default to `silent` level to avoid pollution
  - Scope support for categorizing log entries (`{scope: "cli:remember"}`)
  - **pino-pretty** moved to `optionalDependencies` - gracefully falls back to JSON if not installed

- **CLI Output Wrapper** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Centralized console output system
  - `src/shared/cli/output.ts` provides dual-sink output (console + diagnostic logger)
  - Supports plain mode (default, human-readable) and JSONL mode (machine-parseable)
  - Stream routing: errors/warnings → stderr, info/success/debug → stdout
  - Controlled via `LEX_CLI_OUTPUT_MODE` env var
  - See `docs/CLI_OUTPUT.md` and `schemas/cli-output.v1.schema.json` for details

- **ESLint Legacy Guards** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Prevent reintroduction of removed patterns
  - Added `no-restricted-imports` rules forbidding `**/framestore` and `**/validateModuleIdsSync*`
  - Enforced `no-console` globally with narrow override only for `src/shared/cli/output.ts`
  - Helpful error messages guide developers to correct alternatives

### Changed

- **ESM Imports in Database Layer** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Converted `require()` to ESM imports
  - `src/memory/store/db.ts` now uses proper `import { readFileSync } from "fs"` instead of `require()`
  - Better TypeScript type inference and IDE support
  - Aligns with pure ESM codebase policy

- **Test/Docs Terminology Updates** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Clarified "backward-compatible" → "named exports"
  - Test descriptions updated to reflect these are intentional current APIs, not legacy compatibility layers
  - `docs/CLI_OUTPUT.md` terminology clarified

### Fixed

- **ESLint Configuration Optimized** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Reduced type-safety warnings by 94.6%
  - Lint warnings reduced from 661 → 154 (73% overall reduction)
  - Type-safety rules (no-unsafe-*) exempted for test files and data boundary layers
  - Core business logic in `src/memory` and `src/policy` remains strictly typed
  - Zero hard-stop errors

### Performance

- **CI Cost Optimization** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Reduced GitHub Actions runs by 25%
  - Removed duplicate Node 22 matrix entry from alias tests
  - Maintains Node 20 LTS coverage

### Documentation

- **Legacy Removal Plan** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Added `docs/legacy-removal-plan.md` documenting Phase 2-3 cleanup strategy
- **CLI Output Documentation** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Enhanced `docs/CLI_OUTPUT.md` with usage patterns and schema reference
- **README Updates** ([#173](https://github.com/Guffawaffle/lex/pull/173)): Added Quick Start section and environment variable documentation

## [0.3.0] - 2025-11-08

### ⚠️ Breaking Changes
- **Module ID Validation Strictness** ([#119](https://github.com/Guffawaffle/lex/pull/119)): Substring matching is now disabled in the validator
  - **Previous behavior**: `'auth-core'` would match `'services/auth-core'` automatically
  - **New behavior**: Only exact matches or explicit aliases are accepted (confidence === 1.0)
  - **Migration**: If you rely on substring matching, add explicit aliases to your policy files
  - **Why**: Prevents unintended module resolution and enforces stricter validation

### Added
- **Performance Optimization**: O(1) policy lookup caching via WeakMap for module ID validation ([#117](https://github.com/Guffawaffle/lex/pull/117))
  - Fast path for all-exact-matches case, bypassing resolver entirely
  - 1000-module policy now validates in same time as 10-module (~0.003ms)
  - Benchmark performance improved by ~55% (faster than baseline)
- **Improved Error Handling**: FTS5 search errors now gracefully return empty results instead of failing ([#120](https://github.com/Guffawaffle/lex/pull/120))
  - Handles special characters (hyphens, operators) in search queries
  - Treats SQLITE_ERROR as empty result set rather than propagating errors
  - Better handling of edge cases: unicode, special chars, and malformed queries

### Changed
- **Stricter Module ID Validation**: Disabled substring matching in validator ([#119](https://github.com/Guffawaffle/lex/pull/119))
  - Now only accepts `confidence === 1.0` resolutions (exact match or explicit alias)
  - Substring matches (confidence 0.9) correctly fail validation but suggest alternatives
  - Example: `'auth-core'` no longer auto-resolves to `'services/auth-core'` without explicit alias
  - Enforces case-sensitive validation
- **Documentation Updates**: Comprehensive updates to reflect single-package structure ([#112](https://github.com/Guffawaffle/lex/pull/112))
  - Replaced all `@lex/*` imports with relative paths from `src/`
  - Updated runtime paths: `memory/mcp_server/frame-mcp.mjs` → `dist/memory/mcp_server/frame-mcp.js`
  - Simplified build documentation to single `npm run build` command
  - Updated RELEASE.md, .changeset/README.md, and all module READMEs
  - Added import pattern reference and subpath exports documentation

### Fixed
- **ESM Compatibility**: Fixed CommonJS `require()` in ES module test file ([#118](https://github.com/Guffawaffle/lex/pull/118))
  - Replaced `require("fs")` with ES module import
  - All 12 integration tests now execute properly in ESM context
- **Benchmark Test Fixes**: Made async functions properly await validation promises ([#117](https://github.com/Guffawaffle/lex/pull/117))
  - Tests were measuring promise creation time (~0.001ms) instead of actual execution
  - Fixed `measureTime` and `benchmark` functions to use async/await correctly
- **Build Artifacts**: Added `tsconfig.tsbuildinfo` to `.gitignore` ([#119](https://github.com/Guffawaffle/lex/pull/119))

## Integration Notes

All changes were integrated via umbrella PR [#121](https://github.com/Guffawaffle/lex/pull/121) (merge-weave batch, 2025-11-07).

The 5 PRs were merged locally in dependency order:
1. PR #112 - Documentation updates (independent)
2. PR #118 - ESM test fix (independent)
3. PR #117 - Performance & caching (independent)
4. PR #119 - Validator strictness (depends on #117)
5. PR #120 - Empty search handling (independent)

All gates (lint, typecheck, test) passed locally before integration.

## Upgrade Notes

### From 0.2.0 to 0.3.0

#### Module ID Validation Changes

If you're using module ID validation and previously relied on substring matching:

**Example scenario that now requires explicit aliases:**

```typescript
// Previously worked (substring match):
validateModuleIds(['auth-core'], policy); // matched 'services/auth-core'

// Now requires explicit alias or full path:
validateModuleIds(['services/auth-core'], policy); // full path
// OR add alias to policy:
{
  "aliases": {
    "auth-core": "services/auth-core"
  }
}
```

#### Performance Improvements

The validation performance improvements are automatic and require no code changes. If you were caching policy lookups manually, you may be able to remove that code as it's now handled internally.

#### Documentation Updates

If you're referencing old monorepo documentation:
- Update import patterns from `@lex/*` to relative paths
- Use subpath exports: `lex/cli`, `lex/policy/*`, `lex/memory/*`, `lex/shared/*`
- Build command simplified to `npm run build`

#### FTS5 Search Behavior

Empty search results and special character handling is now more graceful. If you were catching and handling FTS5 SQLITE_ERROR exceptions, that error handling may no longer trigger as these are now treated as empty result sets.

## [0.2.0] - 2025-11-02

Initial release with unified single-package structure after monorepo consolidation (PR #91).

### Features
- Policy-aware memory system with receipts
- Frame storage with SQLite FTS5 search
- MCP (Model Context Protocol) server for memory access
- Module ID validation with fuzzy matching
- Alias resolution system
- Policy checking and scanning

### Architecture
- Single package with subpath exports
- ESM-first design
- TypeScript with strict type checking
- Comprehensive test coverage

[Unreleased]: https://github.com/Guffawaffle/lex/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Guffawaffle/lex/releases/tag/v0.3.0
[0.2.0]: https://github.com/Guffawaffle/lex/releases/tag/v0.2.0
