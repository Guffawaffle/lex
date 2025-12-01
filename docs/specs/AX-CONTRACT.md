# AX Contract v0.1

> **AX: Agent eXperience** – the discipline of designing systems where AI agents are first-class consumers of tools, APIs, workflows, and memory.
>
> Industry sometimes uses "AX / AI Experience" to mean *human* experience of AI products. We explicitly stake out the complementary blade: **how agents experience our systems**, not how humans experience the UI.

This document is not philosophy. It is a set of **concrete, testable guarantees** that Lex and LexRunner commit to for AX v0.1.

- Version: 0.1.0
- Status: Draft, pending Guff adoption
- Intended scope: `lex` (Lex) and `lex-pr-runner` (LexRunner)
- Target AX level: Level 3 – AI-Native (from AX spec)

---

## 1. Principles (Naming Only)

AX v0.1 is grounded in five principles:

1. Deterministic First
2. Structured Over Conversational
3. Fail Loud, Recover Clear
4. Memory Is a Feature
5. Teach Through Constraints

This contract defines what we **actually guarantee** for v0.1 under those names.

---

## 2. v0.1 Guarantees

### 2.1 Structured Output

**Pledge:** AI agents can reliably parse tool output without guessing.

- All new or modified CLI commands that output data for machine consumption **MUST** support a `--json` flag.
- MCP tools that return non-trivial data **MUST** return structured JSON, not freeform prose.
- When both human and AI consumers exist, the machine-friendly form (JSON / table) **MUST NOT** be worse than the prose version.

Applies to: `lex` CLI, LexRunner CLI, LexRunner MCP tools.

---

### 2.2 Deterministic Preparation

**Pledge:** Preparation around LLM calls is deterministic for the same inputs.

- Given the same repo state, config, and inputs, core preparatory workflows **MUST** produce the same outputs:
  - Planning / run graphs
  - Gate configs and command lists
  - Instruction loading / precedence resolution
- No hidden randomness (timestamps, unsorted maps, non-stable iteration) is allowed in these preparatory steps.

Applies to: LexRunner planners, loaders, gate wiring, lex instruction loaders.

---

### 2.3 Recoverable Errors

**Pledge:** When something fails, an AI knows what went wrong and what to try next.

- Structured errors returned from CLI `--json` or MCP tools **MUST** follow an AX error shape, conceptually:

  ```json
  {
    "code": "SOME_CODE",
    "message": "Human-readable description",
    "context": { "optional": "details" },
    "nextActions": ["string suggestion 1"]
  }
  ```

- At least **one** `nextActions[]` entry is required for structured errors.
- Exit codes and error codes **MUST** be stable and documented.

Applies to: LexRunner MCP tools, core CLIs where failures are expected as part of normal workflows.

---

### 2.4 Memory and Recall

**Pledge:** Frames are first-class, and recall actually works.

- Frames created via `lex remember` are treated as the **source of truth** for past decisions and learning.
- `lex recall` and any Runner-side recall mechanisms **MUST** search at minimum:
  - `keywords`
  - `reference_point`
  - `summary_caption`
- Recall **MUST** be case-insensitive for these fields.
- Core workflows that depend on history (merge-weave, executor runs, long-running work) **MUST** attempt recall before making major decisions.

Applies to: Lex memory store, LexRunner executors and senior-dev style flows.

---

### 2.5 Frame Emission for Core Workflows

**Pledge:** Important runs leave receipts.

- The following workflows **MUST** emit at least one Frame upon completion:
  - Merge-weave / PR integration runs
  - Executor runs that modify code or repo state
  - Significant refactors or orchestrations coordinated by Runner
- Frames **MUST** capture, at minimum:
  - What was attempted (summary)
  - Scope touched (modules, paths, PRs)
  - Outcome (success, partial, failed)
  - Recommended next steps when applicable

Applies primarily to: LexRunner, with Lex providing the storage and schema.

---

## 3. Non-goals in v0.1 (Explicitly Not Guaranteed)

AX v0.1 does **not** promise:

- Full CLI / MCP parity (some commands may remain CLI-only for now).
- Human-facing UX quality (AX optimizes for AI agents; human UX is a separate concern).
- Zero hallucinations or perfect model behavior.
- That every legacy command or tool already meets these guarantees; v0.1 applies to:
  - New features
  - Existing features that have been touched as part of AX adoption
  - Design targets for cleanup work

---

## 4. How To Use This Contract

For any new feature or change in Lex or LexRunner:

- If it violates a v0.1 guarantee, that is a **blocker** or at least a **tracked AX issue**, not a vibe.
- PR descriptions and design docs **SHOULD** note:
  - `AX impact: none | improves | regresses (with explanation)`
- Tests and CI should verify:
  - `--json` exists where required
  - AX error shape is respected
  - Recall can find known Frames
  - Core workflows emit Frames

---

## 5. Adoption & Versioning

- Once AX v0.1 (or any >=v0.1 version) is adopted for a codebase, all **new features and changes MUST comply** with the guarantees above.
- Retrofitting existing features to meet this contract SHOULD be treated as a **top-priority cleanup track**, not background wish-list work.
- If you are reading this in a codebase that has moved beyond AX v0.1, **check for a newer AX Contract version immediately**.
  - If no newer version is discoverable, **raise an issue** to clarify whether v0.1 is still the active contract or needs revision.

---

AX v0.1 is our minimum bar. Future versions can tighten or expand these guarantees, but they **MUST NOT** silently weaken them.
