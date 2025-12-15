# LexSona Behavioral Rules Storage Socket

> **Version:** v0.2 (Lex 2.1)
> **Status:** Socket API - Stable
> **Last Updated:** 2025-12-06

## Overview

This document describes the **storage socket** that Lex provides for LexSona.

**Important boundary:** Lex stores and retrieves behavioral rules. It does **not** interpret, enforce, or resolve them. That's LexSona's job.

### Disconnected-Mode Safety

LexSona is designed to degrade gracefully when Lex's storage socket is unavailable:

- **Offline-safe personas** can derive constraints without a database connection
- **Connected personas** fail explicitly (no silent fallback) when memory is unavailable
- The storage socket is optional for constraint derivation, required for learning

This separation ensures that agents using LexSona can function in disconnected environments while maintaining explicit contract boundaries.

```
┌─────────────────────────────────────────────────────────────┐
│  Lex (OSS Core) — Storage Socket                            │
│  ├─ recordCorrection()   ← write API                        │
│  ├─ getRules()           ← read API                         │
│  └─ lexsona_behavior_rules table                            │
└─────────────────────────────────────────────────────────────┘
                        ↑
                      plugs into
                        │
┌─────────────────────────────────────────────────────────────┐
│  LexSona (Separate Package) — Constraint Engine             │
│  ├─ Persona resolution                                      │
│  ├─ Constraint derivation                                   │
│  └─ Learning loop                                           │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### `lexsona_behavior_rules` Table

Stores behavioral rules with Bayesian confidence scoring.

```sql
CREATE TABLE lexsona_behavior_rules (
  rule_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  scope TEXT NOT NULL,              -- JSON object (RuleScope)
  alpha INTEGER NOT NULL DEFAULT 2, -- Bayesian Beta: successes + prior
  beta INTEGER NOT NULL DEFAULT 5,  -- Bayesian Beta: failures + prior
  observation_count INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'style')),
  decay_tau INTEGER NOT NULL DEFAULT 180,  -- Decay time constant in days
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_observed TEXT NOT NULL,
  frame_id TEXT                     -- Optional link to Frame
);
```

### RuleScope (Context)

Rules are scoped to prevent cross-domain contamination.

Lex owns the canonical base keys (Scope Contract "A+"):

| Field | Description | Example |
|-------|-------------|---------|
| `environment` | Execution environment | `"github-copilot"`, `"local"` |
| `project` | Project/repo namespace | `"lex"`, `"lexrunner"` |
| `agent_family` | Agent family | `"copilot"`, `"gpt"` |
| `context_tags` | Tags for additional context | `["tools", "typescript"]` |
| `module_id` | Module scope (exact match) | `"memory/store"` |
| `task_type` | Optional task scope | `"review"`, `"implementation"` |

Extensibility:

| Field | Description |
|-------|-------------|
| `v` | Scope contract version (missing = legacy) |
| `extensions` | Namespaced extension blobs (objects only). Lex preserves but does not consult for base matching. |

Legacy compatibility:
- `moduleId` -> `module_id`
- `taskType` -> `task_type`
- `contextTags` -> `context_tags`

Deprecated alias handling:
- `domain` is a **deprecated input alias** that is only consulted **when `project` is absent**.
  - If `project` is missing and `domain` is present, Lex copies `domain` into `project`, emits a warning, and preserves the original under `extensions.<namespace>.domain`.
  - If `project` is present, `domain` is **not used for matching** and is only preserved under `extensions.<namespace>.domain`.

Normalization invariant (critical):
- Lex-normalized Scope Contract A+ MUST be applied **before DB writes** and **before SQL predicates** to prevent mixed-key storage/query mismatches.

## Storage Socket API

Lex exports these APIs via `@smartergpt/lex/lexsona`:

### `getRules(db, context, options)`

Retrieve applicable behavioral rules for a given context.

```typescript
import { getRules } from "@smartergpt/lex/lexsona";

const rules = getRules(db, {
  module_id: "src/services/auth",
  task_type: "code-review",
});
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database connection |
| `context` | `RuleContext` | Context for filtering rules |
| `options` | `GetRulesOptions` | Optional filtering options |

#### Returns

`BehaviorRuleWithConfidence[]` - Array of rules sorted by effective confidence (descending).

### `recordCorrection(db, correction)`

Record a user correction to update behavioral rules.

```typescript
import { recordCorrection } from "@smartergpt/lex/lexsona";

const rule = recordCorrection(db, {
  context: { module_id: "src/services/auth" },
  correction: "Always use JWT for authentication in this module",
  category: "security_policy",
  severity: "must"
});
```

#### Behavior

If a matching rule exists (same module_id and text):
- Reinforcement (polarity=1): Increment α, increment N
- Counterexample (polarity=-1): Increment β, increment N

If no matching rule exists:
- Create new rule with initial values: α = α₀ + 1, β = β₀, N = 1

## Bayesian Confidence Model

Rules use a Beta-Binomial model for confidence:

- **`alpha` (α)**: Successes (reinforcements + prior α₀ = 2)
- **`beta` (β)**: Failures (counterexamples + prior β₀ = 5)
- **`confidence`**: α / (α + β)

The skeptical prior (α₀=2, β₀=5) means new rules start with ~28.6% confidence
and must accumulate evidence to become active.

### Temporal Decay

Rule confidence decays over time using exponential decay:

```
decay_factor = exp(-(now - last_observed) / τ)
```

Where τ (tau) is the decay time constant (default: 180 days).

The effective confidence is:

```
effective_confidence = confidence × decay_factor
```

## Constants

```typescript
const LEXSONA_DEFAULTS = {
  ALPHA_PRIOR: 2,           // Skeptical prior α₀
  BETA_PRIOR: 5,            // Skeptical prior β₀
  DECAY_TAU_DAYS: 180,      // Decay time constant (days)
  MIN_OBSERVATION_COUNT: 3, // Minimum N for activation
  MIN_CONFIDENCE: 0.5,      // Minimum confidence threshold
  DEFAULT_LIMIT: 100,       // Maximum rules to return
};
```

## Migration

The `lexsona_behavior_rules` table is created by Migration V7. When upgrading an existing database, the migration runs automatically.

## See Also

- [LexSona Paper (Canonical)](https://github.com/Guffawaffle/lexsona/blob/main/docs/papers/FrequencyWeightedMemory.md)
- [LexSona Package](https://github.com/Guffawaffle/lexsona)
- [ADR-001: LexSona Architecture and Boundaries](https://github.com/Guffawaffle/lexsona/blob/main/docs/ADR-001-architecture.md)
