# Contributing to Lex

Thank you for your interest in contributing to Lex! This guide will help you set up your development environment and understand our development workflow.

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
```

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
├── dist/                     # Build output (generated, not committed)
├── docs/                     # Documentation
├── examples/                 # Usage examples
├── scripts/                  # Build and CI scripts
└── testing/                  # Test utilities and fixtures
```

**Key principle:** `src/` contains **only TypeScript**. All `.js` files are build artifacts in `dist/`.

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

```bash
# Run unit tests
npm test

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
 * @param path - Path to lexmap.policy.json
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

## Releasing (Maintainers Only)

```bash
# Version packages (consumes changesets)
npm run version-packages

# Build and publish
npm run release
```

---

## CI/CD

Our CI pipeline runs on every PR:

### Checks
1. **Type Check** - `npm run type-check`
2. **Lint** - `npm run lint`
3. **Format Check** - `npm run format:check`
4. **Test** - `npm test`
5. **Coverage** - `npm run check:coverage`
6. **Build** - `npm run build`
7. **No .js in src/** - `npm run guard:no-js-src`

### Local Reproduction

```bash
# Run full CI locally
npm run local-ci

# Or step-by-step
npm run type-check
npm run lint
npm run format:check
npm test
npm run check:coverage
npm run build
npm run guard:no-js-src
```

---

## Getting Help

- **Documentation**: See `docs/` directory
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
