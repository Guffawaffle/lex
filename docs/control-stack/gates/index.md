# Gates

> If I'm wrong, the gates will tell us. If I'm right, we have evidence.

## What it is

A **Gate** is a check that must pass before a change is considered acceptable. Gates are objective, automated validation steps—lint, typecheck, tests, security scans, custom checks defined by the project.

Gates answer the question: "Does this change meet the project's quality bar?"

---

## Why it exists

Models are confident. Sometimes correctly, sometimes not. Without gates, you're relying on the model's self-assessment of whether its changes are good.

Gates provide external validation:
- They catch errors the model missed
- They produce evidence that the change works
- They create a forcing function for quality

When gates are **required** (not optional), models are protected from their own overconfidence. The constraint feels like relief: "I don't have to be right the first time—I can iterate until gates pass."

---

## How it shows up

### Status Model

Every gate run produces one of three statuses:

| Status | Meaning |
|--------|---------|
| `pass` | The check succeeded |
| `fail` | The check failed—something needs to be fixed |
| `blocked` | The gate didn't run because a prerequisite failed |

The `blocked` status is important: it distinguishes "this check failed" from "this check couldn't run because something earlier broke." This prevents cascading noise when an early gate fails.

### Gate Composition

Gates are typically bundled into a **gate set** that runs together:

```
lint → typecheck → tests
```

The set is defined by the [mode](../modes/) and [policy](../policy-surface/), not chosen ad-hoc. This ensures consistency: the same gates run locally and in CI, with the same inputs and expectations.

### Example Output

A gate produces structured output:

```json
{
  "gate": "typecheck",
  "status": "pass",
  "duration_ms": 1200,
  "artifacts": ["tsc-output.log"]
}
```

This output is recorded in the [receipt](../receipts/) for the operation.

---

## Common Gate Types

| Gate | What it checks |
|------|----------------|
| `lint` | Code style, formatting, static analysis |
| `typecheck` | Type correctness (TypeScript, mypy, etc.) |
| `tests` | Unit/integration test suite |
| `security` | Dependency vulnerabilities, secret detection |
| `custom` | Project-specific checks defined in config |

---

## The Key Principle

Gates are **not optional validation**. They are the **objective ground truth** about whether a change is acceptable.

When a model says "I fixed the bug," the gates confirm it. When a model says "tests pass," the gate output proves it. The claim and the evidence are inseparable.

---

## Related concepts

- [Modes](../modes/) — Define which gates are required for different operation types
- [Receipts](../receipts/) — Where gate results are recorded
- [Policy Surface](../policy-surface/) — Where gate requirements are configured
