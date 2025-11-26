# Modes

> Different tasks warrant different risk tolerances.

## What it is

A **Mode** is a behavioral profile that defines what a model is allowed to do, what validation is required, and how much risk is acceptable. Modes are policy knobs—they don't change the model, they change the guardrails around it.

Think of modes as presets: instead of configuring every parameter for every operation, you select a mode that bundles sensible defaults for a class of tasks.

---

## Why it exists

Not all work is the same:
- Fixing a typo in a README is low-risk
- Refactoring a core module is high-risk
- Brainstorming ideas has no risk (until you try to merge)

Without modes, you either apply maximum caution to everything (slow) or minimum caution to everything (dangerous). Modes let you match the guardrails to the task.

---

## The Three Modes

### Fast-Lane Mode

**For:** Single-file, low-risk edits where speed matters

- Minimal gates (lint only, or none)
- Limited tools (read/write, no terminal)
- Tight scope (one file, small changes)

Use when: Fixing a typo, updating a config value, small formatting fixes.

### Conservative Mode (Default)

**For:** Production-quality changes that need full validation

- All required gates (lint, typecheck, tests)
- Full tool access within scope
- Multi-file changes allowed within policy limits

Use when: Implementing features, fixing bugs, any change that will be merged.

### Exploratory Mode

**For:** Brainstorming, prototyping, experimentation

- Relaxed gates (or none)
- Wider tool access
- Clear label: "Do not merge without human review"

Use when: Trying out ideas, generating options, investigating approaches. The output is a draft, not a deliverable.

---

## What Each Mode Defines

| Dimension | Fast-Lane | Conservative | Exploratory |
|-----------|-----------|--------------|-------------|
| **Gates Required** | Minimal | All | Optional |
| **Side Effects** | Read/write only | Full within scope | Full |
| **Scope Limits** | 1 file, small | Policy-defined | Relaxed |
| **Merge Eligibility** | Yes (if gates pass) | Yes (if gates pass) | No (requires review) |

---

## How it shows up

The active mode is:
1. **Set at operation start** — either explicitly or by inferring from the task
2. **Recorded in the receipt** — so reviewers know what rules applied
3. **Enforced by the control stack** — violations are blocked, not just warned

A model in conservative mode that tries to skip tests will fail. A model in exploratory mode that tries to merge directly will be blocked. The modes aren't suggestions—they're constraints.

---

## The Key Insight

Modes are **policy knobs, not different models**. The same model can operate in any mode. What changes is the structure around it:
- What tools are available
- What gates must pass
- How much scope is allowed
- Whether the output is merge-eligible

This means you don't need a "safe model" and an "exploratory model." You need one model with well-designed mode switches.

---

## Related concepts

- [Gates](../gates/) — Required gates vary by mode
- [Policy Surface](../policy-surface/) — Where mode definitions live
- [Receipts](../receipts/) — Mode is recorded in every receipt
- [Scope & Blast Radius](../scope-and-blast-radius/) — Limits vary by mode
