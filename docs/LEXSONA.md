<<<<<<< HEAD
# LexSona: Behavioral Memory System

> **Version:** v0.1 (0.5.0 Tier 4)
> **Status:** Data Model & Storage Phase
> **Last Updated:** 2025-11-27

## Overview

LexSona is a scoped behavioral memory system for AI agents that learns from user corrections and feedback. It stores behavioral rules with Bayesian-inspired confidence scoring, enabling agents to adapt to user preferences over time.

Unlike global preference models or unstructured memory retrieval, LexSona models behavioral rules as a **deterministic field over a context lattice** with scoped diffusion, temporal decay, and confidence estimation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LexSona v0                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ Corrections │───►│   Rules     │───►│ Persona Snapshot        │ │
│  │ (Input)     │    │ (Storage)   │    │ (Context-Filtered)      │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│                           │                       │                 │
│                           ▼                       ▼                 │
│                    ┌─────────────┐    ┌─────────────────────────┐  │
│                    │ Confidence  │    │ Prompt Injection        │  │
│                    │ Scoring     │    │ (Active Rules)          │  │
│                    └─────────────┘    └─────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### `lexsona_behavior_rules` Table

Stores behavioral rules with Bayesian confidence scoring.

```sql
CREATE TABLE lexsona_behavior_rules (
  rule_id TEXT PRIMARY KEY,
  context TEXT NOT NULL,                -- JSON: scope information
  correction TEXT NOT NULL,             -- The behavioral pattern/rule
  confidence_alpha REAL NOT NULL DEFAULT 1.0,   -- Beta distribution α
  confidence_beta REAL NOT NULL DEFAULT 1.0,    -- Beta distribution β
  observation_count INTEGER NOT NULL DEFAULT 0, -- N
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_observed TEXT NOT NULL,
  decay_tau INTEGER NOT NULL DEFAULT 180        -- Decay constant (days)
);

CREATE INDEX idx_lexsona_context ON lexsona_behavior_rules(context);
CREATE INDEX idx_lexsona_updated ON lexsona_behavior_rules(updated_at);
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | TEXT | Unique identifier for the rule |
| `context` | TEXT (JSON) | Scope information (module, task_type, environment, etc.) |
| `correction` | TEXT | The behavioral pattern learned from user feedback |
| `confidence_alpha` | REAL | Beta distribution α parameter (accumulated support) |
| `confidence_beta` | REAL | Beta distribution β parameter (counter-evidence) |
| `observation_count` | INTEGER | Total observations/reinforcements |
| `created_at` | TEXT | ISO 8601 timestamp when rule was created |
| `updated_at` | TEXT | ISO 8601 timestamp when rule was last modified |
| `last_observed` | TEXT | ISO 8601 timestamp when rule was last observed |
| `decay_tau` | INTEGER | Decay time constant in days (default: 180) |

## Zod Schemas

### BehaviorRule

```typescript
import { z } from "zod";

