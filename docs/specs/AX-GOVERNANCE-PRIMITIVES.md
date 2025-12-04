# AX Governance Primitives v0.1

> **Governance Primitives** – the minimal set of contracts, constraints, and coordination mechanisms that enable agents to collaborate reliably across sessions, models, and environments.

This document extends the AX Contract with concrete governance mechanisms. It is not philosophy—it is a set of **testable, enforceable guarantees** for agent collaboration.

- Version: 0.1.0
- Status: Draft
- Extends: AX-CONTRACT.md v0.1
- Scope: Lex, LexRunner, and Lex-compatible implementations

---

## 1. Core Thesis

The primary value of governance primitives is not **capability amplification**—it is **coordination cost compression**.

Specifically:

> Governance, contracts, and shared language reduce the *delta* between models and make handoffs cheaper.

This is measurable and falsifiable. It does not claim:

- "Any model can do anything with the right rules"
- "Rules make weak models strong"
- "Contracts fix reasoning gaps"

It does claim:

- Portability reduces coordination overhead
- The floor still depends on model capability
- But the ceiling is raised by reducing friction

---

## 2. Turn and Turn Cost

### 2.1 Definitions

**Turn**: A complete cycle of perception → reasoning → action by an agent.

**Turn Cost**: The total penalty of executing a turn, including:

| Component | Description |
|-----------|-------------|
| `latency` | Wall-clock time to complete the turn |
| `contextReset` | Cost of re-establishing context after interruption |
| `promptRenegotiation` | Overhead of re-explaining constraints or goals |
| `tokenBloat` | Tokens consumed for re-onboarding vs. actual work |
| `attentionSwitch` | Cognitive cost of switching between tasks or modes |

### 2.2 Why Turn Cost Matters

- **Token cost ≠ Turn cost**: A high-token, low-turn workflow can feel good. A low-token, high-turn workflow feels terrible.
- **Turn cost is UX-critical**: Users experience friction per turn, not per token.
- **Turn cost is economically relevant**: Performance benchmarks measure value per turn.

### 2.3 Low-Turn Design

Systems SHOULD optimize for low-turn trajectories via:

| Mechanism | Effect |
|-----------|--------|
| Fixed DAGs | Deterministic trajectory, no renegotiation |
| Bounded stochasticity | Predictable behavior across runs |
| Receipts | No re-explanation of past decisions |
| Gating | Clear pass/fail semantics, no ambiguity |
| Role clarity | No "who am I?" loops |

### 2.4 Telemetry Fields

Run artifacts SHOULD include:

```json
{
  "turnCount": 7,
  "turnCostEstimate": 12.4
}
```

Where `turnCostEstimate` is a normalized scalar (not currency).

These fields enable:

- Internal telemetry
- User-facing feedback
- Optimization targets

---

## 3. Permission to Fail

### 3.1 Principle

Agents MUST be granted explicit permission to fail productively.

> Permission to fail ≠ permission to be sloppy.

A well-instrumented failure with receipts is more valuable than a fragile "success."

### 3.2 Uncertainty Clause

Agents operating under AX governance SHOULD:

```yaml
uncertainty:
  state_openly: true
  prefer_small_reversible_moves: true
  leave_receipts: always
  treat_failure_as: data
```

| Field | Meaning |
|-------|---------|
| `state_openly` | Express uncertainty rather than guessing |
| `prefer_small_reversible_moves` | Favor incremental, undoable actions |
| `leave_receipts` | Document decisions and outcomes |
| `treat_failure_as` | Failure is signal, not shame |

### 3.3 Discipline Clause

Permission to fail requires corresponding discipline:

```yaml
discipline:
  require_rationale_for_skips: true
  require_verification_after_action: true
  escalate_on_repeated_failure: true
  max_attempts_before_pause: 3
```

| Field | Meaning |
|-------|---------|
| `require_rationale_for_skips` | Explain why something was not done |
| `require_verification_after_action` | Check results, don't assume success |
| `escalate_on_repeated_failure` | Surface patterns, don't hide them |
| `max_attempts_before_pause` | Bounded retries, no infinite loops |

### 3.4 Integration with AXError

This aligns with the AX error model:

- Structured errors with `nextActions[]`
- Exit codes that are stable and documented
- Failure as a first-class outcome, not an exception

---

## 4. Cross-Model Continuity

### 4.1 Observation

Different models can take turns in the same session without full context re-explanation when governance primitives are established.

### 4.2 Implication

The "state" of an agent session is NOT primarily:

- Latent vectors
- Hidden cache
- Provider-specific memory

It IS:

