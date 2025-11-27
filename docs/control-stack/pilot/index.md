# The PILOT Loop

> **The Control Deck runs the PILOT loop once per task/episode under a given version contract.**
> **It *never* directly edits code or runs commands; it plans and allocates.**

**Version:** PILOT v0 (draft) — deliberately constrained scope.

---

## Overview

PILOT is a **control loop**, not an API. It classifies, plans, and allocates—but never executes.

$$
\text{PILOT} : \text{Request} \times \text{State} \rightarrow \text{Outcome}
$$

Each phase has a specific responsibility and produces typed artifacts that flow to the next phase.

---

## v0 Constraints (Deliberate)

PILOT v0 is **intentionally small**. Wider scope requires a version bump.

| Constraint | v0 Limit | Future (v1+) |
|------------|----------|--------------|
| Repos per run | 1 | Multi-repo orchestration |
| Branches per run | 1 | Cross-branch coordination |
| Providers per plan | ≤ 2 | Arbitrary provider graphs |
| DAG pattern | Fixed: analysis → proposal → gates → (apply) | Deep/arbitrary DAGs |
| Total stochastic tokens | $\tau_P \leq 500$, others = 0 | Per-phase budgets |

**If you need more, you need PILOT v1.**

---

## What PILOT Guarantees vs. Doesn't

### ✓ Guarantees

- There is always a **visible plan and budget** for each run
- We know which providers/agents we **asked** to do what
- We know which Receipts we **got back** and how we interpreted them
- Decisions are logged with provenance

### ✗ Does NOT Guarantee

- That providers didn't do extra internal work we can't observe
- Perfect understanding of intent
- Perfect safety under misconfigurations
- That nothing happened beyond what Receipts show

> **Receipts prove what we observed, not that nothing else happened.**

---

## Task Classes: Safe vs. Mutating

PILOT distinguishes two task classes:

| Class | Examples | When Allowed | Typical Providers |
|-------|----------|--------------|-------------------|
| **Safe** | Read-only analysis, log summarization, dry-run, status checks | Always | `local_llm`, `openai` |
| **Mutating** | Code edits, file creation, migrations, config changes, merges, PRs | Only when $a \leq \theta$ AND $\delta \geq \delta_{\min}$ | `copilot_cli`, `codex` |

### Examples

| Task | Class | Rationale |
|------|-------|----------|
| "Summarize the lint errors" | Safe | Read-only, no repo changes |
| "Explain this function" | Safe | Analysis, no side effects |
| "Run tests in dry-run mode" | Safe | Observation only |
| "Fix the failing test" | Mutating | Edits code |
| "Create a PR for this branch" | Mutating | Creates external artifact |
| "Apply the migration" | Mutating | Database/schema changes |

Perceive + Integrate decide which classes are allowed under current risk/ambiguity.
**Perceive does not block the loop—it gates which actions are permitted.**

> **Invariant:** Perceive must always produce at least one SAFE task that can run.
> If truly nothing safe exists, that is an explicit error, not silent gating.

---

## The Five Phases

| Phase | Name | Responsibility | Primary Output | Version |
|-------|------|----------------|----------------|---------|
| **P** | [Perceive](./perceive.md) | Classify risk, compute ambiguity, gate task classes | `PerceivedIntent` | draft v0 |
| **I** | [Integrate](./integrate.md) | Resolve precedence, validate scope | `IntegratedContext` | draft |
| **L** | [Layout](./layout.md) | v0 DAG: analysis → proposal → gates | `TaskPlan` | draft |
| **O** | [Orchestrate](./orchestrate.md) | Emit frozen plan.json | `ExecutionPlan` | signed v0 |
| **T** | [Track](./track.md) | Consume Receipts, log blind spots, decide | `TrackingDecision` | draft |

---

## Stochastic Budget (v0)

| Phase | Budget | Notes |
|-------|--------|-------|
| Perceive | $\tau_P \leq 500$ | One LLM call for disambiguation |
| Integrate | $\tau_I = 0$ | Pure precedence resolution |
| Layout | $\tau_L = 0$ | Deterministic pattern selection |
| Orchestrate | $\tau_O = 0$ | Pure serialization |
| Track | $\tau_T \leq 500$ | Advisory summaries only, not ground truth |

**Total v0:** $\tau_{\text{total}} \leq 1000$ tokens (P + T only)

> Config parameters like $\tau$, $\theta$, $\delta_{\min}$ are themselves under a **config contract**. Changing them requires a new version with rationale.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PILOT v0 Loop                                │
│                                                                      │
│  ┌──────────┐    ┌───────────┐    ┌────────┐    ┌───────────┐       │
│  │ Perceive │───▶│ Integrate │───▶│ Layout │───▶│Orchestrate│       │
│  │ advisory │    │ precedence│    │  v0 DAG│    │   pure    │       │
│  └──────────┘    └───────────┘    └────────┘    └─────┬─────┘       │
│       │                                               │              │
│   gates ACTIONS                                       ▼              │
│   not the LOOP                                 ┌───────────┐         │
│       │                                        │   Track   │         │
│       │◀───────────────────────────────────────│ + blind   │         │
│       │         (re-plan if needed)            │   spots   │         │
│       │                                        └───────────┘         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │      LexRunner        │
                    │  (Executor, not PILOT)│
                    └───────────────────────┘
