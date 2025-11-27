# Track — Feedback Loop in the PILOT Loop

> **Watch what happened. Decide what's next. Close the loop.**

The **Track** phase consumes execution results from LexRunner and decides whether the version contract is satisfied, a re-plan is needed, or escalation to human is required.

---

## Purpose

Track answers three questions:

1. **What happened?** — Consume Receipts, gate outcomes, budget usage
2. **Did we succeed?** — Check against version contract acceptance criteria
3. **What's next?** — Accept, re-plan, or escalate

Track closes the PILOT loop and produces the final outcome.

---

## Mathematical Framing

Let:
- $\mathcal{O}$ = `OrchestrateResult` (plan emitted)
- $\mathcal{R}$ = Receipts and gate outcomes from LexRunner
- $\mathcal{C}$ = Version contract (from Integrate)

Track computes:

$$
\text{TrackingDecision} = \tau(\mathcal{O}, \mathcal{R}, \mathcal{C})
$$

Where $\tau$ evaluates:
1. Gate pass/fail status
2. Budget consumption
3. Contract satisfaction

---

## 1. Result Collection

### 1.1 Gate Outcomes

For each task $t$ and gate $g$:

$$
\text{outcome}(t, g) \in \{\texttt{pass}, \texttt{fail}, \texttt{blocked}, \texttt{skipped}\}
$$

Aggregated:

| Status | Meaning |
|--------|---------|
| `pass` | All required gates passed |
| `fail` | One or more required gates failed |
| `blocked` | Dependency failed; task not run |
| `skipped` | Policy/config excluded this gate |

### 1.2 Budget Consumption

Track actual spend vs. allocated:

$$
\text{usage}(t) = \begin{cases}
\text{tokens\_used} & \text{if LLM task} \\
\text{requests\_used}, \text{minutes\_used} & \text{if agentic task}
\end{cases}
$$

Flags:
- **Soft limit exceeded:** $\text{usage}(t) > 0.8 \times \text{budget}(t)$
- **Hard limit hit:** Task terminated due to budget

### 1.3 Receipts

Collect Frames emitted during execution:

$$
\mathcal{F}_{\text{execution}} = \{f \mid f.\text{runId} = \mathcal{O}.\text{runId}\}
$$

These become part of the audit trail.

---

## 2. Contract Evaluation

### 2.1 Acceptance Criteria

The version contract defines acceptance:

```typescript
interface ContractAcceptance {
  required_gates: string[];      // Must all pass
  optional_gates: string[];      // May fail without blocking
  success_threshold: number;     // 0-1, fraction of tasks passing
  budget_tolerance: number;      // 0-1, allowed overage fraction
}
```

### 2.2 Evaluation Function

$$
\text{contract\_met}(\mathcal{R}, \mathcal{C}) = \begin{cases}
\texttt{true} & \text{if all required gates pass AND } \frac{|\text{tasks\_passed}|}{|\text{tasks}|} \geq \text{threshold} \\
\texttt{false} & \text{otherwise}
\end{cases}
$$

### 2.3 Failure Analysis (Stochastic)

If the contract is not met, optionally use one bounded LLM call:

$$
\text{analysis} = s_T(\mathcal{R}.\text{failures})
$$

**Budget:** $\tau_T \leq 500$ tokens

**Output:**
- Root cause hypothesis
- Suggested remediation
- Re-plan recommendations

---

## 3. Decision Logic

### 3.1 Decision Tree

```
                  ┌─────────────────┐
                  │ Contract met?   │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
          ┌───▼───┐                 ┌───▼───┐
          │  YES  │                 │  NO   │
          └───┬───┘                 └───┬───┘
              │                         │
        ┌─────▼─────┐           ┌───────┴───────┐
        │  ACCEPT   │           │ Retries left? │
        └───────────┘           └───────┬───────┘
                                        │
                          ┌─────────────┴─────────────┐
                          │                           │
                      ┌───▼───┐                   ┌───▼───┐
                      │  YES  │                   │  NO   │
                      └───┬───┘                   └───┬───┘
                          │                           │
                    ┌─────▼─────┐             ┌───────┴───────┐
                    │  RE-PLAN  │             │ Risk allows   │
                    └───────────┘             │ auto-escalate?│
                                              └───────┬───────┘
                                                      │
                                        ┌─────────────┴─────────────┐
                                        │                           │
                                    ┌───▼───┐                   ┌───▼───┐
                                    │  YES  │                   │  NO   │
                                    └───┬───┘                   └───┬───┘
                                        │                           │
                                  ┌─────▼─────┐               ┌─────▼─────┐
                                  │  ESCALATE │               │   FAIL    │
                                  └───────────┘               └───────────┘
```

