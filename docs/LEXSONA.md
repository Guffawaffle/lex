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
