# Receipt Protocol

**Version:** 1.0.0  
**Status:** Implemented  
**Governance Alignment:** "Permission to Fail with Discipline" (Section 3.4)

---

## Overview

The Receipt Protocol provides a structured way to document actions taken under uncertainty with explicit markers for confidence, reversibility, and escalation needs. It implements the "Permission to Fail with Discipline" concept from the coordination cost compression thesis.

### Definition: Disciplined Failure

A failure mode where:
1. **Uncertainty is stated explicitly** before action
2. **Actions taken are reversible** (or flagged as non-reversible)
3. **Receipts document** the decision chain
4. **Recovery path is proposed** or escalation triggered

---

## Business Value

The thesis identifies two failure anti-patterns:

- **Confidence inflation**: Agent produces incorrect output confidently → errors propagate
- **Paralysis**: Agent refuses to act without certainty → progress stalls

Disciplined failure provides the middle path: **act with structured uncertainty**.

---

## Schema

### Receipt

A receipt documents a single action with its uncertainty context.

```typescript
interface Receipt {
  schemaVersion: "1.0.0";
  kind: "Receipt";
  
  // What happened
  action: string;              // What action was taken
  outcome: "success" | "failure" | "partial" | "deferred";
  rationale: string;           // Why this action was chosen
  
  // Uncertainty handling
  confidence: "high" | "medium" | "low" | "uncertain";
  uncertaintyNotes?: UncertaintyMarker[];
  
  // Reversibility
  reversibility: "reversible" | "partially-reversible" | "irreversible";
  rollbackPath?: string;       // How to undo if needed
  rollbackTested?: boolean;    // Whether rollback has been tested
  
  // Escalation
  escalationRequired: boolean;
  escalationReason?: string;   // Why escalation is needed
  escalatedTo?: string;        // Who/what this was escalated to
  
  // Metadata
  timestamp: string;           // ISO 8601 datetime
  agentId?: string;
  sessionId?: string;
  frameId?: string;            // Link to associated Frame
}
```

### UncertaintyMarker

An explicit marker for a point of uncertainty in decision-making.

```typescript
interface UncertaintyMarker {
  stated: string;              // What uncertainty was identified
  actionTaken: string;         // What action was taken despite uncertainty
  confidence: "high" | "medium" | "low" | "uncertain";
  mitigations?: string[];      // Steps taken to reduce risk
}
```

---

## Usage Examples

### Example 1: Token Refresh Implementation

```typescript
import { createReceipt, markUncertainty } from '@smartergpt/lex/memory/receipts';

// Create receipt for action
let receipt = createReceipt({
  action: 'Implemented token refresh with 80% TTL',
  rationale: 'Balances security (fresh tokens) with performance (fewer refreshes)',
  confidence: 'medium',
  reversibility: 'reversible',
  rollbackPath: 'Change LEX_TOKEN_REFRESH_TTL environment variable',
  sessionId: 'session-123',
});

// Add uncertainty marker
receipt = markUncertainty(receipt, {
  stated: 'Not sure if 80% TTL is optimal for token refresh',
  actionTaken: 'Implemented with 80% TTL, flagged for review',
  confidence: 'medium',
  mitigations: [
    'Made TTL configurable via LEX_TOKEN_REFRESH_TTL env var',
    'Added monitoring for refresh failures',
    'Documented in AUTH.md for future review'
  ]
});
```

### Example 2: Escalation Required

```typescript
import { createReceipt, requireEscalation } from '@smartergpt/lex/memory/receipts';

let receipt = createReceipt({
  action: 'Attempted to implement rate limiting for OAuth endpoints',
  outcome: 'deferred',
  rationale: 'Security requirement to prevent abuse',
  confidence: 'uncertain',
  reversibility: 'irreversible',  // Would affect production traffic
});

receipt = requireEscalation(
  receipt,
  'Cannot determine correct rate limits without production traffic data and security team input',
  'security-team'
);
```

### Example 3: High Confidence Action

```typescript
const receipt = createReceipt({
  action: 'Added input validation for email field',
  rationale: 'Prevent invalid data in database',
  confidence: 'high',
  reversibility: 'reversible',
  rollbackPath: 'Remove validation from user schema',
  rollbackTested: true,
  outcome: 'success',
});
```

---

## Integration with Frames

Receipts can be linked to Frames via the optional `frameId` field:

