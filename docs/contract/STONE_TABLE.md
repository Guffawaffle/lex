# Stone Table v1.0.0

> **The constitution layer. Non-negotiable. Binary. Testable.**

This document defines the invariants that all Lex ecosystem tooling must satisfy. Violations do not ship.

---

## The Thesis

Lex is a **truth-preserving work compiler**:

- It ingests messy reality (repos, issues, diffs, CI, comments).
- It produces a **deterministic evidence bundle** that a stochastic agent cannot distort.
- It emits **receipts** that let humans audit decisions, replay runs, and recover from failures without mythology.

---

## Stone Table Rules

### 1. Receipts Over Claims

Every action produces machine-verifiable artifacts:
- Inputs (with digests)
- Outputs (with digests)
- Tool calls (with parameters and responses)
- Timestamps (ISO 8601, UTC)

**Test:** Can you replay the exact decision from the receipt alone? If not, it's incomplete.

### 2. Determinism Before Judgment

- **D0 (Harvest)** and **D1 (Analyze)** are facts only.
- **D2 (Plan)** is allowed to be stochastic, but must cite evidence IDs.
- The same `HarvestBundle` input must produce the same `AnalysisPool` output.

**Test:** Run D1 twice on the same frozen bundle. Outputs must be byte-identical.

### 3. Unknown Is Not False

Missing signals are first-class values:
- `unknown` — signal could not be determined
- `truncated` — signal was cut off (e.g., token limit)
- `unavailable` — source was unreachable

These are never silently collapsed to "no problems" or "all clear."

**Test:** If a CI status is missing, the output must contain `"ciStatus": "unknown"`, not `"ciStatus": "pass"`.

### 4. Pinned Reality

Every harvested entity is pinned to immutable identifiers:

| Entity | Required Pins |
|--------|---------------|
| Repository | `defaultBranchSha` |
| Pull Request | `prHeadSha`, `prBaseSha`, `mergeBaseSha` |
| Issue | `updatedAt` (ISO 8601) |
| Commit | `sha` |
| File | `blobSha` or content digest |

**Test:** Can you reconstruct the exact state from pins alone? If not, add more pins.

### 5. MCP/CLI Parity for Core Surfaces

If a capability matters, it has both MCP tool and CLI command:
- Same input schema
- Same output schema
- Same behavior

**Test:** `lex frame_list --json` and MCP `frame_list` tool return identical structures.

### 6. No Stdout Contamination for MCP Servers

Stdio MCP servers never print prose to stdout:
- Protocol messages only on stdout
- Debug/logs go to stderr
- Gated by `LEX_DEBUG` or equivalent

**Test:** Pipe MCP server output through a JSON parser. It must not fail.

### 7. Budgeted Fanout

Concurrency, token budgets, and risk gates are explicit inputs:
- `maxWorkers` — parallel execution limit
- `maxTokens` — LLM budget (if applicable)
- `riskGates` — conditions that block progression

**Test:** Fanout without explicit budget must fail or use documented defaults.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-31 | Initial Stone Table |

---

## Enforcement

- **CI check:** Stone Table violations fail the build
- **Code review:** Reviewers must verify Stone Table compliance
- **MCP tools:** Must emit structured errors for violations

If it violates Stone Table, it doesn't merge.
