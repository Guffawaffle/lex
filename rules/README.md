# LexSona Behavioral Rules

This directory contains behavioral rule definitions for LexSona v0 integration.

## Overview

Rules define behavioral preferences and policies that guide agent behavior. They are loaded with the same precedence chain as prompts and schemas:

1. **LEX_RULES_DIR** (environment variable) - Highest priority
2. **.smartergpt.local/canon/rules/** (workspace overlay) - Medium priority  
3. **canon/rules/** (package defaults) - Lowest priority

## Rule Structure

Each rule is a JSON file following the LexSona behavioral rule schema:

```json
{
  "rule_id": "unique-stable-identifier",
  "category": "tool_preference",
  "text": "Human-readable rule directive",
  "scope": {
    "environment": "github-copilot",
    "context_tags": ["execution", "tools"]
  },
  "alpha": 8,
  "beta": 1,
  "confidence": 0.89,
  "severity": "zero-tolerance",
  "timing_requirement_seconds": 5,
  "first_seen": "2025-11-23T00:00:00Z",
  "last_correction": "2025-11-23T00:00:00Z"
}
```

## Included Rules

### tool-fallback-protocol.json
**Confidence:** 62%  
**Severity:** zero-tolerance  
**Timing:** <5 seconds

When a tool fails, enumerate all available alternatives before claiming inability. Prevents premature capability abandonment.

### operator-role-primacy.json
**Confidence:** 62%  
**Severity:** zero-tolerance

When assigned operator role, maintain it through obstacles. Prefer tool execution over manual instructions.

### escalation-response.json
**Confidence:** 62%  
**Severity:** should

Treat repeated corrections as strong behavioral signals requiring immediate policy shift.

### plan-execute-transition.json
**Confidence:** 64%  
**Severity:** zero-tolerance

Execute plans immediately after synthesis when in operator mode. No gap between planning and execution.

## Usage

```typescript
import { resolveRules } from '@smartergpt/lex/shared/rules';

// Get rules for a specific context
const rules = resolveRules({
  environment: 'github-copilot',
  context_tags: ['execution', 'tools'],
  confidenceThreshold: 0.75
});

// Use rules to guide behavior
rules.forEach(rule => {
  console.log(`[${rule.severity}] ${rule.text}`);
});
```

## Precedence Example

```
File: tool-fallback-protocol.json

Package (canon/rules/):                  confidence: 0.89
Workspace (.smartergpt.local/canon/rules/): confidence: 0.92  ← Overrides package
ENV ($LEX_RULES_DIR):                    confidence: 0.95  ← Overrides all

Result: ENV version loaded (highest precedence)
```

## Schema Reference

See `docs/research/LexSona/CptPlnt/lexsona_behavior_rule.schema.json` for the full JSON schema.

## Case Study

These rules were derived from the agent behavior failure case study documented in:
`docs/research/LexSona/case_studies/agent_behavior_failure_parallel_assignment.md`

The case study demonstrates the exact failure modes these rules prevent, validated through Bayesian confidence scoring.
