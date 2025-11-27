# Perceive — Intent Parsing in the PILOT Loop

> **The deterministic scaffold around a single stochastic spark.**

The **Perceive** phase is where raw human requests become structured, actionable intent. It's mostly deterministic extraction with one carefully bounded stochastic step for disambiguation.

---

## Mathematical Framing

We define Perceive as a pipeline:

$$
x \mapsto \text{PerceivedIntent}(x)
$$

with three main pieces:

- A **deterministic extractor** $h$
- A bounded **stochastic helper** $s$ (1 LLM call)
- A **merger** $g$ that combines them under explicit rules

Formally:

$$
\text{PerceivedIntent}(x) = g\bigl(h(x), s(x)\bigr)
$$

Where $x$ is the raw human request + metadata (repo, branch, issue link, etc.).

---

## 1. The Slots We're Filling

Let the intent schema have slots:

$$
F = \{\text{goal}, \text{non\_goals}, \text{constraints}, \text{risk\_mode}, \text{urgency}, \text{version\_contract\_id}, \text{repo}, \text{branch}, \text{issue\_or\_pr}\}
$$

For each $f \in F$, the Perceive stage will:

1. Try a deterministic extractor $h_f(x)$
2. Optionally use a stochastic suggestion $s_f(x)$

and end with a value $v_f$ and provenance label $\text{src}_f \in \{\text{deterministic}, \text{stochastic}, \text{unknown}\}$.

---

## 2. Deterministic Extractor $h$

For each slot $f$ we have:

$$
h_f : X \rightarrow V_f \cup \{\bot\}
$$

where $\bot$ means "not found deterministically."

**Examples:**

| Slot | Extraction Logic |
|------|------------------|
| `risk_mode` | Regex/keyword: "fast lane", "quick hack" → `fast`; "prod", "compliance", "contract" → `conservative` |
| `version_contract_id` | Look for `[signed ~]` blocks, `v1.0.0`, `Scope: …` headings |
| `repo`, `branch` | Git context, editor state |
| `issue_or_pr` | Regex for `#123`, `PR-456` patterns |

**The Determinism Requirement:**

> For fixed input $x$, $h(x)$ must always produce exactly the same result:
> same slots filled, same values, same conflicts.

No model calls allowed inside $h$. Only pure string/AST/config logic.

### Determinism Ratio

Define:

- $D = \bigl|\{ f \in F \mid \text{src}_f = \text{deterministic} \}\bigr|$ — slots resolved purely deterministically
- $R = \bigl|\{ f \in F \mid \text{src}_f \in \{\text{deterministic}, \text{stochastic}\} \}\bigr|$ — total resolved slots

Then:

$$
\delta = \begin{cases}
\frac{D}{R} & \text{if } R > 0 \\
1 & \text{if } R = 0 \text{ (degenerate case)}
\end{cases}
$$

**Target:** $\delta \geq \delta_{\min} = 0.8$

At least 80% of resolved slots must come from deterministic logic, not model guesses.

---

## 3. Stochastic Helper $s$

We allow **at most one** LLM call in Perceive:

$$
s : X \rightarrow S
$$

Where $S$ is a suggested intent object (JSON) with:

- Candidate values for each slot $f$
- A probability distribution over `risk_mode` (and optionally other slots)

**Budget:**

- Output token cap: $\tau \leq 500$ tokens
- Exactly one call per Perceive run
- If it fails/timeouts, Perceive still returns a *deterministic* skeleton

So Perceive is **deterministic by default**, with a single "spark" of stochastic help when needed.

---

## 4. Ambiguity & Confidence

We want a numeric **ambiguity score** $a \in [0, 1]$ that drives "ask for clarification vs proceed."

### 4.1 Base (Deterministic) Ambiguity

Let:

- $C = \frac{R}{|F|}$ — **coverage** = fraction of slots filled (deterministic or stochastic)
- $K \in \{0, 1\}$ — **conflict flag** = 1 if $h_f(x) \neq s_f(x)$ for any slot we care about

Define:

$$
a_{\text{base}} = \max\bigl(1 - C, \; \kappa \cdot K\bigr)
$$

where $\kappa \in [0,1]$ is a penalty weight (e.g., $\kappa = 0.75$).

**Interpretation:**

- Low coverage (few slots filled) → $a_{\text{base}}$ is high
- $h$ and $s$ disagree on something important → $a_{\text{base}}$ jumps toward 0.75+

### 4.2 Stochastic Ambiguity (Entropy)

Suppose the stochastic helper gives a distribution over risk modes:

$$
p = (p_{\text{fast}}, p_{\text{conservative}}, p_{\text{exploratory}})
$$

Define the normalized entropy:

$$
H(p) = -\sum_i p_i \log p_i
$$

$$
H_{\text{norm}}(p) = \frac{H(p)}{\log 3}
$$

