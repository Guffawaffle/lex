# Repository Hardening & Workflow Improvement Plan

**Version:** 1.0
**Date:** November 6, 2025
**Status:** Planning Phase

---

## Executive Summary

This document outlines a comprehensive plan to harden the Lex repository following industry-leading practices for security, CI/CD, release management, and contributor trust. The goal is to create a secure, maintainable, and trustworthy open-source project that consumers can rely on.

---

## Table of Contents

1. [Git Commit Signing](#1-git-commit-signing)
2. [Branch Strategy & Protection](#2-branch-strategy--protection)
3. [CI/CD Pipeline Enhancement](#3-cicd-pipeline-enhancement)
4. [Security Hardening](#4-security-hardening)
5. [Release Management](#5-release-management)
6. [Code Quality & Testing](#6-code-quality--testing)
7. [Documentation & Governance](#7-documentation--governance)
8. [Implementation Roadmap](#8-implementation-roadmap)

---

## 1. Git Commit Signing

### Overview
Commit signing ensures authenticity and prevents impersonation. GitHub supports GPG, SSH, and S/MIME signing.

### Recommended Approach: GPG Signing

#### Setup for Individual Contributors

```bash
# 1. Generate GPG key (if you don't have one)
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, never expires (or appropriate expiry)
# Use your GitHub email address

# 2. List keys and get the key ID
gpg --list-secret-keys --keyid-format=long
# Output shows: sec   rsa4096/YOUR_KEY_ID 2025-11-06

# 3. Export public key
gpg --armor --export YOUR_KEY_ID

# 4. Add to GitHub
# Go to: Settings → SSH and GPG keys → New GPG key
# Paste the exported key

# 5. Configure git globally
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# 6. Test it
git commit -S -m "Test signed commit"
git verify-commit HEAD
```

#### For the Repository Owner

```bash
# Add to .gitconfig or configure per-repo
cd /srv/lex-mcp/lex
git config user.signingkey YOUR_KEY_ID
git config commit.gpgsign true
git config tag.gpgsign true

# Sign previous commits (if needed, use with caution)
# git rebase --exec 'git commit --amend --no-edit -n -S' -i <commit-hash>
```

#### Repository Configuration

**Branch Protection:** Enable "Require signed commits" in GitHub settings for both `staging` and `main`.

**Tag Signing:** Verify signed tags in release workflow only (see release.yml).

> **Note:** GitHub's native branch protection handles commit signature verification. Custom GPG verification in CI is flaky (requires importing all contributor keys) and unnecessary.

---

## 2. Branch Strategy & Protection

### Recommended Branch Model

Aligned to **Wednesday weekly release cadence**:

```
staging (default, protected)
  ↓
feature/* → staging (PR, short-lived)
  ↓
Version Release PR (Wednesday) → main
  ↓
main (protected, version tags only)
```

### Branch Descriptions

| Branch | Purpose | Lifetime | Auto-deploy |
|--------|---------|----------|-------------|
| `staging` | **Default branch**, integration | Permanent | Dev preview |
| `main` | **Released versions only** (tagged) | Permanent | Production (npm) |
| `rc/v*` | Optional formal pre-releases | Until promoted | Staging (optional) |
| `feature/*` | New features | Until merged to staging | - |
| `hotfix/*` | Critical production fixes | Until merged | - |

**Key Philosophy:**
- All development merges to `staging`
- Weekly (Wednesday): Create **Release PR** from `staging` → `main`
- Release PR bumps versions, updates changelog (via Changesets)
- Merge to `main` only for version updates
- Tag releases with signed tags on `main`

### Branch Protection Rules

#### For `staging` (default branch):
```yaml
Protection Rules:
  ✅ Require pull request reviews (1 approval)
  ✅ Require status checks to pass before merging
    - unit-tests
    - integration-tests
    - type-check
    - lint
  ✅ Require signed commits
  ✅ Require linear history (squash or rebase only)
  ✅ Include administrators
  ✅ Require conversation resolution before merging
  ✅ Allow force push for maintainers (for rebasing)
```

#### For `main` (releases only):
```yaml
Protection Rules:
  ✅ Require pull request reviews (1 approval - maintainer only)
  ✅ Require all status checks to pass
    - unit-tests
    - integration-tests
    - security-scan
    - type-check
    - lint
    - validate-packages
  ✅ Require signed commits
  ✅ Require linear history (squash merge from release PR)
  ✅ Include administrators (no bypass)
  ✅ Restrict who can push (maintainers only)
  ✅ Lock branch (prevent force push & deletion)
  ✅ Require signed tags for releases
```

**Note**: When additional maintainers join, increase to 2 required approvals.

#### For `rc/*` (optional):
```yaml
Protection Rules:
  ✅ Require pull request reviews (2 approvals)
  ✅ Require all status checks to pass
  ✅ Require signed commits
  ✅ Lock branch (no force push)
```

### Implementation via GitHub API

Create `scripts/setup-branch-protection.sh`:
```bash
#!/bin/bash
# Requires: gh CLI tool (brew install gh)

REPO="Guffawaffle/lex"

# Protect main branch
gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":2,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  --field required_status_checks='{"strict":true,"contexts":["unit-tests","integration-tests","security-scan","type-check","lint"]}' \
  --field enforce_admins=true \
  --field required_linear_history=true \
  --field required_signatures=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false

echo "✅ Branch protection enabled for main"
```

---

## 3. CI/CD Pipeline Enhancement

### Current State
- Basic unit tests on PR
- Integration tests
- Runs on ubuntu-latest

### Enhanced Pipeline Architecture

```
┌─────────────────┐
│  Pull Request   │
└────────┬────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Stage 1: Quick Validation (< 2 min)       │
    │ • Lint (ESLint + Prettier)                │
    │ • Type check (TypeScript)                 │
    │ • Commit message validation               │
    │ • Dependency audit                        │
    └────┬──────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Stage 2: Build & Unit Tests (< 5 min)     │
    │ • Build all packages                      │
    │ • Run unit tests (parallel)               │
    │ • Code coverage (>80% required)           │
    └────┬──────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Stage 3: Integration Tests (< 10 min)     │
    │ • Cross-package integration               │
    │ • MCP server E2E tests                    │
    │ • CLI integration tests                   │
    └────┬──────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Stage 4: Security & Quality (< 5 min)     │
    │ • SAST (CodeQL)                           │
    │ • Dependency scanning (Dependabot)        │
    │ • License compliance check                │
    │ • Package audit (npm audit)               │
    └────┬──────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Stage 5: Publishing (main only)           │
    │ • Verify tarball contents                 │
    │ • Publish to npm (if tagged)              │
    │ • Create GitHub release                   │
    │ • Update changelog                        │
    └───────────────────────────────────────────┘
```

### Enhanced Workflow Files

#### `.github/workflows/ci.yml` (Primary CI)

```yaml
name: Continuous Integration

on:
  pull_request:
    branches: [ main, next, 'rc/**' ]
  push:
    branches: [ main, next ]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  # Stage 1: Quick Validation
  lint-and-format:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

      - name: Validate commit messages
        if: github.event_name == 'pull_request'
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.sha }}

  type-check:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run type-check

  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Audit dependencies
        run: npm audit --audit-level=moderate

      - name: Check for outdated dependencies
        run: npx npm-check-updates --errorLevel 2

  # Stage 2: Build & Unit Tests
  build-and-test:
    name: Build & Test (Node ${{ matrix.node-version }}, ${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    needs: [lint-and-format, type-check]
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: ['18', '20', '22']

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build all packages
        run: npm run build

      - name: Run unit tests with coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        if: matrix.os == 'ubuntu-latest' && matrix.node-version == '20'
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-${{ matrix.os }}-node${{ matrix.node-version }}

  # Stage 3: Integration Tests
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: build-and-test

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - name: Run integration tests
        run: npm run test:integration

      - name: Test MCP server
        run: npm run test:mcp-server

      - name: Test CLI
        run: npm run test:cli

  # Stage 4: Security Scanning
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: [lint-and-format, type-check]
    permissions:
      security-events: write
      actions: read
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-extended

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  # Package validation
  validate-packages:
    name: Validate Package Manifests
    runs-on: ubuntu-latest
    needs: build-and-test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build

      - name: Test npm pack for all packages
        run: |
          for dir in shared/* memory/* policy/*; do
            if [ -f "$dir/package.json" ]; then
              echo "Testing pack for $dir"
              cd "$dir"
              npm pack --dry-run
              cd -
            fi
          done

      - name: Verify package exports
        run: npm run test:exports

  # All checks must pass
  all-checks-pass:
    name: All Checks Passed
    runs-on: ubuntu-latest
    needs: [lint-and-format, type-check, dependency-audit, build-and-test, integration-tests, security-scan, validate-packages]
    steps:
      - run: echo "✅ All checks passed!"
```

#### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., 0.1.0)'
        required: true
        type: string

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  validate-tag:
    name: Validate Release Tag
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate semver tag
        run: |
          if [[ ! "${{ github.ref_name }}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Invalid semver tag: ${{ github.ref_name }}"
            exit 1
          fi

      - name: Verify tag is signed
        run: |
          git verify-tag ${{ github.ref_name }}

  build-and-test:
    name: Build & Test for Release
    needs: validate-tag
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm run build
      - run: npm test

      - name: Create tarballs
        run: |
          mkdir -p dist-packages
          for dir in shared/* memory/* policy/*; do
            if [ -f "$dir/package.json" ]; then
              cd "$dir"
              npm pack --pack-destination ../../dist-packages
              cd -
            fi
          done

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: npm-packages
          path: dist-packages/*.tgz
          retention-days: 7

  publish-npm:
    name: Publish to npm
    needs: build-and-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: npm-packages
          path: dist-packages

      - name: Publish packages
        run: |
          # Publish in dependency order (see RELEASE.md)
          npm publish dist-packages/lex-types-*.tgz --access public
          npm publish dist-packages/lex-git-*.tgz --access public
          # ... continue in order
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  create-github-release:
    name: Create GitHub Release
    needs: publish-npm
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          # Generate changelog between this tag and previous tag
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^)
          git log $PREV_TAG..${{ github.ref_name }} --pretty=format:"- %s (%h)" > CHANGELOG.txt

      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref_name }}
          release_name: Release ${{ github.ref_name }}
          body_path: CHANGELOG.txt
          draft: false
          prerelease: false
```

#### `.github/workflows/nightly.yml`

```yaml
name: Nightly Build

on:
  schedule:
    # Run at 2 AM UTC every day
    - cron: '0 2 * * *'
  workflow_dispatch:

permissions:
  contents: write
  packages: write

jobs:
  nightly-build:
    name: Create Nightly Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: next

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build
      - run: npm test

      - name: Update version to nightly
        run: |
          DATE=$(date +%Y%m%d)
          for dir in shared/* memory/* policy/*; do
            if [ -f "$dir/package.json" ]; then
              cd "$dir"
              npm version "0.0.0-nightly.$DATE" --no-git-tag-version
              cd -
            fi
          done

      - name: Publish to npm with nightly tag
        run: |
          for dir in shared/* memory/* policy/*; do
            if [ -f "$dir/package.json" ]; then
              cd "$dir"
              npm publish --tag nightly --access public || true
              cd -
            fi
          done
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create nightly release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: nightly-$(date +%Y%m%d)
          release_name: Nightly Build $(date +%Y-%m-%d)
          prerelease: true
```

---

## 4. Security Hardening

### Security Policy

Create `SECURITY.md`:

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via:
- Email: security@example.com (encrypted with our PGP key)
- GitHub Security Advisories (preferred)

You should receive a response within 48 hours. If the issue is confirmed, we will:
1. Acknowledge receipt within 24 hours
2. Provide a detailed response within 7 days
3. Release a fix as soon as possible
4. Credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

When using Lex packages:
- Always use the latest stable version
- Review CHANGELOG.md for security updates
- Enable Dependabot alerts
- Use signed releases only
```

### Dependabot Configuration

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  # Enable version updates for npm
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 10
    reviewers:
      - "Guffawaffle"
    assignees:
      - "Guffawaffle"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"
    labels:
      - "dependencies"
      - "automated"
    versioning-strategy: increase

  # Separate group for security updates
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    open-pull-requests-limit: 5
    labels:
      - "security"
      - "dependencies"
    # Only security updates
    allow:
      - dependency-type: "direct"
        update-types: ["security"]
      - dependency-type: "indirect"
        update-types: ["security"]

  # GitHub Actions updates
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore(ci)"
    labels:
      - "ci"
      - "dependencies"
```

### CodeQL Configuration

Create `.github/codeql/codeql-config.yml`:

```yaml
name: "CodeQL Config"

queries:
  - uses: security-extended
  - uses: security-and-quality

paths-ignore:
  - '**/node_modules'
  - '**/dist'
  - '**/*.test.ts'
  - '**/*.test.js'

query-filters:
  - exclude:
      id: js/unused-local-variable
```

### npm Package Provenance

Update package.json scripts to include provenance:

```json
{
  "scripts": {
    "publish:provenance": "npm publish --provenance --access public"
  }
}
```

This creates verifiable build provenance linking packages to source code and CI runs.

---

## 5. Release Management

### Release Cadence

Following semantic versioning and industry practices:

| Release Type | Frequency | Branch | Testing Period |
|-------------|-----------|--------|----------------|
| Major (breaking) | Yearly | main | 4 weeks (via RC) |
| Minor (features) | Bi-monthly | main | 2 weeks (via RC) |
| Patch (fixes) | As needed | main | 1 week |
| Hotfix (critical) | Immediate | main | 24-48 hours |
| Nightly | Daily | next | Unstable |

### Release Process

#### 1. Create Release Candidate

```bash
# Create RC branch
git checkout -b rc/v0.2.0-rc.1 next
git push origin rc/v0.2.0-rc.1

# Tag RC
git tag -s v0.2.0-rc.1 -m "Release candidate 0.2.0-rc.1"
git push origin v0.2.0-rc.1

# Publish RC to npm
npm publish --tag rc --access public
```

#### 2. Testing Period

- Deploy to staging environment
- Run extended test suite
- Invite beta testers
- Monitor for issues
- Fix critical bugs in RC branch

#### 3. Promote to Release

```bash
# Merge RC to main
git checkout main
git merge --no-ff rc/v0.2.0-rc.1

# Tag release
git tag -s v0.2.0 -m "Release 0.2.0"
git push origin v0.2.0

# CI automatically publishes to npm
```

### Changelog Automation

Create `.github/workflows/changelog.yml`:

```yaml
name: Update Changelog

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  update-changelog:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update CHANGELOG.md
        uses: release-drafter/release-drafter@v6
        with:
          config-name: release-drafter.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Create `.github/release-drafter.yml`:

```yaml
name-template: 'v$RESOLVED_VERSION'
tag-template: 'v$RESOLVED_VERSION'

categories:
  - title: '🚀 Features'
    labels:
      - 'feature'
      - 'enhancement'
  - title: '🐛 Bug Fixes'
    labels:
      - 'bug'
      - 'fix'
  - title: '🔒 Security'
    labels:
      - 'security'
  - title: '📚 Documentation'
    labels:
      - 'documentation'
  - title: '🔧 Maintenance'
    labels:
      - 'chore'
      - 'dependencies'

version-resolver:
  major:
    labels:
      - 'breaking'
  minor:
    labels:
      - 'feature'
      - 'enhancement'
  patch:
    labels:
      - 'bug'
      - 'fix'
      - 'security'
      - 'chore'

template: |
  ## What's Changed

  $CHANGES

  ## Contributors

  $CONTRIBUTORS
```

---

## 6. Code Quality & Testing

### Code Coverage Requirements

Create `.nycrc.json`:

```json
{
  "all": true,
  "check-coverage": true,
  "reporter": ["text", "lcov", "html"],
  "lines": 80,
  "statements": 80,
  "functions": 80,
  "branches": 75,
  "exclude": [
    "**/*.test.ts",
    "**/*.test.js",
    "**/dist/**",
    "**/node_modules/**"
  ]
}
```

### Linting & Formatting

Create `.eslintrc.json`:

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:security/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint", "security"],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "security/detect-object-injection": "warn"
  }
}
```

### Commit Message Convention

Create `.commitlintrc.json`:

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "chore",
        "revert",
        "ci",
        "build"
      ]
    ],
    "scope-enum": [
      2,
      "always",
      [
        "types",
        "aliases",
        "policy",
        "atlas",
        "cli",
        "store",
        "renderer",
        "mcp-server",
        "ci",
        "deps"
      ]
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"]
  }
}
```

### Pre-commit Hooks

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run linting and type checking
npm run lint
npm run type-check

# Run tests on staged files
npm run test:staged
```

Create `.husky/commit-msg`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Validate commit message
npx --no -- commitlint --edit $1
```

---

## 7. Documentation & Governance

### Required Documentation Files

1. **CONTRIBUTING.md** - Contributor guidelines
2. **CODE_OF_CONDUCT.md** - Community standards
3. **SECURITY.md** - Security policy (created above)
4. **GOVERNANCE.md** - Decision-making process
5. **MAINTAINERS.md** - List of maintainers

### CODEOWNERS File

Create `.github/CODEOWNERS`:

```
# Global owners
* @Guffawaffle

# Package-specific owners
/shared/types/ @Guffawaffle
/shared/cli/ @Guffawaffle
/memory/mcp_server/ @Guffawaffle

# CI/CD and workflows
/.github/ @Guffawaffle
/RELEASE.md @Guffawaffle

# Security-sensitive
SECURITY.md @Guffawaffle
/.github/workflows/release.yml @Guffawaffle
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Priority: CRITICAL**

- [ ] Set up GPG signing for all maintainers
- [ ] Enable branch protection for `main`
- [ ] Create `SECURITY.md`
- [ ] Set up Dependabot
- [ ] Enable CodeQL scanning

**Deliverables:**
- All commits signed
- Protected main branch
- Security policy published
- Automated dependency updates

### Phase 2: CI/CD Enhancement (Week 3-4)

**Priority: HIGH**

- [ ] Enhance CI workflow with all stages
- [ ] Add security scanning (CodeQL + Snyk)
- [ ] Set up code coverage reporting (Codecov)
- [ ] Create release workflow
- [ ] Add commit message validation

**Deliverables:**
- Comprehensive CI pipeline
- Security scanning on every PR
- Automated releases

### Phase 3: Release Management (Week 5-6)

**Priority: MEDIUM**

- [ ] Create `next` branch for development
- [ ] Set up nightly builds
- [ ] Create RC process documentation
- [ ] Implement changelog automation
- [ ] Set up package provenance

**Deliverables:**
- Multi-branch strategy operational
- Nightly builds publishing
- Automated changelog

### Phase 4: Code Quality (Week 7-8)

**Priority: MEDIUM**

- [ ] Add ESLint with security rules
- [ ] Set up Prettier
- [ ] Configure commitlint
- [ ] Add pre-commit hooks (Husky)
- [ ] Achieve 80% code coverage

**Deliverables:**
- Enforced code standards
- Improved test coverage
- Validated commit messages

### Phase 5: Documentation & Governance (Week 9-10)

**Priority: LOW**

- [ ] Create CONTRIBUTING.md
- [ ] Add CODE_OF_CONDUCT.md
- [ ] Write GOVERNANCE.md
- [ ] Set up CODEOWNERS
- [ ] Create maintainer onboarding guide

**Deliverables:**
- Complete governance documentation
- Clear contribution process
- Maintainer succession plan

---

## Quick Start Checklist

Start here for immediate security wins:

### This Week

- [ ] Generate GPG key and add to GitHub
- [ ] Sign all future commits: `git config --global commit.gpgsign true`
- [ ] Enable branch protection for `main` (require signed commits)
- [ ] Create `SECURITY.md`
- [ ] Enable Dependabot in repository settings

### This Month

- [ ] Implement enhanced CI workflow
- [ ] Add CodeQL scanning
- [ ] Set up code coverage reporting
- [ ] Create release workflow
- [ ] Document release process in RELEASE.md

### This Quarter

- [ ] Establish `next` branch workflow
- [ ] Implement nightly builds
- [ ] Add pre-commit hooks
- [ ] Achieve 80% code coverage
- [ ] Complete governance documentation

---

## Monitoring & Metrics

Track repository health with these metrics:

| Metric | Target | Current | Tool |
|--------|--------|---------|------|
| Code Coverage | >80% | TBD | Codecov |
| Security Alerts | 0 critical | TBD | Dependabot |
| Build Success Rate | >95% | TBD | GitHub Actions |
| Mean Time to Release | <2 weeks | TBD | Manual tracking |
| Commit Signature Rate | 100% | TBD | GitHub UI |
| PR Approval Time | <48 hours | TBD | GitHub Insights |

---

## Resources & References

### Industry Standards
- [OpenSSF Best Practices](https://bestpractices.coreinfrastructure.org/)
- [SLSA Framework](https://slsa.dev/) (Supply-chain Levels for Software Artifacts)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Tools
- [GPG Tools](https://gpgtools.org/)
- [GitHub CLI](https://cli.github.com/)
- [Codecov](https://codecov.io/)
- [Snyk](https://snyk.io/)

### Example Repositories
- [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes)
- [microsoft/vscode](https://github.com/microsoft/vscode)
- [vercel/next.js](https://github.com/vercel/next.js)

---

## Conclusion

This hardening plan transforms the Lex repository into a secure, enterprise-grade open-source project. By following these practices:

✅ **Security**: Signed commits, automated scanning, vulnerability management
✅ **Quality**: Comprehensive testing, code coverage, automated validation
✅ **Reliability**: Multi-stage CI/CD, release candidates, nightly builds
✅ **Trust**: Transparent governance, clear security policy, provenance
✅ **Maintainability**: Automated updates, changelog generation, clear processes

The phased approach allows incremental implementation while maintaining development velocity.

---

**Next Steps:**
1. Review this plan with all maintainers
2. Prioritize phases based on team capacity
3. Start with Phase 1 (Foundation) this week
4. Schedule monthly reviews of progress
5. Adjust timeline as needed based on feedback

**Questions or Suggestions?**
Open an issue or contact the maintainer team.
