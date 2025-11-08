# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### From 0.2.0 to Unreleased

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

[Unreleased]: https://github.com/Guffawaffle/lex/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Guffawaffle/lex/releases/tag/v0.2.0
