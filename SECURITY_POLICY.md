# Security Policy — IP Leak Prevention

## Overview

This policy establishes rules and automated gates to prevent intellectual property leaks across the Lex and lexrunner repositories. It was created in response to Security Incident 2025-11-12 (see `SECURITY_INCIDENT_20251112.md`).

---

## Asset Ownership Classification

### 🔴 lexrunner Owned (NEVER in Lex repo)

**Schemas:**
- `runner.stack.schema.*` (all variants: .ts, .js, .d.ts, .json)
- `runner.scope.schema.*` (all variants)
- `execution-plan-v1.*` (canonical version in lexrunner)
- Autopilot-related schemas
- Plan schemas (`plan.schema.json`)

**Documentation:**
- Merge-weave state machine documentation
- Merge-weave logic and algorithms
- Autopilot configuration guides
- Runner-specific architecture docs

**Source Code:**
- Any `/src/` files from lexrunner
- Runner CLI implementations
- Merge orchestration logic
- Gate execution engines

**How to use in Lex:** Import via package exports:
```typescript
// ✅ CORRECT
import { ExecutionPlanSchema } from '@guffawaffle/lexrunner/schemas/execution-plan-v1';
import { GatesSchema } from '@guffawaffle/lexrunner/schemas/gates';

// ❌ WRONG - DO NOT duplicate files
```

---

### 🔵 Lex Owned (NEVER in lexrunner repo)

**Schemas:**
- `feature-spec-v0.*` (Lex feature specifications)
- `infrastructure.*` (Lex infrastructure)
- Prompt-related schemas

**Documentation:**
- Prompt templates and guides
- Lex-specific architecture
- Front-end capture documentation
- Policy loader internals

**Source Code:**
- Lex `/src/` files
- Prompt loaders
- Policy engines
- Lex-specific utilities

**How to use in lexrunner:** Import via package exports:
```typescript
// ✅ CORRECT (when Epic #196 complete)
import { ProfileSchema } from '@guffawaffle/lex/schemas/profile';

// ❌ WRONG - DO NOT duplicate files
```

---

### 🟢 Shared / Multi-Repo (Canonical in Lex)

These schemas are **canonical in Lex** and **imported by lexrunner**:

**Schemas:**
- `profile.schema.json` — Runtime profiles (Lex canonical, lexrunner imports)
- `gates.schema.json` — Safety gates (Lex canonical, lexrunner imports)

