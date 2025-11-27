# ADR-0005: Git Integration Feature Flag

**Status:** Accepted
**Date:** 2025-11-25
**Authors:** Lex Memory System

---

## Context

Git integration in Lex was hard-wired as a dependency rather than an optional capability. `getCurrentBranch()` and `getCurrentCommit()` shell out to git unconditionally, causing:

- **Test failures** — Tests that touch git paths trigger git commands
- **CI hangs** — GPG signing requirements cause infinite wait for passphrase
- **Deployment issues** — Environments without `.git` directories receive `fatal: not a git repository` errors
- **Developer friction** — `npm test` cannot complete reliably without manual intervention

The question: how do we make git optional while preserving functionality for users who want it?

---

## Decision

We adopt an **opt-in** design where git commands are disabled by default.

### Central Runtime Flag

```typescript
// src/shared/git/runtime.ts
export type GitMode = 'off' | 'live';

let mode: GitMode = (process.env.LEX_GIT_MODE as GitMode) || 'off';

export function gitIsEnabled(): boolean {
  return mode === 'live';
}
```

**Key design decision:** Default is `off` (no git shells). A single env var (`LEX_GIT_MODE=live`) enables git commands.

### Target Behavior

| Context | Should call real `git`? | Notes |
|---------|------------------------|-------|
| `npm test` | **No** | Uses env-provided or undefined branch/commit |
| `npm run local-ci` | **No** | Same as `npm test` |
| `scripts/ci.sh` in CI | **No** | Deploy images have no `.git` |
| `npm run test:git` | **Yes** (controlled) | Only here, with GPG-safe wrapper |
| Library usage in a repo | *Optional* | Only if user opts in with flag |
| Library usage in deploy | **No** | No `.git` assumption, no fatal errors |

### Helper Function Updates

Git helpers must:
1. Check `gitIsEnabled()` first — if false, return env value or undefined
2. If enabled and env value exists, return env value (env always takes precedence)
3. Check for `.git` directory existence before attempting git commands
4. Never throw on git failures — return undefined instead

---

## Consequences

### Positive

- **Reliable tests** — `npm test` completes without git dependencies
- **CI stability** — No hangs from GPG signing prompts
- **Deployment safety** — Works in environments without `.git`
- **Opt-in simplicity** — One env var to enable full git integration

### Negative

- **Feature degradation** — Branch/commit info unavailable without `LEX_GIT_MODE=live`
- **Documentation need** — Users must know to set the flag to get git features

---

## References

- `/docs/specs/git-feature-flag-redesign.md` — Full specification
- `/.github/copilot-instructions.md` — Test isolation rules
