# Lex Ecosystem Naming Conventions

> **Status:** Canonical specification
> **Scope:** Lex, LexSona, LexRunner
> **Last Updated:** 2025-12-16

This document defines the naming conventions for all tools, commands, and identifiers across the Lex ecosystem. It is the single source of truth.

---

## MCP Tool Names

### Key Insight: VS Code Prefix Behavior

**VS Code automatically adds `mcp_{servername}_` prefix to ALL tool names.**

This means tool names in source code should **NOT include a namespace prefix**. The prefix is added by VS Code at display time.

### Pattern (in source code)

```
{action}              # Simple action
{category}_{action}   # Categorized action (when disambiguation needed)
```

| Component | Description | Constraints |
|-----------|-------------|-------------|
| `category` | Domain/subsystem | Optional. Use when disambiguation needed |
| `action` | Verb describing operation | Required. Lowercase snake_case |

### How It Works

| Source Name | Server | VS Code Display |
|-------------|--------|-----------------|
| `remember` | `lex` | `mcp_lex_remember` |
| `start_run` | `lexrunner` | `mcp_lexrunner_start_run` |
| `persona_activate` | `lexsona` | `mcp_lexsona_persona_activate` |

### Reference: GitHub MCP Pattern

GitHub's MCP server defines tools like `create_pull_request` (not `github_create_pull_request`).
VS Code displays these as `mcp_github_create_pull_request`.

**We follow this same pattern.**

### Rules

1. **No namespace prefix** — VS Code adds `mcp_{server}_` automatically
2. **All lowercase** — no camelCase, no PascalCase
3. **Underscore only** — no hyphens, no dots (snake_case)
4. **No abbreviations** — prefer `discover` over `disc`
5. **Action-oriented** — name should describe what the tool does

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
| `run` | Run lifecycle management | `start_run`, `get_status` |
| `gate` | CI/gate execution | `gates_run` |
| `plan` | Plan creation/validation | `plan_create` |
| `persona` | Persona management | `persona_activate` |
| `rules` | Behavioral rules | `rules_learn` |
| `constraints` | Constraint derivation | `constraints_derive` |

New categories require justification and should be added sparingly.

### Examples

**Lex (displayed as `mcp_lex_{name}`):**
```
remember           → mcp_lex_remember
recall             → mcp_lex_recall
list_frames        → mcp_lex_list_frames
timeline           → mcp_lex_timeline
policy_check       → mcp_lex_policy_check
code_atlas         → mcp_lex_code_atlas
```

**LexRunner (displayed as `mcp_lexrunner_{name}`):**
```
discover           → mcp_lexrunner_discover
doctor             → mcp_lexrunner_doctor
local_init         → mcp_lexrunner_local_init
start_run          → mcp_lexrunner_start_run
list_artifacts     → mcp_lexrunner_list_artifacts
get_status         → mcp_lexrunner_get_status
gates_run          → mcp_lexrunner_gates_run
plan_create        → mcp_lexrunner_plan_create
```

**LexSona (displayed as `mcp_lexsona_{name}`):**
```
persona_activate   → mcp_lexsona_persona_activate
persona_list       → mcp_lexsona_persona_list
rules_learn        → mcp_lexsona_rules_learn
constraints_derive → mcp_lexsona_constraints_derive
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
