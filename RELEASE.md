# Release Checklist

This document outlines the process for releasing packages from the Lex monorepo.

## Pre-Release Verification

### ✅ Build & Test
- [x] All packages build successfully: `npm run build`
- [x] All tests pass (151/151): `npm test`
- [x] No TypeScript errors
- [x] All package.json files validated

### ✅ Package Metadata
All publishable packages have been validated with:
- [x] Correct `name`, `version`, `license`, `repository`
- [x] Proper `main`, `types`, and `exports` fields
- [x] `files` array to include dist and exclude unnecessary files
- [x] Appropriate `keywords` for discoverability
- [x] `bin` entries for CLI packages (@lex/cli, @lex/policy-check)

## Publishable Packages

The following packages are ready for publication:

### Core Types & Utilities
1. **@lex/types** (`shared/types`) - TypeScript type definitions
2. **@lex/module-ids** (`shared/module_ids`) - Module ID validation
3. **@lex/aliases** (`shared/aliases`) - Alias resolution
4. **@lex/policy** (`shared/policy`) - Policy loader utilities

### Infrastructure
5. **@lex/atlas** (`shared/atlas`) - Spatial neighborhood extraction
6. **@lex/git** (`shared/git`) - Git utilities

### Policy Subsystem
7. **@lex/merge** (`policy/merge`) - Scanner output merge logic
8. **@lex/policy-check** (`policy/check`) - Policy violation checker (CLI)

### Memory Subsystem
9. **@lex/store** (`memory/store`) - Frame storage (SQLite + FTS5)
10. **@lex/renderer** (`memory/renderer`) - Memory card visualization
11. **@lex/mcp-server** (`memory/mcp_server`) - MCP server for AI integration

### User-Facing
12. **@lex/cli** (`shared/cli`) - Unified CLI interface

## Publication Order

Publish in dependency order to avoid issues:

### Phase 1: Foundation (no internal dependencies)
```bash
cd shared/types && npm publish --dry-run
cd shared/git && npm publish --dry-run
```

### Phase 2: Core Utilities (depend on types)
```bash
cd shared/module_ids && npm publish --dry-run
cd shared/aliases && npm publish --dry-run
cd shared/policy && npm publish --dry-run
```

### Phase 3: Policy & Atlas (depend on core)
```bash
cd shared/atlas && npm publish --dry-run
cd policy/merge && npm publish --dry-run
```

### Phase 4: Memory Subsystem
```bash
cd memory/store && npm publish --dry-run
cd memory/renderer && npm publish --dry-run
```

### Phase 5: Integration & CLI
```bash
cd memory/mcp_server && npm publish --dry-run
cd policy/check && npm publish --dry-run
cd shared/cli && npm publish --dry-run
```

## Dry-Run Testing

Before actual publication, test each package:

```bash
# For each package:
cd <package-dir>
npm pack --dry-run  # Verify files to be included
npm pack            # Create tarball
tar -tf lex-<name>-<version>.tgz | head -30  # Inspect contents
```

## Consumer Smoke Test

Create a test project to verify runtime resolution:

```bash
mkdir /tmp/lex-consumer-test
cd /tmp/lex-consumer-test
npm init -y
npm install /srv/lex-mcp/lex/shared/types/lex-types-*.tgz
npm install /srv/lex-mcp/lex/shared/aliases/lex-aliases-*.tgz
npm install /srv/lex-mcp/lex/shared/cli/lex-cli-*.tgz
```

Test imports:
```javascript
// test.mjs
import { Policy } from '@lex/types/policy';
import { resolveModuleId } from '@lex/aliases';
console.log('Imports work!');
```

Run: `node test.mjs`

## Version Bumping

When ready to release a new version:

1. Update version in all `package.json` files:
   ```bash
   # Use a script or manually update from 0.1.0-alpha to 0.1.0
   ```

2. Create git tag:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```

3. Publish packages in order (remove --dry-run):
   ```bash
   npm publish --access public
   ```

## CI/CD Integration

Future: Add GitHub Actions workflow to:
- Run build + tests on all PRs
- Run build + tests on tags
- Automatically publish verified tags to npm registry

## Post-Release

1. Update CHANGELOG.md with release notes
2. Create GitHub Release with notes
3. Announce in relevant channels
4. Update documentation if needed

## Rollback Plan

If a published package has critical issues:

1. Publish a patch version with fix
2. Deprecate broken version: `npm deprecate @lex/package@version "Critical bug, use @lex/package@fixed-version"`
3. Update dependent packages

## Notes

- All packages use `0.1.0-alpha` versioning indicating pre-release status
- MIT license across all packages
- Repository metadata points to GitHub: `https://github.com/Guffawaffle/lex.git`
- Packages use ESM (`"type": "module"`)
- TypeScript source files are included for workspace development
- Compiled dist files are included for npm consumers