**Current State (during Epic #196 transition):**
- ✅ lexrunner temporarily has copies while Epic #196 completes
- ✅ After Epic #196: lexrunner imports from `@guffawaffle/lex` package
- ✅ Lex publishes `prompts/` and `schemas/` in npm package

**Import Pattern (post-Epic #196):**
```typescript
// In lexrunner (after Epic #196):
import { ProfileSchema, GatesSchema } from '@guffawaffle/lex/schemas';
```

---

## Code Review Checklist

### For All PRs Touching `.smartergpt/schemas/` or `/schemas/`

**Before Approval:**

- [ ] **Ownership Verification:** Does this file belong in THIS repository?
  - If `runner.*`, `execution-plan`, `autopilot`, or `merge-weave` → lexrunner ONLY
  - If `feature-spec`, `infrastructure`, prompts → Lex ONLY
  - If `profile`, `gates` (shared) → Canonical in Lex, imported by lexrunner

- [ ] **No Duplicates:** Is this already canonical in another repository?
  - Search other repo: `gh repo search-code <filename> --repo Guffawaffle/lexrunner`
  - If found: Use package import instead of duplication

- [ ] **Import Pattern:** If owned elsewhere, use subpath export:
  ```typescript
  // ✅ CORRECT
  import { Schema } from '@guffawaffle/other-repo/schemas/name';

  // ❌ WRONG
  cp ../other-repo/schemas/name.json ./schemas/
  ```

- [ ] **No runner.* Files in Lex:**
  ```bash
  git diff --name-only origin/main | grep -E "runner\.|execution-plan|merge-weave"
  # Should be empty for Lex PRs
  ```

- [ ] **No Lex-Specific Files in lexrunner:**
  ```bash
  git diff --name-only origin/main | grep -E "feature-spec|infrastructure"
  # Should be empty for lexrunner PRs
  ```

- [ ] **History Check (for deletions):**
  ```bash
  # If PR deletes schema files, verify they're removed from history:
  git log --all --full-history --oneline -- "path/to/deleted/file"
  # Should be empty after merge (may need git-filter-repo)
  ```

---

## Automated CI Gates

### Pre-commit Hook (Local Prevention)

**Install:** `.githooks/pre-commit`

```bash
#!/bin/bash
set -e

REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")

# Prevent runner schemas in Lex repo
if [ "$REPO_NAME" == "lex" ]; then
  if git diff --cached --name-only | grep -E "runner\.|execution-plan|merge-weave|autopilot"; then
    echo "❌ Error: Runner-owned files cannot be committed to Lex repo"
    echo ""
    echo "Detected files:"
    git diff --cached --name-only | grep -E "runner\.|execution-plan|merge-weave|autopilot"
    echo ""
    echo "Solution: Import from @guffawaffle/lexrunner/schemas/..."
    exit 1
  fi
fi

# Prevent Lex schemas in lexrunner repo
if [ "$REPO_NAME" == "lexrunner" ]; then
  if git diff --cached --name-only | grep -E "feature-spec|infrastructure" | grep -v node_modules; then
    echo "⚠️  Warning: Lex-owned files detected in lexrunner"
    echo ""
    echo "Detected files:"
    git diff --cached --name-only | grep -E "feature-spec|infrastructure" | grep -v node_modules
    echo ""
    read -p "These should be imported from @guffawaffle/lex. Continue anyway? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  fi
fi

echo "✓ Ownership check passed"
```

**Enable:**
```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

---

### GitHub Actions Gate

**Create:** `.github/workflows/ip-leak-prevention.yml`

```yaml
name: IP Leak Prevention

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main, develop]

jobs:
  check-ownership:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for comprehensive checks

      - name: Check file ownership (Lex repo)
        if: github.repository == 'Guffawaffle/lex'
        run: |
          echo "Checking for runner-owned files in Lex repo..."
          FILES=$(git diff --name-only origin/main HEAD 2>/dev/null || git ls-files)

          # Check for runner-specific files
          VIOLATIONS=$(echo "$FILES" | grep -E "runner\.|execution-plan|merge-weave|autopilot" | grep -v node_modules || true)

          if [ -n "$VIOLATIONS" ]; then
            echo "❌ ERROR: Runner-owned files detected in Lex repo:"
            echo "$VIOLATIONS"
            echo ""
            echo "These files belong in lexrunner. Import via:"
            echo "  import { Schema } from '@guffawaffle/lexrunner/schemas/...'"
            exit 1
          fi

          echo "✓ No ownership violations detected"

      - name: Check file ownership (lexrunner repo)
        if: github.repository == 'Guffawaffle/lexrunner'
        run: |
          echo "Checking for Lex-owned files in lexrunner repo..."
          FILES=$(git diff --name-only origin/main HEAD 2>/dev/null || git ls-files)

          # Check for Lex-specific files (excluding node_modules)
          VIOLATIONS=$(echo "$FILES" | grep -E "feature-spec|infrastructure" | grep -v node_modules || true)

          if [ -n "$VIOLATIONS" ]; then
            echo "⚠️  WARNING: Lex-owned files detected in lexrunner:"
            echo "$VIOLATIONS"
            echo ""
            echo "These files should be imported from @guffawaffle/lex"
            echo "Allowing for now, but verify this is intentional."
          fi

          echo "✓ Check complete"

      - name: Verify no leaked files in history (on schema changes)
        run: |
          echo "Checking for historical leaks in schema changes..."

          # Get list of changed schema files
          SCHEMA_FILES=$(git diff --name-only origin/main HEAD | grep -E "\.schema\.(ts|js|json)$" || true)

          if [ -z "$SCHEMA_FILES" ]; then
            echo "No schema files changed, skipping history check"
            exit 0
          fi

          echo "Schema files changed:"
          echo "$SCHEMA_FILES"
          echo ""

          # For each deleted schema file, verify it's not in history
          for file in $SCHEMA_FILES; do
            if [ ! -f "$file" ]; then
              echo "Checking history for deleted file: $file"
              HISTORY=$(git log --all --full-history --oneline -- "$file" | head -5 || true)

              if [ -n "$HISTORY" ]; then
                echo "⚠️  WARNING: Deleted file '$file' still in history:"
                echo "$HISTORY"
                echo ""
                echo "Consider running git-filter-repo to purge from history"
              fi
            fi
          done

          echo "✓ History check complete"
```

---

### Schema Import Linter

**Create:** `scripts/check-schema-imports.js`

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const repoName = path.basename(repoRoot);

// Files that should NEVER be in this repo
const forbiddenPatterns = {
  lex: [
    /runner\..*\.schema\.(ts|js|json)$/,
    /execution-plan.*\.(ts|js|json)$/,
    /merge-weave/,
    /autopilot.*\.schema/
  ],
  'lexrunner': [
    /feature-spec.*\.(ts|js|json)$/,
    /infrastructure.*\.(ts|js|json)$/
  ]
};

function checkDirectory(dir, patterns) {
  const violations = [];

  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git') {
          walk(filePath);
        }
      } else {
        const relativePath = path.relative(repoRoot, filePath);

        for (const pattern of patterns) {
          if (pattern.test(relativePath)) {
            violations.push(relativePath);
            break;
          }
        }
      }
    }
  }

  walk(dir);
  return violations;
}

const patterns = forbiddenPatterns[repoName];
if (!patterns) {
  console.log(`No ownership rules for repo: ${repoName}`);
  process.exit(0);
}

console.log(`Checking ${repoName} for IP ownership violations...`);
const violations = checkDirectory(repoRoot, patterns);

if (violations.length > 0) {
  console.error(`\n❌ IP Ownership Violations Detected:\n`);
  violations.forEach(v => console.error(`  - ${v}`));
  console.error(`\nThese files belong in the other repository.`);
  console.error(`Use package imports instead of duplication.\n`);
  process.exit(1);
}

console.log('✓ No IP ownership violations detected');
```

**Add to package.json:**
```json
{
  "scripts": {
    "check-ownership": "node scripts/check-schema-imports.js",
    "pretest": "npm run check-ownership"
  }
}
```

---

## Import Pattern Guidelines

### ✅ CORRECT: Package Imports

```typescript
// In Lex (importing from lexrunner):
import { ExecutionPlanSchema } from '@guffawaffle/lexrunner/schemas/execution-plan-v1';
import { RunnerStackSchema } from '@guffawaffle/lexrunner/schemas/runner-stack';

// In lexrunner (importing from Lex - after Epic #196):
import { ProfileSchema } from '@guffawaffle/lex/schemas/profile';
import { GatesSchema } from '@guffawaffle/lex/schemas/gates';
```

### ❌ WRONG: File Duplication

```typescript
// ❌ DO NOT copy files between repos:
cp ../lexrunner/schemas/execution-plan-v1.json ./schemas/

// ❌ DO NOT commit duplicated files:
git add .smartergpt/schemas/runner.stack.schema.ts
```

### 🔧 Migration Pattern

When moving files to their canonical repository:

1. **Copy to canonical location:**
   ```bash
   cp lex/schemas/runner.stack.schema.* lexrunner/schemas/
   ```

2. **Add package exports in canonical repo:**
   ```json
   // lexrunner/package.json
   {
     "exports": {
       "./schemas/runner-stack": "./schemas/runner.stack.schema.js"
     }
   }
   ```

3. **Update imports in source repo:**
   ```typescript
   // In lex (after lexrunner publishes):
   import { RunnerStackSchema } from '@guffawaffle/lexrunner/schemas/runner-stack';
   ```

4. **Delete from source repo:**
   ```bash
   git rm lex/schemas/runner.stack.schema.*
   ```

5. **Clean git history:**
   ```bash
   git filter-repo --invert-paths --path schemas/runner.stack.schema.ts
   ```

---

## Incident Response Checklist

### If IP Leak Detected:

1. **Assess Scope:**
   ```bash
   # Check history exposure:
   git log --all --full-history --oneline -- "path/to/leaked/file"

   # Check if pushed to remote:
   git log origin/main --oneline -- "path/to/leaked/file"
   ```

2. **Create Backup:**
   ```bash
   git tag backup/pre-cleanup-$(date +%Y%m%d)
   ```

3. **Remove from History (if needed):**
   ```bash
   # Install git-filter-repo:
   sudo apt install git-filter-repo

   # Rewrite history:
   git filter-repo --invert-paths --path "path/to/leaked/file" --force

   # Verify removal:
   git log --all --full-history --oneline -- "path/to/leaked/file"
   # Should be empty
   ```

4. **Force Push (if already on remote):**
   ```bash
   # Re-add remote (filter-repo removes it):
   git remote add origin https://github.com/Guffawaffle/REPO.git

   # Force push:
   git push origin BRANCH --force
   ```

5. **Document:**
   - Create incident report (see `SECURITY_INCIDENT_20251112.md` template)
   - Update this policy if new patterns emerge
   - Notify team of the leak and resolution

6. **Verify:**
   ```bash
   # Tests still pass:
   npm test

   # No regression:
   npm run build
   ```

---

## Periodic Audits

### Monthly Ownership Audit

Run this script monthly to verify no violations:

```bash
#!/bin/bash
echo "Running IP ownership audit..."

# Check for runner files in Lex:
echo "Checking Lex repo..."
cd ~/repos/lex
find . -name "runner.*.schema.*" -o -name "execution-plan*" -o -name "merge-weave*" | \
  grep -v node_modules || echo "  ✓ No violations"

# Check for Lex files in lexrunner:
echo "Checking lexrunner repo..."
cd ~/repos/lexrunner
find . -name "feature-spec*" -o -name "infrastructure*" | \
  grep -v node_modules || echo "  ✓ No violations"

echo "Audit complete"
```

### Quarterly History Audit

```bash
# Check for any leaked files still in history:
for file in runner.stack.schema execution-plan gates.schema merge-weave; do
  echo "Checking history for: $file"
  git log --all --full-history --oneline -- "*$file*" | head -5
done
```

---

## Contact

**Security Issues:** Report via GitHub Security Advisories (private disclosure)
**Policy Questions:** Open issue with `security-policy` label
**Incident Reports:** Document in `/SECURITY_INCIDENT_YYYYMMDD.md`

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2025-11-12 | 1.0 | Initial policy created after Security Incident 2025-11-12 |

---

**Last Updated:** November 12, 2025
**Next Review:** February 12, 2026 (quarterly)
