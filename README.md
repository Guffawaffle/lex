<div align="center">

# Lex

### **Episodic Memory & Architectural Policy for AI Agents**

[![MIT License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@smartergpt/lex?label=version&color=blue)](https://www.npmjs.com/package/@smartergpt/lex)
[![CI Status](https://img.shields.io/badge/CI-passing-success)](https://github.com/Guffawaffle/lex/actions)
[![Coverage](https://img.shields.io/badge/coverage-89.2%25-yellow)](#quality-metrics)
[![Tests](https://img.shields.io/badge/tests-123%2F123-success)](#quality-metrics)

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

---

## 🚀 Quick Start

### Installation

```bash
# Install globally (recommended) — install the alpha release explicitly
npm install -g @smartergpt/lex@alpha

# Or locally in your project (alpha)
npm install @smartergpt/lex@alpha
```

Note: this repository's published release is version `0.4.5-alpha` and is published under the `alpha` dist-tag. If/when we promote a release to `latest`, we'll update these instructions accordingly.

### Initialize

```bash
lex init
# Creates .smartergpt/ workspace with:
#   .smartergpt/prompts/ - Shared prompts (organization-level)
#   .smartergpt/lex/ - Lex-specific files (policy, memory.db, logs, backups)
```

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
# Keeps last 7 backups, stored in .smartergpt.local/lex/backups/

# Optimize database (rebuild and compact)
lex db vacuum

# Set backup retention via environment variable
export LEX_BACKUP_RETENTION=14  # Keep 14 most recent backups
```

**NDJSON Logging:** Lex automatically logs operations to `.smartergpt.local/lex/logs/lex.log.ndjson` with structured fields:
- `timestamp`, `level`, `message`, `module`, `operation`, `duration_ms`, `metadata`, `error`
- Log files rotate automatically at 100MB
- Logs are silent in test mode unless `LEX_LOG_NDJSON=1`

**That's it!** You now have persistent memory for your AI workflows.

[Full Quick Start Guide →](./QUICK_START.md)

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
- [Policy Enforcement](./docs/API_USAGE.md) — Setting up architectural boundaries
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

const db = getDb(); // Uses .smartergpt.local/lex/memory.db

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
| `@smartergpt/lex` | Core frame storage | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/cli` | Programmatic CLI access | [CLI Output](./docs/CLI_OUTPUT.md) |
| `@smartergpt/lex/memory/store` | Direct database operations | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/shared/policy` | Policy loading & validation | [API Usage](./docs/API_USAGE.md) |
| `@smartergpt/lex/shared/atlas` | Atlas Frame generation | [Architecture](./docs/ARCHITECTURE.md) |
| `@smartergpt/lex/shared/aliases` | Module alias resolution | [Aliases](./src/shared/aliases/README.md) |

[Full API Documentation →](./docs/API_USAGE.md)

---

## 🎯 Project Status

**Current Version:** `0.4.5-alpha` ([Changelog](./CHANGELOG.md))

### ⚠️ Alpha Status

Lex is **production-ready for local development** but still alpha for multi-tenant deployments.

**Ready for:**
- ✅ Personal projects and local dev tools
- ✅ Private MCP servers
- ✅ CI/CD policy enforcement
- ✅ Experimental AI agent workflows

**Not yet ready for:**
- ❌ Public SaaS deployments
- ❌ Multi-tenant production systems
- ❌ Stable APIs (expect breaking changes in minor versions)

### 🚧 Active Development: Project 0.5.0

**Timeline:** Q1 2026 (January–March)
**Goal:** Production-ready release with security hardening and LexSona behavioral rules

| Feature | Status | Target |
|---------|--------|--------|
| Canon assets + precedence | ✅ Complete | Nov 2025 |
| LexSona behavioral rules (v0) | 🟡 In Progress | Dec 2025 |
| SQLCipher encryption | 🟡 Planned | Feb 2026 |
| OAuth2/JWT auth | 🟡 Planned | Feb 2026 |
| Enhanced audit logging | 🟡 Planned | Feb 2026 |
| API stability guarantee | 🟡 Planned | Mar 2026 |

[Project 0.5.0 Details →](./docs/PROJECT_0.5.0_METRICS.md)

### Quality Metrics

- **Test Coverage:** 89.2% (target: ≥90%)
- **Passing Tests:** 123/123
- **CI Success Rate:** 96.4% (target: ≥98%)
- **Security:** 0 critical/high findings

---

## 🌟 Why Lex?

### Democratizing AI Capability

**The Challenge:** Today's AI landscape is two-tier. Frontier models (GPT-5.1, Claude 4.5 Sonnet) outperform smaller models primarily due to parameter count—not reasoning architecture.

**Our Thesis:** *Cognitive architecture can bridge this gap.* Just as human experts use external memory and structured reasoning, AI agents can achieve near-frontier performance with:
- Episodic memory (Lex Frames)
- Orchestration tools (LexRunner)
- Behavioral constraints (LexSona)

**Proof Target:** A locally-run Llama 3.3 8B agent (~8GB VRAM) or Qwen 2.5 14B (~16GB VRAM) achieving **≥85% of frontier model scores** on EsoBench.

**Why This Matters:**
- **Access over exclusivity** — No $200/month API budget or high-end GPU required
- **Architecture over parameters** — Smarter systems, not just bigger models
- **Raising the floor** — Advanced AI for students, hobbyists, and consumer hardware (RTX 4060 Ti 16GB, RX 7900 XT)

[Mission Statement →](./docs/OVERVIEW.md)

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

- **[LexRunner](https://github.com/Guffawaffle/lex-pr-runner)** — Orchestration for parallel PR workflows
- **LexSona** — Behavioral rules for AI agents *(coming soon)*

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
2. **Local overlay:** `.smartergpt.local/prompts/`
3. **Package defaults:** `prompts/` (lowest)

```bash
# Customize locally
cp prompts/remember.md .smartergpt.local/prompts/
vim .smartergpt.local/prompts/remember.md

# Or use custom directory
LEX_CANON_DIR=/my/custom/canon lex remember ...
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LEX_LOG_LEVEL` | Log verbosity (`silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`) | `info` (tests: `silent`) |
| `LEX_LOG_PRETTY` | Pretty-print logs (`1` = enabled) | Auto-detect TTY |
| `LEX_POLICY_PATH` | Custom policy file location | `.smartergpt.local/lex/lexmap.policy.json` |
| `LEX_DB_PATH` | Database location | `.smartergpt.local/lex/memory.db` |
| `LEX_DEFAULT_BRANCH` | Override default branch detection | Auto-detect from git |
| `LEX_CANON_DIR` | Override canonical resources root | Package defaults |
| `SMARTERGPT_PROFILE` | Profile configuration path | `.smartergpt.local/profile.yml` |
| `LEX_CLI_OUTPUT_MODE` | CLI output format (`plain` or `jsonl`) | `plain` |

[Environment Configuration →](./docs/ADOPTION_GUIDE.md)

---

## 🧪 Development

### Prerequisites

- **Node.js:** v20+ LTS
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
└── .smartergpt.local/      # Local workspace (gitignored)
```

### Running Tests

```bash
npm test                     # Run all tests
npm run test:coverage       # With coverage report
npm run test:watch          # Watch mode
```

### Code Quality

```bash
npm run lint                # ESLint checks
npm run format              # Prettier formatting
npm run typecheck           # TypeScript validation
```

[Contributing Guide →](./CONTRIBUTING.md)
