# Capability Tiers

## Overview

Capability Tiers provide a classification system for matching task complexity to model capability. This implements the coordination cost compression thesis from governance research.

> **Claim 3.4:** Matching task tier to model capability reduces overall Turn Cost by avoiding both over-allocation (expensive models on trivial tasks) and under-allocation (failures requiring escalation).

## Tier Definitions

| Tier | Role | Characteristics | Example Tasks |
|------|------|----------------|---------------|
| **Senior** | Design, critique, decide | Requires judgment, handles ambiguity, cross-cutting concerns, architectural decisions | • Design API surface<br>• Review security implications<br>• Resolve conflicting requirements<br>• Architectural refactoring |
| **Mid** | Implement, extend, refactor | Clear scope, established patterns, bounded complexity | • Implement feature X<br>• Refactor module Y<br>• Add tests for Z<br>• Fix known bugs |
| **Junior** | Verify, instrument, lint | Deterministic, low-risk, repetitive | • Run linter<br>• Format code<br>• Update documentation<br>• Generate types |

## Usage in Frames

Frames can optionally track capability tier information using the `capabilityTier` and `taskComplexity` fields:

```typescript
const frame: Frame = {
  // ... standard fields ...
  capabilityTier: "mid",
  taskComplexity: {
    tier: "mid",
    assignedModel: "claude-sonnet-4.5",
    actualModel: "claude-sonnet-4.5",
    escalated: false,
    retryCount: 0,
  }
};
```

## Classification Heuristics

### Senior Tier Indicators

A task should be classified as **senior** if it involves:

- **Ambiguity:** Requirements are unclear or conflicting
- **Judgment:** Requires weighing trade-offs between multiple approaches
- **Cross-cutting concerns:** Changes affect multiple modules or systems
- **Contract changes:** Modifies public APIs or contract surfaces
- **Security implications:** Touches authentication, authorization, or data validation
- **Architectural decisions:** Impacts system structure or design patterns

**Examples:**
- "Design the OAuth2 flow for our MCP server"
- "Review the security implications of exposing this API"
- "Decide whether to use SQLite or Postgres"
- "Refactor the memory system to support multiple storage backends"

### Mid Tier Indicators

A task should be classified as **mid** if it has:

- **Clear scope:** Well-defined boundaries and acceptance criteria
- **Established patterns:** Similar work has been done before
- **Bounded complexity:** Limited to a single module or feature
- **Known solution space:** Implementation approach is understood

**Examples:**
- "Implement PKCE support for OAuth2"
- "Add pagination to the frames API"
- "Fix the bug where timestamps are not ISO 8601"
- "Refactor the query builder to use prepared statements"

### Junior Tier Indicators

A task should be classified as **junior** if it is:

- **Deterministic:** Single correct answer or approach
- **Low-risk:** Failure has minimal impact
- **Repetitive:** Similar to many other tasks
- **Automatable:** Could be done by a linter or formatter

**Examples:**
- "Run ESLint and fix all auto-fixable issues"
- "Format all files with Prettier"
- "Update the README with the new CLI commands"
- "Generate TypeScript definitions from JSON Schema"

## Escalation and Tier Mismatch

When a task assigned to a lower tier fails or proves more complex than anticipated, it may need escalation:

```typescript
{
  capabilityTier: "mid",
  taskComplexity: {
    tier: "mid",
    assignedModel: "claude-haiku-4",
    actualModel: "claude-sonnet-4.5",  // Escalated
    escalated: true,
    escalationReason: "Required architectural decision about storage backend",
    retryCount: 2,
    tierMismatch: true,  // Actual tier higher than suggested
  }
}
```

### Escalation Metrics

Track escalation rates to optimize tier classification:

- **Over-allocation rate:** Senior tasks that could have been mid/junior
- **Under-allocation rate:** Mid/junior tasks that required escalation
- **Retry count distribution:** How many attempts before escalation
- **Tier mismatch patterns:** Which task types are commonly misclassified

## Business Value

### Without Tier Tracking
- Expensive models used for trivial tasks (cost waste)
- Under-capable models assigned complex tasks (escalation overhead)
- No data for optimization

### With Tier Tracking
- Match task complexity to model capability
- Measure escalation rates per tier
- Optimize costs with data-driven routing
- Identify patterns in tier misclassification

## Integration with LexRunner

The capability tier fields are consumed by LexRunner to:

1. **Route tasks** to appropriate model tiers
2. **Track performance** by tier and model
3. **Detect escalation patterns** for optimization
4. **Measure cost efficiency** of tier assignments

See [LexRunner Executor Canonicalization](https://github.com/Guffawaffle/lex-pr-runner/issues/404) for implementation details.

## Schema Version

Capability tier classification was added in **v4** of the Frame schema (Lex 2.0.0).

## Cross-References

- **Thesis:** `docs/thesis/lex_governance-collab_systems_paper_draft.md` Section 3.6
- **Frame Types:** `src/memory/frames/types.ts`
- **Contract Surface:** `docs/CONTRACT_SURFACE.md`

---

*Last updated: 2025-12-05*