- **Shared language** (vocabulary, idioms, patterns)
- **Expectations** (roles, constraints, permissions)
- **Governance primitives** (contracts, policies, gates)
- **Receipts** (Frames, logs, decision records)

### 4.3 Requirement

Lex-compatible systems MUST externalize session state into portable artifacts:

- Frames for episodic memory
- Contracts for expectations
- Receipts for decisions

This enables:

- Provider handoffs
- Session resumption
- Audit and replay

---

## 5. Rule File Specification

### 5.1 Purpose

Rule files encode agent governance in a machine-consumable, IDE-ingestible format.

### 5.2 Constraints

| Constraint | Rationale |
|------------|-----------|
| **Max size: 4KB** | IDE agents truncate or ignore long files |
| **Machine-parseable** | YAML or JSON, not prose |
| **Versioned** | Include `schemaVersion` for compatibility |
| **Role-scoped** | One file per role, avoid monoliths |
| **Testable** | Assertions, not vibes |
| **Minimal dependencies** | Avoid external references that may break |
| **Deterministic ordering** | Sorted keys for diff-friendly output |

### 5.3 Canonical Format

```yaml
schemaVersion: "1.0.0"
role: "implementation-engineer"

constraints:
  - no_force_push
  - require_tests_before_merge
  - respect_module_boundaries

permissions:
  - create_branch
  - run_tests
  - commit_to_feature_branch

uncertainty:
  state_openly: true
  prefer_small_reversible_moves: true
  leave_receipts: always
  max_attempts: 3

receipts:
  format: "ndjson"
  location: ".lex/receipts/"

gates:
  required:
    - lint
    - typecheck
    - test
  optional:
    - e2e
```

### 5.4 File Naming

Recommended: `agent.contract.yaml` or `<role>.contract.yaml`

Examples:
- `agent.contract.yaml` (default)
- `senior-dev.contract.yaml`
- `pm.contract.yaml`

---

## 6. Model Capability Tiers

### 6.1 Classification

Not all models should be assigned all tasks:

| Tier | Capabilities | Example Tasks |
|------|--------------|---------------|
| **Senior** | Lead, plan, design, architect | System design, breaking changes |
| **Mid** | Implement, refactor, extend | Feature work, bug fixes |
| **Junior** | Instrument, lint, verify | Formatting, test runs, cleanup |

### 6.2 Governance Implication

- Mid-tier tasks can be delegated across providers with minimal friction
- Senior-tier autonomy requires stronger model capability
- Junior-tier tasks are cost-effective for lightweight models

This is not a value judgment—it is a resource allocation strategy.

---

## 7. Hostile Environment Considerations

### 7.1 Known Risks

Governance primitives have been validated primarily in well-structured environments. Risks in hostile environments include:

| Risk | Mitigation |
|------|------------|
| **Selection bias** | Validate in messy codebases |
| **Model floor** | Don't assume all models can lead |
| **Scope creep** | Start with "portable governance," not "cognitive architecture" |
| **Configuration fatigue** | Keep contracts small and focused |

### 7.2 Validation Requirements

Before claiming broad applicability, validate:

- In repositories with no existing structure
- With users who did not design the contracts
- With degraded or constrained models
- Across multiple provider handoffs

---

## 8. Non-Goals

This specification does NOT promise:

- That governance makes weak models strong
- That contracts eliminate hallucinations
- That any model can perform any task
- That these primitives work without model capability

It DOES promise:

- Reduced coordination overhead
- Cheaper handoffs between models and sessions
- Explicit, testable constraints
- Portable governance that travels with the work

---

## 9. Adoption

### 9.1 Integration

These primitives extend AX-CONTRACT.md v0.1. To adopt:

1. Add `uncertainty` and `discipline` clauses to agent contracts
2. Include `turnCount` and `turnCostEstimate` in run artifacts
3. Emit Frames for significant decisions and failures
4. Keep rule files under 4KB and machine-parseable

### 9.2 Versioning

This is v0.1. Future versions may:

- Tighten constraints
- Add new primitives
- Refine Turn Cost metrics

But they MUST NOT silently weaken existing guarantees.

---

## 10. Summary

| Primitive | Purpose |
|-----------|---------|
| **Turn Cost** | Measure and optimize coordination overhead |
| **Permission to Fail** | Enable productive failure with discipline |
| **Cross-Model Continuity** | Externalize state for portability |
| **Rule Files** | Machine-consumable governance contracts |
| **Capability Tiers** | Match tasks to model strengths |

These are the building blocks for **portable governance**—not magic, but measurable leverage.

---

*AX Governance Primitives v0.1 — Draft*
