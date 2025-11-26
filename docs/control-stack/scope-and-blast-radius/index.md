# Scope and Blast Radius

> The narrower the lane, the more reliable the work.

## What it is

**Scope** is what you *intend* to change—the files, modules, or boundaries you're working within.

**Blast Radius** is what *actually* changed—the lines touched, files modified, and effects produced.

Together, they constrain how much a single operation can affect, making changes reviewable, testable, and reversible.

---

## Why it exists

Ambiguous prompts like "fix the tests" or "clean up the code" have unbounded scope. The model doesn't know where to stop. This leads to:
- Large diffs that take hours to review
- Unexpected side effects in unrelated files
- Changes that are hard to reverse without losing good work

Explicit scope constraints flip this dynamic:
- Small, focused changes that take minutes to review
- Predictable effects within declared boundaries
- Clean reversibility with `git revert`

The constraint isn't limiting—it's *liberating*. When the lane is narrow, the model can be confident about what it should and shouldn't touch.

---

## How it shows up

### Scope Declaration

Scope is declared upfront, either explicitly or by policy:

**File lists:**
```
Edit: src/cli.ts, src/core/gates.ts
```

**Boundary markers:**
```
Stay within: auth/
Forbidden: node_modules/, .env
```

**Module scope:**
```
Modules: ["auth/core", "auth/password"]
```

### Blast Radius Limits

Policy defines maximum acceptable change size:

```yaml
limits:
  max_files_changed: 5
  max_lines_changed: 200
  max_hunks: 10
```

If an operation would exceed these limits, it's blocked—not warned, blocked. The model must break the work into smaller pieces.

### Verification

After an operation, blast radius is measured and recorded in the [receipt](../receipts/):

```json
{
  "scope_declared": ["src/cli.ts"],
  "blast_radius": {
    "files_changed": 1,
    "lines_added": 23,
    "lines_removed": 8
  },
  "within_limits": true
}
```

If the actual blast radius exceeds the declared scope, this is flagged for review.

---

## Scope vs Blast Radius

| Dimension | Scope | Blast Radius |
|-----------|-------|--------------|
| When defined | Before operation | After operation |
| Who defines it | User/policy | Measured from diff |
| Purpose | Constraint | Verification |
| Example | "Edit auth/ only" | "Changed 3 files, 47 lines" |

The ideal state: blast radius stays well within declared scope. If they diverge significantly, something unexpected happened.

---

## Examples in Practice

**Good scope declaration:**
> "Edit `src/cli.ts` and `src/core/gates.ts` only. Add error handling to the exit path. No more than 50 lines changed."

**Poor scope declaration:**
> "Fix the CLI." (Where? How much? What counts as "fixed"?)

**Blast radius limit violation:**
> "This change touches 12 files and 400 lines. Policy limit is 5 files and 200 lines. Breaking into smaller operations."

---

## The Key Insight

Scope constraints are how you trade ambiguity for reliability.

When you tell a model:
- Exactly which files to touch
- The maximum acceptable change size
- The boundaries it must not cross

...you get work that is:
- **Reviewable** in minutes, not hours
- **Testable** against a focused gate set
- **Reversible** with a single command

The model doesn't need to decide how big the change should be. The policy decides. The model executes within those bounds.

---

## Related concepts

- [Policy Surface](../policy-surface/) — Where scope limits are defined
- [Gates](../gates/) — Run against the actual blast radius
- [Modes](../modes/) — Different modes have different scope limits
- [Receipts](../receipts/) — Blast radius is recorded for audit