export const BehaviorRuleSchema = z.object({
  rule_id: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
  correction: z.string().min(1),
  confidence_alpha: z.number().min(0),
  confidence_beta: z.number().min(0),
  observation_count: z.number().int().min(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_observed: z.string().datetime(),
  decay_tau: z.number().int().positive().default(180),
});

export type BehaviorRule = z.infer<typeof BehaviorRuleSchema>;
```

### Correction

```typescript
export const CorrectionSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  correction: z.string().min(1),
  user_id: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type Correction = z.infer<typeof CorrectionSchema>;
```

## Usage

### Importing

```typescript
// Schemas
import {
  BehaviorRuleSchema,
  CorrectionSchema,
  parseBehaviorRule,
  validateBehaviorRule,
} from "@smartergpt/lex/shared/lexsona";

// Store operations
import {
  saveBehaviorRule,
  getBehaviorRuleById,
  getAllBehaviorRules,
  queryBehaviorRules,
  deleteBehaviorRule,
  getBehaviorRuleCount,
  updateBehaviorRuleConfidence,
} from "@smartergpt/lex/store";
```

### CRUD Operations

```typescript
import { getDb, saveBehaviorRule, getBehaviorRuleById } from "@smartergpt/lex/store";
import type { BehaviorRule } from "@smartergpt/lex/shared/lexsona";

const db = getDb();

// Create a new rule
const rule: BehaviorRule = {
  rule_id: "rule-001",
  context: { module: "auth", task_type: "code_review" },
  correction: "Always check for null values before accessing object properties",
  confidence_alpha: 1.0,
  confidence_beta: 1.0,
  observation_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_observed: new Date().toISOString(),
  decay_tau: 180,
};

saveBehaviorRule(db, rule);

// Retrieve a rule
const retrieved = getBehaviorRuleById(db, "rule-001");
```

### Querying Rules

```typescript
import { queryBehaviorRules } from "@smartergpt/lex/store";

// Get high-confidence rules with minimum observations
const activeRules = queryBehaviorRules(db, {
  minConfidence: 0.7,      // 70% confidence threshold
  minObservations: 5,      // At least 5 observations
  limit: 10,               // Top 10 rules
});
```

### Updating Confidence

```typescript
import { updateBehaviorRuleConfidence } from "@smartergpt/lex/store";

// Update after new observation (reinforce rule)
updateBehaviorRuleConfidence(db, "rule-001", {
  confidence_alpha: rule.confidence_alpha + 1,  // Add support
  confidence_beta: rule.confidence_beta,
  observation_count: rule.observation_count + 1,
  updated_at: new Date().toISOString(),
  last_observed: new Date().toISOString(),
});
```

## Confidence Calculation

The confidence score is calculated using a Beta distribution posterior:

```
confidence = α / (α + β)
```

Where:
- **α (alpha)**: Accumulated support (reinforcements)
- **β (beta)**: Accumulated counter-evidence

### Default Prior

New rules start with α=1, β=1 (uniform prior), giving an initial confidence of 0.5.

### Recency Decay

Old evidence decays exponentially with time constant `τ` (decay_tau):

```
λ(Δt) = exp(-Δt / τ)
```

With default τ=180 days, the half-life of evidence is approximately 125 days.

## Context Lattice

The context field supports hierarchical scoping:

```json
{
  "environment": "production",
  "project": "lex-core",
  "module": "auth",
  "task_type": "code_review",
  "tags": ["security", "critical"]
}
```

Rules can be scoped from general (empty context) to highly specific (all fields specified).

## Mathematical Framework

For the complete mathematical framework including:
- Context lattice structure
- Scoped reinforcement diffusion
- Lex Confidence Field
- Conflict resolution

See: [docs/research/LexSona/MATH_FRAMEWORK_v0.1.md](./research/LexSona/MATH_FRAMEWORK_v0.1.md)

## Migration

The `lexsona_behavior_rules` table is created by Migration V7. When upgrading an existing database, the migration runs automatically.

To verify the migration:

```typescript
const db = getDb();
const version = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
console.log(version); // { v: 7 }
```

## Roadmap

### v0.1 (Current) - Data Model & Storage
- [x] Database schema
- [x] Zod schemas
- [x] CRUD operations
- [x] Query with confidence filtering

### v0.2 - API Endpoints
- [ ] MCP tool: `lexsona_record_correction`
- [ ] MCP tool: `lexsona_get_persona`
- [ ] REST API endpoints

### v0.3 - Inference & Injection
- [ ] Context matching
- [ ] Persona snapshot generation
- [ ] Prompt injection

### v0.4 - Diffusion & Decay
- [ ] Scoped reinforcement diffusion
- [ ] Temporal decay
- [ ] Conflict resolution

## References

- [LexSona Mathematical Framework v0.1](./research/LexSona/MATH_FRAMEWORK_v0.1.md)
- [LexSona Research Paper](./research/LexSona/lexsona_paper.md)
- [Case Study: Agent Behavioral Failure](./research/LexSona/CASE_STUDY_AGENT_BEHAVIORAL_FAILURE.md)

---

# LexSona Behavioral Rules API

> **⚠️ EXPERIMENTAL**: This module is NOT part of the Lex 1.0.0 public contract.
> The LexSona API and semantics are still evolving and may change without notice.

## API Overview

LexSona provides internal APIs for behavioral rules:

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
>>>>>>> origin/copilot/add-internal-api-endpoints
