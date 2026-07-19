# Compatibility Environment Reference

This document covers supported environment configuration for the standalone Lex CLI, the
compatibility FrameStore factory, and the packaged MCP launcher.

Environment variables are convenient local process configuration. They are **not** tenant,
workspace, principal, or capability authority. A trusted Lex 3 host supplies repository evidence,
authority, backend connections, and scoped store binders explicitly; it does not grant access by
reconstructing scope from ambient environment variables.

When a command offers an equivalent CLI flag, the explicit flag takes precedence. Use
`lex introspect --json` to confirm the effective workspace, store, policy, and warnings rather than
assuming that an inherited shell environment is harmless.

## Storage and workspace

### `LEX_STORE`

Selects the compatibility Frame backend: `sqlite` (default) or `postgres`.

```bash
export LEX_STORE=sqlite
```

PostgreSQL selection is explicit for normal compatibility runtime operations. `lex init` is more
defensive: `--store sqlite|postgres` wins, and an otherwise unset `LEX_STORE` plus a present
`LEX_DATABASE_URL` chooses PostgreSQL so initialization does not accidentally create SQLite state.

### `LEX_WORKSPACE_ROOT`

Overrides the active repository/workspace root. The normal default is the current or detected
project root. It affects relative database and policy paths, logs, backups, and repository state.

```bash
export LEX_WORKSPACE_ROOT=/absolute/path/to/project
```

### `LEX_DB_PATH` and `LEX_MEMORY_DB`

`LEX_DB_PATH` selects the SQLite file. The default is `.smartergpt/lex/memory.db` relative to the
workspace. Use an absolute path when multiple trusted local launchers should share one store.

`LEX_MEMORY_DB` is a compatibility alias. `LEX_DB_PATH` wins when both are present.

```bash
export LEX_STORE=sqlite
export LEX_DB_PATH=/absolute/path/to/frames.db
```

### `LEX_DATABASE_URL`

Connection URL used by the compatibility PostgreSQL adapter when `LEX_STORE=postgres`.
Introspection redacts its password and query parameters.

This adapter uses dedicated `lex_compat_*` relations and a separate migration ledger. It may
coexist with the Lex 3 scoped/RLS store in one PostgreSQL schema, but it is not a tenant boundary
and never auto-adopts scoped or quarantined legacy Frames.

```bash
export LEX_STORE=postgres
export LEX_DATABASE_URL=postgresql://lex@127.0.0.1:5433/lex
```

### `LEX_POSTGRES_PASSWORD`

Optional PostgreSQL password applied only when `LEX_DATABASE_URL` does not contain one. It is not
included in store metadata or introspection. Prefer a secret-injection mechanism over checked-in
launcher files.

### `LEX_POSTGRES_POOL_MAX`

Maximum compatibility PostgreSQL pool size. Default: `10`.

### `LEX_APP_ROOT`

Compatibility override for the application root used by the configuration and path systems.
Prefer an explicit command project root or `LEX_WORKSPACE_ROOT` in new launchers.

## Repository policy and packaged data

### `LEX_POLICY_PATH`

Overrides the repository policy path. Without it, Lex searches the active workspace in this order:

1. `.smartergpt/lex/lexmap.policy.json`
2. `canon/policy/lexmap.policy.json`
3. `src/policy/policy_spec/lexmap.policy.json.example`

```bash
export LEX_POLICY_PATH=/absolute/path/to/lexmap.policy.json
```

When no readable policy exists, core Frame operations can continue without policy enrichment. Use
`--modules unscoped` for an explicit ontology-free Frame, or `--skip-policy` when intentionally
bypassing validation.

### `LEX_RULES_DIR`

Overrides behavioral-rule discovery. Otherwise Lex checks workspace and packaged rule locations.
Rules are optional and separate from tenant/workspace authority.

### `LEX_SCHEMAS_DIR`

Overrides packaged schema discovery for embedded or development layouts. Ordinary installed users
should not need it.

Prompt scaffolding uses the `lex init --prompts-dir <path>` command option. `LEX_PROMPTS_DIR` is
not a supported runtime variable.

## Git evidence

### `LEX_GIT_MODE`

Set to `off` to disable live Git commands. The default is `live`.

### `LEX_DEFAULT_BRANCH` and `LEX_BRANCH`

`LEX_DEFAULT_BRANCH` overrides detected branch evidence. `LEX_BRANCH` is a legacy alias. Without
an override, disabled or unavailable Git yields `unknown`; it does not silently claim `main`.

### `LEX_DEFAULT_COMMIT` and `LEX_COMMIT`

`LEX_DEFAULT_COMMIT` overrides detected commit evidence. `LEX_COMMIT` is a legacy alias. Without
an override, disabled or unavailable Git yields `unknown`.

