# Contributing to Lex

Thank you for your interest in contributing to Lex! This guide will help you set up your development environment and understand our development workflow.

---

## Commit Signing Policy (Mandatory)

**All commits to this repository MUST be GPG-signed.**

Before committing, ensure:
1. GPG key is configured: `git config user.signingkey <YOUR_KEY_ID>`
2. GPG_TTY is set in your shell: `export GPG_TTY=$(tty)`
3. Commits are signed: Use `git commit -S` or enable auto-signing with `git config commit.gpgsign true`

**Verification:** Run `git log --show-signature -1` to confirm signature presence.

**Troubleshooting:**
- If you see "gpg failed to sign the data": Check `gpg --list-secret-keys` and verify `git config user.signingkey` is correct
- If key is set to `--unset`: Run `git config user.signingkey <YOUR_KEY_ID>` to fix

---

## Development Environment

### Prerequisites

- **Node.js**: 20.x or 22.x (we recommend 22 for development)
- **npm**: 9+ (comes with Node.js)
- **Git**: 2.30+

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/Guffawaffle/lex.git
cd lex

# Install dependencies
npm ci

# Build the project
npm run build

# Run tests
npm test

# Run full local CI (includes lint, type-check, test)
npm run local-ci

# Run slow CLI tests (opt-in, takes ~30s)
npm run test:cli:slow
```

**Note on slow tests:** The `test:cli:slow` script runs slow CLI tests that are excluded from the default test suite. These tests validate progress reporting for large exports and take approximately 30 seconds to complete.

### Node Version Management

We provide a `.nvmrc` file for Node version management:

```bash
# If using nvm
nvm use

# If using fnm
fnm use
```

---

## Project Structure

```
lex/
├── src/                      # TypeScript source (TS-only, no .js)
│   ├── cli/                  # CLI commands (references all modules)
│   ├── memory/               # Frame storage and MCP server
│   │   ├── store/            # SQLite storage layer
│   │   ├── renderer/         # Memory card rendering
│   │   └── mcp_server/       # MCP stdio interface
│   ├── policy/               # Policy checking and merging
│   │   ├── check/            # Policy validation
│   │   └── merge/            # Fact merging
│   └── shared/               # Shared utilities
│       ├── types/            # Core TypeScript types
│       ├── policy/           # Policy loading
│       ├── atlas/            # Atlas frame generation
│       ├── aliases/          # Module ID alias resolution
│       ├── module_ids/       # Module ID validation
│       └── cli/              # CLI entry point
├── canon/                    # Canonical source (tracked in git)
│   ├── prompts/              # Prompt templates (source)
│   └── schemas/              # JSON schemas (source)
├── prompts/                  # Build artifact (gitignored, published)
├── schemas/                  # Build artifact (gitignored, published)
├── dist/                     # Build output (generated, not committed)
├── docs/                     # Documentation
├── examples/                 # Usage examples
├── scripts/                  # Build and CI scripts
└── testing/                  # Test utilities and fixtures
```

**Key principles:**
- `src/` contains **only TypeScript**. All `.js` files are build artifacts in `dist/`.
- `canon/` is the **source of truth** for prompts and schemas (tracked in git).
- `prompts/` and `schemas/` are **build artifacts** (gitignored, packaged for distribution).
- **Code must read from `prompts/` and `schemas/`** (packaged locations), with fallback to `canon/` for development.

---

## Common Commands

### Building

```bash
# Clean build
npm run clean
npm run build

# Incremental build (faster after first build)
npm run build

# Type-check without emitting files
npm run type-check
```

### Testing

> ⚠️ **CRITICAL: NO GIT COMMANDS IN TESTS** ⚠️
>
> **Tests MUST NOT execute git commands or any command chain that might invoke git commit.**
>
> This environment uses **mandatory interactive GPG signing** for all commits.
> Any test that spawns `git commit` will hang indefinitely waiting for GPG input,
> crashing the test runner and potentially the entire WSL2 environment.
>
> **Forbidden in test code:**
> - `execSync("git commit ...")`
> - `execSync("git init ...")` followed by commits
> - Any shell command that might trigger a commit hook
> - Spawning processes that interact with git commit signing
>
> **Tests that require git operations are quarantined:**
> - Located in `test/shared/git/` directory
> - Run separately via `npm run test:git` (NOT part of `npm test`)
> - Must include warning comment at top of file

```bash
# Run unit tests (excludes git-related tests)
npm test

