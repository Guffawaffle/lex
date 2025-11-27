# Release Checklist

This document outlines the process for releasing the Lex package.

> **Note:** After PR #91, Lex is now a single package instead of a monorepo. The release process has been simplified.

## Version Alignment Check

Before any release work, verify that package.json version and Git tags are aligned:

```bash
npm run check:release-drift
```

This script will:
- ✅ Exit 0 if a tag exists for the current package.json version
- ❌ Exit 1 if no tag exists (drift detected), with instructions to fix

Run this check:
- Before tagging a release
- After bumping package.json version
- As part of CI on version-changing PRs (optional)

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

The GitHub Actions release workflow (`.github/workflows/release.yml`) will automatically:
1. Validate the signed tag format (vX.Y.Z)
2. Build the package and run all tests
3. Verify npm authentication with `npm whoami`
4. Run a dry-run publish to validate the package
5. Publish to npm with provenance attestation
6. Create GitHub release with auto-generated changelog

The workflow includes safeguards:
- Tag must match semver format (`v*.*.*`)
- Tag signing is verified (warns if unsigned)
- npm authentication is verified before publish
- Dry-run tests the publish without actually publishing
- Actual publish only happens on tag push events

## Dry-Run Testing

Before actual publication, test the package:

```bash
npm pack --dry-run  # Verify files to be included
npm pack            # Create tarball
tar -tf lex-*.tgz | head -30  # Inspect contents
```

## Consumer Smoke Test

An automated smoke test verifies that the package can be installed and its subpath exports work correctly.

### Running the Smoke Test

```bash
npm run test:smoke
```

This script will:
1. Build the package (`npm run build`)
2. Create a tarball (`npm pack`)
3. Install the tarball in a temporary test project
4. Test imports from all representative subpaths:
   - `lex` (main entry)
   - `lex/cli`
   - `lex/policy/*`
5. Clean up temporary files

### Manual Smoke Test

You can also manually test the package:

```bash
# Create tarball
npm pack

# Create test project
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
import { getDb, saveFrame } from 'lex';
import { createProgram } from 'lex/cli';
import { detectViolations } from 'lex/policy/check/violations.js';
import { mergeScans } from 'lex/policy/merge/merge.js';
console.log('All imports work!');
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

### Automated Release Workflow

The `.github/workflows/release.yml` workflow automates the publishing process:

#### Trigger
- **Tag push**: When a tag matching `v*.*.*` (e.g., `v0.2.0`) is pushed
- **Manual dispatch**: Can be manually triggered via GitHub Actions UI

#### Workflow Steps

1. **Validate Tag** (`validate-tag` job)
   - Verifies tag follows semver format (`vX.Y.Z`)
   - Checks if tag is signed (warns but doesn't fail)
   - Ensures tag authenticity and format compliance

2. **Build & Test** (`build-and-test` job)
   - Installs dependencies hermetically (`npm ci --ignore-scripts`)
   - Builds native dependencies (better-sqlite3)
   - Compiles TypeScript (`npm run build`)
   - Runs full test suite (`npm run test:all`)
   - Creates npm tarball (`npm pack`)
   - Uploads package artifact for publishing

3. **Publish to npm** (`publish-npm` job)
   - Downloads built package artifact
   - **Verifies npm authentication** with `npm whoami`
   - **Runs dry-run publish** to validate package before actual publish
   - Publishes to npm with provenance attestation (only on tag push)
   - Uses `NPM_TOKEN` secret for authentication
   - Publishes with `--provenance` flag for supply chain security

4. **Create GitHub Release** (`create-github-release` job)
   - Generates changelog from git commits
   - Creates GitHub release with auto-generated notes
   - Attaches changelog to release

#### Safeguards

The workflow includes multiple safeguards:
- ✅ **Tag validation**: Ensures tags follow semver format
- ✅ **Tag signing verification**: Warns if tags aren't signed (optional)
- ✅ **npm whoami check**: Verifies authentication before publishing
- ✅ **Dry-run**: Tests publish without actually publishing
- ✅ **Conditional publish**: Only publishes on tag push, not manual dispatch
- ✅ **Provenance attestation**: Links published package to source code and build
- ✅ **Hermetic builds**: Uses `npm ci --ignore-scripts` for reproducible builds
- ✅ **Production environment**: Requires approval if environment protection rules are configured

#### Required Secrets

Configure these secrets in GitHub repository settings:
- `NPM_TOKEN`: npm authentication token with publish permissions
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

#### Testing the Workflow

On non-tag branches or manual dispatch:
- The workflow runs all validation and build steps
- The dry-run executes to verify package integrity
- Actual publishing is skipped (conditional on tag push)

## Post-Release

1. CHANGELOG.md is automatically updated via changesets
2. GitHub Release is created automatically
3. Announce in relevant channels
4. Update documentation if needed

## Notes

- Package uses semantic versioning (currently `0.6.0`)
- MIT license
- Repository: `https://github.com/Guffawaffle/lex.git`
- Package uses ESM (`"type": "module"`)
- Single package with subpath exports for modular access
- Compiled dist files are included for npm consumers

## Catch-Up Releases (One-Time)

As of 2025-11-27, there is drift between existing Git tags and GitHub releases:

| Version | Git Tag | GitHub Release | Status |
|---------|---------|----------------|--------|
| v0.2.0 | ✅ | ✅ | Aligned |
| v0.3.0 | ✅ | ❌ | Needs GH release |
| v0.4.x-alpha | ✅ (8 tags) | ❌ | Skip (pre-release) |
| v0.6.0 | ✅ | ❌ | Needs GH release |

### Manual Catch-Up Procedure

For each missing GitHub release, create it manually via GitHub UI or CLI:

```bash
# Example: Create GitHub release for existing tag v0.6.0
gh release create v0.6.0 \
  --title "v0.6.0" \
  --notes "See CHANGELOG.md for details." \
  --verify-tag

# For v0.3.0 (historical)
gh release create v0.3.0 \
  --title "v0.3.0" \
  --notes "Historical release. See git log for changes." \
  --verify-tag
```

**Notes:**
- `--verify-tag` ensures the tag already exists (won't create new tags)
- Alpha releases (v0.4.x-alpha) can be skipped or marked as pre-releases
- This is a one-time catch-up; future releases will follow the standard workflow

After catch-up, `npm run check:release-drift` should pass.
