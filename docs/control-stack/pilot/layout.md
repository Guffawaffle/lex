# Layout — Plan Design in the PILOT Loop

> **Break down the work. Assign the workers. Set the limits.**

The **Layout** phase transforms validated intent into a concrete task graph with provider assignments and budget allocations—all without touching the repo.

---

## Purpose

Layout answers three questions:

1. **What are the tasks?** — Decompose the goal into atomic work units
2. **Who does each task?** — Assign providers (LLM, agentic, API)
3. **What are the limits?** — Set budgets (tokens, time, money, requests)

Layout designs the plan; Orchestrate emits it.

---

## Mathematical Framing

Let:
- $\mathcal{I}$ = `IntegratedContext` from Integrate
- $\mathcal{P}$ = Available providers (filtered by permissions)
- $\mathcal{B}$ = Budget constraints (from policy)

Layout computes:

$$
\text{TaskPlan} = \lambda(\mathcal{I}, \mathcal{P}, \mathcal{B})
$$

Where $\lambda$ produces:
1. A **task DAG** $G = (V, E)$ where $V$ = tasks, $E$ = dependencies
2. A **provider assignment** $\pi : V \rightarrow \mathcal{P}$
3. A **budget allocation** $\beta : V \rightarrow \mathcal{B}$

---

## 1. Task Decomposition

### 1.1 Goal to Tasks

Transform the goal into atomic tasks:

$$
V = \text{decompose}(\mathcal{I}.\text{intent}.\text{goal}, \mathcal{I}.\text{relevant\_frames})
$$

**Decomposition strategies:**

| Goal Type | Decomposition |
|-----------|---------------|
| Single file change | 1 task: edit + verify |
| Multi-file refactor | N tasks: one per file + integration |
| Feature implementation | Subtasks: scaffold, implement, test, document |
| Bug fix | Subtasks: reproduce, diagnose, fix, verify |

### 1.2 Dependency Graph

Build the DAG:

$$
E = \{(t_i, t_j) \mid t_j \text{ depends on } t_i\}
$$

**Topological constraints:**
- Tests depend on implementation
- Documentation depends on API stability
- Integration depends on all component tasks

### 1.3 Stochastic Assist (Optional)

For complex goals, use one bounded LLM call to suggest decomposition:

$$
V_{\text{suggested}} = s_L(\mathcal{I}.\text{intent}.\text{goal})
$$

**Budget:** $\tau_L \leq 500$ tokens output

**Merge rule:** Deterministic decomposition takes precedence; stochastic suggestions fill gaps.

---

## 2. Provider Assignment

### 2.1 Provider Registry

Available provider types:

| Provider | Type | Capabilities | Cost Model |
|----------|------|--------------|------------|
| `local_llm` | LLM | Fast inference, local | tokens |
| `openai` | LLM | High quality, API | tokens + dollars |
| `github_models` | LLM | GitHub-integrated | tokens + requests |
| `copilot_cli` | Agentic | Terminal workflows | premium_requests + minutes |
| `codex` | Agentic | Code generation | premium_requests + minutes |

### 2.2 Assignment Function

For each task $t \in V$:

$$
\pi(t) = \underset{p \in \mathcal{P}_{\text{allowed}}}{\arg\min} \; \text{cost}(t, p) \quad \text{s.t.} \quad \text{capability}(p) \supseteq \text{requirements}(t)
$$

**Assignment heuristics:**

| Task Type | Preferred Provider | Fallback |
|-----------|-------------------|----------|
| Log summarization | `local_llm` | `openai` |
| Code generation | `copilot_cli` | `codex` |
| Complex refactor | `copilot_cli` | Manual escalation |
| Documentation | `local_llm` | `openai` |
| Test generation | `copilot_cli` | `codex` |

### 2.3 Risk Mode Influence

The effective `risk_mode` constrains provider choice:

| Risk Mode | Allowed Providers |
|-----------|-------------------|
| `fast` | `local_llm` only |
| `conservative` | All, but human approval for merges |
| `exploratory` | All, but `dry_run: true` enforced |

---

## 3. Budget Allocation

### 3.1 Budget Dimensions

Each provider type has different budget dimensions:

```typescript
type LLMBudget = {
  tokens_in: number;
  tokens_out: number;
  dollars?: number;
};

type AgenticBudget = {
  premium_requests: number;
  minutes: number;
  tool_calls?: number;
};
```

### 3.2 Allocation Strategy

For each task $t$ with provider $\pi(t)$:

$$
\beta(t) = \text{allocate}(t, \pi(t), \mathcal{B}_{\text{remaining}})
$$

**Allocation rules:**
1. Estimate task complexity from goal + file count
2. Apply per-task caps from policy
3. Reserve buffer for retries (20% default)
4. Hard caps are never exceeded

### 3.3 Budget Formulas

