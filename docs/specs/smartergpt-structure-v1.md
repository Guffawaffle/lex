# .smartergpt Structure Specification v1

**Status:** Accepted
**Version:** 1.1.0
**Last Updated:** 2025-11-23

## Overview

The `.smartergpt/` structure provides a standardized, portable workspace for Lex and lexrunner tooling. This specification defines the directory layout, precedence chains, and environment variable expansion rules.

**Key Change (v1.1.0):** Consolidated from `.smartergpt.local/` to `.smartergpt/` as the single canonical workspace directory (organization-level).

## Directory Structure

### Organization Workspace (`.smartergpt/`)
User workspace for local development, overrides, and runtime state:

```
.smartergpt/
├── prompts/          # Shared prompt overlays (organization-level)
│   └── custom-prompt.md
├── schemas/          # Optional shared schemas
│   └── custom.schema.json
├── rules/            # Optional shared rules
│   └── custom-rule.js
├── lex/              # Lex-specific working files
│   ├── lexmap.policy.json  # Module dependency policy
│   ├── memory.db           # Episodic memory database
│   ├── logs/               # NDJSON logs
│   ├── backups/            # Database backups
│   └── frames.export/      # Exported frames
└── runner/           # lexrunner artifacts (if using lexrunner)
    ├── plan.json
    ├── cache/
    └── deliverables/
```

**Purpose:** Local development, working state, user customizations, tool-specific files
**Git:** Ignored (`.gitignore`)
**Scope:** Organization-level (shared between lex and lexrunner in same workspace)
**Precedence:** High (overrides package defaults)

### Package Defaults (`canon/`, `prompts/`, `schemas/`, `rules/`)
Package-shipped resources:

```
canon/                # Source of truth (development only)
├── prompts/          # Prompt template sources
├── schemas/          # Schema sources
└── rules/            # Rule sources

prompts/              # Built artifacts (shipped with package)
schemas/              # Built artifacts (shipped with package)
rules/                # Built artifacts (shipped with package)
```

**Purpose:** Package defaults and templates
**Git:** `canon/` tracked; `prompts/`, `schemas/`, `rules/` gitignored (build artifacts)
**Precedence:** Lowest (fallback when no workspace override exists)

## Precedence Chains

### Prompts
```
1. LEX_PROMPTS_DIR (if set)           # Explicit environment override
2. .smartergpt/prompts/               # Shared overlay (organization-level)
3. prompts/                           # Package default (shipped)
4. canon/prompts/                     # Development source (fallback)
```

### Schemas
```
1. LEX_SCHEMAS_DIR (if set)           # Explicit environment override
2. .smartergpt/schemas/               # Shared overlay (organization-level)
3. schemas/                           # Package default (shipped)
4. canon/schemas/                     # Development source (fallback)
```

### Rules
```
1. LEX_RULES_DIR (if set)             # Explicit environment override
2. .smartergpt/rules/                 # Shared overlay (organization-level)
3. rules/                             # Package default (shipped)
4. canon/rules/                       # Development source (fallback)
```

### Policy
```
1. LEX_POLICY_PATH (if set)           # Explicit environment override
2. .smartergpt/lex/lexmap.policy.json # Workspace policy (default)
3. examples/lexmap.policy.json        # Example fallback
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `LEX_PROMPTS_DIR` | Override prompts directory | `/path/to/custom/prompts` |
| `LEX_SCHEMAS_DIR` | Override schemas directory | `/path/to/custom/schemas` |
| `LEX_RULES_DIR` | Override rules directory | `/path/to/custom/rules` |
| `LEX_POLICY_PATH` | Override policy file | `.smartergpt/lex/lexmap.policy.json` |
| `LEX_DB_PATH` | Override database location | `.smartergpt/lex/memory.db` |

## Token Expansion

Configuration files support token expansion:

| Token | Expands To | Example |
|-------|------------|---------|
| `$HOME` | User home directory | `/home/user` |
| `$PWD` | Current working directory | `/srv/lex-mcp/lex` |
| `${VAR}` | Environment variable | `${LEX_PROMPTS_DIR}/custom.md` |

**Example usage:**
```bash
# Use custom prompts directory
export LEX_PROMPTS_DIR=/custom/prompts
lex remember ...

# Use custom database path
export LEX_DB_PATH=/custom/memory.db
lex remember ...
```

## Platform-Specific Considerations

### Windows
- Use forward slashes in paths: `.smartergpt/lex/memory.db`
- Environment variables: `%USERPROFILE%` becomes `$HOME`

### WSL
- Windows paths must be converted: `/mnt/c/Users/...`
- Use WSL-native paths in configuration

### macOS/Linux
- Standard POSIX paths work without conversion

## Migration Guide

### From `.smartergpt.local/` (Legacy)

**Before (v1.0.0):**
```
.smartergpt.local/
├── profile.yml
├── lex/
│   ├── lexmap.policy.json
│   └── memory.db
├── runner/
│   └── plan.json
└── prompts/
    └── custom.md
```

**After (v1.1.0):**
```
.smartergpt/
├── prompts/          # Shared prompts (organization-level)
│   └── custom.md
├── lex/              # Lex-specific files
│   ├── lexmap.policy.json
│   ├── memory.db
│   ├── logs/
│   ├── backups/
│   └── frames.export/
└── runner/           # lexrunner artifacts
    └── plan.json
```

**Migration Steps:**
1. Run `lex migrate-workspace` (when available) OR manually rename
2. `mv .smartergpt.local .smartergpt`
3. Verify `.gitignore` includes `.smartergpt/`
4. Update any hardcoded paths in scripts/configs

### From Legacy Structure (Pre-v1.0.0)

**Before:**
```
.smartergpt/          # Tracked in repo (old design)
├── runner/
│   ├── intent.md
│   └── plan.json
└── lex-brain.db
```

**After:**
```
.smartergpt/          # Gitignored (new design)
├── lex/
│   ├── lexmap.policy.json
│   └── memory.db
└── runner/
    └── plan.json
```

**Migration Steps:**
1. Run `npx lex init` to create new structure
2. Copy `lex-brain.db` → `.smartergpt/lex/memory.db`
3. Move runner artifacts to `.smartergpt/runner/`
4. Update `.gitignore` to exclude `.smartergpt/`

## Usage Examples

### Initialize Workspace
```bash
npx lex init
# Creates .smartergpt/ with:
#   .smartergpt/prompts/ - Shared prompts
#   .smartergpt/lex/ - Lex-specific files
```

### Create Local Prompt Override
```bash
cp prompts/remember.md .smartergpt/prompts/
vim .smartergpt/prompts/remember.md
```

### Use Custom Policy Path
```bash
export LEX_POLICY_PATH=.smartergpt/lex/lexmap.policy.json
lex check merged-facts.json
```

## Schema Validation

Configuration files MAY include a `$schema` reference for IDE support:

```json
{
  "$schema": "../schemas/policy.schema.json",
  "modules": {
    ...
  }
}
```

This enables:
- IDE autocomplete
- Real-time validation
- Documentation tooltips

## References

- **ADR:** [ADR-00X: Consolidate Workspace Layout into `.smartergpt/`](../../.github/ADR-00X-smartergpt-workspace-rename.md)
- **Implementation:** [Issue #183](https://github.com/Guffawaffle/lex/issues/183)
- **Init Command:** [Issue #230](https://github.com/Guffawaffle/lex/issues/230)
