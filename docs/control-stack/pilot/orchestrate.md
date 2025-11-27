# Orchestrate — Plan Emission in the PILOT Loop

> **Turn the design into a machine-readable contract. Then hand it off.**

The **Orchestrate** phase transforms the task plan into a concrete, frozen `plan.json` that LexRunner can execute. This phase is **purely deterministic**—no LLM calls.

---

## Purpose

Orchestrate answers one question:

**What exactly should LexRunner do?**

It produces a `plan.json` that is:
- **Complete:** All information needed for execution
- **Frozen:** Immutable once emitted
- **Auditable:** Hashable for provenance

The Control Deck's job ends here. LexRunner takes over.

---

## Mathematical Framing

Let:
- $\mathcal{T}$ = `TaskPlan` from Layout

Orchestrate computes:

$$
\text{ExecutionPlan} = \omega(\mathcal{T})
$$

Where $\omega$ is a **pure function** that:
1. Serializes tasks to LexRunner's schema
2. Configures gates per task
3. Computes the plan hash for audit

**No stochastic calls.** $\tau_O = 0$.

---

## 1. Schema Translation

### 1.1 Task → PlanItem

For each task $t \in \mathcal{T}.\text{tasks}$:

```typescript
// Input (from Layout)
{
  id: "fix-legacy-setup",
  name: "Fix legacy test setup",
  dependencies: ["summarize-errors"],
  provider: { id: "copilot_cli", type: "agentic" },
  budget: { premium_requests: 25, minutes: 30 },
  gates: ["lint", "typecheck", "test"]
}

// Output (for LexRunner)
{
  name: "fix-legacy-setup",
  deps: ["summarize-errors"],
  gates: [
    { name: "lint", run: "npm run lint" },
    { name: "typecheck", run: "npm run typecheck" },
    { name: "test", run: "npm test" }
  ]
}
```

### 1.2 Provider Encoding

Provider information is encoded in task metadata or environment:

```typescript
{
  name: "fix-legacy-setup",
  deps: ["summarize-errors"],
  gates: [...],
  env: {
    "PILOT_PROVIDER": "copilot_cli",
    "PILOT_BUDGET_REQUESTS": "25",
    "PILOT_BUDGET_MINUTES": "30"
  }
}
```

LexRunner reads these but doesn't interpret them—the executor does.

---

## 2. Gate Configuration

### 2.1 Gate Resolution

For each gate name, resolve to a concrete command:

$$
\text{gate\_command}(g) = \text{registry}[g] \cup \text{policy\_overrides}[g]
$$

**Default gate registry:**

| Gate | Default Command |
|------|-----------------|
| `lint` | `npm run lint` |
| `typecheck` | `npm run typecheck` |
| `test` | `npm test` |
| `build` | `npm run build` |
| `determinism` | `npm run build && git diff --exit-code` |
| `policy` | `lex policy check` |

### 2.2 Gate Configuration

Each gate can have:

```typescript
{
  name: "test",
  run: "npm test",
  cwd: "./packages/core",
  env: { "CI": "true" },
  runtime: "local",
  artifacts: ["coverage/lcov.info", "junit.xml"]
}
```

### 2.3 Retry Configuration

From policy, attach retry rules:

```typescript
{
  name: "e2e",
  run: "npm run e2e",
  runtime: "container",
  // From policy.retries.e2e
  maxAttempts: 2,
  backoffSeconds: 30
}
```

---

## 3. Plan Assembly

### 3.1 Frozen Plan

The final `ExecutionPlan` (plan.json):

```json
{
  "schemaVersion": "1.0.0",
  "target": "main",
  "policy": {
    "requiredGates": ["lint", "typecheck", "test"],
    "optionalGates": ["e2e"],
    "maxWorkers": 2,
    "retries": {
      "e2e": { "maxAttempts": 2, "backoffSeconds": 30 }
    }
  },
  "items": [
    {
      "name": "summarize-errors",
      "deps": [],
      "gates": [
        { "name": "determinism", "run": "true" }
      ]
    },
    {
      "name": "fix-legacy-setup",
      "deps": ["summarize-errors"],
      "gates": [
        { "name": "lint", "run": "npm run lint" },
        { "name": "typecheck", "run": "npm run typecheck" },
        { "name": "test", "run": "npm test" }
      ]
    }
  ]
}
```

