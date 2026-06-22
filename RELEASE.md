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
- **@smartergpt/lex** - Main package entry point

### Subpath Exports
- **@smartergpt/lex/cli** - Programmatic CLI helpers
- **@smartergpt/lex/policy** - Policy loading and validation
- **@smartergpt/lex/atlas** - Atlas Frame generation
- **@smartergpt/lex/store** - Direct database operations
- **@smartergpt/lex/types** - Shared public types
- **@smartergpt/lex/memory** - Frame payload validation helpers

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

# Push tag (triggers release validation workflow)
git push origin "v${VERSION}"
```

### 5. Publish

The GitHub Actions release workflow (`.github/workflows/release.yml`) validates
the tag and package. npm publication is currently a manual release-manager step
after those checks pass.

The workflow currently:
1. Validate the signed tag format (vX.Y.Z)
2. Build the package and run all tests
3. Verify npm authentication with `npm whoami`
4. Run a dry-run publish to validate the package

Manual publish:

```bash
npm publish --provenance
```

The workflow includes safeguards:
- Tag must match semver format (`v*.*.*`)
- Tag signing is verified (warns if unsigned)
- npm authentication is verified before publish
- Dry-run tests the publish without actually publishing
- Actual publish requires a release manager unless the workflow is changed

## Dry-Run Testing

Before actual publication, test the package:

```bash
npm pack --dry-run  # Verify files to be included
npm pack            # Create tarball
tar -tf smartergpt-lex-*.tgz | head -30  # Inspect contents
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
   - `@smartergpt/lex` (main entry)
   - `@smartergpt/lex/cli`
   - `@smartergpt/lex/policy`
   - `@smartergpt/lex/atlas`
   - `@smartergpt/lex/store`
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
npm install /path/to/smartergpt-lex-*.tgz

# Or from npm after publishing
npm install @smartergpt/lex
```

Test imports:
```javascript
// test.mjs
import { getDb, saveFrame } from '@smartergpt/lex';
import { createProgram } from '@smartergpt/lex/cli';
import { loadPolicy } from '@smartergpt/lex/policy';
import { generateAtlasFrame } from '@smartergpt/lex/atlas';
console.log('All imports work!');
```

Run: `node test.mjs`

## Rollback Procedure

If a published version has critical bugs:

1. **Do not delete the bad version** (npm policy discourages unpublish)
2. Deprecate the broken version:
   ```bash
   npm deprecate @smartergpt/lex@<bad-version> "Critical bug, use @smartergpt/lex@<fixed-version>"
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
- Release validation on tagged releases (`.github/workflows/release.yml`)

### Automated Release Workflow

The `.github/workflows/release.yml` workflow automates release validation. npm
publishing remains manual unless the workflow publish job is explicitly enabled.

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
   - Uploads package artifact for release review

3. **Dry-Run Publish**
   - Downloads built package artifact
   - Verifies npm authentication with `npm whoami`
   - Runs dry-run publish to validate package metadata and contents
   - Leaves actual npm publication to the release manager

4. **Create GitHub Release** (`create-github-release` job)
   - Generates changelog from git commits
   - Creates GitHub release with auto-generated notes
   - Attaches changelog to release

#### Safeguards

The workflow includes multiple safeguards:
- ✅ **Tag validation**: Ensures tags follow semver format
- ✅ **Tag signing verification**: Warns if tags aren't signed (optional)
- ✅ **npm whoami check**: Verifies authentication before dry-run validation
- ✅ **Dry-run**: Tests publish without actually publishing
- ✅ **Manual publish gate**: Actual publication requires release-manager action
- ✅ **Hermetic builds**: Uses `npm ci --ignore-scripts` for reproducible builds
- ✅ **Production environment**: Requires approval if environment protection rules are configured

#### Required Secrets

Configure these secrets in GitHub repository settings:
- `NPM_TOKEN`: npm authentication token with publish permissions for dry-run checks
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

#### Testing the Workflow

On non-tag branches or manual dispatch:
- The workflow runs all validation and build steps
- The dry-run executes to verify package integrity
- Actual publishing is manual

## Post-Release

