# LexSona Behavioral Rules API

> **⚠️ EXPERIMENTAL**: This module is NOT part of the Lex 1.0.0 public contract.
> The LexSona API and semantics are still evolving and may change without notice.

## Overview

LexSona is a scoped behavioral memory system for AI agents. It learns and retrieves
behavioral rules based on user corrections, using a Bayesian confidence model with
temporal decay.

This document describes the internal API for behavioral rules:

- `getRules(db, context, options)` - Retrieve applicable rules for a context
- `recordCorrection(db, correction)` - Capture user feedback

These are internal APIs (not exposed via HTTP yet). They are intended for
LexRunner integration and other internal tooling.

## Concepts

### Behavioral Rules

A behavioral rule is a directive learned from user corrections. Rules have:

- **`rule_id`**: Unique identifier
- **`text`**: Human-readable rule statement (e.g., "Always use JWT for authentication")
- **`scope`**: Context where the rule applies (module_id, task_type, environment, etc.)
- **`category`**: Grouping (e.g., "security_policy", "tool_preference", "communication_style")
- **`severity`**: Enforcement level ("must", "should", "style")

### Bayesian Confidence Model

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

### Activation Threshold

By default, rules must have:
- At least N ≥ 3 observations (`minN`)
- At least 0.5 effective confidence (`minConfidence`)

These thresholds prevent premature rule activation.

## API Reference

### `getRules(db, context, options)`

Retrieve applicable behavioral rules for a given context.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database connection |
| `context` | `RuleContext` | Context for filtering rules |
| `options` | `GetRulesOptions` | Optional filtering options |

##### `RuleContext`

```typescript
interface RuleContext {
  module_id?: string;    // Exact match on module (e.g., "src/services/auth")
  task_type?: string;    // Fuzzy match on task type (e.g., "code-review")
  environment?: string;  // Environment filter (e.g., "github-copilot")
  project?: string;      // Project filter (e.g., "lex-core")
  agent_family?: string; // Agent filter (e.g., "claude", "gpt")
  context_tags?: string[];  // Tags for fine-grained matching
}
```

##### `GetRulesOptions`

```typescript
interface GetRulesOptions {
  minN?: number;          // Minimum observation count (default: 3)
  minConfidence?: number; // Minimum effective confidence (default: 0.5)
  limit?: number;         // Maximum rules to return (default: 100)
}
```

#### Returns

`BehaviorRuleWithConfidence[]` - Array of rules sorted by effective confidence (descending).

Each rule includes computed fields:
- `confidence`: α / (α + β)
- `decay_factor`: exp(-(now - last_observed) / τ)
- `effective_confidence`: confidence × decay_factor

#### Example

```typescript
import { getDb } from "@smartergpt/lex/store";
import { getRules } from "@smartergpt/lex/shared/lexsona";

const db = getDb();

// Get rules for auth module in code review
const rules = getRules(db, {
  module_id: "src/services/auth",
  task_type: "code-review",
  environment: "github-copilot"
});

// Get all rules (including low confidence)
const allRules = getRules(db, {}, { minN: 1, minConfidence: 0 });
```

### `recordCorrection(db, correction)`

Record a user correction to update behavioral rules.

If a matching rule exists (same module_id and text):
- Reinforcement (polarity=1): Increment α, increment N
- Counterexample (polarity=-1): Increment β, increment N

If no matching rule exists:
- Create new rule with initial values: α = α₀ + 1, β = β₀, N = 1

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database connection |
| `correction` | `Correction` | The correction to record |

##### `Correction`

```typescript
interface Correction {
  context: RuleScope;           // Context where the correction occurred
  correction: string;           // The correction text / rule statement
  category?: string;            // Category (default: "general")
  severity?: RuleSeverity;      // Severity (default: "should")
  polarity?: 1 | -1;           // Reinforcement (+1) or counterexample (-1)
  frame_id?: string;           // Optional frame ID for auditability
}
```

##### `RuleScope`

```typescript
interface RuleScope {
  module_id?: string;
  task_type?: string;
  environment?: string;
  project?: string;
  agent_family?: string;
  context_tags?: string[];
}
```

#### Returns

`BehaviorRuleWithConfidence` - The updated or created rule with confidence scores.

#### Example

```typescript
import { getDb } from "@smartergpt/lex/store";
import { recordCorrection } from "@smartergpt/lex/shared/lexsona";

const db = getDb();

// Record a positive correction (reinforcement)
const rule = recordCorrection(db, {
  context: { module_id: "src/services/auth" },
  correction: "Always use JWT for authentication in this module",
  category: "security_policy",
  severity: "must"
});

console.log(`Rule ${rule.rule_id} updated, confidence: ${rule.confidence}`);

// Record a counterexample (negative correction)
const updated = recordCorrection(db, {
  context: { module_id: "src/utils" },
  correction: "Use lodash for utility functions",
  polarity: -1  // This is a counterexample
});
```

## Database Schema

LexSona uses the `lexsona_behavior_rules` table (migration V7):

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

## Mathematical Background

LexSona is based on the LexSona Mathematical Framework v0.1. Key concepts:

### Context Lattice

Behavioral scope is modeled as a partially ordered set (lattice) with:
- Environment (e.g., "github-copilot", "awa")
- Project (e.g., "lex-core", "awa-monorepo")
- Agent family (e.g., "gpt", "claude", "copilot")
- Context tags (e.g., ["security", "cli"])

More specific contexts override more general ones.

### Bayesian Beta Model

The Beta distribution is used for confidence:
- Prior: Beta(α₀=2, β₀=5) - skeptical by default
- Posterior mean: α / (α + β)
- Updated with each correction

### Scoped Diffusion

Corrections can propagate across the context lattice with exponential attenuation
(not yet implemented in this version).

### Conflict Resolution

Rules are resolved using lexicographic ordering:
1. Severity (must > should > style)
2. Specificity (more specific context wins)
3. Confidence (higher confidence wins)
4. Recency (more recent wins)

## See Also

- [LexSona Mathematical Framework v0.1](./research/LexSona/MATH_FRAMEWORK_v0.1.md)
- [CptPlnt Schema](./research/LexSona/CptPlnt/lexsona_behavior_rule.schema.json)
- [CptPlnt SQL Schema](./research/LexSona/CptPlnt/lexsona_schema.sql)
