# ADR-00X: Consolidate Workspace Layout into `.smartergpt/`

**Status:** Proposed
**Date:** 2025-11-23
**Author:** Lex (with Guff)

---

## 1. Context

Lex currently uses two related but confusing workspace directories:

- `.smartergpt/` — tracked in the Lex repo (legacy / dev-only)
- `.smartergpt.local/` — untracked, described in docs as the local workspace for policy, memory, logs, and prompts

This split causes several problems:

- It violates the common convention that a single dot-directory represents a tool's local state (e.g., `.git/`, `.vscode/`).
- The `.smartergpt.local/` naming is awkward and hard to remember.
- Having a tracked `.smartergpt/` in the repo conflicts with the idea that `.smartergpt/` is a per-workspace, untracked directory for runtime state and configuration.
- It complicates documentation and mental models around where prompts, DBs, policies, and logs live.

At the same time, the project is already moving to a more explicit layout where *canon defaults* live in the package under a dedicated `canon/` tree, and *workspace state* lives in a local directory.

This ADR formalizes a simplified layout:

- **One** workspace root directory: `.smartergpt/`
- **One** source of shipped defaults: `canon/` in the package
- **No** `postinstall` unpacking side effects
- **Explicit** migration of any existing `.smartergpt.local/` directories via a script/command

---

## 2. Decision

We will:

1. **Adopt `.smartergpt/` as the single canonical workspace directory** for Lex.

2. **Remove `.smartergpt.local/` from the design**, replacing it with a migration path that renames any existing `.smartergpt.local/` to `.smartergpt/` when requested.

3. **Move all shipped defaults into `canon/` inside the package**:
   - Canonical prompts: `canon/prompts/**`
   - Canonical policies: `canon/policy/**`
   - Canonical schemas and other templates as needed: `canon/schemas/**`, etc.

4. **Ensure `.smartergpt/` is never shipped or tracked in the published package or the repo**, except as a local workspace (ignored by git).

5. **Provide an explicit workspace migration command**, e.g.:

   ```bash
   npx lex migrate-workspace
   # or
   lex migrate-workspace
   ```

   which:
   - Detects `.smartergpt.local/` in the current project.
   - Renames it to `.smartergpt/` (with safety checks).
   - Optionally refreshes missing defaults from `canon/` (without overwriting user-modified files).

6. **Update `lex init`** to use `.smartergpt/` as the workspace root and to copy defaults from `canon/` into that directory, without any reliance on `.smartergpt.local/`.

7. **Remove any `postinstall` scripts** that were previously used to unpack prompts/configs into local directories. All initialization must be explicit (`lex init`, `lex migrate-workspace`), not a side effect of `npm install`.

---

## 3. New Layout and Resolution Rules

### 3.1 Workspace root (`W`)

Lex will determine a workspace root `W` as follows:

1. If `LEX_ROOT_DIR` env var is set:
   `W = LEX_ROOT_DIR`

2. Else, if a `.smartergpt/` directory exists in the current working directory or a parent directory:
   `W = <that>/.smartergpt`

3. Else, optionally fallback to a global default:
   `W = $HOME/.smartergpt/`

The legacy `.smartergpt.local/` directory is *not* part of normal resolution. It is only handled during explicit migration (`lex migrate-workspace`) or via manual user action.

### 3.2 Default paths under `.smartergpt/`

After migration, the default filesystem layout is:

```text
.smartergpt/
  lex/
    memory.db            # Default episodic memory DB
    lexmap.policy.json   # Default policy map
    backups/             # DB backups (if enabled)
    logs/                # NDJSON logs, etc.
  prompts/               # Workspace prompt templates / overrides
  profile.yml            # Optional profile / workspace-level config
  config/                # Optional future config files
```

Environment variable defaults:

- `LEX_DB_PATH` → `.smartergpt/lex/memory.db`
- `LEX_POLICY_PATH` → `.smartergpt/lex/lexmap.policy.json`
- `SMARTERGPT_PROFILE` → `.smartergpt/profile.yml`

All of these can still be overridden by env vars or explicit configuration flags; `.smartergpt/` is simply the default root.

### 3.3 Prompts resolution

Prompts will be resolved with this precedence:

1. **Explicit override (highest)**
   - `LEX_PROMPTS_DIR` env var
   - Or an explicit `promptsDir` option passed via API

2. **Workspace-local prompts**
   - `.smartergpt/prompts/`

3. **Shipped canon defaults**
   - `<package-root>/canon/prompts/`

There is no longer any use of `.smartergpt.local/prompts/` or a tracked `.smartergpt/` directory in the repo.

---

## 4. Migration Strategy

There is **no need to keep `.smartergpt.local/` as a supported runtime location** after this change. Instead, we will:

### 4.1 CLI migration command

Add a command:

```bash
lex migrate-workspace
```

Behavior:

1. Look for `.smartergpt.local/` in the current directory.
2. If `.smartergpt/` already exists:
   - Refuse to overwrite and print a clear error:
     > Found both .smartergpt.local/ and .smartergpt/. Please resolve this manually before migrating.
3. If only `.smartergpt.local/` exists:
   - Rename `.smartergpt.local/` → `.smartergpt/`.
4. Optionally run a "hydrate defaults" step:
   - Copy any missing files from `canon/` into `.smartergpt/` (without overwriting any existing files).
5. Print a short summary of what changed and where the new workspace root is.

This gives existing users a one-shot migration and removes the need for special-case runtime logic.

### 4.2 `lex init` behavior

Update `lex init` to:

1. Resolve `W` (workspace root) using the new rules.
2. If `.smartergpt.local/` is present and `.smartergpt/` is not, print a hint to run `lex migrate-workspace` first, rather than silently renaming.
3. Create `.smartergpt/` if it does not exist.
4. Copy defaults from `canon/` into `.smartergpt/` without overwriting existing files:
   - `canon/policy/**` → `.smartergpt/lex/`
   - `canon/prompts/**` → `.smartergpt/prompts/`
   - Any other default templates → appropriate locations
5. Optionally add a small marker file like `.smartergpt/.lex-workspace`.

With this, `lex init` is clean, idempotent initialization for new workspaces, while `lex migrate-workspace` is an explicit, opt-in action for older setups.

---

## 5. Repository and Packaging Changes

To implement this ADR:

1. **Remove tracked `.smartergpt/` directory from the Lex repo:**
   - Move any useful content into:
     - `canon/` (defaults),
     - `docs/examples/` (example workspaces),
     - `test/fixtures/` (test inputs), as appropriate.
   - Add `.smartergpt/` to `.gitignore`.

2. **Ensure the npm package only ships canon and dist artifacts:**
   - Include `canon/**` (prompts, policies, schemas, etc.).
   - Exclude `.smartergpt/` entirely.

3. **Remove all `postinstall` scripts from `package.json`:**
   - The package must not perform any side effects (e.g., copying prompts) on `npm install`.

4. **Update docs and examples:**
   - Replace `.smartergpt.local/` with `.smartergpt/` in README and docs.
   - Update environment variable defaults to point at `.smartergpt/`.
   - Update any "Project Structure" examples to show `.smartergpt/` as the local workspace (gitignored).
   - Document the new `lex migrate-workspace` command and its usage.

---

## 6. Consequences

### 6.1 Positive

- **Simpler mental model**
  There is now only one workspace directory: `.smartergpt/`, just like `.git/` or `.vscode/`.

- **Cleaner separation of concerns**
  - Shipped defaults live in `canon/`, inside the package and repo.
  - User/workspace state lives in `.smartergpt/`, untracked and local.

- **No `postinstall` surprises**
  All initialization and migration behavior is explicit (`lex init`, `lex migrate-workspace`), not hidden in `npm install`.

- **Easier documentation and onboarding**
  New users only need to know about `.smartergpt/` and `canon/`, not `.smartergpt.local`.

### 6.2 Negative / Tradeoffs

- **Breaking change for existing workspaces**
  Existing users with `.smartergpt.local/` will need to run `lex migrate-workspace` once or manually rename the directory.

- **Slightly more work up front**
  Implementing the migration command and updating docs introduces a small amount of engineering overhead, but it greatly simplifies the model going forward.

---

## 7. Implementation Checklist

- [x] Remove tracked `.smartergpt/` from the repo; add `.smartergpt/` to `.gitignore`.
- [x] Move any default config/prompt/policy content into `canon/**`.
- [x] Update `package.json` to:
  - [x] Remove `postinstall`.
  - [x] Ensure `canon/**` is included in the `files` list for npm.
- [x] Implement workspace root resolution using `.smartergpt/` and `LEX_ROOT_DIR`.
- [x] Update `LEX_DB_PATH`, `LEX_POLICY_PATH`, and `SMARTERGPT_PROFILE` defaults to `.smartergpt/...`.
- [ ] Implement `lex migrate-workspace` command (deferred to future PR)
- [x] Update `lex init` to use `.smartergpt/` and `canon/**` as described.
- [x] Update README and docs to reference `.smartergpt/` (not `.smartergpt.local/`).
- [x] Add a short "Breaking Changes" note to the changelog for the release that includes this ADR.

**Implementation Status:** ✅ Core implementation complete (commit 19e2517, 7cab54f)
**Remaining:** `lex migrate-workspace` command can be added in a future PR when needed.

