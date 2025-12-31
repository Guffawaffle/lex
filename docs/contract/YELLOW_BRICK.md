# Replayable Analysis Pipeline (Yellow Brick) v1.0.0

> **The path contract. D0 → D1 → D2 → D3 → D4.**

This document defines the deterministic pipeline that transforms messy reality into auditable decisions.

---

## Pipeline Overview

```
D0 Harvest → D1 Analyze → D2 Plan → D3 Execute → D4 Verify
     ↓            ↓           ↓          ↓           ↓
 harvest.json  analysis.json plan.json receipt.json verify.json
```

Each phase produces a versioned artifact with a digest. The digest of phase N is an input to phase N+1.

---

## D0: Harvest

**Purpose:** Fetch, normalize, pin, and label unknowns.

**Input:** Query parameters (repo, PR numbers, issue filters, etc.)

**Output:** `HarvestBundle`

**Constraints:**
- All entities pinned to immutable identifiers (see Non-Negotiables §4)
- Unknown/truncated signals are first-class (see Non-Negotiables §3)
- No analysis, no recommendations, no judgments
- Pure fetch and normalize

**Artifact:**
```json
{
  "schemaVersion": "1.0.0",
  "phase": "D0",
  "timestamp": "2025-12-31T12:00:00Z",
  "inputDigest": "sha256:abc123...",
  "bundle": { /* HarvestBundle */ },
  "outputDigest": "sha256:def456..."
}
```

---

## D1: Analyze

**Purpose:** Pure computation over D0. Facts only.

**Input:** `HarvestBundle` (from D0)

**Output:** `AnalysisPool`

**Constraints:**
- **Deterministic:** Same input → same output (byte-identical)
- **No prose:** Output is structured data, not sentences
- **No recommendations:** No "you should" or "consider"
- **Facts only:** Derived signals, not opinions

**Artifact:**
```json
{
  "schemaVersion": "1.0.0",
  "phase": "D1",
  "timestamp": "2025-12-31T12:01:00Z",
  "inputDigest": "sha256:def456...",
  "pool": { /* AnalysisPool */ },
  "outputDigest": "sha256:789abc..."
}
```

---

## D2: Plan

**Purpose:** Stochastic choice with citations.

**Input:** `AnalysisPool` (from D1)

**Output:** `Plan`

**Constraints:**
- Every rationale must cite evidence IDs (EIDs)
- Unknowns must be declared, not hidden
- Budget constraints are explicit inputs
- Allowed to be non-deterministic (LLM-based)

**Artifact:**
```json
{
  "schemaVersion": "1.0.0",
  "phase": "D2",
  "timestamp": "2025-12-31T12:02:00Z",
  "inputDigest": "sha256:789abc...",
  "plan": { /* Plan */ },
  "rationale": [
    { "decision": "assign-copilot", "eid": "pr-42", "reason": "Complexity score 2, no blockers" }
  ],
  "unknowns": ["ci-status-pr-99"],
  "outputDigest": "sha256:aabbcc..."
}
```

---

## D3: Execute

**Purpose:** Do the work.

**Input:** `Plan` (from D2)

**Output:** `Receipt`

**Constraints:**
- All actions recorded with inputs and outputs
- Failure classification (retryable, fatal, external)
- Links to created artifacts (issue IDs, PRs, commits)

**Artifact:**
```json
{
  "schemaVersion": "1.0.0",
  "phase": "D3",
  "timestamp": "2025-12-31T12:10:00Z",
  "inputDigest": "sha256:aabbcc...",
  "receipt": { /* Receipt */ },
  "links": {
    "issuesCreated": [641, 642],
    "prsCreated": [],
    "commitsCreated": []
  },
  "failures": [],
  "outputDigest": "sha256:ddeeff..."
}
```

---

## D4: Verify (Optional)

**Purpose:** Gate merges and update world state.

**Input:** `Receipt` (from D3) + current world state

**Output:** `VerifyResult`

**Constraints:**
- All gates must pass before merge
- Follow-up tasks recorded
- World state diff captured

**Artifact:**
```json
{
  "schemaVersion": "1.0.0",
  "phase": "D4",
  "timestamp": "2025-12-31T12:15:00Z",
  "inputDigest": "sha256:ddeeff...",
  "result": { /* VerifyResult */ },
  "gatesPassed": ["lint", "typecheck", "test"],
  "gatesFailed": [],
  "followUp": [],
  "outputDigest": "sha256:112233..."
}
```

---

## Digest Chain

Each phase includes the previous phase's `outputDigest` as its `inputDigest`. This creates an immutable chain:

```
D0.outputDigest → D1.inputDigest
D1.outputDigest → D2.inputDigest
D2.outputDigest → D3.inputDigest
D3.outputDigest → D4.inputDigest
```

To replay: start from any phase's artifact, verify its `inputDigest` matches the previous phase's `outputDigest`, then re-run.

---

## Second Star (Target State)

A developer or agent can:

1. **Discover** Lex from the MCP registry
2. **Execute** with one command (`npx @smartergpt/lex-mcp`)
3. **Trust** outputs (clear provenance + constraints)
4. **Use** Frames + Atlas + policy checks to reduce drift

For fanout specifically:

> **Fanout produces an AnalysisPool that is so clean and replayable that decision-making becomes safely stochastic.**

Stochastic decisions riding on deterministic rails.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-31 | Initial pipeline contract |
