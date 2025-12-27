# Governance Metrics

This document describes the governance metrics tracked by Lex to measure and optimize coordination costs in AI-assisted development.

## Turn Cost

**Turn Cost** is the primary governance metric in Lex, measuring the total coordination overhead of an AI-assisted work session. It quantifies the cost of human-AI interaction beyond raw token consumption.

### Formula

```
Turn Cost = λL + γC + ρR + τT + αA
```

Where:
- **L** = Latency (response time in milliseconds)
- **C** = Context Reset (tokens required to re-establish context)
- **R** = Renegotiation (number of clarification turns)
- **T** = Token Bloat (excess tokens beyond minimum necessary)
- **A** = Attention Switch (count of human interventions)

### Default Weights

The default weights are derived from empirical analysis in the governance thesis:

| Component | Weight | Symbol | Rationale |
|-----------|--------|--------|-----------|
| Latency | 0.1 | λ | Response time impact on flow |
| Context Reset | 0.2 | γ | Cost of rebuilding shared understanding |
| Renegotiation | 0.3 | ρ | Highest cost: back-and-forth clarifications |
| Token Bloat | 0.1 | τ | Excess verbosity overhead |
| Attention Switch | 0.3 | α | Human cognitive load from interruptions |

### Business Value

From the governance thesis:

> "Even a 50% reduction in token cost saves $0.075; a 50% reduction in interaction turns saves $4.17. This asymmetry motivates our focus on Turns rather than Tokens."

The **400:1 ratio** of coordination cost to token optimization makes Turn Cost the highest-leverage metric for productivity improvement.

### Usage

#### Schema Integration

Turn Cost is captured as an optional field in Frame v4:

```typescript
import type { TurnCost } from "@smartergpt/lex/memory/frames/types";

const frame = {
  id: "frame-001",
  timestamp: "2025-12-05T02:00:00Z",
  branch: "feature/auth",
  module_scope: ["services/auth"],
  summary_caption: "Fixed auth timeout",
  reference_point: "auth fix session",
  status_snapshot: {
    next_action: "Deploy to staging"
  },
  
  // Turn Cost tracking (v4)
  turnCost: {
    components: {
      latency: 1500,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2
    },
    weightedScore: 551.5,
    sessionId: "session-123",
    timestamp: "2025-12-05T02:00:00Z"
  }
};
```

#### Calculation

Use the `calculateWeightedTurnCost` helper to compute the weighted score:

```typescript
import { 
  calculateWeightedTurnCost,
  DEFAULT_TURN_COST_WEIGHTS
} from "@smartergpt/lex/memory/frames/turncost";

const components = {
  latency: 1500,
  contextReset: 2000,
  renegotiation: 3,
  tokenBloat: 500,
  attentionSwitch: 2
};

// Use default weights
const score = calculateWeightedTurnCost(components);
console.log(`Turn Cost: ${score}`);  // 551.5

// Use custom weights
const customWeights = {
  lambda: 0.15,
  gamma: 0.25,
  rho: 0.3,
  tau: 0.1,
  alpha: 0.2
};

const customScore = calculateWeightedTurnCost(components, customWeights);
console.log(`Custom Turn Cost: ${customScore}`);
```

#### CLI

The `lex turncost` command provides basic Turn Cost metrics from your Frame database:

```bash
# Show metrics for last 24 hours (default)
lex turncost

# Output:
# 📊 Turn Cost Metrics
# 
# Period: 24h
# Frames: 5
# Estimated Tokens: 7,500
# Prompts: 20
# 
# Average tokens per frame: 1,500

# JSON output
lex turncost --json

# Custom time period
lex turncost --period 7d   # Last 7 days
lex turncost --period 30d  # Last 30 days
lex turncost --period 48h  # Last 48 hours
```

The command aggregates:
- **Frames**: Count of work sessions in the period
- **Estimated Tokens**: Sum of `spend.tokens_estimated` from frames with spend metadata
- **Prompts**: Sum of `spend.prompts` from frames with spend metadata

**Future enhancements** (planned):
- Session-level Turn Cost component tracking (λL + γC + ρR + τT + αA)
- Historical Turn Cost analysis and trends
- Turn Cost optimization recommendations
- Anomaly detection for unusually high coordination costs

### Interpretation

#### Low Turn Cost (< 500)
- Efficient session with minimal coordination overhead
- Clear requirements, good context retention
- Few clarifications needed

#### Medium Turn Cost (500-2000)
- Normal session with moderate coordination
- Some context rebuilding or clarifications
- Acceptable for complex tasks

#### High Turn Cost (> 2000)
- Significant coordination overhead
- Frequent context loss or renegotiation
- Signal to improve:
  - Frame memory quality
  - Instruction clarity
  - Task decomposition

### Optimization Strategies

To reduce Turn Cost:

1. **Reduce Context Reset (C)**
   - Use Frames to capture work continuity
   - Store decisions and rationale
   - Link related Frames

2. **Reduce Renegotiation (R)**
   - Write clearer instructions
   - Provide concrete examples
   - Use personas for consistent behavior

3. **Reduce Attention Switch (A)**
   - Batch related tasks
   - Improve task autonomy
   - Use policy guardrails

4. **Reduce Token Bloat (T)**
   - Request concise output
   - Use structured formats (JSON)
   - Limit unnecessary verbosity

5. **Reduce Latency (L)**
   - Optimize model selection
   - Use caching when appropriate
   - Parallel execution where possible

### Future Enhancements

Planned Turn Cost features:

- **Automatic tracking**: Capture Turn Cost from MCP server sessions
- **Historical analysis**: Trend analysis over time
- **Anomaly detection**: Flag unusually high Turn Cost sessions
- **Optimization recommendations**: AI-driven suggestions to reduce coordination cost
- **Benchmarking**: Compare Turn Cost across teams/projects

## References

- **Governance Thesis**: See full analysis in `docs/thesis/lex_governance-collab_systems_paper_draft.md` (Section 3.1)
- **Frame Schema v4**: `src/memory/frames/types.ts`
- **Turn Cost Calculation**: `src/memory/frames/turncost.ts`
- **CLI Command**: `src/shared/cli/turncost.ts`
- **Database Queries**: `src/memory/store/queries.ts` (getTurnCostMetrics)
- **Tests**: 
  - Schema tests: `test/memory/frames/turncost.test.ts`
  - CLI tests: `test/shared/cli/turncost.test.ts`
