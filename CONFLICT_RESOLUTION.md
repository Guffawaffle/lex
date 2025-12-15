# Conflict Resolution Strategy

## Purpose

This document defines the standard conflict resolution strategy for concurrent PRs that modify shared documentation, fixtures, or configuration files in the Lex ecosystem (lex, lexsona, lex-pr-runner).

**Problem:** When multiple PRs modify the same files concurrently, different resolution heuristics (`--theirs`, `--ours`, manual merge) create friction during merge operations.

**Solution:** Consistent, documented rules per file category that can be applied automatically by merge-weave tooling.

---

## Resolution Rules by File Category

### 1. Test Fixtures (YAML/JSON)

**Strategy:** Merge both versions (prefer newer dates when applicable)

**Rationale:** Test fixtures often represent independent test cases. Adding fixtures from both PRs provides better test coverage.

**Rule:**
- Combine arrays of test cases from both versions
- Sort by date/timestamp if present
- Deduplicate by unique identifiers (e.g., `id`, `name` fields)
- Preserve structure from newer PR if schemas differ

**Example:**

**Base (main):**
```yaml
test_cases:
  - id: test-001
    name: "Basic authentication flow"
    date: "2025-12-10"
```

**PR #13 (ours):**
```yaml
test_cases:
  - id: test-001
    name: "Basic authentication flow"
    date: "2025-12-10"
  - id: test-002
    name: "JWT validation"
    date: "2025-12-12"
```

**PR #19 (theirs):**
```yaml
test_cases:
  - id: test-001
    name: "Basic authentication flow"
    date: "2025-12-10"
  - id: test-003
    name: "Password reset flow"
    date: "2025-12-13"
```

**Merged result:**
```yaml
test_cases:
  - id: test-001
    name: "Basic authentication flow"
    date: "2025-12-10"
  - id: test-002
    name: "JWT validation"
    date: "2025-12-12"
  - id: test-003
    name: "Password reset flow"
    date: "2025-12-13"
```

---

### 2. Documentation (Markdown)

**Strategy:** Take latest structure, manually merge content sections when semantic conflict exists

**Rationale:** Documentation often has both structural changes (new sections, reordering) and content changes. Structure changes should win, but content should be preserved.

**Rule:**
- Use `--theirs` for pure structural changes (new sections, heading levels)
- Manual merge for content conflicts in the same section
- Take newer version for timestamp-based entries (changelogs, release notes)
- Preserve links and references from both versions

**Example:**

**Scenario 1: Non-conflicting sections**

**Base (main):**
```markdown
## Installation

npm install lex

## Usage

Basic usage...
```

**PR #13 (ours):**
```markdown
## Installation

npm install lex

## Usage

Basic usage...

## Configuration

Add a lex.yaml file...
```

**PR #19 (theirs):**
```markdown
## Installation

npm install lex

### Prerequisites

Node.js 20+

## Usage

Basic usage...
```

**Merged result (manual merge needed):**
```markdown
## Installation

npm install lex

### Prerequisites

Node.js 20+

## Usage

Basic usage...

## Configuration

Add a lex.yaml file...
```

**Scenario 2: Same section, different content**

When both PRs modify the same section with different content, manual resolution is required. The reviewer should:
1. Read both versions
2. Determine if both changes are needed
3. Combine or choose the most accurate/complete version
4. Preserve links and examples from both if applicable

---

### 3. Package Configuration (package.json, tsconfig.json, etc.)

**Strategy:** Take `--theirs` (feature branch wins)

**Rationale:** Configuration changes are typically feature-driven. The newer PR likely has the most current requirements.

**Rule:**
- Default to `--theirs` for dependency additions
- Manual merge if both PRs add different dependencies
- Manual merge for conflicting build scripts or compiler options
- Validate after merge: ensure `npm ci && npm run build && npm test` passes

**Example:**

**Base (main):**
```json
{
  "dependencies": {
    "chalk": "^5.0.0"
  },
  "scripts": {
    "build": "tsc"
  }
}
```

