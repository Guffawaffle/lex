# Canon Architecture

## Overview

The `canon/` directory is the **source of truth** for prompts and schemas in the Lex project. This document explains the architecture and rules for working with canon files.

## Directory Structure

```
lex/
├── canon/              # Source of truth (tracked in git)
│   ├── prompts/        # Prompt template sources (.md files)
│   ├── schemas/        # Schema sources (.json, .ts files)
│   └── README.md       # Canon documentation
├── prompts/            # Build artifact (gitignored, published to npm)
├── schemas/            # Build artifact (gitignored, published to npm)
└── dist/               # Compiled TypeScript (gitignored, published to npm)
```

## Build Flow

```
┌─────────────┐
│ canon/      │  Source (git tracked)
│  prompts/   │
│  schemas/   │
└──────┬──────┘
       │ npm run copy-canon (via postbuild)
       ▼
┌─────────────┐
│ prompts/    │  Build artifacts (gitignored)
│ schemas/    │  Published to npm
└─────────────┘
```

## Critical Rules

### 1. File Placement

**✅ DO:**
- Edit files in `canon/prompts/` and `canon/schemas/`
- Add new templates to `canon/prompts/`
- Add new schemas to `canon/schemas/`
- Commit changes to `canon/`

**❌ DON'T:**
- Edit files in `prompts/` or `schemas/` directly
- Commit `prompts/` or `schemas/` directories
- Reference `canon/` in production code paths

### 2. Code References

**✅ CORRECT Pattern:**

```typescript
import { join } from 'path';
import { existsSync } from 'fs';

// Primary: packaged location (works in production)
const packagedPath = join(__dirname, '../../prompts/example.md');
// Fallback: source location (works in development)
const sourcePath = join(__dirname, '../../canon/prompts/example.md');

const promptPath = existsSync(packagedPath) ? packagedPath : sourcePath;
```

**❌ WRONG Patterns:**

```typescript
// WRONG: Only reads from canon/ (breaks in production)
const path = join(__dirname, '../../canon/prompts/example.md');

// WRONG: Reads canon/ first (inverted precedence)
const path = existsSync(sourcePath) ? sourcePath : packagedPath;
```

### 3. Environment Variables

Current precedence for prompt/schema loading:

1. **`LEX_PROMPTS_DIR`** - Explicit user override (points to custom directory)
2. **`.smartergpt.local/prompts/`** - Local overlay (untracked)
3. **`prompts/`** - Package default (packaged from canon/)
4. **`canon/prompts/`** - Development fallback (source)

### 4. Git Tracking

**Tracked:**
- `canon/prompts/*.md`
- `canon/schemas/*.json`
- `canon/schemas/*.ts`
- `canon/README.md`

**Gitignored:**
- `prompts/` (entire directory)
- `schemas/` (entire directory)

**Special case:** Files in `canon/prompts/` and `canon/schemas/` must be added with `git add -f` because the gitignore pattern `prompts/` matches both locations.

## Publishing

The npm package **excludes** `canon/` (via `.npmignore`) but **includes** `prompts/` and `schemas/`.

When users install `@guffawaffle/lex`:
- ✅ They get `prompts/` and `schemas/`
- ❌ They do NOT get `canon/`

## CI Checks

### Build Determinism

Verifies that running the build twice produces identical outputs:

```bash
npm run build
cp -r prompts prompts.first
cp -r schemas schemas.first
rm -rf prompts schemas
npm run copy-canon
diff -r prompts.first prompts    # Must be identical
diff -r schemas.first schemas    # Must be identical
```

**Failure case:** Files exist in `prompts/` or `schemas/` but NOT in `canon/prompts/` or `canon/schemas/`.

### Schema Validation

Validates all JSON schemas with AJV:

```bash
npm run validate-schemas
```

All `*.json` files in `canon/schemas/` must be valid JSON Schema draft-07.

## Troubleshooting

### Problem: Build determinism fails

**Symptoms:**
```
Only in prompts.first: new-file.md
```

**Cause:** File added to `prompts/` but not to `canon/prompts/`

**Fix:**
```bash
# Move file to source
mv prompts/new-file.md canon/prompts/
git add -f canon/prompts/new-file.md
npm run copy-canon  # Rebuild
```

### Problem: Code can't find prompts in production

**Symptoms:**
- Works locally
- Fails when installed as npm package

**Cause:** Code references `canon/` which doesn't exist in published package

**Fix:** Update code to follow the correct pattern (see "Code References" above)

## Examples

### Adding a New Prompt

```bash
# 1. Create in canon (source)
echo "# My Prompt" > canon/prompts/my-prompt.md

# 2. Add to git (force due to gitignore)
git add -f canon/prompts/my-prompt.md

# 3. Build (copies to prompts/)
npm run copy-canon

# 4. Verify
ls -la prompts/my-prompt.md
```

### Adding a New Schema

```bash
# 1. Create in canon (source)
cat > canon/schemas/my-schema.json << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object"
}
EOF

# 2. Add to git (force due to gitignore)
git add -f canon/schemas/my-schema.json

# 3. Validate
npm run validate-schemas

# 4. Build (copies to schemas/)
npm run copy-canon
```

## Related Documentation

- [`canon/README.md`](../canon/README.md) - Canon directory documentation
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) - Development guide
- [`.github/workflows/determinism.yml`](../.github/workflows/determinism.yml) - Build determinism CI
- [`.github/workflows/validate-canon.yml`](../.github/workflows/validate-canon.yml) - Schema validation CI

## Summary

**Remember:**
1. Canon is the source, prompts/schemas are build artifacts
2. Edit canon, not prompts/schemas
3. Code reads prompts/schemas first, canon fallback
4. Canon is git-tracked, prompts/schemas are gitignored
5. npm publishes prompts/schemas, NOT canon
