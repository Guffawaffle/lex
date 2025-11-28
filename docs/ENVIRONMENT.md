# Lex Environment Variables

This document lists all `LEX_*` environment variables used by Lex, their purpose, and precedence rules.

## Precedence Rules

Lex follows a consistent precedence order for configuration:

1. **CLI flags** (highest priority)
2. **Environment variables** (`LEX_*`)
3. **Workspace config** (`.lex.config.json`)
4. **Sensible defaults** (lowest priority)

---

## Core Path Variables

### `LEX_WORKSPACE_ROOT`

**Purpose:** Override the workspace root directory.

**Default:** Current working directory, or auto-detected from `package.json` location.

**Used by:** Database path resolution, log directory, backup directory, path normalization.

```bash
export LEX_WORKSPACE_ROOT=/path/to/my/project
```

---

### `LEX_DB_PATH`

**Purpose:** Override the database file location.

**Default:** `.smartergpt/lex/memory.db` relative to workspace root.

**Used by:** Frame storage, all memory operations.

```bash
export LEX_DB_PATH=/custom/path/frames.db
```

---

### `LEX_POLICY_PATH`

**Purpose:** Override the policy file location.

**Default:** Searched in this order:
1. `.smartergpt/lex/lexmap.policy.json`
2. `src/policy/policy_spec/lexmap.policy.json.example`

**Behavior when policy file not found:**
- CLI commands that use policy (e.g., `lex remember`) will emit a warning but continue execution
- Module validation will be skipped, allowing any module ID
- To explicitly skip policy validation even when a file exists, use the `--skip-policy` flag

**Used by:** Policy loading, module ID validation, Atlas Frame generation.

```bash
export LEX_POLICY_PATH=/custom/path/my-policy.json
```

**Note:** You can also use the `--skip-policy` flag with `lex remember` to bypass policy validation:

```bash
lex remember --skip-policy --modules "any-module-id" --reference-point "test" --summary "test" --next "test"
```

---

### `LEX_APP_ROOT`

**Purpose:** Override the application root directory (used by config system).

**Default:** Auto-detected from `package.json` location.

**Used by:** Config loading, path resolution.

```bash
export LEX_APP_ROOT=/path/to/app
```

---

## Git Integration Variables

### `LEX_GIT_MODE`

**Purpose:** Control git integration behavior.

**Values:**
- `live` (default): Execute real git commands
- `off`: Disable git integration, use fallback values

**Used by:** Branch detection, commit detection, tests that need to avoid git.

```bash
export LEX_GIT_MODE=off  # Useful for CI or testing
```

---

### `LEX_DEFAULT_BRANCH`

**Purpose:** Fallback branch name when git is unavailable or `LEX_GIT_MODE=off`.

**Default:** `main`

**Aliases:** `LEX_BRANCH` (legacy, deprecated)

```bash
export LEX_DEFAULT_BRANCH=develop
```

---

### `LEX_DEFAULT_COMMIT`

**Purpose:** Fallback commit SHA when git is unavailable or `LEX_GIT_MODE=off`.

**Default:** `0000000000000000000000000000000000000000`

**Aliases:** `LEX_COMMIT` (legacy, deprecated)

```bash
export LEX_DEFAULT_COMMIT=abc123
```

---

## CLI Output Variables

### `LEX_CLI_OUTPUT_MODE`

**Purpose:** Control CLI output format.

**Values:**
- `text` (default): Human-readable text output
- `json`: Machine-readable JSON output (JSONL format)

**Used by:** All CLI commands.

```bash
export LEX_CLI_OUTPUT_MODE=json  # Force JSON output
```

---

### `LEX_CLI_PRETTY`

**Purpose:** Force pretty (colored) output even when not in a TTY.

**Values:**
- `1`: Enable colors
- (unset): Auto-detect from TTY

**Used by:** CLI output formatting.

```bash
export LEX_CLI_PRETTY=1
```

---

## Logging Variables

### `LEX_LOG_LEVEL`

**Purpose:** Control log verbosity.

**Values:** `silent`, `error`, `warn`, `info`, `debug`

**Default:** `silent` in test mode, `info` otherwise.

```bash
export LEX_LOG_LEVEL=debug
```

---

### `LEX_LOG_PRETTY`

**Purpose:** Force pretty (human-readable) log formatting.

**Values:**
- `1`: Enable pretty logging
- (unset): Auto-detect from TTY

```bash
export LEX_LOG_PRETTY=1
```

---

### `LEX_LOG_NDJSON`

**Purpose:** Enable NDJSON file logging.

