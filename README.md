<div align="center">

# Lex

### **Episodic Memory & Architectural Policy for AI Agents**

[![MIT License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@smartergpt/lex)](https://www.npmjs.com/package/@smartergpt/lex)
[![CI Status](https://img.shields.io/badge/CI-passing-success)](https://github.com/Guffawaffle/lex/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6)](https://www.typescriptlang.org/)

**Stop losing context. Start building agents that remember.**

[Quick Start](#-quick-start) · [Documentation](#-documentation) · [Examples](./examples/) · [API Reference](#-api-reference) · [Contributing](./CONTRIBUTING.md)

</div>

---

## 📖 What is Lex?

**Lex** is a TypeScript framework that gives AI agents **episodic memory** and **architectural awareness**. It solves the fundamental problem of context loss in long-running development workflows.

### The Problem

You're working with an AI coding assistant on a complex feature. You stop for the day. When you return:
- The assistant has no memory of what you were doing
- It can't recall why you made certain architectural decisions
- It doesn't know which modules are safe to modify
- You spend 30 minutes re-explaining context every session

### The Solution

Lex provides three capabilities:

1. **📸 Episodic Memory (Frames)** — Capture work snapshots with context, blockers, and next actions
2. **🗺️ Spatial Memory (Atlas)** — Navigate module dependencies without overwhelming token budgets
3. **🛡️ Architectural Policy** — Enforce boundaries, permissions, and deprecation patterns in CI

**Result:** Your AI assistant recalls exactly where you left off, understands your architecture, and respects your constraints.

---

## 🎯 Core Capabilities

### 🧠 Frames: Work Session Memory

Capture meaningful moments in your development workflow:

```bash
lex remember \
  --reference-point "Implementing user authentication" \
  --summary "Added JWT validation to API middleware" \
  --next "Wire up password reset flow" \
  --modules "services/auth,api/middleware" \
  --blockers "Need PermissionService access - forbidden edge in policy" \
  --jira "AUTH-123"
```

Later, instantly recall:

```bash
lex recall "authentication"
# Returns: Your exact context, blockers, next action, and relevant module neighborhood
```

[Learn more about Frames →](./docs/MIND_PALACE.md)

### 🗺️ Atlas Frames: Architectural Context

When you recall a Frame, Lex doesn't dump your entire codebase into context. Instead, it provides an **Atlas Frame**: the modules you touched plus their immediate neighborhood (dependencies, dependents, permissions).

This "fold radius" approach gives AI assistants exactly the architectural context they need—nothing more, nothing less.

**Token efficiency:** 10-module project → ~500 tokens (not 50,000)

[Learn more about Atlas →](./docs/ARCHITECTURE.md)

### 🛡️ Policy Enforcement

Define architectural boundaries as code:

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
# ✖ Violation: ui/components → database/queries (forbidden edge)
#   Reason: UI must not access database directly. Use API layer.
```

[Learn more about Policy →](./docs/API_USAGE.md)

### 📝 Instructions Generation

Maintain a single source of truth for AI assistant guidance:

```bash
# Your canonical instructions live in one place
.smartergpt/instructions/lex.md

# Project them to host-specific files
lex instructions generate
# Creates: .github/copilot-instructions.md, .cursorrules
```

**Benefits:**
- Single source → Multiple hosts (Copilot, Cursor, etc.)
- Safe updates via marker system (human content preserved)
- Deterministic output (same input = same output)

[Learn more about Instructions →](./docs/INSTRUCTIONS.md)

---

## 🚀 Quick Start

### Installation

```bash
# Install globally (recommended)
npm install -g @smartergpt/lex

# Or locally in your project
npm install @smartergpt/lex
```

**Requires Node.js 20+** (tested through Node.js 22, see `.nvmrc`)

**Lex 2.0.0 is AX-native** with structured output (`--json`), recoverable errors (AXError), and Frame Schema v3 for orchestrator integration. All commands provide both human-readable and machine-parseable output.

### Initialize

```bash
# Zero-to-value initialization (new in v2.1.0!)
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
# Example: src/memory/store/ → memory/store module with src/memory/store/** match pattern

# Force reinitialize (overwrite existing files)
lex init --force
```

**What happens during init:**
1. 🔍 **Project Detection** — Identifies Node.js, Python, Rust, Go, Java, .NET, Ruby projects and frameworks
2. 📝 **IDE Setup** — Creates `.github/copilot-instructions.md` and `.cursorrules` (if Cursor detected) with LEX markers for safe updates
3. ⚙️ **Configuration** — Generates `lex.yaml` with defaults based on your project
4. 💾 **Database** — Initializes SQLite database at `.smartergpt/lex/memory.db`
5. 📡 **MCP Guidance** — Shows configuration for VS Code MCP server integration

### Capture Your First Frame

```bash
lex remember \
  --reference-point "Refactoring payment processing" \
  --summary "Extracted validation logic to PaymentValidator" \
  --next "Add unit tests for edge cases" \
  --modules "services/payment"
```

### Recall Later

```bash
lex recall "payment"
# Shows your context, blockers, and architectural neighborhood
```

### Database Maintenance

Keep your memory database optimized and backed up:

```bash
# Create a timestamped backup (memory-20251123.sqlite)
lex db backup --rotate 7
# Keeps last 7 backups, stored in .smartergpt/lex/backups/

# Optimize database (rebuild and compact)
lex db vacuum

# Set backup retention via environment variable
export LEX_BACKUP_RETENTION=14  # Keep 14 most recent backups
```

**NDJSON Logging:** Lex automatically logs operations to `.smartergpt/lex/logs/lex.log.ndjson` with structured fields:
- `timestamp`, `level`, `message`, `module`, `operation`, `duration_ms`, `metadata`, `error`
- Log files rotate automatically at 100MB
- Logs are silent in test mode unless `LEX_LOG_NDJSON=1`

**That's it!** You now have persistent memory for your AI workflows.

[Full Quick Start Guide →](./QUICK_START.md)

### MCP Server Integration

Use Lex with any MCP-compatible AI assistant (VS Code, Claude Desktop, etc.):

```bash
# Install the MCP wrapper
npm install -g @smartergpt/lex-mcp

# Or run directly
npx @smartergpt/lex-mcp
```

**VS Code Configuration (`.vscode/mcp.json`):**
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

**Claude Desktop Configuration:**
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

The MCP server exposes 14 tools for episodic memory, policy validation, and architectural analysis:
- `frame_create`, `frame_search`, `frame_get`, `frame_list`, `frame_validate`
- `policy_check`, `timeline_show`, `atlas_analyze`
- `system_introspect`, `help`, `hints_get`
- `contradictions_scan`, `db_stats`, `turncost_calculate`

[MCP Server Documentation →](./README.mcp.md)

---

## 💡 Use Cases

### 👨‍💻 For Developers

- **Preserve context** across work sessions with AI coding assistants
- **Document architectural decisions** with searchable, timestamped snapshots
- **Enforce boundaries** via CI to prevent policy violations

### 🤖 For AI Agents

- **Recall previous work** using natural language search
- **Navigate large codebases** with token-efficient Atlas Frames
- **Respect constraints** by checking policy before suggesting changes

### 👥 For Teams

- **Onboard new members** by showing architectural history
- **Track technical debt** with kill patterns and forbidden edges
- **Maintain consistency** across multi-module projects

### 📸 See It In Action

**Want to see how Lex is used in practice?** Check out our [dogfooding examples](./examples/dogfood/) — real Frames from building Lex with Lex.

See how we:
- Use `lex recall` to resume work after breaks
- Capture context with `lex remember` at key checkpoints
- Handle blockers and escalations in real development
- Track complexity and turn costs for governance

[View Dogfood Examples →](./examples/dogfood/)

---

## 🏗️ Architecture

Lex is built on three pillars:

```
┌─────────────────────────────────────────────────────────┐
│                    Lex Framework                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📸 Memory Layer (lex/memory)                          │
│  ├─ Frame storage (SQLite)                             │
│  ├─ Search & recall                                     │
│  └─ MCP server integration                             │
│                                                         │
│  🗺️ Atlas Layer (lex/shared/atlas)                     │
│  ├─ Module dependency graphs                           │
│  ├─ Fold radius computation                            │
│  └─ Token-aware context generation                     │
│                                                         │
│  🛡️ Policy Layer (lex/policy)                          │
│  ├─ Boundary definitions                               │
│  ├─ Multi-language scanners                            │
│  └─ CI enforcement                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

[Architecture Details →](./docs/ARCHITECTURE.md)

---

## 📚 Documentation

### Getting Started
- [Quick Start Guide](./QUICK_START.md) — Get up and running in 5 minutes
- [Installation & Setup](./docs/ADOPTION_GUIDE.md) — Detailed installation guide
- [Core Concepts](./docs/OVERVIEW.md) — Understanding Frames, Atlas, and Policy

### Guides
- [Mind Palace Guide](./docs/MIND_PALACE.md) — Using Frames for episodic memory
- [Code Atlas Guide](./docs/atlas/README.md) — Spatial memory and architectural context
- [Policy Enforcement](./docs/API_USAGE.md) — Setting up architectural boundaries
- [Instructions Generation](./docs/INSTRUCTIONS.md) — Sync AI instructions across IDEs
- [CLI Reference](./docs/CLI_OUTPUT.md) — Command-line usage and output modes
- [MCP Integration](./memory/mcp_server/README.md) — Using Lex with Model Context Protocol
- [OAuth2/JWT Authentication](./docs/AUTH.md) — Multi-user authentication setup

### Security
- [Security Policy](./SECURITY.md) — Security posture and best practices
- [OAuth2/JWT Guide](./docs/AUTH.md) — Authentication and user isolation

### Advanced
- [Architecture Loop](./docs/ARCHITECTURE_LOOP.md) — How Frames, Atlas, and Policy interact
- [API Reference](#-api-reference) — TypeScript API documentation
- [Limitations](./docs/LIMITATIONS.md) — Known constraints and future work
- [FAQ](./docs/FAQ.md) — Common questions

### Development
- [Contributing Guide](./CONTRIBUTING.md) — How to contribute
- [Release Process](./RELEASE.md) — Versioning and publishing
- [ADRs](./docs/adr/) — Architectural decision records

---

## 🔧 API Reference

Lex provides multiple entry points for different use cases:

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

### Subpath Exports

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

[Full API Documentation →](./docs/API_USAGE.md)

---

## 🎯 Project Status

**Current Version:** `2.5.1` ([Changelog](./CHANGELOG.md))

### 🚀 2.0.0 — AX-Native Release

Lex 2.0.0 is the first stable release with **AX (Agent eXperience)** as a first-class design principle. This release introduces structured output, recoverable errors, and Frame Schema v3 for AI agent integration.

**Ready for:**
- ✅ Personal projects and local dev tools
- ✅ Private MCP servers
- ✅ CI/CD policy enforcement
- ✅ Multi-user deployments with OAuth2/JWT
- ✅ Encrypted databases with SQLCipher
- ✅ LexRunner and other orchestrator integrations

**2.0.0 Highlights:**
- **AX Guarantees (v0.1)** — Structured output, recoverable errors, reliable memory/recall ([AX Contract](./docs/specs/AX-CONTRACT.md))
- **Frame Schema v3** — Runner fields (`runId`, `planHash`, `toolCalls`) for orchestration ([Schema Docs](./docs/specs/FRAME-SCHEMA-V3.md))
- **AXError Schema** — Structured errors with `code`, `message`, `context`, and `nextActions[]` for programmatic recovery
- **CLI JSON Output** — `lex remember --json` and `lex timeline --json` with machine-parseable event streams
- **Instructions Management** — `lex instructions` CLI for syncing AI instructions across IDEs (Copilot, Cursor, etc.)
- **LexSona Socket** — Behavioral memory API (`recordCorrection`/`getRules`) exported via `@smartergpt/lex/lexsona`
- **Performance** — Cached policy module ID lookups for O(1) resolution

**LexSona Integration:**
Lex 2.0.0 provides a **public behavioral memory socket** (`@smartergpt/lex/lexsona`) for persona-based workflows. **LexSona** is a separate private package (v0.2.0+) that consumes this socket to enable offline-capable persona modes. The socket API is stable and documented; LexSona implementation details remain private. Lex itself is persona-agnostic — the socket is a stable integration point for any behavioral engine.

See [CHANGELOG v2.0.0](./CHANGELOG.md#200---2025-12-05) for full release notes.

### Quality Metrics

| Metric | Value |
|--------|-------|
| Test Files | 78 |
| Test Suites | 23 |
| Source Files | 108 |
| Exports | 14 subpaths |
| Schema Version | 2 |

---

## 🌟 Why Lex?

### Cognitive Architecture for AI Agents

**The Challenge:** AI coding assistants lose context between sessions. They can't remember what you were working on, why you made certain decisions, or which parts of your codebase are off-limits.

**Our Approach:** External memory and structured reasoning — the same techniques human experts use to maintain context across complex, long-running projects.

**The Components:**
- **Episodic memory** — Lex Frames capture what you were doing, blockers, and next actions
- **Spatial memory** — Atlas Frames provide token-efficient architectural context
- **Policy enforcement** — Boundaries and permissions enforced in CI
- **Orchestration** — LexRunner coordinates multi-PR workflows

**Why This Matters:**
- **Continuity** — Pick up exactly where you left off, every time
- **Architecture** — AI assistants understand your codebase structure
- **Guardrails** — Prevent violations before they happen
- **Accessibility** — Works with any LLM that supports MCP

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Read the guides:**
   - [Contributing Guide](./CONTRIBUTING.md)
   - [Code of Conduct](./CODE_OF_CONDUCT.md)
   - [Development Setup](./docs/ADOPTION_GUIDE.md)

2. **Pick an issue:**
   - [Good first issues](https://github.com/Guffawaffle/lex/labels/good%20first%20issue)
   - [Help wanted](https://github.com/Guffawaffle/lex/labels/help%20wanted)

3. **Submit a PR:**
   - Follow commit conventions (imperative mood)
   - Include tests and documentation
   - GPG-sign your commits

[Contributing Guide →](./CONTRIBUTING.md)

---

## 📦 Related Projects

- **[LexRunner](https://github.com/Guffawaffle/lexrunner)** — Orchestration for parallel PR workflows

- **LexSona** (v0.2.0+) — Behavioral persona engine, separate private package
  Consumes Lex behavioral memory socket (`@smartergpt/lex/lexsona`) to enable offline-capable persona modes with constraint enforcement. High-level concept: persona-driven workflows without embedding persona logic in Lex core. See [Control Stack documentation](./docs/control-stack/index.md) for conceptual framework (public portions).

---

## 📄 License

**MIT License** — Free for personal and commercial use.

See [LICENSE](./LICENSE) for full text.

---

## 🔗 Links

- **Documentation:** [docs/](./docs/)
- **Examples:** [examples/](./examples/)
- **npm Package:** [@smartergpt/lex](https://www.npmjs.com/package/@smartergpt/lex)
- **Issues:** [GitHub Issues](https://github.com/Guffawaffle/lex/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Guffawaffle/lex/discussions)

---

<div align="center">

**Built with ❤️ by the Lex community**

[⭐ Star on GitHub](https://github.com/Guffawaffle/lex) · [📦 Install from npm](https://www.npmjs.com/package/@smartergpt/lex) · [💬 Join Discussions](https://github.com/Guffawaffle/lex/discussions)

</div>

## 💻 Advanced Topics

### TypeScript Build System

Lex uses **TypeScript project references** for deterministic, incremental builds:

```bash
npm run build      # Compile with project references
npm run clean      # Clean build artifacts
npm run typecheck  # Type-check without emitting
```

**Why NodeNext module resolution?**
- Source uses `.ts` files with `.js` import extensions
- TypeScript resolves imports during compilation
- Emitted `.js` files work correctly in Node.js ESM
- No confusion between source and build artifacts

[Build System Details →](./docs/adr/0001-ts-only-nodenext.md)

### Local CI with Docker

Run CI checks locally without touching GitHub:

```bash
npm run local-ci          # Run full CI suite locally
npm run local-ci:nonet    # Run without network access
```

This uses `ci.Dockerfile` for local parity with CI checks.

### Multi-Language Policy Scanning

While TypeScript scanning is built-in, **Python and PHP scanners** are available as examples:

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

⚠️ **Security Note:** External scanners execute arbitrary code. Review before use.

[Scanner Documentation →](./examples/scanners/README.md)

### Customizing Prompts & Schemas

Lex uses a **precedence chain** for configuration:

1. **Environment:** `LEX_CANON_DIR=/custom/canon` (highest)
2. **Local overlay:** `.smartergpt/prompts/`
3. **Package defaults:** `prompts/` (lowest)

```bash
# Customize locally
cp prompts/remember.md .smartergpt/prompts/
vim .smartergpt/prompts/remember.md

# Or use custom directory
LEX_CANON_DIR=/my/custom/canon lex remember ...
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LEX_LOG_LEVEL` | Log verbosity (`silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`) | `info` (tests: `silent`) |
| `LEX_LOG_PRETTY` | Pretty-print logs (`1` = enabled) | Auto-detect TTY |
| `LEX_POLICY_PATH` | Custom policy file location | `.smartergpt/lex/lexmap.policy.json` |
| `LEX_DB_PATH` | Database location | `.smartergpt/lex/memory.db` |
| `LEX_DB_KEY` | Database encryption passphrase (required in production) | None (unencrypted) |
| `LEX_GIT_MODE` | Git integration (`off`, `live`) | `off` |
| `LEX_DEFAULT_BRANCH` | Override default branch detection | Auto-detect from git |
| `LEX_CANON_DIR` | Override canonical resources root | Package defaults |
| `LEX_PROMPTS_DIR` | Override prompts directory | Package defaults |
| `LEX_SCHEMAS_DIR` | Override schemas directory | Package defaults |
| `LEX_CLI_OUTPUT_MODE` | CLI output format (`plain` or `jsonl`) | `plain` |
| `LEX_BACKUP_RETENTION` | Number of database backups to retain | `7` |
| `SMARTERGPT_PROFILE` | Profile configuration path | `.smartergpt/profile.yml` |

### 🔐 Database Encryption

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

**Key Features:**
- ✅ AES-256 encryption at rest
- ✅ PBKDF2 key derivation (64K iterations)
- ✅ Mandatory in production (`NODE_ENV=production`)
- ✅ Migration tool with integrity verification

[Security Guide →](./SECURITY.md#database-encryption)

[Environment Configuration →](./docs/ADOPTION_GUIDE.md)

---

## 🧪 Development

### Prerequisites

- **Node.js:** v20+ LTS (tested up to v22, see `.nvmrc`)
- **npm:** v10+
- **Git:** For branch detection

### Local Setup

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

### Project Structure

```
lex/
├── src/                     # TypeScript source (no .js files)
│   ├── memory/             # Frame storage & MCP server
│   ├── policy/             # Policy enforcement & scanners
│   ├── shared/             # Shared utilities & types
│   └── index.ts            # Main entry point
├── dist/                    # Build output (gitignored)
├── canon/                   # Canonical prompts & schemas
├── docs/                    # Documentation
├── examples/                # Usage examples & optional scanners
├── test/                    # Test suite
└── .smartergpt/            # Local workspace (gitignored)
```

### Running Tests

```bash
npm test                     # Run all tests (excludes git tests)
npm run test:coverage       # With coverage report
npm run test:watch          # Watch mode
npm run test:git            # Git integration tests (requires non-interactive signing)
```

**Note:** Git tests are quarantined due to mandatory GPG signing in this environment. See [test/README.md](./test/README.md) for details.

### Code Quality

```bash
npm run lint                # ESLint checks
npm run format              # Prettier formatting
npm run typecheck           # TypeScript validation
```

[Contributing Guide →](./CONTRIBUTING.md)
