# ADR-0004: Control Stack Architecture

**Status:** Accepted
**Date:** 2025-11-25
**Authors:** Lex, Guff

---

## Context

AI coding agents operate with confidence but variable accuracy. Without structural constraints, models rely on self-assessment to determine if their changes are good. This creates several problems:

- **Overconfidence** — Models claim success without validation
- **Invisible failures** — No evidence trail when things go wrong
- **Inconsistent quality** — No forcing function for standards
- **Audit gaps** — Reviewers can't verify what actually happened

The question became: how do we provide external validation and durable evidence while keeping the model productive?

---

## Decision

We adopt a **Control Stack** architecture with six core concepts:

### 1. Gates

A **Gate** is a check that must pass before a change is considered acceptable. Gates are objective, automated validation steps—lint, typecheck, tests, security scans.

Gates produce one of three statuses:
- `pass` — The check succeeded
- `fail` — The check failed—something needs to be fixed
- `blocked` — The gate didn't run because a prerequisite failed

The `blocked` status distinguishes "check failed" from "couldn't run because something earlier broke."

### 2. Receipts

A **Receipt** is a durable record of what actually happened during a session. It captures the mode that was active, which tools were invoked, what gates ran and their outcomes, which files were touched, and a summary of results.

Receipts collapse the trust problem. The claim and the evidence are bundled together.

### 3. Modes

A **Mode** is a named configuration that bundles together a set of constraints, permissions, and expectations. Modes define what gates run, what tools are available, and what level of autonomy the model has.

Examples: `conservative`, `autonomous`, `review-only`

### 4. Policy Surface

The **Policy Surface** is the boundary layer where human judgment about risk, scope, and acceptable behavior gets encoded into rules the control stack can enforce.

Policy defines:
- Module ownership and risk tiers
- Allowed and forbidden edges (boundaries)
- Escalation conditions
- Blast radius limits

### 5. Epistemic Guardrails

**Epistemic Guardrails** are constraints that prevent models from operating on uncertain knowledge. They answer: "What does the model think it knows, and should it be allowed to act on that?"

### 6. Scope & Blast Radius

**Scope** defines what the model is allowed to touch. **Blast Radius** measures potential impact. Together they prevent runaway changes and contain failure.

---

## Consequences

### Positive

- **External validation** — Gates catch errors the model missed
- **Evidence production** — Receipts prove what happened
- **Consistent quality** — Same gates run locally and in CI
- **Auditable** — Reviewers can trace every decision
- **Model relief** — Constraints feel like relief: "I don't have to be right the first time"

### Negative

- **Overhead** — More infrastructure to implement
- **Learning curve** — Users must understand the control stack model
- **Configuration burden** — Policy surfaces need to be defined

---

## References

- `/docs/control-stack/index.md` — Overview
- `/docs/control-stack/gates/` — Gates specification
- `/docs/control-stack/receipts/` — Receipts specification
- `/docs/control-stack/modes/` — Modes specification
- `/docs/control-stack/policy-surface/` — Policy surface specification
