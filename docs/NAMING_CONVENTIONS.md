# Lex Ecosystem Naming Conventions

> **Status:** Canonical specification
> **Scope:** Lex, LexSona, LexRunner
> **Last Updated:** 2025-12-16

This document defines the naming conventions for all tools, commands, and identifiers across the Lex ecosystem. It is the single source of truth.

---

## MCP Tool Names

### Pattern (in source code)

```
{namespace}_{category}_{action}
```

VS Code's MCP client automatically adds the `mcp_{servername}_` prefix when exposing tools.
So a tool named `lex_remember` in code appears as `mcp_lex_lex_remember` in VS Code.

**Important:** To avoid duplication, tool names in code should use just `{namespace}_{action}` without the `mcp_` prefix.

| Component | Description | Constraints |
|-----------|-------------|-------------|
| `namespace` | Tool owner | Required. One of: `lex`, `lexsona`, `lexrunner` |
| `category` | Domain/subsystem | Optional. Use when disambiguation needed |
| `action` | Verb describing operation | Required. Lowercase, no separators |

### Rules

1. **All lowercase** — no camelCase, no PascalCase
2. **Underscore only** — no hyphens, no dots
3. **No abbreviations** — prefer `discover` over `disc`
4. **Verb last** — `gate_run` not `run_gate`

### Rationale

- Underscore is a **valid identifier** in Python, TypeScript, JavaScript
- Hyphen is **not** a valid identifier (interpreted as subtraction)
- Dot notation **conflicts** with object property access
- Consistent pattern enables **AI agent prediction** and tool discovery
- Matches **GitHub MCP** convention (`mcp_github_create_issue`)

### Categories

Keep the category set **small and stable**:

| Category | Domain | Examples |
|----------|--------|----------|
| `core` | Cross-cutting / no clear domain | `mcp_lexrunner_core_health` |
| `weave` | Merge-weave orchestration | `mcp_lexrunner_weave_discover` |
| `gate` | CI/gate execution | `mcp_lexrunner_gate_run` |
| `plan` | Plan creation/validation | `mcp_lexrunner_plan_create` |
| `workspace` | Local workspace management | `mcp_lexrunner_workspace_init` |
| `run` | Run lifecycle management | `mcp_lexrunner_run_start` |
| `persona` | Persona management | `mcp_lexsona_persona_activate` |
| `rules` | Behavioral rules | `mcp_lexsona_rules_learn` |
| `constraints` | Constraint derivation | `mcp_lexsona_constraints_derive` |
| `memory` | Frame/memory operations | `mcp_lex_memory_recall` |
| `policy` | Policy validation | `mcp_lex_policy_check` |

New categories require justification and should be added sparingly.

### Examples

**LexRunner:**
```
lexrunner_weave_discover
lexrunner_weave_plan
lexrunner_weave_status
lexrunner_gate_run
lexrunner_plan_create
lexrunner_plan_validate
lexrunner_workspace_init
lexrunner_workspace_doctor
lexrunner_run_start
lexrunner_run_status
lexrunner_core_health
```

**LexSona:**
```
lexsona_persona_activate
lexsona_persona_list
lexsona_persona_show
lexsona_rules_learn
lexsona_rules_list
lexsona_constraints_derive
```

**Lex:**
```
lex_remember
lex_recall
lex_list_frames
lex_timeline
lex_policy_check
lex_code_atlas
```

---

## CLI Commands

### Pattern

```
{cli} {category} {action} [--flags]
```

Or for top-level commands:

```
{cli} {action} [--flags]
```

| Component | Description | Constraints |
|-----------|-------------|-------------|
| `cli` | CLI entry point | `lex`, `lexsona`, `lex-pr` |
| `category` | Noun/domain | Optional for top-level commands |
| `action` | Verb | Required |
| `flags` | Options | Hyphen-prefixed: `--json`, `--verbose` |

### Rules

