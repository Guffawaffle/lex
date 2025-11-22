# Architecture & Design Decisions

This document explains key architectural choices in Lex, including dependency rationale, design philosophy, and future evolution plans.

---

## Design Philosophy

### Principle 1: "Dumb by Design" Scanners

Language scanners (TypeScript, Python, PHP) are intentionally **simple fact reporters**, not intelligent analyzers:

**What scanners DO:**
- Observe code and report structural facts
- Extract: classes, functions, imports, declarations
- Detect: feature flags, permission checks
- Map: files to modules (when policy provided)

**What scanners DON'T DO:**
- Make architectural decisions
- Enforce policies
- Decide if imports are allowed
- Determine if boundaries are violated

**Why:** Policy enforcement happens separately in `policy/check/`, which compares scanner facts against `lexmap.policy.json`. This separation allows:
- Scanners to be language-specific but policy-agnostic
- Policy rules to evolve without changing scanners
- Multiple scanners to produce compatible output
- Clear separation of concerns

### Principle 2: Local-First, MCP-Optional

Lex is designed as a **library first, server second**:

- **Core functionality** works entirely locally (no network required)
- **MCP server** is an optional adapter layer
- **Database** is local SQLite (no cloud dependencies)
- **Prompts/schemas** ship with package (no external fetches)

**Why:** Developers should be able to use Lex in:
- Airgapped environments
- Offline development
- CI/CD pipelines without internet access
- Privacy-sensitive projects

### Principle 3: Explicit Over Implicit

- **Module IDs** must match policy file exactly (no fuzzy matching by default)
- **Database paths** follow explicit precedence: env var → workspace → home fallback
- **Schema versions** are checked and validated (no silent upgrades)
- **Prompts/templates** use precedence chain (package → local → env override)

**Why:** When work continuity fails, debugging is easier with explicit rules than "magic" inference.

---

## Dependency Rationale

### Required Dependencies (Always Installed)

#### better-sqlite3
- **Purpose:** Embedded database for frame storage
- **Why SQLite:**
  - Zero-config (no separate database server)
  - ACID transactions (data integrity)
  - Full-text search (FTS5 for frame recall)
  - Fast for local dev workloads
- **Trade-offs:**
  - ✅ No network latency, no auth complexity
  - ❌ Not ideal for concurrent writes (fine for single-dev use)
- **Future:** PostgreSQL adapter for multi-user deployments (0.7.0+)

#### zod
- **Purpose:** Runtime type validation and schema definitions
- **Why Zod:**
  - Type-safe schema definitions
  - Runtime validation of user inputs
  - Easy integration with TypeScript
  - Clear error messages
- **Trade-offs:**
  - ✅ Prevents invalid data from entering system
  - ❌ Adds ~50KB to bundle size (acceptable for safety)
- **Future:** Core dependency, no plans to replace

#### commander
- **Purpose:** CLI argument parsing
- **Why Commander:**
  - Industry standard for Node CLIs
  - Rich features (subcommands, options, help generation)
  - Stable API (no breaking changes in years)
- **Trade-offs:**
  - ✅ Robust, well-tested
  - ❌ Slightly heavier than minimalist parsers
- **Alternative considered:** yargs (chose commander for simpler API)

---

### Heavy Dependencies (Used for Specific Features)

#### express (5.1.0) - HTTP/MCP Server
- **Purpose:** Provides MCP protocol HTTP endpoint
- **When used:** Only if you run the MCP server (`npx lex mcp`)
- **Size impact:** ~500KB with dependencies
- **Tree-shakeable:** Not imported if using library API only

**Why Express:**
- Industry standard HTTP framework
- Stable, well-audited
- v5 modernizes for async/await
- Large ecosystem for middleware

**Trade-offs:**
- ✅ Battle-tested, widely deployed
- ❌ Heavy for a "library" package
- ⚠️ Most users won't use MCP server feature

**Future improvements:**
- **0.5.0:** Make Express a **peer dependency** (user installs if needed)
- **0.6.0:** Alternative: Separate `@lex/mcp-server` package with Express included
- **Consideration:** Support multiple HTTP frameworks (Fastify, Hono) via adapters

---

#### sharp (0.34.5) - Image Processing
- **Purpose:** Frame attachments support (screenshots, diagrams in memory cards)
- **When used:** Only when saving frames with image data
- **Size impact:** ~1.5MB (includes native addons or pre-built binaries)
- **Native dependency:** Requires build tools or pre-built binaries for your platform

