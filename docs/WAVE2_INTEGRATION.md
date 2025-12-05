# Wave 2 Integration: Turn Cost → Capability Tier System

## Overview

This document describes the Wave 2 integration between Turn Cost measurement, Receipt Protocol, and Capability Tier classification systems merged in PRs #484, #485, and #486.

## Integration Points

### 1. TurnCost → Tier Feedback Loop

**Location:** `src/memory/frames/tier-feedback.ts`

The integration provides automatic tier recommendations based on Turn Cost measurements.

#### Usage Example

```typescript
import { suggestTierFromTurnCost } from './src/memory/frames/tier-feedback.js';

const turnCost = {
  components: {
    latency: 5000,
    contextReset: 10000,
    renegotiation: 15,
    tokenBloat: 3000,
    attentionSwitch: 10,
  },
  weightedScore: 2807.5
};

const recommendation = suggestTierFromTurnCost(turnCost, 'junior');
// Returns: { recommendedTier: 'mid', reason: '...', isEscalation: true }
```

#### Thresholds

- **Junior → Mid escalation:** Turn Cost ≥ 500
- **Mid → Senior escalation:** Turn Cost ≥ 1000
- **Mid → Junior de-escalation:** Turn Cost < 100
- **Senior → Mid de-escalation:** Turn Cost < 200

#### Pattern Detection

For consistent patterns across multiple sessions:

```typescript
import { analyzeConsistentTurnCost } from './src/memory/frames/tier-feedback.js';

const history = [
  { turnCost: {...}, tier: 'junior', timestamp: '...' },
  // ... more entries
];

const recommendation = analyzeConsistentTurnCost(history, 5);
// Analyzes last 5 entries for consistent high/low patterns
```

### 2. Receipt → Turn Cost Attribution

**Location:** `src/memory/receipts/schema.ts`, `src/memory/receipts/index.ts`

Receipts can now include Turn Cost at the time of emission.

#### Usage Example

```typescript
import { createReceipt } from './src/memory/receipts/index.js';

const receipt = createReceipt({
  action: 'Implemented complex refactor',
  rationale: 'Technical debt reduction',
  confidence: 'low',
  reversibility: 'partially-reversible',
  outcome: 'failure',
  turnCost: {
    components: {
      latency: 5000,
      contextReset: 10000,
      renegotiation: 15,
      tokenBloat: 3000,
      attentionSwitch: 10,
    },
    weightedScore: 2807.5
  }
});

// Receipt now includes Turn Cost that led to the failure
console.log(receipt.turnCost.weightedScore); // 2807.5
```

#### Schema

The `turnCost` field in Receipt schema is optional and backward compatible:

```typescript
interface Receipt {
  // ... other fields
  turnCost?: TurnCost;
}
```

### 3. Tier → Frame Classification

**Location:** `src/memory/store/queries.ts`

Frames can now store tier classification and enable tier-based queries.

#### Saving Frames with Tier Data

```typescript
import { saveFrame } from './src/memory/store/queries.js';

const frame = {
  id: 'frame-001',
  timestamp: new Date().toISOString(),
  branch: 'feature/wave2',
  module_scope: ['memory/frames'],
  summary_caption: 'Tier classification test',
  reference_point: 'tier test',
  status_snapshot: { next_action: 'verify' },
  
  // New Wave 2 fields
  capabilityTier: 'senior',
  taskComplexity: {
    tier: 'senior',
    assignedModel: 'gpt-4',
    actualModel: 'gpt-4',
    escalated: false,
    tierMismatch: false
  },
  turnCost: {
    components: {
      latency: 1500,
      contextReset: 2000,
      renegotiation: 3,
      tokenBloat: 500,
      attentionSwitch: 2,
    },
    weightedScore: 551.5
  }
};

saveFrame(db, frame);
```

#### Querying Frames by Tier

```typescript
import { getFramesByTier, getTierEscalationPatterns, getTurnCostStatsByTier } from './src/memory/store/queries.js';

// Get all senior-tier frames with high Turn Cost
const seniorFrames = getFramesByTier(db, {
  tier: 'senior',
  minTurnCost: 1000
});

// Get frames where tier escalation occurred
const escalatedFrames = getFramesByTier(db, {
  escalated: true
});

// Get tier escalation patterns (tier mismatch)
const patterns = getTierEscalationPatterns(db, 100);

// Get Turn Cost statistics by tier
const stats = getTurnCostStatsByTier(db);
// Returns: [
//   { tier: 'senior', count: 45, avgTurnCost: 750 },
//   { tier: 'mid', count: 120, avgTurnCost: 450 },
//   { tier: 'junior', count: 200, avgTurnCost: 180 }
// ]
```

## Database Schema

Migration V8 adds three new columns to the `frames` table:

```sql
ALTER TABLE frames ADD COLUMN turn_cost TEXT;  -- JSON stringified TurnCost
ALTER TABLE frames ADD COLUMN capability_tier TEXT CHECK (
  capability_tier IS NULL OR 
  capability_tier IN ('senior', 'mid', 'junior')
);
ALTER TABLE frames ADD COLUMN task_complexity TEXT;  -- JSON stringified TaskComplexity

CREATE INDEX idx_frames_capability_tier ON frames(capability_tier) 
  WHERE capability_tier IS NOT NULL;
```

All columns are nullable for backward compatibility.

## Testing

Integration tests are located in `test/memory/integration/wave2.test.ts`:

```bash
npm test -- test/memory/integration/wave2.test.ts
```

## Backward Compatibility

All new fields are optional:
- Existing Frames without tier data continue to work
- Receipts without Turn Cost continue to work
- No breaking changes to existing APIs

## Next Steps

Future enhancements could include:
- CLI commands for tier-based queries (`lex frames --tier senior --high-cost`)
- Automatic tier recommendation display in Frame output
- Turn Cost trend analysis over time
- Integration with LexRunner for automatic tier assignment
