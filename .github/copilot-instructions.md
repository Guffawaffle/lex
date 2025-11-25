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
npm run local-ci # Full CI
```

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
