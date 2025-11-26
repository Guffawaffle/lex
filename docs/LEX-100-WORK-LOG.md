# Lex 1.0.0 Work Log

## Session: 2025-11-26

### Critical Fix: WSL2/GPG Test Hang Root Cause

**Problem:** Tests would hang indefinitely when running in WSL2 with GPG signing enabled.

**Root Cause Chain:**
1. `src/shared/git/branch.ts` and `src/shared/git/commit.ts` used `execSync()` to run git commands
2. `execSync()` spawns a shell, which on WSL2 can get into weird TTY states
3. Even without GPG, the shell spawning itself was problematic
4. The `npm test` script did NOT set `LEX_GIT_MODE=off`, so tests could trigger git operations

**Fixes Applied:**

1. **Replaced `execSync` with `spawnSync`** in both git modules
   - `spawnSync` bypasses the shell and runs the binary directly
   - Added `LEX_GIT_MODE=off` check to skip git entirely when off
   - Added `LEX_DEFAULT_BRANCH` and `LEX_DEFAULT_COMMIT` env var support

2. **Created test infrastructure** (`test/helpers/`)
   - `setup.ts` - Preload module that sets safe defaults
   - `test-env.ts` - Full test utilities with save/restore semantics
   - `README.md` - Documentation for test authors

3. **Updated `package.json` test scripts**
   - All test commands now use `--import ./test/helpers/setup.ts`
   - Removed redundant inline env var setting
   - Git tests explicitly excluded via `grep -v 'test/shared/git/'`

**Key Insight:** The real fix isn't just "set LEX_GIT_MODE=off in the script" - it's having a **base test infrastructure** that enforces safe defaults so individual test authors never have to think about it.

### Files Changed

- `src/shared/git/branch.ts` - `execSync` → `spawnSync`, added env var checks
- `src/shared/git/commit.ts` - `execSync` → `spawnSync`, added env var checks
- `package.json` - Test scripts updated to use preload
- `test/helpers/setup.ts` - NEW: Preload module
- `test/helpers/test-env.ts` - NEW: Test utilities
- `test/helpers/README.md` - NEW: Documentation

### Test Results

- 123 tests passing
- 0 failures
- Git tests properly excluded and run separately via `npm run test:git`

---

## LEX-100 to LEX-104 Status

Work in progress. Paused to fix the test infrastructure.

### LEX-100: Tighten exports
- [ ] Remove wildcard exports
- [ ] Add explicit exports

### LEX-101: Document LEX_* env vars
- [ ] Create docs/ENVIRONMENT.md

### LEX-102: CLI --json contract tests
- [x] Created `test/shared/cli/output.schema-contract.test.ts`

### LEX-103: MCP error code enum
- [x] Created `src/memory/mcp_server/errors.ts`
- [x] Updated server.ts to use MCPError
- [ ] Document in README

### LEX-104: Audit public types for schemaVersion
- [ ] Pending
