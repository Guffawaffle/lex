# Implementation Summary: Repository Hardening

> **Note:** This document was created during the repository hardening phase. The repository has since been consolidated from a monorepo to a single package (PR #91). Core infrastructure (CI, security, release workflows) remains as described here, but package structure has changed from multiple `@lex/*` packages to a single `lex` package.

## ✅ Completed

### Core Configuration Files
- ✅ `.github/workflows/ci.yml` - Hermetic CI with hardened runners, Linux + Node 20/22 only
- ✅ `.github/workflows/security.yml` - CodeQL, Snyk, and OpenSSF Scorecard scanning
- ✅ `.github/workflows/release.yml` - Automated releases with npm provenance and signed tag verification
- ✅ `.github/workflows/dependency-updates.yml` - Weekly dependency update reports
- ✅ `.github/dependabot.yml` - Daily security updates targeting `staging` branch
- ✅ `.github/codeql/codeql-config.yml` - CodeQL security scanning configuration
- ✅ `.github/CODEOWNERS` - Code ownership for maintainer approval
- ✅ `SECURITY.md` - Comprehensive security policy
- ✅ `.changeset/config.json` - Changesets configuration for `staging` → `main` workflow
- ✅ `.changeset/README.md` - Changeset usage documentation
- ✅ `.eslintrc.json` - ESLint with TypeScript support
- ✅ `.prettierrc.json` - Code formatting configuration
- ✅ `.commitlintrc.json` - Conventional commit validation

### Package Updates
- ✅ Added npm scripts: `lint`, `format`, `type-check`, `changeset`, `version-packages`, `release`
- ✅ Installed dev dependencies: changesets, commitlint, eslint, prettier

### Documentation
- ✅ Updated `REPO_HARDENING_PLAN.md` to reflect `staging` → `main` workflow
- ✅ Created `scripts/setup-hardening.sh` - Bootstrap script for Phase 1

## 🎯 Key Changes from Original Plan

### 1. **Branch Strategy**
- **Before**: `main` (default) → `next` → `rc/*` → `nightly`
- **After**: `staging` (default) → weekly release PR → `main` (releases only)
- **Why**: Aligns with Wednesday release cadence, minimizes branch complexity

### 2. **CI Matrix**
- **Before**: Linux/macOS/Windows × Node 18/20/22
- **After**: Linux only × Node 20/22
- **Why**: Faster CI, lower cost, Node 18 EOL. Can add multi-OS later.

### 3. **Commit Signature Verification**
- **Before**: Custom workflow to verify all commits via `git verify-commit`
- **After**: GitHub branch protection "Require signed commits" only
- **Why**: Avoids importing contributor GPG keys in CI, flaky workflow

### 4. **Coverage Gates**
- **Before**: Hard 80% global coverage requirement
- **After**: Codecov patch/diff coverage, fail_ci_if_error=false (aspirational)
- **Why**: Enables incremental improvement without blocking progress

### 5. **Security Scanning**
- **Before**: Snyk on every PR
- **After**: Snyk on schedule + main pushes, CodeQL in separate workflow
- **Why**: Reduces PR CI bloat, keeps security scanning comprehensive

### 6. **Nightly Builds**
- **Before**: Daily nightly publishes to npm registry
- **After**: Removed (can add on-demand pre-releases later)
- **Why**: Avoids npm registry noise, sticky nightly tags

### 7. **Dependency Updates**
- **Before**: `npm-check-updates` in PR CI
- **After**: Weekly scheduled workflow creating update reports
- **Why**: Less PR noise, grouped updates for easier review

### 8. **Hermetic CI**
- **Added**: `step-security/harden-runner@v2` with egress auditing
- **Added**: `npm ci --ignore-scripts` for supply chain security
- **Why**: Prevents network access during builds, supply chain hardening

### 9. **Version Management**
- **Before**: Manual version bumps, bespoke publish scripts
- **After**: Changesets for workspace-aware version bumps and publishing
- **Why**: Handles monorepo dependency graph correctly, automated changelog

## 📋 Manual Steps Required

### 1. GitHub Repository Settings

#### Branch Protection (requires admin)
```
Settings → Branches → Add rule for "main":
  ✅ Require pull request reviews (1 approval - @Guffawaffle)
  ✅ Require status checks: all-checks-pass
  ✅ Require signed commits
  ✅ Require linear history
  ✅ Lock branch (no force push/delete)

  Note: Increase to 2 approvals when additional maintainers join

Settings → Branches → Add rule for "staging":
  ✅ Require pull request reviews (1 approval)
  ✅ Require status checks: all-checks-pass
  ✅ Require signed commits
  ✅ Require linear history
```

#### Security Features
```
Settings → Security:
  ✅ Enable Dependabot alerts
  ✅ Enable Dependabot security updates
  ✅ Enable CodeQL scanning
```

### 2. GitHub Secrets

Add these in Settings → Secrets → Actions:

```
NPM_TOKEN - npm publish token with publish access
CODECOV_TOKEN - codecov.io token for coverage reporting
SNYK_TOKEN - (optional) snyk.io token for enhanced scanning
```

### 3. Create `staging` Branch

If it doesn't exist:

```bash
git checkout -b staging
git push origin staging

# Set as default branch
gh repo edit --default-branch staging
```

### 4. GPG Commit Signing Setup

For each maintainer:

```bash
# 1. Generate key
gpg --full-generate-key
# Choose: RSA 4096, GitHub email

# 2. Get key ID
gpg --list-secret-keys --keyid-format=long

# 3. Export and add to GitHub
gpg --armor --export KEY_ID | gh gpg-key add -

# 4. Configure git
git config --global user.signingkey KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

### 5. First Changeset (Test)

```bash
# Make a change
echo "test" > test.txt

# Create changeset
npx changeset
# Select packages, type (patch), add summary

# Commit
git add .
git commit -m "chore: test changeset workflow"
```

## 🚀 Weekly Release Workflow

### Every Wednesday:

```bash
# 1. Generate version bumps from changesets
npx changeset version

# 2. Review CHANGELOG.md updates in each package

# 3. Commit version changes
git add .
git commit -m "chore(release): version packages"
git push origin staging

# 4. Create release PR
gh pr create \
  --base main \
  --head staging \
  --title "Release $(date +%Y-%m-%d)" \
  --body "Weekly release - see CHANGELOG.md files"

# 5. After PR approved and merged to main:
git checkout main
git pull

# 6. Create signed tag
VERSION=$(node -p "require('./package.json').version")
git tag -s "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"

# 7. GitHub Actions will automatically:
#    - Validate signed tag
#    - Build and test
#    - Publish to npm with provenance
#    - Create GitHub release
```

## 🧪 Testing the Setup

```bash
# Run all checks locally
npm run lint
npm run type-check
npm run build
npm test

# Test changesets
npx changeset

# Test commitlint
echo "test: this is a test" | npx commitlint

# Test prettier
npm run format:check
```

## 📊 Monitoring

Track these metrics:

- **Codecov**: https://codecov.io/gh/Guffawaffle/lex
- **Snyk**: https://app.snyk.io/org/guffawaffle/
- **OpenSSF Scorecard**: GitHub Security tab
- **GitHub Actions**: .github/workflows status badges

## 🔄 Next Steps

1. **This PR**: Merge hardening infrastructure to `staging`
2. **Week 1**: Set up GPG signing, enable branch protection
3. **Week 2**: Test first release workflow
4. **Week 3**: Add Windows/macOS to CI matrix (optional)
5. **Week 4**: Achieve 75% diff coverage threshold

## 📚 References

- **Changesets**: https://github.com/changesets/changesets
- **Step Security**: https://github.com/step-security/harden-runner
- **OpenSSF Scorecard**: https://github.com/ossf/scorecard
- **npm Provenance**: https://docs.npmjs.com/generating-provenance-statements

---

**Status**: Ready for implementation
**Next Action**: Review files, commit to `staging`, enable GitHub settings
