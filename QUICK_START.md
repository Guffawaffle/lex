# 🚀 Repository Hardening - Quick Start

This guide gets you started with the new security and workflow infrastructure.

## ✅ What's Been Set Up

### New Files Created:
- `.github/workflows/ci.yml` - Hermetic CI with hardened runners
- `.github/workflows/security.yml` - CodeQL, Snyk, OpenSSF Scorecard
- `.github/workflows/release.yml` - Automated npm publishing with provenance
- `.github/workflows/dependency-updates.yml` - Weekly update reports
- `.github/dependabot.yml` - Daily security updates
- `.github/CODEOWNERS` - Maintainer approval workflow
- `.changeset/` - Version management for monorepo
- `SECURITY.md` - Security policy for vulnerability reporting
- `eslint.config.mjs` - Code linting
- `.prettierrc.json` - Code formatting
- `.commitlintrc.json` - Commit message validation
- `scripts/setup-hardening.sh` - Automated setup script

## 🎯 Immediate Actions (This Week)

### 1. Run the Setup Script

```bash
./scripts/setup-hardening.sh
```

This will check your environment and guide you through GPG setup.

### 2. Set Up GPG Signing (5 minutes)

```bash
# Generate GPG key
gpg --full-generate-key
# Choose: (1) RSA and RSA, (4096), (0 = never expires)
# Use your GitHub email address

# Get your key ID
gpg --list-secret-keys --keyid-format=long
# Look for: sec   rsa4096/YOUR_KEY_ID

# Export public key
gpg --armor --export YOUR_KEY_ID

# Add to GitHub
# Go to: https://github.com/settings/keys → New GPG key
# Paste the key

# Configure git
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# Test it
git commit --allow-empty -S -m "test: signed commit"
git verify-commit HEAD
```

### 3. Enable GitHub Security Features (requires repo admin)

Go to https://github.com/Guffawaffle/lex/settings:

**Security & analysis:**
- ✅ Dependency graph (enabled by default)
- ✅ Dependabot alerts → Enable
- ✅ Dependabot security updates → Enable
- ✅ Code scanning → Set up → CodeQL analysis

**Branches:**
- Add rule for `main`:
  - Branch name pattern: `main`
  - ✅ Require pull request reviews (1 approval from @Guffawaffle)
  - ✅ Require status checks: `all-checks-pass`
  - ✅ Require signed commits
  - ✅ Require linear history
  - ✅ Do not allow bypassing the above settings
  - ✅ Restrict who can push (maintainers only)
  - ✅ Lock branch
  - **Note**: Increase to 2 approvals when more maintainers join

- Add rule for `staging`:
  - Branch name pattern: `staging`
  - ✅ Require pull request reviews (1)
  - ✅ Require status checks: `all-checks-pass`
  - ✅ Require signed commits
  - ✅ Require linear history

### 4. Add GitHub Secrets

Settings → Secrets and variables → Actions → New repository secret:

```
NPM_TOKEN - Get from https://www.npmjs.com/settings/[username]/tokens
            (Create "Automation" token with "Publish" permission)

CODECOV_TOKEN - Get from https://codecov.io/gh/Guffawaffle/lex/settings
                (After signing up/in)

SNYK_TOKEN - (Optional) Get from https://app.snyk.io/account
```

### 5. Create `staging` Branch (if not exists)

```bash
# Create staging from current branch
git checkout -b staging
git push origin staging

# Set as default branch
gh repo edit --default-branch staging

# Or via web: Settings → Branches → Default branch → Switch to staging
```

## 📝 Using Changesets (Version Management)

### When You Make Changes:

```bash
# After making changes that should be released:
npx changeset

# It will ask:
# 1. Which packages changed? (spacebar to select)
# 2. Is this a major/minor/patch change?
# 3. What changed? (write a summary for CHANGELOG)

# Commit the changeset
git add .changeset/
git commit -m "chore: add changeset for feature X"
```

### Example Changeset Workflow:

```bash
# 1. Make a change to the CLI
vim src/shared/cli/lex.ts

# 2. Create changeset
npx changeset
# Select: lex (single package)
# Type: minor (new feature)
# Summary: "Add new --format flag for output formatting"

# 3. Commit
git add .
git commit -m "feat(cli): add format flag"
git push origin my-feature-branch

# 4. Create PR to staging
gh pr create --base staging --title "feat(cli): add format flag"
```

## 🗓️ Wednesday Release Workflow

### Every Wednesday (or as needed):

```bash
# 1. Generate version bumps from all changesets
npx changeset version

# This updates:
# - All package.json versions
# - CHANGELOG.md files
# - Removes consumed changesets

# 2. Review the changes
git diff

# 3. Commit version bumps
git add .
git commit -m "chore(release): version packages"
git push origin staging

# 4. Create Release PR
gh pr create \
  --base main \
  --head staging \
  --title "Release $(date +%Y-%m-%d)" \
  --body "Weekly release. See CHANGELOG.md files for details."

# 5. After PR is merged to main:
git checkout main
git pull origin main

# 6. Tag the release (with GPG signature)
VERSION=$(cat package.json | grep '"version"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
git tag -s "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"

# 7. CI automatically publishes to npm! 🎉
```

## 🧪 Testing Your Setup

```bash
# Run all checks
npm run lint          # ESLint (optional, may need config)
npm run type-check    # TypeScript
npm run build         # Build all packages
npm test              # Run tests

# Test formatting
npm run format:check  # Check if files need formatting
npm run format        # Auto-format files

# Test commit message format
echo "feat(cli): test message" | npx commitlint

# Test changeset
npx changeset         # Create a test changeset
```

## 🔍 Monitoring & Metrics

After first release:

- **GitHub Actions**: https://github.com/Guffawaffle/lex/actions
- **Codecov**: https://codecov.io/gh/Guffawaffle/lex
- **npm packages**: https://www.npmjs.com/~guffawaffle
- **Security**: https://github.com/Guffawaffle/lex/security

## 🆘 Troubleshooting

### GPG "no secret key" error
```bash
# Make sure you exported the key
gpg --list-secret-keys --keyid-format=long

# Make sure git is configured
git config --global user.signingkey YOUR_KEY_ID
```

### Changesets "No packages found"
```bash
# Make sure you're in the repo root
cd /srv/lex-mcp/lex

# Run changeset
npx changeset
```

### CI failing on "all-checks-pass"
The first time you push, the workflow needs to run once to create the status check.
After that, branch protection can enforce it.

### ESLint errors
ESLint is currently optional (continue-on-error). You can skip it for now.

## 📚 Documentation

- **Full Plan**: `REPO_HARDENING_PLAN.md`
- **Implementation Details**: `IMPLEMENTATION_SUMMARY.md`
- **Changesets Guide**: `.changeset/README.md`
- **Security Policy**: `SECURITY.md`
- **Release Process**: `RELEASE.md`

## 🎉 Next Steps

1. ✅ Complete steps 1-5 above
2. Make your first signed commit
3. Create a test changeset
4. Merge this hardening PR to staging
5. Test the Wednesday release workflow
6. Monitor CI/security dashboards

---

**Questions?** Open an issue or check the docs above.
**Need help?** See `REPO_HARDENING_PLAN.md` Section 8 for detailed roadmap.