# Run git-related tests ONLY (requires non-interactive git signing)
npm run test:git

# Run git tests in fast mode (reduced workload for iteration)
LEX_CLI_EXPORT_TEST_MODE=fast npm run test:git

# Run integration tests
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Run tests with coverage
npm run coverage

# Check coverage thresholds
npm run check:coverage

# Run consumer smoke test
npm run test:smoke
```

### Linting & Formatting

```bash
# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Lint Budget

We maintain a **lint warning baseline** to prevent quality erosion. CI will fail if your changes introduce new warnings or errors.

```bash
# Check against baseline (same as CI)
npm run lint:baseline:check

# Update baseline (after fixing warnings or when intentional)
npm run lint:baseline:update
```

**How it works:**
- `lint-baseline.json` tracks the current count of warnings/errors
- CI compares your changes against this baseline
- New warnings/errors = CI failure
- Reducing warnings = ✅ encouraged!

**When to update baseline:**
- After fixing lint warnings (to lock in improvements)
- When adding intentional warnings during refactoring (with team approval)
- After updating ESLint rules that generate new warnings

**Current baseline:** 769 warnings, 1 error (as of v0.3.0)

**Top offenders:**
- `@typescript-eslint/no-unsafe-*` rules (unsafe any usage)
- `@typescript-eslint/strict-boolean-expressions` (nullable checks)
- Files: `policy/scanners/test_scanners.ts`, `shared/cli/*.ts`, `memory/mcp_server/*.ts`

### Local CI

Run the full CI pipeline locally before pushing:

```bash
# Standard local CI (uses Docker)
npm run local-ci

# Local CI with no network (stricter)
npm run local-ci:nonet
```

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `chore/` - Maintenance tasks
- `docs/` - Documentation updates

### 2. Make Changes

- Write TypeScript code in `src/`
- Add tests for new functionality
- Update documentation if needed
- Run `npm run build` to verify compilation

### 3. Test Locally

```bash
# Run tests
npm test

# Check types
npm run type-check

# Lint code
npm run lint

# Run full CI (recommended before pushing)
npm run local-ci
```

### 4. Commit Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature
git commit -m "feat(memory): add frame expiration support"

# Bug fix
git commit -m "fix(policy): handle circular dependencies in policy graph"

# Documentation
git commit -m "docs: update README with new CLI commands"

# Chore
git commit -m "chore(deps): upgrade TypeScript to 5.9.3"

# Breaking change
git commit -m "feat(api)!: change Frame interface to use ISO timestamps"
```

Commit message format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `chore` - Maintenance
- `refactor` - Code restructuring
- `test` - Test updates
- `ci` - CI/CD changes

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots/logs if relevant
- Checklist of acceptance criteria

---

## Adding a New Module

Lex uses TypeScript project references for modular builds. To add a new module:

### 1. Create Module Directory

```bash
mkdir -p src/new-area/new-module
```

### 2. Create `tsconfig.json`

`src/new-area/new-module/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "../../../dist/new-area/new-module"
  },
  "references": [
    { "path": "../../shared/types" }
  ],
  "include": ["./**/*.ts"]
}
```

### 3. Add Reference to Build Config

Edit `tsconfig.build.json` and add:

```json
{
  "references": [
    // ... existing references
    { "path": "./src/new-area/new-module" }
  ]
}
```

### 4. Add Exports to `package.json`

If the module should be publicly accessible:

```json
{
  "exports": {
    "./new-area/new-module": {
      "types": "./dist/new-area/new-module/index.d.ts",
      "import": "./dist/new-area/new-module/index.js"
    }
  }
}
```

### 5. Build and Test

```bash
npm run build
npm test
```

---

## Code Style

### TypeScript

- Use **explicit return types** for public functions
- Prefer **interfaces** for public APIs, **types** for internal structures
- Use **explicit `.js` extensions** in imports (required for NodeNext)
- Avoid `any` - use `unknown` when type is truly unknown
- Document public APIs with JSDoc comments

Example:

```typescript
/**
 * Load and validate a policy file.
 *
 * @param path - Path to policy file (defaults to .smartergpt/lex/lexmap.policy.json)
 * @returns Validated policy object
 * @throws {PolicyValidationError} If policy is invalid
 */
