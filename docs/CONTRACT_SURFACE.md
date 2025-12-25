# Lex Contract Surface (v1)

> **For runner authors and tool builders.**
> This is what you must understand to be "Lex-compatible."

**Scope:** This document defines the Lex contract surface. LexRunner behavior is intentionally out of scope — it is one implementation, not the specification.

See also: [`FOUNDERS_NOTE.md`](./FOUNDERS_NOTE.md) for the philosophy behind this separation.

---

## Overview

Lex exposes a contract surface that any runner or tool can target. This document defines:
1. What contracts exist
2. What guarantees they provide
3. What you must respect to call yourself Lex-compatible

---

## Core Contracts

### 1. Introspect

**What:** Discovery mechanism for agents to understand current Lex state, capabilities, and error codes.

**Schema:** Introspect response (no external schema file - defined by MCP server implementation)

**Schema Version:** 1.0.0

**Invariants:**
- Response includes `schemaVersion` field for contract stability tracking
- All arrays (tools, modules, error codes) are returned in **deterministic sorted order**
- Error codes enum values are stable across minor versions (additions only)
- Full format returns: `schemaVersion`, `version`, `policy`, `state`, `capabilities`, `errorCodes`
- Compact format returns abbreviated versions: `schemaVersion`, `v`, `caps`, `state`, `mods`, `errs`

**Stable Fields (guaranteed across minor releases):**
- `schemaVersion`: Version of the introspect response contract (SemVer)
- `version`: Lex package version
- `policy.modules`: Array of module IDs (sorted alphabetically)
- `policy.moduleCount`: Number of modules
- `state.frameCount`: Number of stored frames
- `state.currentBranch`: Current git branch
- `state.latestFrame`: Timestamp of most recent frame (or null)
- `capabilities.encryption`: Whether encryption is available
- `capabilities.images`: Whether image storage is available
- `errorCodes`: Array of MCPErrorCode enum values (sorted alphabetically)

**Best-Effort Fields (may change or be null):**
- `policy`: Null if no policy file is loaded
- `state.latestFrame`: Null if no frames exist

**Guarantee:** 
- Schema version follows SemVer. Agents can cache and depend on the structure within a major version.
- Deterministic ordering enables reliable caching and diffing of introspect results.
- Adding new error codes, capabilities, or fields is considered a minor version bump.
- Removing or changing existing fields is a major version bump.

---

### 2. Frames

**What:** The atomic unit of AI memory.

**Schema:** `schemas/frame.schema.json`

**Invariants:**
- Frames are immutable once written
- Every Frame has a unique `id` (UUID v4)
- Frames have a `schemaVersion` field (currently `v3`)
- Frames may reference other Frames via `parent_id`

**Guarantee:** A valid Frame today will be a valid Frame tomorrow. Schema evolution is additive only within a major version.

---

### 3. Policy

**What:** Rules that govern module ownership, caller permissions, and kill patterns.

**Schema:** `schemas/lexmap.policy.schema.json`

**Invariants:**
- Policy is loaded once at startup (or explicitly reloaded)
- Module IDs are lowercase, hyphenated identifiers
- `allowed_callers` and `forbidden_callers` are enforced at scan time
- `global_kill_patterns` apply to all modules

**Guarantee:** Policy validation is deterministic. Same policy + same codebase = same violations.

---

### 4. Instructions

**What:** IDE/host-specific instruction blocks generated from a canonical source.

**Schema:** `schemas/lex-yaml.schema.json` (config) + marker format

**Invariants:**
- Canonical source lives in `.smartergpt/instructions/lex.md`
- Projections use markers: `<!-- LEX:BEGIN -->` / `<!-- LEX:END -->`
- Content outside markers is never modified by Lex
- Generation is idempotent

**Guarantee:** Running `lex instructions generate` twice produces identical output.

---

### 5. Rules

**What:** Behavioral rules with confidence scores and decay.

**Schema:** `schemas/behavior-rule.schema.json`

**Invariants:**
- Rules have Bayesian confidence (alpha/beta)
- Rules decay over time (configurable tau)
- Rules are scoped by **Scope Contract A+** (Lex-owned canonical base keys). See [`docs/LEXSONA.md`](./LEXSONA.md) for the authoritative definition, legacy alias handling, and normalization requirements.

**Guarantee:** Rule confidence is computable from stored values. No hidden state.

---

### 6. MCP Tools

**What:** Model Context Protocol tools exposed by the Lex MCP server.

**Invariants:**
- Tools list is returned in **deterministic sorted order** by name
- Tool schemas are stable within a major version
- New tools may be added in minor versions
- Tool removal or signature changes require major version bump

**Guarantee:** Tools/list returns a deterministically ordered array, enabling reliable caching and comparison.

---

## Versioning

All schemas follow SemVer:
- **Patch:** Additive optional fields, documentation only
- **Minor:** Additive required fields with safe defaults
- **Major:** Breaking changes to structure or semantics

Lex will refuse to load schemas with unknown major versions.

---

## What Runners Must Do

To be Lex-compatible, a runner must:

| Requirement | Description |
|-------------|-------------|
| **Parse Lex schemas** | Use the published JSON schemas or Zod types |
| **Respect immutability** | Never mutate Frames after creation |
| **Honor policy** | Enforce `allowed_callers`, `forbidden_callers`, `kill_patterns` |
| **Use markers correctly** | Never touch content outside `LEX:BEGIN`/`LEX:END` |
| **Version-check** | Refuse unknown major schema versions |

---

## What Runners May Do

Runners are free to:

- Add their own orchestration logic
- Define their own workflows (gates, merge pyramids, etc.)
- Extend Frames with runner-specific metadata (in designated fields)
- Ignore optional Lex features (e.g., Instructions if not needed)

---

## What Runners Must Not Do

- **Fork Lex schemas** — Target them, don't modify them
- **Invent new Frame fields** — Use `metadata` or `context` for extensions
- **Bypass policy** — If policy says no, it's no
- **Claim Lex-compatibility without testing** — Use `lex policy check` to validate

---

## Reference Implementation

**LexRunner** (`lexrunner`) is the reference runner. It demonstrates:
- Gate execution (lint, typecheck, test)
- Merge pyramid construction
- PR fan-out and dependency ordering
- ScopeGOAT workflow (internal process pattern)

LexRunner is **not required** to use Lex. It's one way to build on Lex—the way the Lex authors use.

---

## Getting Started

1. Install Lex: `npm install @smartergpt/lex`
2. Initialize: `lex init`
3. Check policy: `lex policy check`
4. Generate instructions: `lex instructions generate`

For runner development, see [`docs/RUNNER_DEVELOPMENT.md`](./RUNNER_DEVELOPMENT.md) *(coming soon)*.

---

## Questions

If something in this contract is unclear, that's a bug. File an issue.