These values are discovery evidence for compatibility workflows, not proof of repository identity
in a trusted host.

## CLI output

### `LEX_CLI_OUTPUT_MODE`

Controls shared CLI event rendering:

- `plain` (default): human-readable event text;
- `jsonl`: one versioned `CliEvent` JSON object per line.

```bash
export LEX_CLI_OUTPUT_MODE=jsonl
```

This is distinct from the global `lex --json` flag. Commands such as `recall` and `context` use
`--json` for their command-specific machine-readable result, while `jsonl` controls shared event
emission. See [CLI Output](./CLI_OUTPUT.md).

### `LEX_CLI_PRETTY`

Set to `1` to force ANSI color in shared plain-mode CLI events even when stdout is not a TTY.

### `LEX_VERBOSE`

Set to `1` to enable the diagnostic sink used by shared CLI output. The `--verbose` global flag
sets this behavior for the packaged CLI.

## Logging

### `LEX_LOG_LEVEL`

Pino log level: `silent`, `error`, `warn`, `info`, or `debug`. Library logging defaults to `info`
outside tests, but the packaged CLI forces `silent` unless verbose or debug logging is requested
so machine-readable stdout remains usable.

### `LEX_LOG_PRETTY`

Set to `1` to force human-readable Pino formatting.

### `LEX_LOG_NDJSON`

Set to `1` to explicitly enable NDJSON file logs below `.smartergpt/lex/logs/`. Outside tests,
non-silent library logging may also write the file. Logs rotate at 100 MB and can contain sensitive
repository metadata.

### `LEX_DEBUG`

Set to `1` for diagnostic behavior used by the packaged CLI, MCP server, policy loader, and alias
resolution. Review diagnostics before sharing them because local paths and identifiers may appear.

## SQLite maintenance

### `LEX_DB_KEY`

SQLCipher-compatible SQLite passphrase. It is required by `lex db encrypt` and when opening an
encrypted compatibility store. Keep it out of source control, shell history, Frames, and shared
launcher files.

### `LEX_BACKUP_RETENTION`

Number of rotated database backups to retain. Default: `7`.

## Developer and test controls

These variables are for this repository's test/tooling workflows rather than ordinary consumers:

| Variable | Purpose |
|---|---|
| `LEX_ENABLE_EXTERNAL_SCANNER_TESTS=1` | Run external language-scanner tests |
| `LEX_ENABLE_SLOW_CLI_TESTS=1` | Run opt-in slow CLI tests |
| `LEX_UPDATE_SNAPSHOTS=1` | Update designated test snapshots |

`NODE_ENV` and standard package-manager variables also affect tests and dependency behavior but
are outside the Lex-specific configuration contract.

## Quick reference

| Variable | Compatibility purpose | Default |
|---|---|---|
| `LEX_WORKSPACE_ROOT` | Active workspace root | Detected/current project |
| `LEX_STORE` | `sqlite` or `postgres` | `sqlite` |
| `LEX_DB_PATH` | SQLite database | `.smartergpt/lex/memory.db` |
| `LEX_MEMORY_DB` | Legacy SQLite path alias | — |
| `LEX_DATABASE_URL` | PostgreSQL connection URL | — |
| `LEX_POSTGRES_PASSWORD` | Separate PostgreSQL password | — |
| `LEX_POSTGRES_POOL_MAX` | PostgreSQL pool size | `10` |
| `LEX_POLICY_PATH` | Policy file override | Workspace lookup |
| `LEX_GIT_MODE` | Live or disabled Git evidence | `live` |
| `LEX_DEFAULT_BRANCH` | Branch evidence override | — |
| `LEX_DEFAULT_COMMIT` | Commit evidence override | — |
| `LEX_CLI_OUTPUT_MODE` | Shared event format | `plain` |
| `LEX_CLI_PRETTY` | Force shared-event color | TTY detection |
| `LEX_LOG_LEVEL` | Pino verbosity | Context-dependent |
| `LEX_LOG_PRETTY` | Pretty Pino logs | TTY detection |
| `LEX_LOG_NDJSON` | Explicit file logging | Off in tests |
| `LEX_DEBUG` | Diagnostics | Off |
| `LEX_DB_KEY` | SQLite encryption passphrase | — |
| `LEX_BACKUP_RETENTION` | Backup retention count | `7` |
| `LEX_RULES_DIR` | Rule directory override | Workspace/package lookup |
| `LEX_SCHEMAS_DIR` | Schema directory override | Workspace/package lookup |

## See also

- [Security Policy](../SECURITY.md)
- [Store Contracts](./STORE_CONTRACTS.md)
- [Runtime Scope Contract](./RUNTIME_SCOPE_CONTRACT.md)
- [CLI Output](./CLI_OUTPUT.md)