**PR #13 (ours):**
```json
{
  "dependencies": {
    "chalk": "^5.0.0",
    "uuid": "^9.0.0"
  },
  "scripts": {
    "build": "tsc"
  }
}
```

**PR #19 (theirs - newer):**
```json
{
  "dependencies": {
    "chalk": "^5.0.0",
    "zod": "^3.22.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  }
}
```

**Merged result (take theirs, then add unique deps from ours):**
```json
{
  "dependencies": {
    "chalk": "^5.0.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  }
}
```

---

### 4. Source Code (*.ts, *.js, *.py, etc.)

**Strategy:** Require manual resolution (always)

**Rationale:** Source code conflicts often represent logic conflicts that require human judgment. Automated merges risk introducing bugs.

**Rule:**
- Never auto-merge source code conflicts
- Require reviewer inspection of both changes
- Run tests after manual merge
- Consider if both changes are needed or if one supersedes the other

**Example:**

When encountering source code conflicts:

1. **Review both versions:**
   ```bash
   git show PR-13:src/auth/index.ts
   git show PR-19:src/auth/index.ts
   ```

2. **Understand intent:** Read PR descriptions and commit messages

3. **Manual merge:** Combine logic or choose one version

4. **Validate:** Run tests to ensure correctness
   ```bash
   npm test
   npm run type-check
   ```

---

## README.md Special Case

**Strategy:** Hybrid approach based on conflict location

README.md files are documentation but often have structural significance. Apply these rules:

1. **Badges/metadata (top of file):** Take newest version (`--theirs`)
2. **Table of contents:** Merge both versions (combine sections)
3. **Installation/Quick Start:** Manual merge (verify accuracy)
4. **Feature lists:** Merge both (combine bullet points)
5. **API reference:** Manual merge (may conflict on same endpoints)
6. **Examples:** Merge both (combine examples)
7. **Changelog/recent updates:** Take newest version

**Example:**

For the conflict in lexsona#20 between PRs #13 and #19:

1. Review sections changed by each PR
2. If non-overlapping sections: combine both
3. If same section modified: read both changes and merge manually
4. If structural change (new sections): take newer structure, add older content

---

## Workflow Integration

### Current Manual Process

When encountering conflicts during merge:

1. **Identify file category** using rules above
2. **Apply appropriate strategy:**
   - Test fixtures: Merge both
   - Documentation: Manual merge or take newer structure
   - Package config: Take theirs, verify unique additions
   - Source code: Always manual

3. **Validate the merge:**
   ```bash
   npm ci
   npm run build
   npm test
   npm run lint
   ```

4. **Commit the resolution:**
   ```bash
   git add <conflicted-files>
   git commit -m "fix: resolve merge conflicts per CONFLICT_RESOLUTION.md"
   ```

### Future: Merge-Weave Tooling

This strategy is designed for eventual automation in merge-weave tooling:

- **Phase 1 (current):** Manual application of documented rules
- **Phase 2 (future):** Semi-automated with conflict categorization
- **Phase 3 (future):** Fully automated for fixtures and config, manual approval for code

Tooling integration will be tracked in a separate issue (as noted in the original problem statement).

---

## Validation Checklist

After resolving conflicts, verify:

- [ ] All files build without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] No duplicate content in merged files
- [ ] Resolved files match the intent of both PRs
- [ ] Links and references are intact

---

## Cross-Repository Consistency

This strategy applies to:

- **lex** (main repository)
- **lexsona** (persona/behavioral layer)
- **lex-pr-runner** (CI/PR automation)

When resolving conflicts in any of these repos, apply the same rules for consistency.

---

## References

- **Related Issues:**
  - lex#528: Dogfood analysis showing cross-repo gaps
  - lexsona#20: README.md conflict resolution example
  
- **Contributing Guide:** See [CONTRIBUTING.md](./CONTRIBUTING.md) for PR workflow

---

## Feedback and Updates

This strategy will evolve based on real-world usage. If you encounter:

- Edge cases not covered by these rules
- Better approaches for specific file types
- Tooling opportunities for automation

Please open an issue or PR to update this document.
