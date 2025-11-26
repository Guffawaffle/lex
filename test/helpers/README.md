# Test Helpers

This directory contains shared test utilities that ensure consistent, safe test execution.

## Critical: Git Mode Safety

Tests in this repository **must not spawn git operations** by default. This is because:

1. **WSL2 TTY/GPG hangs**: `execSync` with git commands can hang indefinitely waiting for GPG passphrase input
2. **CI isolation**: Tests should not depend on the runner's git state
3. **Reproducibility**: Tests should produce the same results regardless of the git environment

## How It Works

### Automatic Setup (Recommended)

The `npm test` command automatically preloads `./test/helpers/setup.ts` which sets:

```ts
LEX_GIT_MODE=off          // Prevents git command execution
LEX_DEFAULT_BRANCH=test-branch  // Provides a safe default
LEX_DEFAULT_COMMIT=abc1234      // Provides a safe default
LEX_LOG_LEVEL=silent            // Reduces test noise
NODE_ENV=test                   // Standard test flag
LEX_WORKSPACE_ROOT=<repo-root>  // Sets workspace context
```

### Manual Setup (For Custom Test Runners)

If running tests outside of `npm test`, either:

1. **Set environment variables**:
   ```bash
   LEX_GIT_MODE=off npx tsx --test my-test.ts
   ```

2. **Import the setup module**:
   ```ts
   import '../helpers/setup.js';  // At the top of your test file
   ```

3. **Use the test-env helpers**:
   ```ts
   import { setupTestEnv, cleanupTestEnv } from '../helpers/test-env.js';

   beforeEach(() => setupTestEnv());
   afterEach(() => cleanupTestEnv());
   ```

## Files

### `setup.ts`

Simple preload module that sets safe defaults. Used via `--import ./test/helpers/setup.ts`.

### `test-env.ts`

More sophisticated test utilities with proper save/restore semantics:

- `setupTestEnv(overrides?)` - Set up test environment with optional overrides
- `cleanupTestEnv()` - Restore original environment
- `withTestEnv(name, fn, overrides?)` - Convenience wrapper for describe()
- `withGitTestEnv(name, fn)` - For tests that NEED git (auto-skips if not enabled)

### `validate-cli-event.mjs`

CLI output schema validation helper.

## Git Tests

Tests that actually need to test git functionality:

1. Live in `test/shared/git/`
2. Are excluded from `npm test`
3. Run via `npm run test:git` with `LEX_GIT_MODE=live`
4. Require non-interactive GPG signing (or disabled GPG)

## Adding New Tests

For new test files:

```ts
// No import needed! setup.ts is preloaded by npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('My Feature', () => {
  it('works without git', () => {
    // LEX_GIT_MODE is already 'off'
    assert.ok(true);
  });
});
```

For tests that need to override defaults:

```ts
import { withTestEnv } from '../helpers/test-env.js';

withTestEnv('My Feature', () => {
  it('works with custom branch', () => {
    // Uses setupTestEnv/cleanupTestEnv automatically
  });
}, { LEX_DEFAULT_BRANCH: 'custom-branch' });
```