**Why Sharp:**
- Fastest Node.js image library (uses libvips)
- Supports resize, format conversion, optimization
- Maintains EXIF data for audit trails

**Trade-offs:**
- ✅ High-quality image processing
- ❌ Large dependency, native compilation complexity
- ⚠️ Not needed by users who only store text frames

**Future improvements:**
- **0.5.0:** Make Sharp an **optional peer dependency**
- **0.6.0:** Separate `@lex/frames-render` package
- **Alternative:** Lazy-load Sharp only when image APIs are called

---

#### shiki (3.15.0) - Syntax Highlighting
- **Purpose:** Code rendering in atlas frame visualizations
- **When used:** Only when rendering frames for display (HTML export, web UI)
- **Size impact:** ~400KB core + language grammars (user selects which to load)

**Why Shiki:**
- VS Code's syntax highlighter (TextMate grammars)
- Accurate, beautiful highlighting
- Supports 100+ languages
- No runtime parsing (pre-compiled grammars)

**Trade-offs:**
- ✅ Best-in-class syntax highlighting
- ❌ Large dependency for users who don't render frames
- ⚠️ Many users only need headless frame storage

**Future improvements:**
- **0.6.0:** Lazy-load Shiki via dynamic import
- **Alternative:** Separate `@lex/render` package with Shiki + Sharp
- **Consideration:** Plugin architecture for custom renderers

---

#### pino (9.5.0) - Structured Logging
- **Purpose:** High-performance structured logging
- **When used:** All Lex operations (configurable via `LEX_LOG_LEVEL`)
- **Size impact:** ~100KB

**Why Pino:**
- Fastest JSON logger for Node.js
- Structured logs (easy to parse/analyze)
- Low overhead (async logging)
- Industry standard for production apps

**Trade-offs:**
- ✅ Excellent for debugging and monitoring
- ❌ Heavier than simple console.log
- ✅ Essential for production deployments

**Future:** Core dependency, will keep in 0.5.0+

---

### Development/Build Dependencies (Not in Production Bundle)

- **TypeScript:** Type safety and tooling
- **Vitest:** Fast, modern test runner
- **ESLint:** Code quality and consistency
- **Prettier:** Code formatting
- **tsup:** Fast TS bundler (esbuild-based)

These are dev dependencies only and don't affect package size for users.

---

## Package Size Analysis (0.4.0-alpha)

```
Total package: 270 files, 207 KB (from npm pack)

Size breakdown:
- Core library (src/): ~120 KB
- Examples (examples/): ~15 KB
- Schemas (schemas/): ~8 KB
- Prompts (prompts/): ~12 KB
- Documentation (*.md): ~30 KB
- Dependencies (node_modules): ~4.2 MB installed

Dependency footprint:
- Required deps: ~1.8 MB (better-sqlite3, zod, commander, pino)
- Optional-use deps: ~2.4 MB (express, sharp, shiki)
```

**Comparison to similar tools:**
- **MCP memory-server:** ~50KB (minimal, no extras)
- **Lex 0.4.0-alpha:** ~207KB package, ~4.2MB with deps
- **Typical enterprise app:** ~50-200MB with deps

**Assessment:** Lex is heavier than minimal tools but reasonable for a full-featured framework.

---

## Future Modularization Plan