**LLM tasks:**
$$
\text{tokens\_out}(t) = \min\bigl(\text{estimate}(t), \; \tau_{\text{max}}\bigr)
$$

**Agentic tasks:**
$$
\text{minutes}(t) = \min\bigl(\text{complexity}(t) \times 5, \; m_{\text{max}}\bigr)
$$

Where:
- $\tau_{\text{max}}$ = max tokens per task (default: 2000)
- $m_{\text{max}}$ = max minutes per task (default: 30)

---

## 4. Gate Configuration

Layout specifies which gates apply to each task:

$$
\text{gates}(t) = \text{policy\_gates} \cup \text{task\_specific\_gates}
$$

**Common gates:**

| Gate | When Required |
|------|---------------|
| `lint` | Any code change |
| `typecheck` | TypeScript files |
| `test` | Implementation tasks |
| `policy` | Scope-changing tasks |
| `determinism` | Plan artifacts |

---

## Schema: TaskPlan

```typescript
import { z } from "zod";
import { IntegratedContext } from "./integrate.js";

export const ProviderSpec = z.object({
  id: z.string(), // "local_llm", "copilot_cli", etc.
  type: z.enum(["llm", "agentic", "api"]),
  model: z.string().optional(), // "fast", "gpt-4", etc.
});

export const TaskBudget = z.object({
  // LLM budgets
  tokens_in: z.number().optional(),
  tokens_out: z.number().optional(),
  dollars: z.number().optional(),
  // Agentic budgets
  premium_requests: z.number().optional(),
  minutes: z.number().optional(),
  tool_calls: z.number().optional(),
});

export const Task = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()).default([]), // Task IDs
  provider: ProviderSpec,
  budget: TaskBudget,
  gates: z.array(z.string()).default([]),
  policy: z.object({
    require_approval: z.boolean().default(false),
    dry_run: z.boolean().default(false),
  }).default({}),
});

export const TaskPlan = z.object({
  // Input context (passed through)
  context: IntegratedContext,

  // Task graph
  tasks: z.array(Task),

  // Global constraints
  total_budget: TaskBudget,
  parallelism: z.number().default(1),

  // Provenance
  layout_timestamp: z.string().datetime(),
  stochastic_call_id: z.string().optional(),
  decomposition_method: z.enum(["deterministic", "hybrid"]),
});

export type TaskPlan = z.infer<typeof TaskPlan>;
```

---

## Validation Rules

Before proceeding to Orchestrate:

1. **DAG is valid:** No cycles in dependency graph
2. **Budget is feasible:** $\sum_{t \in V} \beta(t) \leq \mathcal{B}_{\text{total}}$
3. **Providers are available:** $\forall t : \pi(t) \in \mathcal{P}_{\text{allowed}}$
4. **Gates are defined:** All specified gates have registered handlers

---

## Configuration Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Max tasks | — | 20 | Maximum tasks per plan |
| Token cap per task | $\tau_{\text{max}}$ | 2000 | Max tokens for LLM tasks |
| Minute cap per task | $m_{\text{max}}$ | 30 | Max minutes for agentic tasks |
| Retry buffer | — | 20% | Budget reserved for retries |
| Decomposition token cap | $\tau_L$ | 500 | Max tokens for stochastic decomposition |

---

## Example: Layout Output

```json
{
  "tasks": [
    {
      "id": "summarize-errors",
      "name": "Summarize lint errors",
      "description": "Parse and summarize the 47 lint errors",
      "dependencies": [],
      "provider": { "id": "local_llm", "type": "llm", "model": "fast" },
      "budget": { "tokens_in": 2000, "tokens_out": 800 },
      "gates": ["determinism"]
    },
    {
      "id": "fix-legacy-setup",
      "name": "Fix legacy test setup",
      "description": "Refactor setupTests.ts to modern patterns",
      "dependencies": ["summarize-errors"],
      "provider": { "id": "copilot_cli", "type": "agentic" },
      "budget": { "premium_requests": 25, "minutes": 30 },
      "gates": ["lint", "typecheck", "test"],
      "policy": { "require_approval": true }
    }
  ],
  "total_budget": { "tokens_out": 1500, "premium_requests": 30, "minutes": 45 },
  "parallelism": 1
}
```

---

## Version Contract: Layout (L)

```text
[signed Opie]
Layout (L) is DONE when:
- TaskPlan schema exists with tasks, providers, budgets, gates.
- Task decomposition is deterministic with optional bounded LLM assist (τ_L ≤ 500).
- Provider assignment respects permissions and risk mode.
- Budget allocation enforces caps and reserves retry buffer.
- DAG validation catches cycles before Orchestrate.
- docs/control-stack/pilot/layout.md describes the logic.
```

```text
[signed Lex ✶]
Countersigned. This is the v1.0 contract for Layout in PILOT.
Date: 2025-11-27 (model-time)
```