```typescript
import { createReceipt } from '@smartergpt/lex/memory/receipts';
import { saveFrame } from '@smartergpt/lex/memory/store';

// Create a Frame
const frame = {
  id: 'frame-001',
  timestamp: new Date().toISOString(),
  branch: 'feature/oauth',
  module_scope: ['memory/mcp_server/auth'],
  summary_caption: 'Implemented OAuth token refresh',
  reference_point: 'oauth token refresh complete',
  status_snapshot: { next_action: 'Test in staging' }
};

saveFrame(db, frame);

// Create linked receipt
const receipt = createReceipt({
  action: 'Implemented token refresh',
  rationale: 'Security requirement',
  confidence: 'medium',
  reversibility: 'reversible',
  frameId: frame.id,
});
```

---

## CLI Commands

### Create a Receipt

```bash
lex receipt create \
  --action "Implemented feature X" \
  --rationale "User requirement" \
  --confidence medium \
  --reversibility reversible \
  --output receipt.json
```

### Validate a Receipt

```bash
lex receipt validate receipt.json
```

Output:
```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

---

## Validation

The Receipt Protocol includes validation helpers to ensure receipts conform to the schema:

```typescript
import { validateReceiptPayload } from '@smartergpt/lex/memory/receipts/validator';

const result = validateReceiptPayload(data);

if (result.valid) {
  console.log('Receipt is valid');
} else {
  console.error('Validation errors:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Unknown fields:', result.warnings);
}
```

---

## Helper Functions

### `createReceipt(params)`

Creates a new receipt with sensible defaults.

**Parameters:**
- `action` (required): What action was taken
- `rationale` (required): Why this action was chosen
- `confidence` (required): Confidence level
- `reversibility` (required): Reversibility level
- `outcome` (optional): Defaults to `"success"`
- `rollbackPath` (optional): How to undo
- Additional optional fields...

**Returns:** `Receipt`

### `markUncertainty(receipt, marker)`

Adds an uncertainty marker to an existing receipt.

**Parameters:**
- `receipt`: The receipt to modify
- `marker`: The uncertainty marker to add

**Returns:** New receipt with marker added

### `requireEscalation(receipt, reason, escalatedTo?)`

Marks a receipt as requiring escalation.

**Parameters:**
- `receipt`: The receipt to modify
- `reason`: Why escalation is needed
- `escalatedTo` (optional): Who/what it was escalated to

**Returns:** New receipt marked for escalation

### `isReversible(receipt)`

Checks if a receipt indicates a reversible action.

**Returns:** `boolean`

### `hasHighConfidence(receipt)`

Checks if a receipt has high confidence.

**Returns:** `boolean`

### `hasUncertainty(receipt)`

Checks if a receipt has uncertainty markers.

**Returns:** `boolean`

---

## Design Decisions

### Why Immutable Receipts?

Receipts use functional updates (return new objects) to maintain an audit trail. This prevents tampering and makes it clear when receipt properties change.

### Why Explicit Uncertainty?

By requiring explicit uncertainty markers, we:
1. Force agents to acknowledge what they don't know
2. Document the reasoning process
3. Provide recovery paths for future debugging
4. Enable better error messages and escalation

### Why Link to Frames?

Frames capture episodic context (what happened in a session), while Receipts capture disciplined decision-making. Linking them provides:
1. Full decision chain (Frame → Receipt)
2. Ability to query all receipts for a Frame
3. Audit trail for governance

---

## Future Enhancements

### Possible v2 Features

- **Receipt chains**: Link receipts together for multi-step processes
- **Automatic rollback testing**: CLI command to test rollback paths
- **Receipt analytics**: Dashboard showing confidence distribution, escalation rates
- **Template receipts**: Pre-defined receipts for common patterns

### Governance Integration

Future integration with policy checking:
```typescript
// Policy: All irreversible actions require high confidence
const policy = {
  rule: "irreversible-high-confidence",
  check: (receipt: Receipt) => {
    if (receipt.reversibility === "irreversible") {
      return receipt.confidence === "high";
    }
    return true;
  }
};
```

---

## References

- **Thesis:** `docs/thesis/lex_governance-collab_systems_paper_draft.md` Section 3.4
- **Related:** AXError with nextActions (lexrunner issue #483)
- **Schema:** `src/memory/receipts/schema.ts`
- **Validation:** `src/memory/receipts/validator.ts`

---

*— Lex Receipt Protocol, v1.0.0*
