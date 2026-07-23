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

### 2. Preparing a Release

The release manager prepares a release branch or pull request:

```bash
# 1. Inspect the queued release intent
npx changeset status

# 2. Generate version bumps and changelog, consuming queued changesets
npx changeset version

# 3. Review package.json, package-lock.json, CHANGELOG.md, and removed changesets

# 4. Commit the reviewed release changes
git add package.json package-lock.json CHANGELOG.md .changeset
git commit -m "chore: version packages for release"

# 5. Push the branch, open a PR, and merge it to main
git push -u origin HEAD

# 6. Run final release and packed-consumer gates
git checkout main
git pull

# 7. The authenticated human publishes from this exact clean commit
npm publish --access public

# 8. After required ecosystem packages exist, create and push the signed tag
git tag -s vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

If a queued changeset was accidentally carried into the release tag but its
change is already represented in that version's changelog, remove the stale
file without applying another version bump. `npm run check:release-drift`
detects this state while allowing changesets created after the current tag.

### 3. Publishing

npm publishing remains manual because the account requires interactive 2FA. Agents must stop after
the dry run and print the command for the authenticated maintainer:

```bash
npm publish --access public
```

After the required exact npm packages exist, the signed tag triggers validation, build/test, the
GitHub release, and the protected MCP Registry path described in `RELEASE.md`.

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
- Reference the single `@smartergpt/lex` package, not historical `lex/*` subpackages
