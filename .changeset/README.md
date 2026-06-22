# Changesets

This directory contains changeset files for managing releases.

## What are changesets?

Changesets are a way to manage versioning and changelogs. Each changeset describes what should be updated and why.

## Workflow

### 1. Making Changes

When you make a change that should be released:

```bash
npx changeset
```

This will:
- Ask whether the change is major/minor/patch
- Ask for a summary of the change

### 2. Weekly Release (Wednesday)

On Wednesday, the release manager:

```bash
# 1. Generate version bumps and changelog
npx changeset version

# 2. Review changes to package.json and CHANGELOG.md

# 3. Commit the version changes
git add .
git commit -m "chore: version packages for release"

# 4. Push to main
git push origin main

# 5. Tag the release
git checkout main
git pull
git tag -s v0.X.Y -m "Release v0.X.Y"
git push origin v0.X.Y
```

### 3. Publishing

When the signed tag is pushed, GitHub Actions validates the tag and builds the
package. npm publishing is a manual release-manager step unless
`.github/workflows/release.yml` is changed to enable the publish job.

## Changeset Examples

### Feature (minor)
```md
---
'@smartergpt/lex': minor
---

Add new frame visualization command
```

### Bug fix (patch)
```md
---
'@smartergpt/lex': patch
---

Fix SQLite connection leak in frame queries
```

### Breaking change (major)
```md
---
'@smartergpt/lex': major
---

BREAKING: Change policy file format to YAML
```

## Tips

- Always create a changeset when making user-facing changes
- Use semantic versioning correctly (major/minor/patch)
- Write clear, user-focused summaries
- Reference the single `@smartergpt/lex` package (not subpath exports)
