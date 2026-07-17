<div align="center">

# Lex

**Local memory and policy context for AI coding agents.**

**Don't trust the README. Ask your agent.**

</div>

> "Would repo-local memory and policy context help you work in this codebase with fewer repeated explanations, fewer forgotten constraints, and better handoffs between sessions?"

If the answer is yes, Lex is the layer that gives your agent somewhere durable to put that context.

[![MIT License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@smartergpt/lex)](https://www.npmjs.com/package/@smartergpt/lex)
[![CI Status](https://img.shields.io/badge/CI-passing-success)](https://github.com/Guffawaffle/lex/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6)](https://www.typescriptlang.org/)

[60-second test](#the-60-second-test) | [Quick Start](#quick-start) | [Agent Integration](#agent-integration) | [Documentation](#documentation) | [API Reference](#api-reference) | [Contributing](./CONTRIBUTING.md)

---

## What Lex gives your agent

Lex is repo-local memory and policy context for AI coding agents. It stores structured work snapshots, recalls relevant prior context, and connects that context to repository policy when a policy file is available.

Agents get:

- Durable Frames for reference points, summaries, blockers, next actions, branches, tickets, and module scope
- Policy-aware recall that can surface nearby module context instead of asking the human to restate it
- Structured CLI and MCP responses that are easier for tools to parse
- Stable tool names and explicit error codes for recovery
- Local-first context stored in SQLite by default, with explicit self-managed PostgreSQL opt-in
- CLI, MCP, and TypeScript API surfaces for different agent runtimes

Humans do not need to understand the whole framework before adoption. The first useful question is simply whether your agent keeps asking you to repeat context the repository could remember.

---

## The 60-second test

Paste this into Copilot, Claude, Cursor, or another coding agent while it has access to your repository:

```text
Look at this repository. Would a repo-local memory and policy layer help you avoid repeated context setup, forgotten project constraints, or poor handoffs? If yes, where would Lex help first?
```

A useful answer usually names a recurring handoff problem: interrupted feature work, architecture-sensitive modules, policy constraints, release workflows, or places where agents repeatedly need the same explanation.

---

## How it works

### Frames: work memory

Frames capture meaningful moments in a development workflow:

```bash
lex remember \
  --reference-point "Implementing user authentication" \
  --summary "Added JWT validation to API middleware" \
  --next "Wire up password reset flow" \
  --modules "services/auth,api/middleware" \
  --blockers "Need PermissionService access - forbidden edge in policy" \
  --jira "AUTH-123"
```

Frames are meant for durable agent context: what changed, what remains, where it happened, and what should be respected next time.

[Learn more about Frames](./docs/MIND_PALACE.md)

### Recall: prior context on demand

Later, an agent can recall relevant context by topic:

```bash
lex recall "authentication"
# Returns matching context, blockers, next action, and relevant module neighborhood.
```

Recall is the everyday adoption path: before changing code, ask Lex what prior work, blockers, and nearby boundaries matter.

### Context: bounded agent bootstrap

For session-start hooks and agent hosts, use the read-only context product:

```bash
lex context --max-tokens 1200
lex --json context --branch main --limit 5
```

`lex context` selects Frames by optional query, exact branch, workspace policy-module overlap, and recency. Both text and JSON output identify the active project root, config file, database path and store identity, selection reasons, warnings, and enforced output budget. Historical Frame fields are labeled as untrusted data and structurally escaped for direct prompt injection.

Context also carries the Frame write contract: required fields, policy state,
bounded module suggestions, `--modules auto` inference availability, and the
explicit `workspace/unscoped` fallback. This lets an agent prepare a valid
checkpoint without a failed discovery attempt.

```bash
# Infer from changed paths, intent, branch, and recent Frames
lex remember --summary "Finished context wiring" --next "Run validation" --modules auto

# Explicitly record that no useful module ontology is available
lex remember --summary "Repository-level handoff" --next "Add policy" --modules unscoped
```

The stored Frame records whether module attribution was explicit, inferred, or
a fallback, plus confidence and bounded evidence. `--skip-policy` skips only
ontology validation; it does not skip required Frame fields. See
[Agent Continuity](./docs/AGENT_CONTINUITY.md) for the shared AXF/Lex workflow.

### Atlas: nearby repository context

When a Frame is recalled, Lex can provide an Atlas Frame: the touched modules plus their immediate neighborhood, including dependencies, dependents, and permissions.

This fold-radius approach keeps recall focused on nearby repository context instead of flooding the agent with the whole codebase.

[Learn more about Atlas](./docs/ARCHITECTURE.md)

### Policy: architectural boundaries

Lex policy files define repository boundaries as code:

```json
{
  "modules": {
    "ui/components": {
      "owns": ["src/ui/components/**"],
      "mayCall": ["services/auth", "ui/shared"],
      "forbidden": [
        {
          "target": "database/queries",
          "reason": "UI must not access database directly. Use API layer."
        }
      ]
    }
  }
}
```

Enforce in CI:

```bash
lex check merged-facts.json
# Violation: ui/components -> database/queries (forbidden edge)
# Reason: UI must not access database directly. Use API layer.
```

[Learn more about Policy](./docs/API_USAGE.md)

### Instructions: project assistant guidance

Lex can project canonical assistant instructions into host-specific files:

```bash
# Your canonical instructions live in one place
.smartergpt/instructions/lex.md

# Project them to host-specific files
lex instructions generate
# Creates: .github/copilot-instructions.md, .cursorrules
```

The marker system preserves human content while keeping generated agent guidance deterministic.

[Learn more about Instructions](./docs/INSTRUCTIONS.md)

---

## Quick Start

### Installation

```bash
# Install globally (recommended)
npm install -g @smartergpt/lex

# Or locally in your project
npm install @smartergpt/lex
```

Requires Node.js 20+ and currently supports Node.js 20 through 24, matching the package engine range.

WSL users should use a native WSL install on `PATH`, not Windows npm shims or npm's `_npx` cache. See [WSL Native Lex Install](./docs/WSL_NATIVE_INSTALL.md) for the recommended user-local install, checkout symlink bridge, and native SQLite build requirements.

Lex supports structured output (`--json`), recoverable errors (AXError), and Frame Schema v3 for orchestrator integration. Commands provide both human-readable and machine-parseable output where supported.

### Initialize

```bash
# Zero-to-value initialization
npx @smartergpt/lex init --yes
# Auto-detects project type (Node.js, Python, Rust, Go, etc.)
# Creates:
#   .smartergpt/ - Workspace with prompts, policy, and instructions
#   .github/copilot-instructions.md - IDE instructions with LEX markers
#   .cursorrules - Cursor IDE instructions (if Cursor detected)
#   lex.yaml - Configuration with sensible defaults
#   .smartergpt/lex/memory.db - SQLite database (initialized on first use)
# Shows MCP server configuration guidance
# Idempotent: safe to run multiple times

# Interactive mode (prompts for first Frame)
lex init --interactive

# Generate seed policy from directory structure
lex init --policy
# Scans src/ for TypeScript/JavaScript modules
# Generates .smartergpt/lex/lexmap.policy.json with discovered modules
# Example: src/memory/store/ -> memory/store module with src/memory/store/** match pattern

# Force reinitialize (overwrite existing files)
lex init --force
```

During init, Lex detects common project types, creates IDE instruction files with LEX markers, writes `lex.yaml`, initializes `.smartergpt/lex/memory.db`, and prints MCP server configuration guidance.

### Capture the first useful Frame

```bash
lex remember \
  --reference-point "Refactoring payment processing" \
  --summary "Extracted validation logic to PaymentValidator" \
  --next "Add unit tests for edge cases" \
  --modules "services/payment"
```

### Recall it later

```bash
lex recall "payment"
# Shows your context, blockers, and architectural neighborhood.
```

[Full Quick Start Guide](./QUICK_START.md)

### MCP setup

Use Lex with any MCP-compatible AI assistant, including VS Code and Claude Desktop:

```bash
# Install the MCP wrapper
npm install -g @smartergpt/lex-mcp

# Or run directly
npx @smartergpt/lex-mcp
```

VS Code configuration (`.vscode/mcp.json`):

```json
{
  "servers": {
    "lex": {
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"],
      "env": {
        "LEX_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

Claude Desktop configuration:

```json
{
  "mcpServers": {
    "lex": {
      "command": "npx",
      "args": ["@smartergpt/lex-mcp"]
    }
  }
}
```

[MCP Server Documentation](./README.mcp.md)

---

## Agent Integration

Lex is designed to be consumed by agents and tools, not only read by humans.

- CLI: `lex remember`, `lex recall`, `lex context`, `lex check`, `lex timeline`, `lex instructions`, and database maintenance commands are scriptable entry points.
- MCP: `@smartergpt/lex-mcp` exposes Lex through Model Context Protocol for assistants that support MCP.
- Structured JSON: supported commands can emit machine-parseable output for orchestration and recovery.
- Recoverable errors: AXError includes `code`, `message`, `context`, and `nextActions[]` fields.
- Stable tool names: MCP tools have explicit names rather than relying on prose prompts.

The MCP server exposes 14 tools for episodic memory, policy validation, and architectural analysis:

- `frame_create`, `frame_search`, `frame_get`, `frame_list`, `frame_validate`
- `policy_check`, `timeline_show`, `atlas_analyze`
- `system_introspect`, `help`, `hints_get`
- `contradictions_scan`, `db_stats`, `turncost_calculate`

MCP is an adapter surface. Lex itself is the memory and policy core.

---

## Where agents use Lex

- Before editing: recall prior work, blockers, and relevant module boundaries.
- During handoff: store the current branch, next action, and unresolved constraints.
- During review: check policy facts against repository boundaries.
- During onboarding: inspect focused Atlas context instead of asking for a full codebase tour.
- During orchestration: emit structured output for runners and other tools.

Dogfooding examples are available in [examples/dogfood/](./examples/dogfood/). They show real Frames from building Lex with Lex.

---

## Human/operator view

Humans see a local, inspectable record instead of an opaque assistant memory:

- Frames are stored in SQLite at `.smartergpt/lex/memory.db` by default. PostgreSQL is an explicit opt-in for shared cross-host storage.
- Policy files live in the repository and can be reviewed in code review.
- NDJSON logs are written to `.smartergpt/lex/logs/lex.log.ndjson` with structured fields such as `timestamp`, `level`, `operation`, `duration_ms`, `metadata`, and `error`.
- Policy checks can run in CI with `lex check merged-facts.json`.
- Database maintenance commands support backups, rotation, and vacuuming.

```bash
# Create a collision-safe timestamped backup (memory-20251123-120000.000.sqlite)
lex db backup --rotate 7
# Keeps last 7 backups, stored in .smartergpt/lex/backups/

# Optimize database (rebuild and compact)
lex db vacuum

# Set backup retention via environment variable
export LEX_BACKUP_RETENTION=14  # Keep 14 most recent backups
```

Logs rotate automatically at 100MB and are silent in test mode unless `LEX_LOG_NDJSON=1` is set.

---

## Lex is not

- Lex is not a cloud memory service.
- Lex is not a chatbot.
- Lex is not a replacement for tests, code review, or CI.
- Lex is not an MCP-only project.
- Lex is not AXF, LexRunner, or LexSona.

---

## Relationship to AXF, LexRunner, and LexSona

Lex is the memory and policy core.

- Lex remembers and explains project context through Frames, recall, Atlas, policy, instructions, and structured output.
- AXF is the inspectable capability/control-plane layer for agent-operable tooling: manifests, routing, execution surfaces, scaffolding, and lifecycle gates.
- LexRunner composes work over capabilities and runpaths, including parallel PR workflows and merge planning.
- LexSona consumes the public behavioral memory socket (`@smartergpt/lex/lexsona`) for persona and guardrail integration. Lex core remains persona-agnostic.

A useful mental model: Lex remembers and explains context; AXF exposes bounded capabilities; LexRunner coordinates work; LexSona derives behavioral constraints.

---

## Documentation

### Getting Started

- [Quick Start Guide](./QUICK_START.md) - Get up and running in 5 minutes
- [Installation and Setup](./docs/ADOPTION_GUIDE.md) - Detailed installation guide
- [Core Concepts](./docs/OVERVIEW.md) - Understanding Frames, Atlas, and Policy

### Guides

- [Frame Recall Guide](./docs/MIND_PALACE.md) - Using Frames for reference-point recall
- [Code Atlas Guide](./docs/atlas/README.md) - Spatial memory and architectural context
- [Policy Enforcement](./docs/API_USAGE.md) - Setting up architectural boundaries
- [Instructions Generation](./docs/INSTRUCTIONS.md) - Sync AI instructions across IDEs
- [CLI Reference](./docs/CLI_OUTPUT.md) - Command-line usage and output modes
- [MCP Server Documentation](./README.mcp.md) - Using Lex with Model Context Protocol
- [OAuth2/JWT Authentication](./docs/AUTH.md) - Multi-user authentication setup

### Security

- [Security Policy](./SECURITY.md) - Security posture and best practices
- [OAuth2/JWT Guide](./docs/AUTH.md) - Authentication and user isolation

### Advanced

- [Architecture](./docs/ARCHITECTURE.md) - System layers and module context
- [Architecture Loop](./docs/ARCHITECTURE_LOOP.md) - How Frames, Atlas, and Policy interact
- [API Reference](#api-reference) - TypeScript API documentation
- [Limitations](./docs/LIMITATIONS.md) - Known constraints and future work
- [FAQ](./docs/FAQ.md) - Common questions

### Development

- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [Release Process](./RELEASE.md) - Versioning and publishing
- [ADRs](./docs/adr/) - Architectural decision records

---

## API Reference

Lex provides multiple entry points for agents, tools, and application code:

### Core API

```typescript
import { saveFrame, searchFrames, getDb, closeDb } from '@smartergpt/lex';

const db = getDb(); // Uses .smartergpt/lex/memory.db

await saveFrame(db, {
  referencePoint: 'authentication flow',
  summaryCaption: 'Added password validation',
  statusSnapshot: { nextAction: 'Wire up permission check' },
  moduleScope: ['services/auth', 'services/password'],
  branch: 'feature/auth',
  jira: 'AUTH-123'
});

const results = await searchFrames(db, { referencePoint: 'authentication' });
closeDb(db);
```

### Subpath exports

| Import | Purpose | Documentation |
|--------|---------|---------------|
| `@smartergpt/lex` | Core API + store operations | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/cli` | Programmatic CLI access | [CLI Output](./docs/CLI_OUTPUT.md) |
| `@smartergpt/lex/cli-output` | CLI JSON utilities | [CLI Output](./docs/CLI_OUTPUT.md) |
| `@smartergpt/lex/store` | Direct database operations | [Store Contracts](./docs/STORE_CONTRACTS.md) |
| `@smartergpt/lex/types` | All shared types | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/errors` | AXError schema and utilities (v2.0+) | [AX Contract](./docs/specs/AX-CONTRACT.md) |
| `@smartergpt/lex/policy` | Policy loading & validation | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/atlas` | Atlas Frame generation | [Architecture](./docs/ARCHITECTURE.md) |
| `@smartergpt/lex/atlas/code-unit` | Code unit schemas | [Atlas](./docs/atlas/README.md) |
| `@smartergpt/lex/atlas/schemas` | Atlas schemas | [Atlas](./docs/atlas/README.md) |
| `@smartergpt/lex/aliases` | Module alias resolution | [Aliases](./src/shared/aliases/README.md) |
| `@smartergpt/lex/module-ids` | Module ID validation | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/memory` | Frame payload validation | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/logger` | NDJSON logging | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/lexsona` | Behavioral memory socket (v2.0+) | [Control Stack](./docs/control-stack/index.md) |
| `@smartergpt/lex/prompts` | Template system | [Canon Architecture](./docs/CANON_ARCHITECTURE.md) |

[Full API Documentation](./docs/API_USAGE.md)

---

## Project status

**Current Version:** `2.9.1` ([Changelog](./CHANGELOG.md))

Current Lex releases include structured output, recoverable errors, and Frame Schema v3 for agent and orchestrator integration.

Commonly used for:

- Personal projects and local dev tools
- Private MCP servers
- CI/CD policy enforcement
- LexRunner and other orchestrator integrations
- Documented multi-user authentication and encrypted database setup paths for deployments that need them

Current capability highlights:

- Structured output contract (v0.1): machine-parseable output, recoverable errors, and recall-focused events ([AX Contract](./docs/specs/AX-CONTRACT.md))
- Frame Schema v3: runner fields such as `runId`, `planHash`, and `toolCalls` for orchestration ([Schema Docs](./docs/specs/FRAME-SCHEMA-V3.md))
- AXError Schema: structured errors with `code`, `message`, `context`, and `nextActions[]` for programmatic recovery
- CLI JSON Output: `lex remember --json` and `lex timeline --json` with machine-parseable event streams
- Instructions Management: `lex instructions` CLI for syncing AI instructions across IDEs
- LexSona Socket: behavioral memory API (`recordCorrection`/`getRules`) exported via `@smartergpt/lex/lexsona`
- Performance: cached policy module ID lookups for O(1) resolution

Lex 2.0.0 introduced the public behavioral memory socket (`@smartergpt/lex/lexsona`) for persona-based workflows. LexSona is a separate private package that consumes this socket to enable offline-capable persona modes. Lex itself is persona-agnostic.

See the [changelog](./CHANGELOG.md) for release history and version-specific notes.

---

## Contributing

Contributions are welcome.

1. Read the [Contributing Guide](./CONTRIBUTING.md) and [Development Setup](./docs/ADOPTION_GUIDE.md).
2. Pick an issue from [good first issues](https://github.com/Guffawaffle/lex/labels/good%20first%20issue) or [help wanted](https://github.com/Guffawaffle/lex/labels/help%20wanted).
3. Submit a PR with tests and documentation where they apply.

Follow the repo's commit conventions and signing requirements documented in the contributing guide.

---

## Related projects

- [LexRunner](https://github.com/Guffawaffle/lexrunner) - Orchestration for parallel PR workflows.
- LexSona - Behavioral persona engine that consumes Lex's public behavioral memory socket.
- AXF - Capability/control-plane layer for agent-operable tooling.

---

## License

MIT License. See [LICENSE](./LICENSE) for full text.

---

## Links

- [Documentation](./docs/)
- [Examples](./examples/)
- [npm Package](https://www.npmjs.com/package/@smartergpt/lex)
- [Issues](https://github.com/Guffawaffle/lex/issues)
- [Discussions](https://github.com/Guffawaffle/lex/discussions)

---

## Advanced topics

### TypeScript build system

Lex uses TypeScript project references for deterministic, incremental builds:

```bash
npm run build      # Compile with project references
npm run clean      # Clean build artifacts
npm run typecheck  # Type-check without emitting
```

Why NodeNext module resolution?

- Source uses `.ts` files with `.js` import extensions.
- TypeScript resolves imports during compilation.
- Emitted `.js` files work correctly in Node.js ESM.
- There is no confusion between source and build artifacts.

[Build System Details](./docs/adr/0001-ts-only-nodenext.md)

### Local CI with Docker

Run CI checks locally without touching GitHub:

```bash
npm run local-ci          # Run full CI suite locally
npm run local-ci:nonet    # Run without network access
```

This uses `ci.Dockerfile` for local parity with CI checks.

### Multi-language policy scanning

While TypeScript scanning is built in, Python and PHP scanners are available as examples:

```bash
# Scan Python codebase
python examples/scanners/python/scan.py src/ > python-facts.json

# Scan PHP codebase
php examples/scanners/php/scan.php src/ > php-facts.json

# Merge with TypeScript facts
lex merge ts-facts.json python-facts.json > merged-facts.json

# Check policy
lex check merged-facts.json
```

Security note: external scanners execute arbitrary code. Review before use.

[Scanner Documentation](./examples/scanners/README.md)

### Customizing prompts and schemas

Lex uses a precedence chain for configuration:

1. Environment: `LEX_CANON_DIR=/custom/canon` (highest)
2. Local overlay: `.smartergpt/prompts/`
3. Package defaults: `prompts/` (lowest)

```bash
# Customize locally
cp prompts/remember.md .smartergpt/prompts/
vim .smartergpt/prompts/remember.md

# Or use custom directory
LEX_CANON_DIR=/my/custom/canon lex remember ...
```

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LEX_LOG_LEVEL` | Log verbosity (`silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`) | `info` (tests: `silent`) |
| `LEX_LOG_PRETTY` | Pretty-print logs (`1` = enabled) | Auto-detect TTY |
| `LEX_POLICY_PATH` | Custom policy file location | `.smartergpt/lex/lexmap.policy.json` |
| `LEX_STORE` | Frame backend (`sqlite` or `postgres`) | `sqlite` |
| `LEX_DATABASE_URL` | PostgreSQL connection URL; required only when `LEX_STORE=postgres` | — |
| `LEX_POSTGRES_PASSWORD` | Optional separate password for a credential-free PostgreSQL URL | — |
| `LEX_DB_PATH` | SQLite database location; ignored by the PostgreSQL backend | `.smartergpt/lex/memory.db` |
| `LEX_MEMORY_DB` | Compatibility alias for `LEX_DB_PATH` | — |
| `LEX_DB_KEY` | Database encryption passphrase (required in production) | None (unencrypted) |
| `LEX_GIT_MODE` | Git integration (`off`, `live`) | `off` |
| `LEX_DEFAULT_BRANCH` | Override default branch detection | Auto-detect from git |
| `LEX_CANON_DIR` | Override canonical resources root | Package defaults |
| `LEX_PROMPTS_DIR` | Override prompts directory | Package defaults |
| `LEX_SCHEMAS_DIR` | Override schemas directory | Package defaults |
| `LEX_CLI_OUTPUT_MODE` | CLI output format (`plain` or `jsonl`) | `plain` |
| `LEX_BACKUP_RETENTION` | Number of database backups to retain | `7` |
| `SMARTERGPT_PROFILE` | Profile configuration path | `.smartergpt/profile.yml` |

### Database encryption

Protect your Frame data with SQLCipher encryption:

```bash
# Enable encryption for new databases
export LEX_DB_KEY="your-strong-passphrase-here"
lex remember --reference-point "work" --summary "Encrypted!"

# Migrate existing database
lex db encrypt --verify

# Production mode requires encryption
export NODE_ENV="production"
export LEX_DB_KEY="production-passphrase"
```

Key features:

- AES-256 encryption at rest
- PBKDF2 key derivation (64K iterations)
- Mandatory in production (`NODE_ENV=production`)
- Migration tool with integrity verification

[Security Guide](./SECURITY.md#database-encryption)

[Environment Configuration](./docs/ADOPTION_GUIDE.md)

---

## Development

### Prerequisites

- Node.js v20+ LTS, with CI coverage on Node.js 20, 22, and 24
- npm v10+
- Git for branch detection

### Local setup

```bash
# Clone repository
git clone https://github.com/Guffawaffle/lex.git
cd lex

# Install dependencies
npm ci

# Build
npm run build

# Run tests
npm test

# Local CI (full suite)
npm run local-ci
```

### Project structure

```text
lex/
|-- src/                     # TypeScript source (no .js files)
|   |-- memory/              # Frame storage and MCP server
|   |-- policy/              # Policy enforcement and scanners
|   |-- shared/              # Shared utilities and types
|   `-- index.ts             # Main entry point
|-- dist/                    # Build output (gitignored)
|-- canon/                   # Canonical prompts and schemas
|-- docs/                    # Documentation
|-- examples/                # Usage examples and optional scanners
|-- test/                    # Test suite
`-- .smartergpt/             # Local workspace (gitignored)
```

### Running tests

```bash
npm test                     # Run all tests (excludes git tests)
npm run test:coverage       # With coverage report
npm run test:watch          # Watch mode
npm run test:git            # Git integration tests (requires non-interactive signing)
```

Git tests are quarantined due to mandatory GPG signing in this environment. See [test/README.md](./test/README.md) for details.

### Code quality

```bash
npm run lint                # ESLint checks
npm run format              # Prettier formatting
npm run typecheck           # TypeScript validation
```

[Contributing Guide](./CONTRIBUTING.md)