```

---

## Key Invariants

### 1. Control Deck Never Executes

The Control Deck (running PILOT) **never**:
- Runs `git commit`, `npm test`, or any shell command
- Edits files directly
- Makes network requests to external services

It only emits plans. LexRunner executes them.

### 2. Perceive is Advisory, Not a Hard Gate

Perceive classifies risk and ambiguity. It **does not stall the loop**.
Instead, it determines which task classes (safe vs. mutating) are allowed.

### 3. Version Contract Binding

Every PILOT run is bound to a version contract:
- If no contract is specified, use the **default conservative mode**
- If a contract is specified, scope is frozen to that contract
- Scope creep triggers **next-version escalation**, not silent widening

---

## Phase Summaries

### P — Perceive

Transform raw request into structured intent.

**Input:** Human request + context (repo, branch, editor state)
**Output:** `PerceivedIntent` with goal, constraints, risk_mode, provenance
**Math:** $\vec{I} = g(h(x), s(x))$ — deterministic extraction + bounded stochastic

[Full documentation →](./perceive.md)

### I — Integrate

Pull in Lex state and validate against contracts.

**Input:** `PerceivedIntent` + Lex state (Frames, LexSona rules)
**Output:** `IntegratedContext` with scope validation, mode permissions
**Key question:** "Is this in-scope for the current contract?"

[Full documentation →](./integrate.md)

### L — Layout

Design the execution plan without touching the repo.

**Input:** `IntegratedContext`
**Output:** `TaskPlan` with task DAG, provider assignments, budgets
**Key artifact:** Task graph with dependencies and resource allocations

[Full documentation →](./layout.md)

### O — Orchestrate

Emit the concrete, machine-readable plan.

**Input:** `TaskPlan`
**Output:** `ExecutionPlan` (plan.json) for LexRunner
**Key property:** Purely deterministic; no LLM calls

[Full documentation →](./orchestrate.md)

### T — Track

Consume execution results and decide next action.

**Input:** Receipts, gate outcomes, budget usage from LexRunner
**Output:** `TrackingDecision` — accept / re-plan / escalate
**Key question:** "Did we meet the contract, or do we need to adjust?"

[Full documentation →](./track.md)

---

## Provider Model

PILOT supports multiple provider types for task execution:

| Provider | Type | Budget Dimensions | Use Case |
|----------|------|-------------------|----------|
| `local_llm` | LLM | tokens_in, tokens_out | Cheap local inference |
| `openai` | LLM | tokens, dollars | High-quality generation |
| `github_models` | LLM | tokens, requests | GitHub-integrated inference |
| `copilot_cli` | Agentic | premium_requests, minutes | Multi-step terminal work |
| `codex` | Agentic | premium_requests, minutes | Code generation jobs |

Layout assigns providers; Orchestrate emits the assignments in plan.json.

---

## Failure Modes & Recovery

| Failure | Phase | Response |
|---------|-------|----------|
| Ambiguous intent | Perceive | → Clarify (ask human) |
| Out of scope | Integrate | → Next-version escalation |
| No valid provider | Layout | → Re-plan with different constraints |
| Gate failure | Track | → Re-plan or escalate per policy |
| Budget exceeded | Track | → Stop and report |

---

## Relationship to Existing Concepts

| Control Stack Concept | PILOT Phase(s) |
|----------------------|----------------|
| [Receipts](../receipts/) | Track consumes them |
| [Gates](../gates/) | Orchestrate configures them |
| [Modes](../modes/) | Integrate checks them |
| [Policy Surface](../policy-surface/) | Integrate + Layout respect it |
| [Epistemic Guardrails](../epistemic-guardrails/) | All phases (ambiguity gates) |
| [Scope & Blast Radius](../scope-and-blast-radius/) | Integrate enforces it |

---

## Config Contract: PILOT v0

The following parameters are governed by the **PILOT v0 config contract**.
Changing them is a **version bump**, not a casual toggle.

| Parameter | Symbol | v0 Value | Scope |
|-----------|--------|----------|-------|
| Perceive stochastic budget | $\tau_P$ | ≤ 500 tokens | Per run |
| Track stochastic budget | $\tau_T$ | ≤ 500 tokens | Per run |
| Total stochastic budget | $\tau_{\text{total}}$ | ≤ 1000 tokens | P + T only |
| Determinism threshold | $\delta_{\min}$ | 0.8 | All phases |
| Ambiguity threshold | $\theta$ | 0.3 | Perceive |
| Max providers per plan | — | 2 | Layout |
| DAG pattern | — | analysis → proposal → gates → apply | Layout |

> To weaken any of these constraints, create a new version contract (e.g., PILOT v0.1 or v1) with explicit rationale.

---

## Version Contract: PILOT Loop

```text
[signed Opie]
PILOT v0 is DONE when:
- All five phases have typed input/output schemas.
- Stochastic budget: τ_P ≤ 500, τ_T ≤ 500, I/L/O = 0.
- Total stochastic budget τ_total ≤ 1000 tokens per cycle.
- Control Deck never executes; only emits plans.
- Perceive always allows at least one SAFE task.
- Version contract binding is enforced in Integrate.
- Track records observed_scope and blind_spots per provider.
- Re-plan and escalation paths are defined in Track.
- docs/control-stack/pilot/ contains index + per-phase docs.
```

```text
[signed Lex ✶]
Countersigned. This is the v0 contract for the PILOT loop.
Date: 2025-11-27 (model-time)
```

```text
[signed ~]
Countersigned. Acknowledged as the v0 contract for the PILOT loop.
Date: 2025-11-27 (model-time)
```
