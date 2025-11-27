# GitHub Release Catch-Up Guide

> **Created:** 2025-11-27
> **Context:** Resolves RELEASE-001 - aligning GitHub releases with Git tags

## Current State

| Version | Git Tag | GitHub Release | CHANGELOG Entry |
|---------|---------|----------------|-----------------|
| v0.2.0 | ✅ | ✅ | ✅ |
| v0.3.0 | ✅ | ❌ **NEEDS RELEASE** | ✅ |
| v0.4.0-alpha | ✅ (8 tags) | ❌ Skip | ✅ |
| v0.5.0 | ❌ | ❌ | ❌ |
| v0.6.0 | ✅ | ✅ | ✅ |

## Action Required

### v0.3.0 - Create Release

The v0.3.0 tag exists but has no corresponding GitHub release.

```bash
# Option 1: Use the prepared release notes
gh release create v0.3.0 \
  --title "v0.3.0" \
  --notes-file docs/releases/v0.3.0-release-notes.md \
  --verify-tag

# Option 2: Quick release with CHANGELOG reference
gh release create v0.3.0 \
  --title "v0.3.0" \
  --notes "See CHANGELOG.md for details.

**Full Changelog**: https://github.com/Guffawaffle/lex/compare/v0.2.0...v0.3.0" \
  --verify-tag
```

### v0.4.x-alpha - Skip

The v0.4.x series only has alpha releases (v0.4.0-alpha through v0.4.7-alpha). These pre-releases can optionally be created as GitHub pre-releases:

```bash
# Optional: Create pre-releases for alpha versions
gh release create v0.4.7-alpha \
  --title "v0.4.7-alpha" \
  --notes "Pre-release. See CHANGELOG.md for details." \
  --prerelease \
  --verify-tag
```

### v0.5.0 - Does Not Exist

There is no v0.5.0 tag or CHANGELOG entry. The version progression is:
- v0.4.7-alpha → v0.6.0 (skipped v0.5.0)

No action needed for v0.5.0.

### v0.6.0 - Already Complete ✅

Released on 2025-11-27. No action needed.

## Verification

After creating the missing release, verify alignment:

```bash
# List GitHub releases
gh release list --limit 10

# Check release drift
npm run check:release-drift
```

## Notes

- Use `--verify-tag` to ensure the tag already exists (prevents accidental tag creation)
- The issue originally requested v0.3.0 through v0.6.0, but v0.6.0 is already released
- There is no v0.5.0 in the version history
- Alpha releases can be marked as pre-releases if desired