### 3.2 Decision Outcomes

| Decision | Condition | Action |
|----------|-----------|--------|
| `accept` | Contract met | Close loop, emit success Receipt |
| `re-plan` | Retriable failures, retries remaining | → Back to Perceive/Layout |
| `escalate` | Non-retriable or risk requires human | → Human with context |
| `fail` | Out of retries, no escalation path | Close loop, emit failure Receipt |

---

## 4. Re-Plan Path

When Track decides to re-plan:

### 4.1 What Changes

| Component | Re-Plan Behavior |
|-----------|------------------|
| Perceive | Skip (intent unchanged) |
| Integrate | Skip (context unchanged) |
| Layout | Re-run with failure context |
| Orchestrate | Emit new plan |
| Track | Wait for new results |

### 4.2 Re-Plan Constraints

- **Max retries:** Configurable per gate (default: 1)
- **Budget preservation:** Remaining budget from first attempt
- **Provider rotation:** May try different provider for failed task

### 4.3 Re-Plan Input

```typescript
interface RePlanContext {
  original_plan: ExecutionPlan;
  failed_tasks: string[];
  failure_reasons: Record<string, string>;
  remaining_budget: TaskBudget;
  attempt_number: number;
}
```

---

## 5. Escalation Path

When Track decides to escalate:

### 5.1 Escalation Payload

```typescript
interface EscalationPayload {
  run_id: string;
  plan_hash: string;
  contract_id: string;

  // What failed
  failed_tasks: Array<{
    task_id: string;
    gate: string;
    error: string;
    logs?: string;
  }>;

  // Analysis (if stochastic call made)
  root_cause?: string;
  suggested_remediation?: string;

  // Context
  relevant_frames: string[];
  budget_usage: TaskBudget;
}
```

### 5.2 Escalation Channels

| Channel | When Used |
|---------|-----------|
| GitHub Issue comment | PR-related failures |
| Slack notification | Urgent (high risk_mode) |
| Email | Non-urgent, audit required |
| In-editor prompt | Interactive session |

---

## Schema: TrackingDecision

```typescript
import { z } from "zod";

export const GateOutcome = z.object({
  task_id: z.string(),
  gate: z.string(),
  status: z.enum(["pass", "fail", "blocked", "skipped"]),
  duration_ms: z.number().optional(),
  exit_code: z.number().optional(),
  error: z.string().optional(),
  artifacts: z.array(z.string()).default([]),
});

export const BudgetUsage = z.object({
  tokens_in: z.number().default(0),
  tokens_out: z.number().default(0),
  premium_requests: z.number().default(0),
  minutes: z.number().default(0),
  dollars: z.number().default(0),
});

export const TrackingDecision = z.object({
  // Decision
  decision: z.enum(["accept", "re-plan", "escalate", "fail"]),

  // Results
  gate_outcomes: z.array(GateOutcome),
  tasks_passed: z.number(),
  tasks_failed: z.number(),
  tasks_blocked: z.number(),

  // Budget
  budget_usage: BudgetUsage,
  budget_exceeded: z.boolean(),

  // Contract
  contract_met: z.boolean(),
  contract_id: z.string().optional(),

  // Analysis (optional, from stochastic call)
  failure_analysis: z.string().optional(),
  suggested_remediation: z.string().optional(),

  // Re-plan context (if decision = re-plan)
  replan_context: z.object({
    attempt_number: z.number(),
    failed_tasks: z.array(z.string()),
    remaining_budget: BudgetUsage,
  }).optional(),

  // Escalation payload (if decision = escalate)
  escalation_payload: z.unknown().optional(),

  // Observability (mandatory in v0)
  observed_scope: z.record(z.string(), z.object({
    inputs_visible: z.boolean(),
    outputs_visible: z.boolean(),
    intermediate_steps: z.enum(["full", "partial", "none"]),
    reasoning_trace: z.boolean(),
  })),
  blind_spots: z.record(z.string(), z.array(z.string())),

  // Provenance
  track_timestamp: z.string().datetime(),
  stochastic_call_id: z.string().optional(),
  receipts_emitted: z.array(z.string()).default([]),
});

export type TrackingDecision = z.infer<typeof TrackingDecision>;
```