1. CHANGELOG.md is automatically updated via changesets
2. GitHub Release is created automatically
3. **MCP Registry is automatically updated** (see below)
4. Announce in relevant channels
5. Update documentation if needed

### MCP Registry Publication

The MCP (Model Context Protocol) Registry is automatically updated when a new release is published.

#### Automatic Publication

When a GitHub release is published (via the release workflow):
1. The `.github/workflows/mcp-publish.yml` workflow triggers automatically
2. Version sync: `server.json` version is synced with `package.json` version
3. Validation: `server.json` is validated against MCP schema
4. Authentication: GitHub OIDC is used for secure authentication
5. Publication: Package is published to the MCP Registry

**No manual intervention required** - the workflow handles everything automatically.

#### Manual Testing/Publication

To manually test or publish to the MCP Registry:

```bash
# Via GitHub Actions (dry run - validation only)
gh workflow run mcp-publish.yml -f dry_run=true

# Via GitHub Actions (actual publish)
gh workflow run mcp-publish.yml -f dry_run=false
```

#### Local Testing

For local testing before release:

```bash
# Install mcp-publisher
# Note: For production use, consider verifying checksums or pinning to a specific version
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz
sudo mv mcp-publisher /usr/local/bin/

# Sync versions (automated in workflow)
VERSION=$(jq -r '.version' package.json)
jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.json.tmp
mv server.json.tmp server.json

# Validate server.json
mcp-publisher validate

# Authenticate (requires GitHub OAuth)
mcp-publisher login github

# Publish (requires authentication)
mcp-publisher publish
```

#### Version Synchronization

The workflow automatically ensures `server.json` stays in sync with `package.json`:
- Top-level `version` field
- `packages[0].version` field (npm package version)

**Important:** Both versions must match the npm package version for successful publication.

#### Registry Entry

- **Registry Name:** `io.github.guffawaffle/lex`
- **Package Name:** `@smartergpt/lex-mcp`
- **Registry Type:** npm
- **Transport:** stdio
- **Runtimes:** node

#### Troubleshooting

If MCP registry publication fails:

1. **Check GitHub OIDC permissions**: Ensure `id-token: write` permission is granted
2. **Validate server.json**: Run `mcp-publisher validate` locally
3. **Check version sync**: Ensure `server.json` versions match `package.json`
4. **Review workflow logs**: Check `.github/workflows/mcp-publish.yml` run logs
5. **Manual publish**: Use workflow dispatch with `dry_run=false`

For registry-specific issues, see [MCP Registry Documentation](https://github.com/modelcontextprotocol/registry)

## Notes

- Package uses semantic versioning (currently `0.6.0`)
- MIT license
- Repository: `https://github.com/Guffawaffle/lex.git`
- Package uses ESM (`"type": "module"`)
- Single package with subpath exports for modular access
- Compiled dist files are included for npm consumers

## Catch-Up Releases (One-Time)

If `npm run check:release-drift` reports drift between existing Git tags and GitHub releases, use this one-time catch-up table:

| Version | Git Tag | GitHub Release | Status |
|---------|---------|----------------|--------|
| v0.2.0 | ✅ | ✅ | Aligned |
| v0.3.0 | ✅ | ❌ | Needs GH release |
| v0.4.x-alpha | ✅ (8 tags) | ❌ | Skip (pre-release) |
| v0.6.0 | ✅ | ✅ | Aligned |

> **Note:** There is no v0.5.0 - the version progression skipped from v0.4.7-alpha to v0.6.0.

### Manual Catch-Up Procedure

For each missing GitHub release, create it manually via GitHub UI or CLI:

```bash
# For v0.3.0 - use prepared release notes
gh release create v0.3.0 \
  --title "v0.3.0" \
  --notes-file docs/releases/v0.3.0-release-notes.md \
  --verify-tag
```

The old one-time release catch-up guide has been archived; use the commands above if historical backfill is ever needed.

**Notes:**
- `--verify-tag` ensures the tag already exists (won't create new tags)
- Alpha releases (v0.4.x-alpha) can be skipped or marked as pre-releases
- This is a one-time catch-up; future releases will follow the standard workflow

After catch-up, `npm run check:release-drift` should pass.
