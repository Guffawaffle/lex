# ADR-0003: Consolidate Workspace Layout into `.smartergpt/`

**Status:** Accepted
**Date:** 2025-11-23
**Authors:** Lex, Guff

---

## Context

Lex originally used two related but confusing workspace directories:

- `.smartergpt/` — tracked in the Lex repo (legacy / dev-only)
- `.smartergpt.local/` — untracked, described in docs as the local workspace for policy, memory, logs, and prompts

This split caused several problems:

- It violated the common convention that a single dot-directory represents a tool's local state (e.g., `.git/`, `.vscode/`).
- The `.smartergpt.local/` naming was awkward and hard to remember.
- Having a tracked `.smartergpt/` in the repo conflicted with the idea that `.smartergpt/` is a per-workspace, untracked directory for runtime state and configuration.
- It complicated documentation and mental models around where prompts, DBs, policies, and logs live.

---

## Decision

We will:

1. **Adopt `.smartergpt/` as the single canonical workspace directory** for Lex.

2. **Remove `.smartergpt.local/` from the design**, replacing it with a migration path.

3. **Move all shipped defaults into `canon/` inside the package**:
   - Canonical prompts: `canon/prompts/**`
   - Canonical policies: `canon/policy/**`
   - Canonical schemas: `canon/schemas/**`

4. **Ensure `.smartergpt/` is never shipped or tracked in the published package**, except as a local workspace (ignored by git).

5. **Remove any `postinstall` scripts** that were previously used to unpack prompts/configs into local directories. All initialization must be explicit (`lex init`), not a side effect of `npm install`.

---

## Workspace Layout

### Resolution Rules

Lex determines workspace root `W` as follows:

1. If `LEX_ROOT_DIR` env var is set: `W = LEX_ROOT_DIR`
2. Else, if a `.smartergpt/` directory exists in cwd or parent: `W = <that>/.smartergpt`
3. Else, fallback to global: `W = $HOME/.smartergpt/`

### Directory Structure

```text
.smartergpt/
  lex/
    memory.db            # Default episodic memory DB
    lexmap.policy.json   # Default policy map
    backups/             # DB backups (if enabled)
    logs/                # NDJSON logs
  prompts/               # Workspace prompt templates / overrides
  profile.yml            # Optional workspace-level config
```

### Precedence Chains

Prompts are resolved in this order:
1. `LEX_PROMPTS_DIR` env var (explicit override)
2. `.smartergpt/prompts/` (workspace-local)
3. `prompts/` (package default, shipped)
4. `canon/prompts/` (development source, fallback)

Same pattern applies to schemas, rules, and policies.

---

## Consequences

### Positive

- **Simpler mental model** — One workspace directory: `.smartergpt/`, like `.git/` or `.vscode/`.
- **Cleaner separation** — Shipped defaults in `canon/`; user state in `.smartergpt/`.
- **No `postinstall` surprises** — All initialization is explicit.
- **Easier documentation** — New users learn one directory, not two.

### Negative

- **Breaking change for existing workspaces** — Users with `.smartergpt.local/` need to migrate once.
- **Migration command deferred** — `lex migrate-workspace` can be added in future PR when needed.

---

## Implementation Status

- ✅ Removed tracked `.smartergpt/` from repo; added to `.gitignore`
- ✅ Moved default content into `canon/**`
- ✅ Removed `postinstall` from `package.json`
- ✅ Updated workspace root resolution
- ✅ Updated `lex init` to use `.smartergpt/` and `canon/**`
- ✅ Updated README and docs
- ⏳ `lex migrate-workspace` command deferred to future PR

**Commits:** 19e2517, 7cab54f
