# Dogfood Merge-Weave Log - Epic #196 PRs

**Date:** November 12, 2025
**Goal:** Use lex-pr-runner tooling to merge-weave Epic #196 PRs (L-LOADER, L-TESTS, L-CI)

## Issue Encountered

### Problem
When attempting to execute gates using `lex-pr-runner execute`, the tool was reading the wrong plan file from `.smartergpt.local/runner/plan.json` (containing old PRs 72-77, 86-87) instead of the newly created plan for Epic #196 PRs (220-222).

### Root Cause
The `execute` command appears to have a precedence issue where it defaults to reading from `.smartergpt.local/runner/plan.json` even when a specific plan file path is provided as an argument.

### Commands Attempted
```bash
# Created plan successfully
node lex-pr-runner/dist/cli.js plan create --from-github \
  --query "is:open is:pr label:no-legacy" \
  --out dogfood-epic196.json

# Attempted execution (but read wrong plan)
node lex-pr-runner/dist/cli.js execute dogfood-epic196.json/plan.json
# Result: Executed against old PRs (72-77, 86-87) instead of new PRs (220-222)
```

### Verification
```bash
# Confirmed correct plan content
cat dogfood-epic196.json/plan.json | jq -r '.items[] | .name'
# Output: PR-220, PR-221, PR-222 ✓

# But execution showed wrong PRs
# Output: Executing plan: 8 items (PR-72, PR-73, PR-74, PR-75, PR-76, PR-77, PR-86, PR-87)
```

## Current State

### Open PRs (Epic #196)
1. **PR-220** - L-LOADER: Rewrite prompt/schema loaders with new precedence chain
   - Branch: `copilot/rewrite-prompt-schema-loaders`
   - Author: Copilot agent
   - Status: Open

2. **PR-221** - L-TESTS: Replace precedence tests for simplified chain
   - Branch: `copilot/replace-precedence-tests`
   - Author: Copilot agent
   - Status: Open

3. **PR-222** - L-CI: Build & publish adjustments for canon/ publishing
   - Branch: `copilot/update-build-publish-settings`
   - Author: Copilot agent
   - Status: Open

### Plan Generated
- **File:** `dogfood-epic196.json/plan.json`
- **Items:** 3 PRs (220, 221, 222)
- **Dependencies:** None (all independent)
- **Target:** main
- **Schema:** 1.0.0
- **Gates:** lint, typecheck, test (3 gates per PR)

## Next Steps - Manual Execution

Since the automated tool has a path resolution issue, proceeding with manual merge-weave:

1. **Fetch and checkout each PR branch**
2. **Run gates manually** (lint, typecheck, test)
3. **Create integration branch** for merge-weave
4. **Merge PRs in order** (handling any conflicts)
5. **Verify integration branch** passes all gates
6. **Merge to main**
7. **Close PRs** and cleanup branches

## Manual Workflow

### Phase 1: Validate Individual PRs
```bash
# For each PR (220, 221, 222):
git fetch origin pull/{PR}/head:pr-{PR}
git checkout pr-{PR}
npm run lint && npm run typecheck && npm test
# Record results
```

### Phase 2: Create Integration Branch
```bash
git checkout main
git pull origin main
git checkout -b merge-weave/epic196-batch1
```

### Phase 3: Sequential Merge
```bash
# Merge each PR, resolve conflicts, verify
git merge --no-ff pr-220 -m "Merge PR-220: L-LOADER"
npm run lint && npm run typecheck && npm test

git merge --no-ff pr-221 -m "Merge PR-221: L-TESTS"
npm run lint && npm run typecheck && npm test

git merge --no-ff pr-222 -m "Merge PR-222: L-CI"
npm run lint && npm run typecheck && npm test
```

### Phase 4: Final Integration
```bash
# Push integration branch
git push origin merge-weave/epic196-batch1

# Merge to main
git checkout main
git merge --no-ff merge-weave/epic196-batch1
git push origin main

# Close PRs via gh CLI
gh pr close 220 221 222 --comment "Merged via manual merge-weave"
```

## Lessons Learned

### Tool Issues
- `lex-pr-runner execute` command has plan file precedence bug
- Default plan location (`.smartergpt.local/runner/plan.json`) overrides explicit path argument
- Need to fix path resolution in execute command

### Workarounds
- Manual merge-weave workflow still reliable
- Can use `lex-pr-runner plan create` successfully
- Manual gate execution (`npm run lint/typecheck/test`) is straightforward

### Action Items
1. File issue in lex-pr-runner repo about execute command path resolution
2. Add test case for explicit plan file path handling
3. Consider adding `--plan` flag that forces specific plan file usage
4. Document workaround in lex-pr-runner README

## Status
- ✅ Plan created successfully
- ❌ Automated execution blocked by tool bug
- 🔄 Proceeding with manual merge-weave workflow