### 3.2 Plan Hash

Compute a content-addressable hash:

$$
\text{planHash} = \text{SHA256}(\text{canonicalJSON}(\text{plan}))
$$

This appears in:
- The plan file metadata
- Every Frame/Receipt produced during execution
- Audit logs

---

## 4. Handoff to LexRunner

### 4.1 Emit Artifacts

Orchestrate produces:

| Artifact | Purpose |
|----------|---------|
| `plan.json` | The frozen execution plan |
| `plan-hash.txt` | Content hash for audit |
| `pilot-context.json` | Full PILOT context for debugging |

### 4.2 Invoke LexRunner

Conceptually:

```bash
lex-pr-runner execute plan.json --run-id $RUN_ID
```

The Control Deck **does not wait** for completion. Track handles that.

---

## Schema: ExecutionPlan

```typescript
import { z } from "zod";

// Matches LexRunner's schema.ts
export const ExecutionPlan = z.object({
  schemaVersion: z.string().regex(/^1\.\d+\.\d+$/),
  target: z.string().default("main"),
  policy: z.object({
    requiredGates: z.array(z.string()).default([]),
    optionalGates: z.array(z.string()).default([]),
    maxWorkers: z.number().int().min(1).default(1),
    retries: z.record(z.object({
      maxAttempts: z.number().int().min(1).default(1),
      backoffSeconds: z.number().min(0).default(0),
    })).default({}),
  }).optional(),
  items: z.array(z.object({
    name: z.string(),
    deps: z.array(z.string()).default([]),
    gates: z.array(z.object({
      name: z.string(),
      run: z.string(),
      cwd: z.string().optional(),
      env: z.record(z.string()).default({}),
      runtime: z.enum(["local", "container", "ci-service"]).default("local"),
      artifacts: z.array(z.string()).default([]),
    })).default([]),
  })),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlan>;

// Orchestrate output wrapper
export const OrchestrateResult = z.object({
  plan: ExecutionPlan,
  planHash: z.string(),
  runId: z.string(),
  orchestrate_timestamp: z.string().datetime(),
});

export type OrchestrateResult = z.infer<typeof OrchestrateResult>;
```

---

## Validation Rules

Before emitting:

1. **Schema valid:** Plan passes LexRunner's Zod schema
2. **DAG valid:** No cycles in `deps` graph
3. **Gates exist:** All gate names have registered handlers
4. **Budget encoded:** Provider budgets are in environment or metadata

---

## Determinism Guarantee

Orchestrate is **100% deterministic**:

$$
\omega(\mathcal{T}_1) = \omega(\mathcal{T}_2) \iff \mathcal{T}_1 = \mathcal{T}_2
$$

Same TaskPlan → same ExecutionPlan → same planHash.

This is critical for:
- Replay/debugging
- Audit trails
- Cache invalidation

---

## What Orchestrate Does NOT Do

| Action | Why Not |
|--------|---------|
| Execute commands | That's LexRunner's job |
| Make LLM calls | Pure emission phase |
| Modify files | Control Deck never edits |
| Wait for completion | Track handles feedback |
| Interpret results | That's Track's job |

---

## Version Contract: Orchestrate (O)

```text
[signed Opie]
Orchestrate (O) is DONE when:
- ExecutionPlan schema matches LexRunner's plan.json contract.
- Schema translation is a pure function (no LLM calls, τ_O = 0).
- Gate resolution uses registry + policy overrides.
- Plan hash is computed via canonical JSON + SHA256.
- Artifacts are emitted: plan.json, plan-hash.txt, pilot-context.json.
- docs/control-stack/pilot/orchestrate.md describes the emission logic.
```

```text
[signed Lex ✶]
Countersigned. This is the v1.0 contract for Orchestrate in PILOT.
Date: 2025-11-27 (model-time)
```