---

## 6. Receipt Emission

Track always emits a Receipt:

### 6.1 Success Receipt

```json
{
  "receiptId": "receipt-run-123-success",
  "runId": "run-123",
  "type": "pilot-success",
  "contract_id": "v1.0.0-feature-x",
  "tasks_completed": 3,
  "budget_usage": { "tokens_out": 1500, "minutes": 12 },
  "timestamp": "2025-11-27T10:30:00Z"
}
```

### 6.2 Failure Receipt

```json
{
  "receiptId": "receipt-run-123-failure",
  "runId": "run-123",
  "type": "pilot-failure",
  "contract_id": "v1.0.0-feature-x",
  "failed_tasks": ["fix-legacy-setup"],
  "failure_reason": "test gate failed: 3 tests failing",
  "decision": "escalate",
  "timestamp": "2025-11-27T10:35:00Z"
}
```

---

## Configuration Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Max re-plan attempts | — | 2 | Total attempts before escalate/fail |
| Analysis token cap | $\tau_T$ | 500 | Max tokens for failure analysis |
| Auto-escalate threshold | — | 0.5 | Task failure ratio triggering escalation |
| Budget overage tolerance | — | 0.1 | 10% overage before flagging |

---

## Observability Limits: What We Can and Cannot See

Track must honestly document what it can observe per provider.
This prevents false confidence in incomplete data.

### 7.1 observed_scope Defaults (v0)

| Provider | inputs_visible | outputs_visible | intermediate_steps | reasoning_trace |
|----------|----------------|-----------------|---------------------|----------------|
| `local_llm` | ✅ yes | ✅ yes | full | ✅ yes |
| `openai` | ✅ yes | ✅ yes | none | ❌ no |
| `copilot_cli` | ✅ yes | ✅ yes | partial | ❌ no |
| `codex` | ✅ yes | ✅ yes | partial | ❌ no |
| `claude` | ✅ yes | ✅ yes | none | ❌ no |

### 7.2 blind_spots Defaults (v0)

| Provider | Known Blind Spots |
|----------|-------------------|
| `local_llm` | `[]` (full visibility) |
| `openai` | `["chain_of_thought", "tool_call_internals"]` |
| `copilot_cli` | `["agent_planning", "context_selection"]` |
| `codex` | `["code_reasoning", "alternative_paths_considered"]` |
| `claude` | `["chain_of_thought", "self_correction_steps"]` |

### 7.3 Why This Matters

- **Audit trail gaps:** If `reasoning_trace = false`, we cannot explain *why* a task produced its output.
- **Failure analysis limits:** If `intermediate_steps = none`, Track's stochastic analysis is guessing at root cause.
- **Honest reporting:** Receipts must include blind_spots so humans know what they're not seeing.

> **Invariant:** Track must populate `observed_scope` and `blind_spots` for every provider used in the run.
> Missing entries are a schema validation error, not a silent default.

---

## Version Contract: Track (T)

```text
[signed Opie]
Track (T) v0 is DONE when:
- TrackingDecision schema exists with all outcome types.
- Gate outcomes and budget usage are collected from LexRunner.
- Contract evaluation checks required gates and success threshold.
- Decision tree implements: accept / re-plan / escalate / fail.
- Failure analysis uses optional bounded LLM (τ_T ≤ 500).
- Receipts are emitted for all decisions.
- Re-plan path feeds back to Layout with failure context.
- observed_scope and blind_spots are mandatory per provider.
- docs/control-stack/pilot/track.md describes the logic.
```

```text
[signed Lex ✶]
Countersigned. This is the v0 contract for Track in PILOT.
Date: 2025-11-27 (model-time)
```
