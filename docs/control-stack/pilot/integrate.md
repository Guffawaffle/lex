# Integrate — Context Assembly in the PILOT Loop

> **Pull in what you know. Check what you're allowed. Reject what's out of scope.**

The **Integrate** phase assembles the full context needed for planning and validates that the perceived intent is within the bounds of the current version contract.

---

## Purpose

Integrate answers three questions:

1. **What do we know?** — Pull Frames, Receipts, active contracts from Lex
2. **What are we allowed?** — Check LexSona rules, mode permissions, policy surface
3. **Is this in scope?** — Validate against the bound version contract

If the intent is out of scope, Integrate does **not** silently widen—it escalates.

---

## Mathematical Framing

Let:
- $\vec{I}$ = `PerceivedIntent` from Perceive
- $\mathcal{L}$ = Lex state (Frames, Atlas, Receipts)
- $\mathcal{S}$ = LexSona rules (house rules, permissions)
- $\mathcal{C}$ = Active version contract (if bound)

Integrate computes:

$$
\text{IntegratedContext} = \phi(\vec{I}, \mathcal{L}, \mathcal{S}, \mathcal{C})
$$

Where $\phi$ is a deterministic function that:
1. Retrieves relevant context from $\mathcal{L}$
2. Filters by permissions in $\mathcal{S}$
3. Validates scope against $\mathcal{C}$

---

## 1. Context Retrieval

### 1.1 Frame Recall

Given the intent, recall relevant Frames:

$$
\mathcal{F}_{\text{relevant}} = \text{recall}(\vec{I}.\text{goal}, \vec{I}.\text{files\_mentioned}, k)
$$

Where:
- `recall` is the Lex semantic search over Frames
- $k$ is the max frames to retrieve (default: 10)

This is **deterministic** given the same Lex database state.

### 1.2 Receipt History

Pull recent Receipts for the same repo/branch:

$$
\mathcal{R}_{\text{recent}} = \text{receipts}(\vec{I}.\text{repo}, \vec{I}.\text{branch}, t)
$$

Where $t$ is the lookback window (default: 7 days).

### 1.3 Contract Lookup

If `version_contract_id` is specified:

$$
\mathcal{C} = \text{contracts}[\vec{I}.\text{version\_contract\_id}]
$$

Otherwise, $\mathcal{C} = \text{default\_conservative}$.

---

## 2. Permission Checking

### 2.1 Mode Validation

Check if the requested `risk_mode` is allowed:

$$
\text{mode\_allowed} = \vec{I}.\text{risk\_mode} \in \mathcal{S}.\text{allowed\_modes}
$$

If not allowed, either:
- Downgrade to a permitted mode, or
- Escalate to human

### 2.2 Path Permissions

Check if mentioned files are within allowed paths:

$$
\text{paths\_allowed} = \forall p \in \vec{I}.\text{files\_mentioned} : p \in \mathcal{S}.\text{allowed\_paths}
$$

Violations trigger scope escalation.

### 2.3 Provider Permissions

Pre-filter which providers are available:

$$
\mathcal{P}_{\text{allowed}} = \mathcal{S}.\text{allowed\_providers} \cap \text{available\_providers}
$$

This feeds into Layout.

---

## 3. Scope Validation

### 3.1 Contract Scope Check

If a version contract is bound, check intent against it:

$$
\text{in\_scope}(\vec{I}, \mathcal{C}) = \vec{I}.\text{goal} \subseteq \mathcal{C}.\text{scope}
$$

This is implemented as:
1. Keyword matching against contract scope bullets
2. File path intersection with contract boundaries
3. Optional: one bounded LLM call for semantic matching ($\tau_I \leq 300$ tokens)

### 3.2 Scope Decision

$$
\sigma(\vec{I}, \mathcal{C}) = \begin{cases}
\texttt{in\_scope} & \text{if } \text{in\_scope}(\vec{I}, \mathcal{C}) = \text{true} \\
\texttt{next\_version} & \text{otherwise}
\end{cases}
$$

If $\sigma = \texttt{next\_version}$:
- Do **not** proceed to Layout
- Emit a `ScopeEscalation` with suggested parking

---

## 4. Stochastic Assist (Optional)

Integrate may use **one** bounded LLM call for:
- Semantic scope matching when keywords are ambiguous
- Suggesting which version contract to use if none specified

**Budget:** $\tau_I \leq 300$ tokens output

**Failure path:** If the call fails, fall back to keyword-only matching.

---

## Schema: IntegratedContext

```typescript
import { z } from "zod";
import { PerceivedIntent } from "./perceive.js";

export const IntegratedContext = z.object({
  // Input intent (passed through)
  intent: PerceivedIntent,

  // Retrieved context
  relevant_frames: z.array(z.string()).default([]), // Frame IDs
  recent_receipts: z.array(z.string()).default([]), // Receipt IDs

  // Contract binding
  version_contract_id: z.string().optional(),
  version_contract_scope: z.array(z.string()).default([]),

  // Permission results
  mode_allowed: z.boolean(),
  effective_mode: z.enum(["fast", "conservative", "exploratory"]),
  paths_allowed: z.boolean(),
  path_violations: z.array(z.string()).default([]),
  allowed_providers: z.array(z.string()).default([]),

  // Scope validation
  scope_decision: z.enum(["in_scope", "next_version", "needs_clarification"]),
  scope_notes: z.string().optional(),

  // Provenance
  integrate_timestamp: z.string().datetime(),
  stochastic_call_id: z.string().optional(),
});

export type IntegratedContext = z.infer<typeof IntegratedContext>;
```

---

## Decision Outcomes

| Outcome | Condition | Next Action |
|---------|-----------|-------------|
| `proceed` | `scope_decision = in_scope` AND `mode_allowed` AND `paths_allowed` | → Layout |
| `downgrade` | `mode_allowed = false` but lower mode permitted | Adjust mode → Layout |
| `escalate_scope` | `scope_decision = next_version` | → Human with parking suggestion |
| `escalate_permission` | `paths_allowed = false` | → Human with violation list |
| `clarify` | Ambiguous contract binding | → Human to select contract |

---

## Configuration Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Frame recall limit | $k$ | 10 | Max frames to retrieve |
| Receipt lookback | $t$ | 7 days | Receipt history window |
| Scope check token cap | $\tau_I$ | 300 | Max tokens for semantic scope check |
| Strict mode | — | false | If true, any scope ambiguity → escalate |

---

## Relationship to LexSona

LexSona rules define:
- `allowed_modes`: Which risk modes this repo/user can use
- `allowed_paths`: Which paths can be touched
- `allowed_providers`: Which providers are permitted
- `house_rules`: Additional constraints (e.g., "never touch migrations/")

Integrate reads LexSona; it does not modify it.

---

## Version Contract: Integrate (I)

```text
[signed Opie]
Integrate (I) is DONE when:
- IntegratedContext schema exists with all required fields.
- Frame recall is deterministic given Lex database state.
- Mode and path permissions are checked against LexSona.
- Scope validation uses keyword matching + optional bounded LLM (τ_I ≤ 300).
- Out-of-scope intents are escalated, not silently widened.
- Every Integrate run produces provenance metadata.
- docs/control-stack/pilot/integrate.md describes the logic.
```

```text
[signed Lex ✶]
Countersigned. This is the v1.0 contract for Integrate in PILOT.
Date: 2025-11-27 (model-time)
```