### Version 0.5.0 (Q1 2026) - Peer Dependencies
Make heavy optional features into peer dependencies:

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "zod": "^3.24.1",
    "commander": "^12.0.0",
    "pino": "^9.5.0"
  },
  "peerDependencies": {
    "express": "^5.1.0",
    "sharp": "^0.34.0",
    "shiki": "^3.15.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true },
    "sharp": { "optional": true },
    "shiki": { "optional": true }
  }
}
```

**Impact:**
- Users who only need headless frame storage: ~1.8MB deps
- Users who want MCP server: Install express explicitly
- Users who want image frames: Install sharp explicitly

### Version 0.6.0 (Q2 2026) - Package Split

Split into focused packages:

- **`lex-core`** - Database, types, validation (~1.8MB with deps)
  - Dependencies: better-sqlite3, zod, pino

- **`lex-cli`** - CLI commands (~300KB with deps)
  - Dependencies: lex-core, commander, inquirer

- **`lex-server`** - MCP server (~800KB with deps)
  - Dependencies: lex-core, express

- **`lex-render`** - Visualization (~2.5MB with deps)
  - Dependencies: lex-core, sharp, shiki

- **`@lex/scanners-python`** - Python scanner (separate package)
- **`@lex/scanners-php`** - PHP scanner (separate package)

**Benefits:**
- Tree-shaking friendly
- Users install only what they need
- Easier to audit dependencies per feature
- Clear separation of concerns

**Migration path:**
- `lex` meta-package continues to exist, re-exports everything (no breaking change)
- Advanced users can install `lex-core` only

### Version 0.7.0+ (Q3-Q4 2026) - Plugin Architecture

Support external plugins for:
- Custom scanners (Go, Rust, Java, etc.)
- Custom renderers (PDF, Markdown, etc.)
- Custom storage backends (PostgreSQL, S3, etc.)
- Custom authentication providers

**Plugin discovery:**
```bash
npm install lex-scanner-go
# Lex auto-discovers packages matching pattern: lex-scanner-*
```

---

## Database Design Decisions

### Why SQLite?

**Pros:**
- Zero-config (no server setup)
- ACID transactions
- Full-text search (FTS5)
- Fast for local workloads
- Single file (easy backup/transfer)
- No network latency

**Cons:**
- Limited concurrent writes
- No built-in replication
- File locking challenges on NFS
- No row-level security

**Alternative considered:** PostgreSQL
- **Rejected for 0.4.0** because it requires separate server process
- **Planned for 0.7.0** as optional backend for multi-user deployments

### Database Schema Evolution

**Current approach:** Manual migrations in code
**Future approach (0.5.0+):** Proper migration system with version tracking

Example planned migration framework:
```typescript
// migrations/001_add_audit_log.ts
export async function up(db: Database) {
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_id TEXT NOT NULL
    )
  `);
}
```

---

## Security Architecture

See `SECURITY.md` for detailed security considerations.

**Current state (0.4.0-alpha):**
- No authentication (local-only use)
- No encryption at rest (file permissions only)
- No audit logging (application logs only)

**Future state (0.5.0+):**
- Token-based authentication for MCP server
- SQLCipher for database encryption
- Structured audit logs with user attribution

---

## Testing Strategy

### Test Pyramid
- **Unit tests (80%):** Pure functions, business logic
- **Integration tests (15%):** Database operations, file I/O
- **E2E tests (5%):** CLI commands, full workflows

### Test Coverage Goals
- **0.4.0-alpha:** 556 tests passing (current)
- **0.5.0:** Add 100+ security tests (auth, encryption, validation)
- **0.6.0:** 90%+ coverage on core library

### CI/CD
- Local CI via Docker (`npm run local-ci`)
- GitHub Actions for PR validation
- No external services required (tests run offline)

---

## Performance Considerations

### Database Performance

**Current bottlenecks:**
- FTS5 full-text search on large frame sets (>10,000 frames)
- No connection pooling (single connection)
- No read replicas

**Future optimizations (0.6.0+):**
- Lazy-load FTS5 indexes
- Read-only connection pool for queries
- Pagination for large result sets

### Memory Usage

**Current usage:**
- Baseline: ~50MB (Node.js runtime)
- Per frame: ~1-5KB (text only), ~100KB-1MB (with images)
- Sharp image processing: ~50-200MB peak

**Future optimizations:**
- Streaming image processing (don't load full image in memory)
- LRU cache for frequently accessed frames
- Configurable memory limits

---

## API Stability Commitment

### Semantic Versioning (Post-1.0.0)

- **Patch (0.4.1):** Bug fixes, no API changes
- **Minor (0.5.0):** New features, backward compatible
- **Major (1.0.0):** Breaking changes

### Deprecation Policy

- Mark as `@deprecated` in code + docs
- Warn in logs when deprecated features used
- Remove 2 minor versions after deprecation
  - Example: Deprecated in 0.4.0 → removed in 0.6.0

### Current Deprecations (0.4.0-alpha)

None. (Removed deprecated FrameStore before alpha release)

---

## Related Documentation

- **Security:** See `SECURITY.md` for security posture and roadmap
- **Contributing:** See `CONTRIBUTING.md` for development workflow
- **Scanners:** See `examples/scanners/README.md` for scanner architecture
- **MCP Server:** See `src/memory/mcp_server/README.md` for MCP integration

---

**Last Updated:** November 19, 2025
**Applies to:** Lex v0.4.0-alpha
**Next Review:** After 0.5.0 release (Q1 2026)