Then:

$$
a_{\text{stoch}} = H_{\text{norm}}(p)
$$

**Interpretation:**

- Model very confident (one mode has $p_i \approx 1$) → entropy low, $a_{\text{stoch}} \approx 0$
- Model confused (uniform-ish) → $a_{\text{stoch}} \approx 1$

### 4.3 Combined Ambiguity

Combine them:

$$
a = \lambda \cdot a_{\text{base}} + (1 - \lambda) \cdot a_{\text{stoch}}
$$

with $\lambda = 0.7$ (biased toward deterministic signals).

**Decision rule:**

$$
\gamma(\vec{I}) = \begin{cases}
\texttt{proceed} & \text{if } a \leq \theta \text{ and } \delta \geq \delta_{\min} \\
\texttt{clarify} & \text{otherwise}
\end{cases}
$$

Where $\theta = 0.3$ by default.

If $\gamma(\vec{I}) = \texttt{clarify}$, the Control Deck asks the human for clarification instead of guessing. This is **not a failure**—it's the system working correctly.

---

## 5. Risk Mode as Pure Function

`risk_mode` is determined by:

1. Deterministic features from $h(x)$ (keywords, repo tags, policy flags)
2. The LLM distribution $p$ only as a **hint**, not a veto

The final `risk_mode` is computed by a pure function:

$$
\text{risk\_mode} = f_{\text{risk}}\bigl(h(x), p\bigr)
$$

with **no hidden LLM calls**.

---

## Configuration Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Determinism threshold | $\delta_{\min}$ | 0.8 | Min fraction of slots from deterministic extraction |
| Ambiguity threshold | $\theta$ | 0.3 | Max combined ambiguity to proceed without clarification |
| Conflict penalty | $\kappa$ | 0.75 | Penalty when $h$ and $s$ disagree |
| Base weight | $\lambda$ | 0.7 | Weight of deterministic signals in combined ambiguity |
| Token cap | $\tau$ | 500 | Max output tokens for stochastic helper |

---

## Schema: PerceivedIntent

```typescript
import { z } from "zod";

export const PerceivedIntent = z.object({
  // Hard features (deterministic)
  repo: z.string().optional(),
  branch: z.string().optional(),
  issue_or_pr: z.string().optional(),
  files_mentioned: z.array(z.string()).default([]),
  command_keywords: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),

  // Soft features (stochastic, bounded)
  goal: z.string(),
  non_goals: z.array(z.string()).default([]),

  // Risk classification (deterministic function of h(x) and p)
  risk_mode: z.enum(["fast", "conservative", "exploratory"]),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),

  // Contract binding (deterministic)
  version_contract_id: z.string().optional(),

  // Computed metrics
  determinism_ratio: z.number().min(0).max(1),
  ambiguity_score: z.number().min(0).max(1),

  // Provenance
  perceive_timestamp: z.string().datetime(),
  stochastic_call_id: z.string().optional(), // For audit trail
});

export type PerceivedIntent = z.infer<typeof PerceivedIntent>;
```

---

## Why This Split?

| Concern | Deterministic | Stochastic |
|---------|---------------|------------|
| **Reproducibility** | Same input → same output | Same input → similar output |
| **Auditability** | Full trace via pure functions | Requires logging model call |
| **Cost** | Zero tokens | Bounded tokens ($\tau \leq 500$) |
| **Latency** | Milliseconds | Seconds |

By keeping $\delta \geq 0.8$ of Perceive deterministic, we get:

1. **Fast rejection** of obviously-out-of-scope requests
2. **Reproducible risk classification** for policy compliance
3. **Auditable provenance** for every intent
4. **Bounded cost** for the stochastic disambiguation

The model is a *consultant*, not the *decision-maker*.

---

## Next Phase

Once $\vec{I}$ is computed and $\gamma(\vec{I}) = \texttt{proceed}$, the intent flows to **[Integrate](../integrate/)** where we check it against Lex state and LexSona rules.

---

## Version Contract: Perceive (P)

```text
[signed Opie]
Perceive (P) is DONE when:
- PerceivedIntent schema exists with all required slots and metadata.
- Deterministic extractor h is pure, tested, and produces a measurable determinism ratio δ.
- Stochastic helper s is called at most once, with τ ≤ 500 output tokens, and has a defined failure path.
- Ambiguity score a ∈ [0,1] is computed from coverage, conflicts, and model entropy, and gated by θ.
- risk_mode is a pure function of h(x) and the model distribution p, with no hidden LLM calls.
- Every Perceive run produces a Frame/Receipt with provenance, δ, a, and stochastic usage.
- docs/control-stack/perceive/index.md describes the math and is referenced from the control-stack index.
```

```text
[signed Lex ✶]
Countersigned. This is the v1.0 contract for Perceive in PILOT.
Date: 2025-11-27 (model-time)
```
