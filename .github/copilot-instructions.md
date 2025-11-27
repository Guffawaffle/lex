# GitHub Copilot Instructions for Lex

## ⚠️ CRITICAL: NO GIT COMMANDS IN TESTS ⚠️

**This is the most important rule in this codebase.**

Tests MUST NOT execute `git commit` or any command chain that might invoke it.

### Why

This development environment uses **mandatory interactive GPG signing** for all git commits.
Any test that spawns `git commit` will:
- Hang indefinitely waiting for GPG passphrase
- Crash the test runner
- Potentially crash WSL2

### What Is Forbidden

```typescript
// ❌ NEVER generate this in test code
execSync("git commit -m 'test'");
execSync("git init && git add . && git commit -m 'init'");
spawnSync("git", ["commit", "-m", "test"]);
execSync("git config commit.gpgsign false"); // Even this doesn't help
```

### Quarantined Git Tests

Tests requiring git are:
- Excluded from `npm test`
- Located in `test/shared/git/`
- Run via `npm run test:git` only

---

## Build & Test

```bash
npm ci           # Install deps
npm run build    # Build
npm test         # Run tests (excludes git tests)
npm run lint     # Lint
npm run local-ci # Full CI (excludes git tests)
npm run test:git # Git tests ONLY (requires non-interactive git signing)
```

**Important:** `npm run local-ci` executes the full CI pipeline but **excludes git tests**. Git tests are quarantined and should NEVER run in CI or via `npm test`.

## Code Style

- TypeScript only in `src/`
- Zod for runtime validation
- Node.js built-in test runner
- ESM modules (.js extensions in imports)

## Architecture

- `src/memory/` - Frame storage, MCP server
- `src/policy/` - Policy validation
- `src/shared/` - Utilities, CLI
- `canon/` - Source prompts/schemas
- `rules/` - Behavioral rules (JSON)

## Commits

- Must be GPG-signed
- Imperative mood: "Add...", "Fix...", "Update..."
- Reference issues: "Fixes #123"

---

## ⚠️ SQL Safety (Curated Queries Only) ⚠️

**This is a critical rule for database code.**

All SQL must live in curated modules. No dynamic SQL from models, prompts, or application logic.

### Curated SQL Modules

Only these files may contain `db.prepare()` calls:

```
src/memory/store/queries.ts         # Frame CRUD
src/memory/store/code-unit-queries.ts  # CodeUnit CRUD
src/memory/store/db.ts              # Schema initialization
src/memory/store/backup.ts          # Backup utilities
src/memory/store/code-atlas-runs.ts # CodeAtlas run tracking
src/memory/store/images.ts          # Image storage
src/memory/mcp_server/auth/         # OAuth state storage
src/memory/mcp_server/routes/       # MCP route handlers
src/shared/cli/db.ts                # CLI database utilities
```

### What Is Forbidden

```typescript
// ❌ NEVER do this - dynamic SQL from user input
const sql = `SELECT * FROM frames WHERE ${userInput}`;
db.prepare(sql).all();

// ❌ NEVER do this - SQL in application logic
// (belongs in curated query module instead)
function myFeature() {
  db.prepare("SELECT * FROM frames").all();
}

// ❌ NEVER do this - dynamic table names
const table = getTableName();
db.prepare(`SELECT * FROM ${table}`).all();
```

### What Is Allowed

```typescript
// ✅ Use curated query modules
import { getFrameById, searchFrames } from '../store/queries.js';
const frame = getFrameById(db, frameId);

// ✅ Parameterized queries in curated modules
// (inside src/memory/store/queries.ts)
const stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
return stmt.get(frameId);
```

### Migrations

Schema changes go in `migrations/` with numbered SQL files:
- Schema changes only (CREATE TABLE, ALTER TABLE, CREATE INDEX)
- Data migrations require explicit review and approval
- See `migrations/README.md` for rules

### CI Enforcement

The `test/sql-safety.test.ts` test enforces these rules:
- Fails if `db.prepare()` appears outside curated modules
- Runs as part of `npm test`

---

## ⚠️ IP Boundary (Lex → lex-pr-runner) ⚠️

**This is a critical rule for maintaining library independence.**

Lex is a **public MIT library**. It must never import from or depend on lex-pr-runner.

### The Boundary

- **Lex (this repo):** Public library, standalone, MIT licensed
- **lex-pr-runner:** Private tool that imports FROM Lex, never the reverse

### What Is Forbidden

```typescript
// ❌ NEVER import from lex-pr-runner
import { anything } from "lex-pr-runner";
import { anything } from "@smartergpt/lex-pr-runner";

// ❌ NEVER add as dependency
// In package.json:
// "dependencies": { "lex-pr-runner": "..." }  // FORBIDDEN
```

### CI Enforcement

The `test/ip-boundary.test.ts` test enforces this:
- Scans all source files for forbidden imports
- Checks package.json for forbidden dependencies
- Runs as part of `npm test`