1. **Hyphen-case** for multi-word commands and flags: `add-module`, `--dry-run`
2. **Space** separates category from action: `lex db vacuum`
3. **Lowercase** throughout
4. **Noun-verb** order for subcommands: `policy check`, `persona activate`

### Rationale

- Hyphen-case is the **Unix convention** for CLI commands
- CLI commands are typed by **humans**, not parsed as identifiers
- Consistent with `git`, `npm`, `docker`, and other standard tools

### Examples

**Lex:**
```bash
lex recall "topic"
lex remember
lex check
lex init
lex db vacuum
lex db backup
lex policy check
lex policy add-module
lex instructions generate
lex code-atlas
```

**LexSona:**
```bash
lexsona persona list
lexsona persona activate quality-first_engineering
lexsona rules learn "Always run tests"
lexsona constraints derive --project lex
```

**LexRunner:**
```bash
lex-pr weave discover
lex-pr weave plan
lex-pr weave status
lex-pr gate run
lex-pr workspace init
lex-pr workspace doctor
```

---

## Persona IDs

### Pattern

```
{behavioral-focus}_{domain}
```

| Component | Description | Separator |
|-----------|-------------|-----------|
| `behavioral-focus` | How the persona approaches decisions | Hyphen within |
| `domain` | Area of expertise | Underscore between |

### Examples

```
quality-first_engineering
momentum-first_product
risk-reducer_operations
```

### Rationale

This mixed scheme is **intentional** (documented in LexSona AGENTS.md):
- Hyphen groups the behavioral modifier: `quality-first`
- Underscore separates behavior from domain
- Reads naturally: "quality-first engineering"

---

## File Names

### Rules

1. **Hyphen-case** for multi-word: `command-map.ts`, `naming-conventions.md`
2. **Lowercase** except for conventional files: `README.md`, `CHANGELOG.md`
3. **No spaces** — use hyphens

### Examples

```
src/cli/command-map.ts
docs/NAMING_CONVENTIONS.md
.github/copilot-instructions.md
```

---

## TypeScript/JavaScript Identifiers

### Rules

1. **camelCase** for variables and functions: `runGate()`, `planCreate()`
2. **PascalCase** for classes and types: `GateResult`, `PlanNode`
3. **SCREAMING_SNAKE_CASE** for constants: `MAX_RETRIES`, `DEFAULT_TIMEOUT`

### Examples

```typescript
// Functions
function runGate(config: GateConfig): Promise<GateResult> { ... }

// Classes
class MergeWeaveRunner { ... }

// Constants
const MAX_WORKERS = 4;
```

---

## Summary Table

| Context | Convention | Example |
|---------|------------|---------|
| MCP tool names | `mcp_{ns}_{cat}_{action}` | `mcp_lexrunner_weave_discover` |
| CLI commands | `{cli} {cat} {action}` | `lex-pr weave discover` |
| CLI multi-word | hyphen-case | `add-module`, `--dry-run` |
| Persona IDs | `{behavior}_{domain}` | `quality-first_engineering` |
| File names | hyphen-case | `command-map.ts` |
| TS functions | camelCase | `runGate()` |
| TS classes | PascalCase | `GateResult` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |

---

## Migration

When renaming existing tools/commands:

1. **Register both names** during transition (old as deprecated alias)
2. **Log deprecation warning** when old name is used
3. **Document in CHANGELOG** with migration guidance
4. **Remove old names** in next major version

---

## References

- LexSona: [AGENTS.md](https://github.com/Guffawaffle/lexsona/blob/main/AGENTS.md) — Persona naming rationale
- LexRunner: [CLI_VERBS.md](https://github.com/Guffawaffle/lexrunner/blob/main/docs/CLI_VERBS.md) — Category-action contract
- MCP Spec: [modelcontextprotocol.io](https://modelcontextprotocol.io/specification/server/tools/) — Tool naming guidance
