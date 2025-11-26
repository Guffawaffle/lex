# Lex Test Suite

## ⚠️ CRITICAL: NO GIT COMMANDS IN TESTS ⚠️

**Tests MUST NOT execute `git commit` or any command chain that might invoke it.**

### Why This Policy Exists

This development environment uses **mandatory interactive GPG signing** for all git commits.
Any test that spawns `git commit` will:

1. **Hang indefinitely** waiting for GPG passphrase input
2. **Crash the test runner** when it times out
3. **Potentially crash WSL2** due to resource exhaustion from hung processes

### What Is Forbidden

```typescript
// ❌ NEVER DO THIS IN TEST CODE
execSync("git commit -m 'test'");
execSync("git init && git add . && git commit -m 'init'");
spawnSync("git", ["commit", "-m", "test"]);

// ❌ Even with gpgsign=false, this pattern is forbidden
execSync("git config commit.gpgsign false");
execSync("git commit -m 'test'");  // Still forbidden - policy applies

// ❌ Any command that might trigger commit hooks
execSync("npm version patch");  // Triggers git commit
```

### What Is Allowed

```typescript
// ✅ Read-only git commands are acceptable (with caution)
execSync("git rev-parse --git-dir", { stdio: "ignore" });
execSync("git branch --show-current");
execSync("git log --oneline -1");

// ✅ Mocking git behavior without actual git
const mockBranch = process.env.LEX_DEFAULT_BRANCH || "main";
```

### Quarantined Git Tests

Tests that **require** git operations are:

1. **Excluded from `npm test`** - They never run in the default test path
2. **Located in `test/shared/git/`** - Clearly separated from other tests
3. **Run via `npm run test:git`** - Explicit opt-in only
4. **Marked with warning comments** - Every file has a header warning

### Running Tests

```bash
# Standard tests (safe, no git commands)
npm test

# Git-related tests (ONLY run if you have non-interactive signing)
npm run test:git

# All tests including integration
npm run test:all
```

### Test Mode Configuration

Some slow tests support configurable workloads for faster iteration:

#### CLI Export Test Modes

The `lex frames export` progress test supports two modes:

- **Fast mode** (`LEX_CLI_EXPORT_TEST_MODE=fast`): Reduced workload (10 frames, ~2s)
  - Use for rapid iteration and debugging
  - Still validates progress reporting logic
  - Ideal for local development

- **Full mode** (`LEX_CLI_EXPORT_TEST_MODE=full`): Full workload (150 frames, ~30s)
  - Comprehensive testing of progress indicators
  - Default mode for `npm run test:git`
  - Recommended for CI and pre-commit validation

```bash
# Fast mode for quick iteration
LEX_CLI_EXPORT_TEST_MODE=fast npm run test:git

# Full mode (default)
LEX_CLI_EXPORT_TEST_MODE=full npm run test:git

# Or just
npm run test:git  # Defaults to full mode
```

### Adding New Tests

When creating new tests:

1. **Do not import `child_process` for git** - If you need git info, use environment variables
2. **Check existing patterns** - Look at how other tests mock git-dependent behavior
3. **If you absolutely must test git** - Put it in `test/shared/git/` and add the warning header

### File Header Template (for quarantined git tests)

```typescript
/**
 * ⚠️  WARNING: THIS FILE IS EXCLUDED FROM `npm test` ⚠️
 *
 * This file executes git commands and is NOT acceptable in the main test path.
 * Reason: This environment uses mandatory interactive GPG signing for commits,
 * which causes these tests to hang indefinitely.
 *
 * To run these tests explicitly: npm run test:git
 *
 * [Rest of file description...]
 */
```

---

**This policy is non-negotiable. Violations will break CI and local development.**
