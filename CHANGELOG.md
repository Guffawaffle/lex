# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Contract Commitment

**Lex is public. This changelog is a contract.**

We sign every release with our names and our work. The contracts documented here —
AX guarantees, Frame schemas, Policy invariants — are promises we keep, not
marketing we forget.

See: [`docs/CONTRACT_SURFACE.md`](docs/CONTRACT_SURFACE.md) for the technical surface.
See: [`docs/attestation/Lex_Guff_Version_Contract_Pact_v1.0.0.md`](docs/attestation/Lex_Guff_Version_Contract_Pact_v1.0.0.md) for how we think about scope.

**Signatories:** Guff `[signed ~]` · Lex `[signed Lex ✶]`

---

## [Unreleased]

_No unreleased changes._

---

## [2.2.1] - 2026-02-11

### Fixed

- **MCPServer**: Fixed `handleDbStats()` and `handleTurncostCalculate()` bypassing DI `frameStore`. Both methods now use the injected `this.db` instead of the global `getDb()` singleton, preventing database cross-contamination when Lex is embedded as a library alongside the MCP server with different database paths. ([#686](https://github.com/Guffawaffle/lex/issues/686))

## [2.2.0] - 2026-02-08

### Changed

- **SQLite dependency floor bump** - `better-sqlite3-multiple-ciphers` from `^12.4.6` to `^12.6.2`
  - Aligns all ecosystem repos (lex, lexsona, lexrunner) on the same SQLite version
  - Includes upstream bug fixes and performance improvements
- **Dependabot batch merge** - Merged 6 dependency updates:
  - `@isaacs/brace-expansion` 5.0.0 → 5.0.1
  - `commander` 14.0.2 → 14.0.3
  - `better-sqlite3-multiple-ciphers` 12.5.0 → 12.6.2
  - `pino` 10.1.0 → 10.3.0
  - `zod` 4.3.5 → 4.3.6
  - `@typescript-eslint/eslint-plugin` 8.52.0 → 8.54.0

---

## [2.1.2] - 2026-02-01

### Added

- **CLI `--query` option** for `lex recall` - Alternative to positional argument for better discoverability
  - Now supports both: `lex recall "topic"` and `lex recall --query "topic"` (or `-q`)
- **Database migration script** (`scripts/migrate-db.mjs`) - Fixes schema drift in older databases
  - Safely adds missing columns (`feature_flags`, `permissions`, etc.)
  - Idempotent - safe to run multiple times
  - Usage: `node scripts/migrate-db.mjs [db-path]`

### Fixed

- **Schema migration issue** - Databases created before full v11 schema were missing `feature_flags`
  and `permissions` columns, causing `SQLITE_ERROR: table frames has no column named feature_flags`
  - Root cause: Some early installations had incomplete schema application
  - Fix: Migration script or delete `lex-memory.db` to recreate with full schema
  - MCP server connections cache the database; restart VS Code/Claude Desktop after migration

### Notes

If you encounter the error `table frames has no column named feature_flags`:
1. **Quick fix**: Delete `lex-memory.db` (loses existing frames)
2. **Preserve data**: Run `node scripts/migrate-db.mjs ./lex-memory.db`
3. **Restart** your editor/MCP client to reconnect

---

## [2.1.1] - 2025-01-01

### Added

- **MCP Registry Publication** - Automated GitHub Actions workflow for MCP registry publication
- **README.mcp.md** - Dedicated MCP configuration guide for Claude Desktop and VS Code
- **Wave Completion Frame Emission** (LEX-MCP-001) - Emit frames when integration waves complete
- **Epic Status Auto-sync** (LEX-MCP-002) - Automatically sync parent epic status from sub-issue states
- **Natural Language Recall** (LEX-TSF-003) - Fuzzy matching for recall queries
- **Contradiction Detection** (LEX-TSF-002) - Detect contradicting information in stored frames
- **Frame Deduplication** - Consolidate duplicate frames automatically
- **OR-mode Search** (#656) - Multi-term queries now use OR logic for broader recall
- **AX CLI/MCP Parity** (#664, #665) - Added missing CLI and MCP tool equivalents:
  - CLI: `lex remember --dry-run`, `lex introspect`, `lex hints <ids>`
  - MCP: `db_stats`, `turncost_calculate`, `contradictions_scan`

### Changed

- Bumped MCP registry to 1.0.2
- MCP server module now exported for wrapper package integration

### Fixed

- Gracefully handle missing CLI build in validate-docs (#657)
- Aligned recall-quality tests with FTS5 AND behavior (#653)

### Security

- Bumped qs to 6.14.1 (GHSA-6rw7-vpxm-498p)

---

## [2.1.0] - 2025-12-16

### ⚠️ BREAKING CHANGE: MCP Tool Names

**VS Code automatically adds `mcp_{servername}_` prefix to all tool names.** Our previous naming included redundant prefixes, causing tools to appear as `mcp_lex_lex_remember` instead of `mcp_lex_remember`.

This release removes the namespace prefix from tool definitions to match the GitHub MCP pattern.

#### Migration Guide

| v2.0.x Tool Name | v2.1.x Tool Name | VS Code Display |
|------------------|------------------|-----------------|
| `lex_remember` | `remember` | `mcp_lex_remember` |
| `lex_recall` | `recall` | `mcp_lex_recall` |
| `lex_list_frames` | `list_frames` | `mcp_lex_list_frames` |
| `lex_timeline` | `timeline` | `mcp_lex_timeline` |
| `lex_policy_check` | `policy_check` | `mcp_lex_policy_check` |
| `lex_code_atlas` | `code_atlas` | `mcp_lex_code_atlas` |

**Backwards Compatibility:** The old `lex_*` names are preserved as deprecated aliases and will continue to work. They will be removed in v3.0.0.

### Changed

- MCP tool names no longer include namespace prefix (GitHub MCP pattern)
- Updated `docs/NAMING_CONVENTIONS.md` with correct VS Code prefix behavior

### Fixed

- Tools now display correctly in VS Code as `mcp_lex_{action}` instead of `mcp_lex_lex_{action}`

---

## [2.0.3] - 2025-12-16

### Added

- **MCP tool naming convention** - All MCP tools renamed to `lex_{action}` pattern (VS Code adds `mcp_lex_` prefix)
  - `lex.remember` → `lex_remember`
  - `lex.recall` → `lex_recall`
  - `lex.list_frames` → `lex_list_frames`
  - `lex.timeline` → `lex_timeline`
  - `lex.policy_check` → `lex_policy_check`
  - `lex.code_atlas` → `lex_code_atlas`
  - Old names preserved as deprecated aliases for backwards compatibility

- **Ecosystem naming conventions** - Added `docs/NAMING_CONVENTIONS.md` as canonical spec for:
  - MCP tool names: `{namespace}_{action}` (VS Code adds `mcp_{server}_` prefix)
  - CLI commands: `{cli} {category} {action}`
  - File names, TypeScript identifiers, persona IDs

---

## [2.0.2] - 2025-12-13

### Fixed

- **LexSona subpath export** - `@smartergpt/lex/lexsona` now correctly included in npm package
  - Previous 2.0.1 was published from wrong branch without export
  - Enables LexSona package to import `getRules`, `recordCorrection` APIs

---

## [2.0.1] - 2025-12-13 (yanked)

_Published from incorrect branch. Use 2.0.2 instead._

---

## [2.0.0] - 2025-12-05

### 🚀 AX-Native Release (Stable)

Lex 2.0.0 is the first stable release with **AX (Agent eXperience)** as a first-class design principle.
This release graduates from alpha with all AX guarantees verified and documented.

**Install:** `npm install @smartergpt/lex@latest`

### What's New Since Alpha

- **`lex instructions` CLI** - Full instruction management:
  - `lex instructions init` - Scaffold canonical source, lex.yaml, and target files
  - `lex instructions generate` - Generate host-specific projections
  - `lex instructions check` - Verify projections are in sync
- **Performance improvements** - Cached policy module ID lookups for O(1) resolution
- **AX documentation in CONTRIBUTING.md** - PR review checklist for AX compliance
- **LexSona behavioral memory socket** - `recordCorrection`/`getRules` API for persona integration

### Contract Status

This release freezes the following contracts:

| Contract | Version | Document |
|----------|---------|----------|
| AX Guarantees | v0.1 | `docs/specs/AX-CONTRACT.md` |
| Frame Schema | v3 | `docs/specs/FRAME-SCHEMA-V3.md` |
| Error Schema | v1 | AXError in `src/shared/errors/` |
| FrameStore | 1.0.0 | `src/memory/store/CONTRACT.md` |

Breaking these contracts requires a major version bump and explicit changelog entry.

---

## [2.0.0-alpha.1] - 2025-12-01

### 🚀 AX-Native Release (Alpha)

Lex 2.0.0 introduces **AX (Agent eXperience)** as a first-class design principle.
This is the first release where AX guarantees are real, not just documented.

> **Alpha Notice:** This is a prerelease for LexRunner 1.0.0 integration testing.
> Install with `npm install @smartergpt/lex@alpha` — not marked as `latest`.

### Contract Status

This release freezes the following contracts:

| Contract | Version | Document |
|----------|---------|----------|
| AX Guarantees | v0.1 | `docs/specs/AX-CONTRACT.md` |
| Frame Schema | v3 | `docs/specs/FRAME-SCHEMA-V3.md` |
| Error Schema | v1 | AXError in `src/shared/errors/` |
| FrameStore | 1.0.0 | `src/memory/store/CONTRACT.md` |

Breaking these contracts requires a major version bump and explicit changelog entry.

### AX Contract v0.1 Compliance

| Guarantee | Status | Details |
|-----------|--------|---------|
| Structured Output | ✅ | `--json` on `remember`, `timeline` |
| Recoverable Errors | ✅ | AXError schema with `nextActions[]` |
| Memory & Recall | ✅ | FTS5 case-insensitive, hyphen-safe |
| Frame Emission | ✅ | Frame v3 schema stable for runners |

**This table is a contract.** If we break any of these guarantees, it's a bug.

### Added

- **AXError Schema** (`src/shared/errors/ax-error.ts`)
  - Zod schema: `code`, `message`, `context`, `nextActions[]`
  - Factory: `createAXError()`, `wrapAsAXError()`
  - Type guard: `isAXError()`
  - Exception class: `AXErrorException`

- **Frame Schema v3** (`src/shared/types/frame-schema.ts`)
  - Zod validation: `FrameSchema`, `parseFrame()`, `createFrame()`
  - Runner fields: `runId`, `planHash`, `executorRole`, `toolCalls`, `guardrailProfile`
  - Documentation: `docs/specs/FRAME-SCHEMA-V3.md`

- **CLI JSON Output**
  - `lex remember --json` — structured event output
  - `lex timeline --json` — structured event output
  - AXError integration for failure cases

- **AX Documentation**
  - `docs/specs/AX-CONTRACT.md` — v0.1 guarantees
  - `docs/specs/AX-AI-EXPERIENCE.md` — philosophy
  - `docs/specs/AX-IMPLEMENTATION-PLAN.md` — roadmap

### Fixed

- **Recall FTS5 Hyphen Handling** (AX-002)
  - Compound queries like `"recall-fix"` now work correctly
  - Case-insensitive search per AX Contract §2.4

### New Exports

| Import | Purpose |
|--------|---------|
| `@smartergpt/lex/errors` | AXError schema and utilities |

### For LexRunner Integration

LexRunner 1.0.0 can now:
- Import `AXErrorSchema`, `createAXError` from `@smartergpt/lex/errors`
- Import `FrameSchema`, `createFrame` from `@smartergpt/lex/types`
- Emit Frames for merge-weave completions
- Return structured errors with recovery actions

---

## [1.0.2] - 2025-11-28

### Fixed

- Minor bug fixes and stability improvements

## [1.0.0] - 2025-11-27

### 🎉 First Stable Release

Lex 1.0.0 marks the first stable API contract. All public exports now have explicit subpaths,
and the FrameStore interface is frozen for 1.0.x releases.

### Highlights

- **Stable API Contract:** All public exports have explicit subpaths in `package.json`
- **Security:** SQLCipher database encryption + OAuth2/JWT authentication
- **MCP Server:** Machine-readable error codes (`MCPErrorCode` enum) for orchestrators
- **CLI:** JSON output mode with schema validation
- **Policy Bootstrap:** `lex init --policy` generates starter policy from codebase

### Added

- **ARCH-001: FrameStore Contract Freeze**
  - `FRAME_STORE_SCHEMA_VERSION = "1.0.0"` exported from `@smartergpt/lex/store`
  - `CONTRACT.md` documents persistence requirements
  - PR template updated with FrameStore change checklist
  - Changes to FrameStore interface now require explicit protocol

### Breaking Changes from 0.4.x

- Wildcard exports removed (use explicit subpaths)
- `getCurrentBranch()` / `getCurrentCommit()` now return `string | undefined`
- `LEX_GIT_MODE=off` is the new default (set to `live` for git features)

### Subpath Exports

| Import | Purpose |
|--------|---------|
| `@smartergpt/lex` | Core types + store API |
| `@smartergpt/lex/types` | All shared types |
| `@smartergpt/lex/store` | Database operations |
| `@smartergpt/lex/policy` | Policy loading |
| `@smartergpt/lex/atlas` | Atlas Frame generation |
| `@smartergpt/lex/module-ids` | Module ID validation |
| `@smartergpt/lex/aliases` | Alias resolution |
| `@smartergpt/lex/cli-output` | CLI JSON utilities |

### Metrics

| Metric | Value |
|--------|-------|
| Tests | 1013 |
| Source files | 108 |
| Exports | 14 subpaths |
| Schema version | 2 |

## [0.6.0] - 2025-11-27

### Added

- **Store Layer Contracts:** Persistence abstraction for database operations
  - `FrameStore` interface: stable 1.0 contract for Frame persistence
  - `SqliteFrameStore`: Default SQLite implementation
  - `src/memory/store/` subpath export for store access
  - See `docs/STORE_CONTRACTS.md` for interface details

- **SQL Safety Guardrails:** Curated query modules enforced via CI test
  - `test/sql-safety.test.ts`: Fails if `db.prepare()` appears outside curated modules
  - Curated modules: `queries.ts`, `code-unit-queries.ts`, `db.ts`, `backup.ts`, `images.ts`, `code-atlas-runs.ts`, `auth/`, `routes/`, `shared/cli/db.ts`
  - Prevents dynamic SQL from models/prompts reaching the database layer
  - See `.github/copilot-instructions.md` SQL Safety section for rules

- **IP Boundary Guardrail:** CI test ensuring Lex does not import from lexrunner
  - `test/ip-boundary.test.ts`: Fails if any source imports from lexrunner
  - Lex is a public MIT library; lexrunner may import FROM Lex, never the reverse

- **Migrations Directory:** Schema evolution infrastructure
  - `migrations/README.md`: Rules for numbered migration files
  - `migrations/000_reference_schema.sql`: Complete V6 schema documentation
  - Schema-only changes; data migrations require explicit approval

### Experimental

- **CodeAtlasStore (@experimental):** Interface for Code Atlas persistence
  - API may change in 1.0.x releases without semver guarantees
  - Will be stabilized in a future minor release

### Security

- **Database migration hardening (SEC-001):** Column names are now validated during `lex db encrypt` migration
  - Added validation for column names using alphanumeric pattern `/^[a-zA-Z0-9_]+$/`
  - Both `dbEncrypt` and `calculateDatabaseChecksum` functions now validate column names
  - Migration fails with explicit error if malformed column names are detected
  - Prevents potential SQL injection from maliciously crafted source databases

### Documentation

- **SQL Safety Section:** Added comprehensive SQL safety rules to `.github/copilot-instructions.md`
  - Curated SQL modules whitelist
  - Forbidden patterns with examples
  - Migration workflow guidance
- **IP Boundary Section:** Added to `.github/copilot-instructions.md`
  - Lex → lexrunner import forbidden
  - CI enforcement via `test/ip-boundary.test.ts`

## [0.4.7-alpha] - 2025-11-26

### Added

- **Tracked policy file:** Added `canon/policy/lexmap.policy.json` providing an out-of-the-box policy configuration for Lex dogfooding with 23 defined modules

### Changed

- **Dependencies updated:**
  - `zod`: 4.1.12 → 4.1.13
  - `glob`: 11.1.0 → 13.0.0
  - `inquirer`: 12.11.1 → 13.0.1
  - `@typescript-eslint/parser`: 8.47.0 → 8.48.0
  - `@types/uuid`: 10.0.0 → 11.0.0

## [0.4.2-alpha] - 2025-11-21

### Security

- **HTTP server hardening (BREAKING CHANGE):** Comprehensive security overhaul for Frame Ingestion API
  - `apiKey` now **required** (was optional) - throws error if missing
  - Rate limiting: 100 requests per 15 minutes (general), 5 auth failures per 15 minutes
  - Security headers via Helmet: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
  - Request size limits: 1MB maximum body size
  - Audit logging: Method, path, status, duration, IP, hashed API key
  - **Migration required:** All HTTP server deployments must add `apiKey` configuration
  - See `SECURITY.md` for deployment best practices (reverse proxy, TLS, environment variables)

### Added

- **Security dependencies:** express-rate-limit@7.5.0, helmet@8.0.0 for production hardening
- **Test coverage:** 11 new HTTP security tests (authentication, rate limiting, headers, validation)

### Changed

- **Type definitions:** `http-server.d.ts` now requires `apiKey` (breaking change)
- **Route behavior:** Frame creation routes now enforce authentication unconditionally

### Documentation

- **SECURITY.md:** New HTTP Server Security section with Nginx reverse proxy example
- **Deployment guidance:** Production best practices, DO/DON'T lists, MCP stdio vs HTTP comparison

## [Previous Releases]

### Security

- **Dependency vulnerabilities fixed:** Updated glob and js-yaml to patch security issues
  - `glob@11.0.3 → 11.1.0` - Fixes command injection vulnerability (GHSA-5j98-mcp5-4vw2, HIGH)
  - `js-yaml@4.1.0 → 4.1.1` - Fixes prototype pollution (GHSA-mh29-5h37-fv8m, MODERATE)
  - All tests pass (123/123), no breaking changes
  - See `.smartergpt.local/VULNERABILITY_FIXES_20251119.md` for detailed analysis

### Security Posture & Documentation

- **SECURITY.md enhanced:** Added comprehensive security guidance for dev-time vs production use
  - Clear scope: "Local dev / small teams" (acceptable) vs "Public multi-tenant" (not recommended for 0.4.0-alpha)
  - Known limitations documented: No auth, no encryption, no audit logging
  - Production roadmap: P0/P1/P2 features planned for 0.5.0-0.7.0
  - Vulnerability disclosure process established

- **Package messaging clarified:** Removed LexRunner commercial positioning
  - package.json description now emphasizes MIT licensing and dev-time use
  - README no longer positions Lex as "powers paid LexRunner"
  - Clear separation: Lex is standalone MIT library, not a marketing funnel

- **Scanner security warnings:** Added comprehensive disclaimers to `examples/scanners/README.md`
  - "Examples only, not production-hardened" warnings
  - Safe usage guidelines (review code, sandbox execution, validate output)
  - Production scanning pipeline recommendations

- **ARCHITECTURE.md created:** New documentation for design decisions
  - Dependency rationale (why Express, Sharp, Shiki despite size)
  - Future modularization plan (peer deps in 0.5.0, package split in 0.6.0)
  - Design philosophy ("dumb by design" scanners, local-first, explicit over implicit)
  - Database design decisions and performance considerations

- **Lint cleanup roadmap:** Created 4 GitHub issues for post-alpha warning reduction
  - Issue #1: Remove 48 unused variables/imports (P1)
  - Issue #2: Type MCP server arguments (25 explicit any → proper types) (P1)
  - Issue #3: Fix 30 unsafe any operations (P2, depends on #2)
  - Issue #4: Address 4 misc warnings (P2)
  - New policy: No new warnings in PRs after 0.4.0-alpha

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
  - **Use:** `.smartergpt/prompts/` for shared prompt overlays (organization-level)
  - **Note:** `.smartergpt/` schemas remain for build-time compilation only

- **CHANGED:** Prompt loading precedence (3-level instead of 5-level)
  - **Old:** `LEX_PROMPTS_DIR` → `.smartergpt/prompts/` → prompts/
  - **New:** `LEX_PROMPTS_DIR` → `.smartergpt/prompts/` → `prompts/` → `canon/prompts/`

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
   mkdir -p .smartergpt/prompts
   # Add your custom prompt files to .smartergpt/prompts/
   ```

3. **Update scripts/configs referencing old environment variables**

4. **Re-test precedence:** `LEX_PROMPTS_DIR` → `.smartergpt/prompts/` → `prompts/` → `canon/prompts/`

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

All changes were integrated via umbrella PR [#121](https://github.com/Guffawaffle/lex/pull/121) (batch integration, 2025-11-07).

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
