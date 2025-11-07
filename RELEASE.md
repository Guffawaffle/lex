# Release Checklist

This document outlines the process for releasing the Lex package.

> **Note:** After PR #91, Lex is now a single package instead of a monorepo. The release process has been simplified.

## Pre-Release Verification

### ✅ Build & Test
- [ ] Package builds successfully: `npm run build`
- [ ] All tests pass: `npm test`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] Linting passes: `npm run lint`

### ✅ Package Metadata
The package.json file should have:
- [ ] Correct `name` (lex), `version`, `license`, `repository`
- [ ] Proper `main`, `types`, and `exports` fields
- [ ] `files` array includes dist directory
- [ ] Appropriate `keywords` for discoverability
- [ ] `bin` entry for the CLI (`lex`)

## Single Package Structure

The Lex package exports multiple entry points via subpath exports:

### Main Entry
- **lex** - Main package entry point

### Subpath Exports
- **lex/cli** - CLI utilities (`dist/cli/index.js`)
- **lex/policy/\*** - Policy checking and scanning (`dist/policy/*`)
- **lex/memory/\*** - Frame storage and MCP server (`dist/memory/*`)
- **lex/shared/\*** - Shared utilities and types (`dist/shared/*`)

## Publication Process

### 1. Create a Changeset

When making changes that should be released:

```bash
npx changeset
```

Select the change type (major/minor/patch) and provide a description.

### 2. Version Bump

On release day (typically Wednesday):

```bash
# Generate version bump and CHANGELOG
npx changeset version

# Review changes
git diff

# Commit
git add .
git commit -m "chore: version bump for release"
```

### 3. Create Release PR

```bash
git push origin staging

# Create PR from staging to main
gh pr create --base main --head staging \
  --title "Release v0.X.Y" \
  --body "Weekly release - see CHANGELOG.md for details"
```

### 4. Tag and Publish

After the PR is merged to main:

```bash
git checkout main
git pull origin main

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Create signed tag
git tag -s "v${VERSION}" -m "Release v${VERSION}"

# Push tag (triggers automated npm publish)
git push origin "v${VERSION}"
```

### 5. Automated Publishing

The GitHub Actions release workflow will:
- Validate the signed tag
- Run build and tests
- Publish to npm with provenance
- Create GitHub release with changelog

## Dry-Run Testing

Before actual publication, test the package:

```bash
npm pack --dry-run  # Verify files to be included
npm pack            # Create tarball
tar -tf lex-*.tgz | head -30  # Inspect contents
```

## Consumer Smoke Test

Create a test project to verify the published package:

```bash
mkdir /tmp/lex-consumer-test
cd /tmp/lex-consumer-test
npm init -y

# Install from local tarball
npm install /path/to/lex-*.tgz

# Or from npm after publishing
npm install lex
```

Test imports:
```javascript
// test.mjs
import { FrameStore } from 'lex/memory/store';
import { loadPolicy } from 'lex/shared/policy';
console.log('Imports work!');
```

Run: `node test.mjs`

## Rollback Procedure

If a published version has critical bugs:

1. **Do not delete the bad version** (npm policy discourages unpublish)
2. Deprecate the broken version:
   ```bash
   npm deprecate lex@<bad-version> "Critical bug, use lex@<fixed-version>"
   ```
3. Publish fixed version:
   ```bash
   npm run build
   npm publish
   ```

## CI/CD Integration

The repository has automated workflows for:
- Build + tests on all PRs (`.github/workflows/ci.yml`)
- Security scanning (`.github/workflows/security.yml`)
- Automated npm publishing on tagged releases (`.github/workflows/release.yml`)

## Post-Release

1. CHANGELOG.md is automatically updated via changesets
2. GitHub Release is created automatically
3. Announce in relevant channels
4. Update documentation if needed

## Notes

- Package uses semantic versioning (currently `0.2.0`)
- MIT license
- Repository: `https://github.com/Guffawaffle/lex.git`
- Package uses ESM (`"type": "module"`)
- Single package with subpath exports for modular access
- Compiled dist files are included for npm consumers