export function loadPolicy(path: string): Policy {
  // Implementation
}
```

### Import Conventions

```typescript
// ✅ Correct (explicit .js for local files)
import { foo } from "./utils.js";
import { bar } from "../types/index.js";

// ❌ Wrong (missing extension)
import { foo } from "./utils";

// ✅ Correct (no extension for node_modules)
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
```

### Testing

- Place tests next to source files: `foo.ts` → `foo.test.ts`
- Use descriptive test names: `test("should reject frames with invalid module IDs", ...)`
- Test edge cases and error conditions
- Prefer unit tests over integration tests when possible
- Use `testing/fixtures/` for shared test data

---

## Pull Request Guidelines

### Before Opening a PR

- [ ] All tests pass (`npm test`)
- [ ] Types check (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Lint budget check passes (`npm run lint:baseline:check`)
- [ ] Local CI passes (`npm run local-ci`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation updated (if needed)
- [ ] Changeset added (if user-facing change)

### PR Description Template

```markdown
## Description
Brief summary of changes

## Related Issues
Fixes #123

## Changes
- Added X
- Fixed Y
- Updated Z

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing performed

## Screenshots/Logs
(if applicable)

## Checklist
- [ ] Tests pass
- [ ] Docs updated
- [ ] Changeset added
- [ ] No breaking changes (or documented)
```

### Review Process

1. Automated CI checks must pass
2. At least one maintainer approval required
3. All review comments addressed
4. Squash merge preferred (clean history)

---

## Changesets

We use [changesets](https://github.com/changesets/changesets) for version management.

### When to Add a Changeset

Add a changeset if your PR includes:
- New features
- Bug fixes
- Breaking changes
- Dependency updates affecting users

### How to Add a Changeset

```bash
npm run changeset
```

Follow the prompts:
1. Select packages affected (usually just `lex`)
2. Choose version bump type:
   - `patch` - Bug fixes, non-breaking changes (0.0.X)
   - `minor` - New features, non-breaking (0.X.0)
   - `major` - Breaking changes (X.0.0)
3. Write a user-facing description

This creates a file in `.changeset/` that will be included in the next release.

---

## Release Process

For detailed release instructions, see the [Release Checklist (RELEASE.md)](./RELEASE.md).

### Quick Reference (Maintainers Only)

```bash
# Version packages (consumes changesets)
npm run version-packages

# Build and publish
npm run release
```

### Release Steps Summary

1. **Version bump** in `package.json` via changesets
2. **CHANGELOG update** (auto-generated by changesets)
3. **Create signed Git tag** (format: `v0.X.Y`)
4. **Push tag** to trigger automated npm publish
5. **GitHub Release** created automatically

**Tag format:** `v0.X.Y` (e.g., `v0.6.0`, `v0.4.7-alpha`)

For the complete release workflow, tag signing, and rollback procedures, see [RELEASE.md](./RELEASE.md).

---

## CI/CD

Our CI pipeline runs on every PR:

### Checks
1. **Type Check** - `npm run type-check`
2. **Lint** - `npm run lint`
3. **Lint Budget** - `npm run lint:baseline:check` (fails on warning increase)
4. **Format Check** - `npm run format:check`
5. **Test** - `npm test`
6. **Coverage** - `npm run check:coverage`
7. **Build** - `npm run build`
8. **No .js in src/** - `npm run guard:no-js-src`

### Local Reproduction

```bash
# Run full CI locally
npm run local-ci

# Or step-by-step
npm run type-check
npm run lint
npm run lint:baseline:check
npm run format:check
npm test
npm run check:coverage
npm run build
npm run guard:no-js-src
```

---

## Getting Help

- **Documentation**: See [docs/](./docs/) directory
- **Quick Start**: [QUICK_START.md](./QUICK_START.md)
- **Security Policy**: [SECURITY.md](./SECURITY.md)
- **Release Process**: [RELEASE.md](./RELEASE.md)
- **Issues**: [GitHub Issues](https://github.com/Guffawaffle/lex/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Guffawaffle/lex/discussions)

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help create a welcoming community

---

## License

By contributing to Lex, you agree that your contributions will be licensed under the MIT License.