**Values:**
- `1`: Enable NDJSON logging to `.smartergpt/lex/logs/lex.log.ndjson`
- (unset): Disable in test mode, auto-detect otherwise

**Log location:** `.smartergpt/lex/logs/lex.log.ndjson`

**Log rotation:** Automatic at 100MB.

```bash
export LEX_LOG_NDJSON=1
```

---

### `LEX_DEBUG`

**Purpose:** Enable debug output for troubleshooting.

**Values:**
- `1`: Enable debug messages
- (unset): Disabled

**Used by:** Alias resolution, MCP server, policy loading.

```bash
export LEX_DEBUG=1
```

---

## Prompts and Rules Variables

### `LEX_PROMPTS_DIR`

**Purpose:** Override the prompts directory.

**Default:** Searched in this order:
1. `LEX_PROMPTS_DIR` (this variable)
2. `.smartergpt/prompts/`
3. `prompts/` (legacy)
4. Package `canon/prompts/` (built-in fallback)

```bash
export LEX_PROMPTS_DIR=/custom/prompts
```

---

### `LEX_RULES_DIR`

**Purpose:** Override the behavioral rules directory.

**Default:** Searched in this order:
1. `LEX_RULES_DIR` (this variable)
2. `.smartergpt/rules/`
3. `canon/rules/` (package defaults)

**Note:** Rules are experimental and not part of the Lex 1.0.0 contract.

```bash
export LEX_RULES_DIR=/custom/rules
```

---

## Database Variables

### `LEX_DB_KEY`

**Purpose:** Passphrase for database encryption.

**Default:** None (database is unencrypted).

**Security:** This enables SQLite encryption via `better-sqlite3-multiple-ciphers`.

**Note:** Database encryption is experimental and not part of the Lex 1.0.0 contract.

```bash
export LEX_DB_KEY=my-secret-passphrase
```

---

### `LEX_BACKUP_RETENTION`

**Purpose:** Number of database backups to retain.

**Default:** `7`

**Used by:** `lex db backup --rotate`

```bash
export LEX_BACKUP_RETENTION=14
```

---

## Testing Variables

### `LEX_ENABLE_EXTERNAL_SCANNER_TESTS`

**Purpose:** Enable tests for external language scanners.

**Values:**
- `1`: Enable external scanner tests
- (unset): Skip external scanner tests

**Note:** Scanners are experimental and not part of the Lex 1.0.0 contract.

```bash
export LEX_ENABLE_EXTERNAL_SCANNER_TESTS=1
```

---

## Quick Reference

| Variable | Purpose | Default | Contract Status |
|----------|---------|---------|-----------------|
| `LEX_WORKSPACE_ROOT` | Workspace root | Auto-detect | 1.0.0 |
| `LEX_DB_PATH` | Database path | `.smartergpt/lex/memory.db` | 1.0.0 |
| `LEX_POLICY_PATH` | Policy file path | `.smartergpt/lex/lexmap.policy.json` | 1.0.0 |
| `LEX_APP_ROOT` | App root | Auto-detect | 1.0.0 |
| `LEX_GIT_MODE` | Git integration | `live` | 1.0.0 |
| `LEX_DEFAULT_BRANCH` | Fallback branch | `main` | 1.0.0 |
| `LEX_DEFAULT_COMMIT` | Fallback commit | `0000...` | 1.0.0 |
| `LEX_CLI_OUTPUT_MODE` | Output format | `text` | 1.0.0 |
| `LEX_CLI_PRETTY` | Force colors | Auto-detect | 1.0.0 |
| `LEX_LOG_LEVEL` | Log verbosity | `info` | Internal |
| `LEX_LOG_PRETTY` | Pretty logs | Auto-detect | Internal |
| `LEX_LOG_NDJSON` | File logging | Auto | Internal |
| `LEX_DEBUG` | Debug output | Disabled | Internal |
| `LEX_PROMPTS_DIR` | Prompts path | Precedence chain | Internal |
| `LEX_RULES_DIR` | Rules path | Precedence chain | Experimental |
| `LEX_DB_KEY` | Encryption key | None | Experimental |
| `LEX_BACKUP_RETENTION` | Backup count | `7` | 1.0.0 |
| `LEX_ENABLE_EXTERNAL_SCANNER_TESTS` | Scanner tests | Disabled | Experimental |

---

## See Also

- [CLI Output Documentation](./CLI_OUTPUT.md)
- [API Usage Guide](./API_USAGE.md)
- [Architecture Overview](./ARCHITECTURE.md)
