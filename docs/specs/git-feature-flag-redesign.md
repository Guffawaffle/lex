# Feature Spec: Git Integration Feature Flag Redesign

**Version:** 0.1.0  
**Status:** Draft  
**Author:** Lex Memory System  
**Created:** 2025-11-25  
**Priority:** P0 - Critical (Blocks reliable CI/CD)

## Executive Summary

Git integration in Lex is currently hard-wired as a dependency rather than an optional capability. This causes test failures, CI hangs, and deployment issues in environments without `.git` directories. This spec defines a feature-flagged approach where git commands are **opt-in** rather than **opt-out**.

## Problem Statement

### Current State
- `getCurrentBranch()` and `getCurrentCommit()` in `src/shared/git/` shell out to git unconditionally
- Multiple code paths (MCP server, token expander, CLI) call these functions
- Tests that touch these paths trigger git commands
- GPG signing requirements cause test hangs (infinite wait for passphrase)
- Deployed environments without `.git` directories receive `fatal: not a git repository` errors
- Current mitigation: fragile skip patterns in test commands

### Impact
- `npm test` cannot complete reliably without manual intervention
- `npm run local-ci` hangs on git-dependent code paths
- CI/CD pipelines are unstable
- Developer experience suffers from unpredictable test behavior

## Target Behavior

| Context | Should call real `git`? | Notes |
|---------|------------------------|-------|
| `npm test` | **No** | Uses env-provided or undefined branch/commit |
| `npm run local-ci` | **No** | Same as `npm test` |
| `scripts/ci.sh` in CI | **No** | Deploy images have no `.git` |
| `npm run test:git` | **Yes** (controlled) | Only here, with GPG-safe wrapper |
| Library usage in a repo | *Optional* | Only if user opts in with flag |
| Library usage in deploy | **No** | No `.git` assumption, no fatal errors |

## Proposed Solution

### 1. Central Git Runtime Flag

Create `src/shared/git/runtime.ts`:

```typescript
export type GitMode = 'off' | 'live';

let mode: GitMode = (process.env.LEX_GIT_MODE as GitMode) || 'off';

export function setGitMode(next: GitMode): void {
  mode = next;
}

export function gitIsEnabled(): boolean {
  return mode === 'live';
}

export function getEnvBranch(): string | undefined {
  return process.env.LEX_DEFAULT_BRANCH || process.env.LEX_BRANCH || undefined;
}

export function getEnvCommit(): string | undefined {
  return process.env.LEX_DEFAULT_COMMIT || process.env.LEX_COMMIT || undefined;
}
```

**Key Design Decision:** Default is `off` (no git shells). A single env var (`LEX_GIT_MODE=live`) enables git commands.

### 2. Update Git Helper Functions

Modify `getCurrentBranch()` and `getCurrentCommit()` to:

1. Check `gitIsEnabled()` first - if false, return env value or undefined
2. If enabled and env value exists, return env value (env always takes precedence)
3. Check for `.git` directory existence before attempting git commands
4. Never throw on git failures - return undefined instead

```typescript
// src/shared/git/branch.ts
export function getCurrentBranch(opts?: { repoRoot?: string }): string | undefined {
  const envBranch = getEnvBranch();
  
  // Gate: never call git unless enabled
  if (!gitIsEnabled()) {
    return envBranch;
  }

  // Env takes precedence even when git is enabled
  if (envBranch) {
    return envBranch;
  }

  const cwd = opts?.repoRoot ?? process.cwd();
  if (!existsSync(join(cwd, '.git'))) {
    return undefined;
  }

  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim() || undefined;
  } catch {
    return undefined;
  }
}
```

### 3. GPG-Safe Git Wrapper

For `test:git` scenarios, create a wrapper that disables GPG signing:

```typescript
// src/shared/git/run.ts
export function runGit(args: string[], opts: { cwd?: string } = {}): string {
  const extra: string[] = ['-c', 'commit.gpgSign=false'];

  const result = spawnSync('git', [...extra, ...args], {
    cwd: opts.cwd,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git failed');
  }

  return result.stdout.trim();
}
```

### 4. Script Updates

**package.json:**
```json
{
  "scripts": {
    "test": "LEX_GIT_MODE=off ... npx tsx --test ...",
    "test:git": "LEX_GIT_MODE=live ... npx tsx --test 'test/shared/git/**/*.test.ts' ..."
  }
}
```

**Test environment helpers:**
```typescript
function getTestEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LEX_GIT_MODE: 'off',
    LEX_DEFAULT_BRANCH: 'test-branch',
    // ... other test env vars
  };
}
```

## Migration Plan

### Phase 1: Add Feature Flag Infrastructure
1. Create `src/shared/git/runtime.ts` with mode flag and env helpers
2. Add `src/shared/git/run.ts` with GPG-safe wrapper
3. No behavior changes yet

### Phase 2: Update Git Helpers
1. Modify `getCurrentBranch()` to check `gitIsEnabled()` gate
2. Modify `getCurrentCommit()` to check `gitIsEnabled()` gate
3. Update callers to handle `undefined` returns gracefully

### Phase 3: Update Scripts and Tests
1. Add `LEX_GIT_MODE=off` to `npm test` and `npm run local-ci`
2. Add `LEX_GIT_MODE=live` to `npm run test:git`
3. Update CLI test harness with proper env vars
4. Remove fragile skip patterns once gate is working

### Phase 4: Documentation and Cleanup
1. Update `copilot-instructions.md` with new model
2. Document `LEX_GIT_MODE` in README
3. Remove obsolete comments about git test exclusion

## Acceptance Criteria

- [ ] `npm test` completes without any git commands being executed
- [ ] `npm run local-ci` completes without any git commands
- [ ] `npm run test:git` runs git tests with GPG signing disabled
- [ ] No `fatal: not a git repository` errors in any test or deploy context
- [ ] `LEX_GIT_MODE=live` enables git detection in library usage
- [ ] `LEX_DEFAULT_BRANCH` and `LEX_DEFAULT_COMMIT` env vars are respected
- [ ] All existing tests pass (with appropriate env configuration)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing user workflows | Default to `off` preserves current safe behavior |
| Tests silently skipping git | `test:git` lane explicitly tests git functionality |
| Incomplete migration | Phase approach allows incremental validation |

## Open Questions

1. Should `LEX_GIT_MODE` have a third value like `auto` for smart detection?
2. Should the feature flag be configurable via `lexmap.policy.json`?
3. Do we need telemetry/logging when git is disabled vs unavailable?

## References

- GitHub Copilot Instructions: `.github/copilot-instructions.md`
- Current git helpers: `src/shared/git/branch.ts`, `src/shared/git/commit.ts`
- Token expander (calls git): `src/shared/tokens/expander.ts`
- MCP server (calls git): `src/memory/mcp_server/server.ts`
