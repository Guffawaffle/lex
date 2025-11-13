# .smartergpt Structure Specification v1

**Status:** Accepted  
**Version:** 1.0.0  
**Last Updated:** 2025-11-13

## Overview

The `.smartergpt.local/` structure provides a standardized, portable workspace for Lex and lex-pr-runner tooling. This specification defines the directory layout, precedence chains, and environment variable expansion rules.

## Directory Structure

### Tracked (`.smartergpt/`)
Repository-tracked canonical resources:

```
.smartergpt/
├── schemas/          # JSON Schemas for configuration files
│   ├── profile.schema.json
│   ├── policy.schema.json
│   └── ...
└── prompts/          # Canonical prompt templates (tracked)
    ├── remember.md
    ├── recall.md
    └── ...
```

**Purpose:** Version-controlled defaults and schemas  
**Git:** Tracked  
**Precedence:** Lowest (fallback when no local override exists)

### Local (`.smartergpt.local/`)
User workspace for local development and overrides:

```
.smartergpt.local/
├── profile.yml       # Workspace profile metadata
├── lex/              # Lex-specific working files
│   ├── lexmap.policy.json  # Module dependency policy
│   └── memory.db           # Episodic memory database
├── runner/           # lex-pr-runner artifacts
│   ├── plan.json
│   ├── cache/
│   └── deliverables/
└── prompts/          # Local prompt overlays
    └── custom-prompt.md
```

**Purpose:** Local development, working state, user customizations  
**Git:** Ignored (`.gitignore`)  
**Precedence:** Highest (overrides canonical)

## Precedence Chains

### Prompts
```
1. LEX_CANON_DIR/prompts/        (if LEX_CANON_DIR set)
2. .smartergpt.local/prompts/    (local overlays)
3. prompts/                      (package canonical)
```

### Schemas
```
1. .smartergpt/schemas/          (repo tracked)
2. node_modules/@guffawaffle/lex/schemas/  (package)
```

### Configuration
```
1. .smartergpt.local/profile.yml (local)
2. .smartergpt/profile.yml       (repo default, if exists)
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `LEX_CANON_DIR` | Override canonical resource root | `/path/to/custom/canon` |
| `SMARTERGPT_PROFILE` | Specify profile path | `.smartergpt.local/profile.yml` |
| `LEX_DB_PATH` | Override database location | `.smartergpt.local/lex/memory.db` |

## Token Expansion

Configuration files support token expansion:

| Token | Expands To | Example |
|-------|------------|---------|
| `$HOME` | User home directory | `/home/user` |
| `$PWD` | Current working directory | `/srv/lex-mcp/lex` |
| `${VAR}` | Environment variable | `${LEX_CANON_DIR}/prompts` |

**Example `profile.yml`:**
```yaml
role: local
name: Local Dev
paths:
  canon: ${LEX_CANON_DIR:-$PWD/.smartergpt}
  database: .smartergpt.local/lex/memory.db
```

## Platform-Specific Considerations

### Windows
- Use forward slashes in YAML: `path: .smartergpt.local/lex/memory.db`
- Environment variables: `%USERPROFILE%` becomes `$HOME`

### WSL
- Windows paths must be converted: `/mnt/c/Users/...`
- Use WSL-native paths in configuration

### macOS/Linux
- Standard POSIX paths work without conversion

## Migration Guide

### From Legacy Structure

**Before:**
```
.smartergpt/
├── runner/
│   ├── intent.md
│   ├── plan.json
│   └── cache/
└── lex-brain.db
```

**After:**
```
.smartergpt.local/
├── profile.yml
├── lex/
│   ├── lexmap.policy.json
│   └── memory.db
└── runner/
    ├── plan.json
    └── cache/
```

**Migration Steps:**
1. Run `npx lex init` to create new structure
2. Copy `lex-brain.db` → `.smartergpt.local/lex/memory.db`
3. Move runner artifacts to `.smartergpt.local/runner/`
4. Update `.gitignore` to exclude `.smartergpt.local/`

## Usage Examples

### Initialize Workspace
```bash
npx lex init
```

### Create Local Prompt Override
```bash
cp prompts/remember.md .smartergpt.local/prompts/
vim .smartergpt.local/prompts/remember.md
```

### Validate Configuration
```bash
npx lex validate-profile .smartergpt.local/profile.yml
```

## Schema Validation

All configuration files SHOULD include a `$schema` reference:

```yaml
# .smartergpt.local/profile.yml
$schema: ../.smartergpt/schemas/profile.schema.json
role: local
```

This enables:
- IDE autocomplete
- Real-time validation
- Documentation tooltips

## References

- **Implementation:** [Issue #183](https://github.com/Guffawaffle/lex/issues/183)
- **Init Command:** [Issue #230](https://github.com/Guffawaffle/lex/issues/230)
- **Related:** `DIRECTORY_ALIGNMENT.md`
