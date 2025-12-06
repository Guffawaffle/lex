# Lex Local Testing — PM Spec

> **Status:** Stashed (post-LexSona 0.x)
> **Last Updated:** 2025-12-06
> **Context:** Updated after LexSona 0.1.0 release-candidate pass

---

## Problem Statement

Lex's positioning claims that disciplined, policy-aware agent behavior delivers value **independent of where a model runs**. This is a founder-level differentiator: compute-agnostic discipline.

However, we have no repo-owned evidence that this claim holds on local models. Without concrete validation:

1. The "compute-agnostic" narrative remains aspirational, not proven.
2. We cannot honestly tell founders: "Discipline improves outcomes even on weaker models."
3. We risk coupling our story to cloud-only workflows.

---

## Why Now (Timing)

**This work is explicitly deferred until after LexSona 0.x ships.**

Rationale:

- LexSona 0.1.0 is release-ready with 94 tests passing.
- The cross-repo interface is stable (Lex 2.0.0 ↔ LexSona socket confirmed).
- Attempting local testing validation before LexSona ships would create scope creep risk.
- The architecture boundaries are now documented and locked.

**Trigger condition:** Begin this work after LexSona 0.1.0+ has been used in real dogfooding for at least one iteration.

---

## Scope

### In Scope

1. **OpenAI-compatible provider abstraction** in Lex
   - `LEX_LLM_BASE_URL`, `LEX_LLM_API_KEY`, `LEX_LLM_MODEL` env vars
   - Default dogfood backend: Ollama in WSL2
   - Optional support: LM Studio, vLLM via same abstraction

2. **CLI utilities**
   - `lex local:doctor` — Validate model server reachability
   - `lex local:smoke` — Run minimal prompt set

3. **Minimal A/B evaluation harness**
   - 10-20 prompts representing "Lex discipline"
   - Two modes: no constraints vs. baseline constraints injected
   - JSON report output with pass/fail tags

4. **Documentation**
   - WSL2 + VS Code + AI Toolkit workflow
   - Ollama setup guide
   - LM Studio alternative path

### Out of Scope

- Full LexRunner autonomy on local models
- Production-grade local model manager
- Persona execution or orchestration inside Lex
- Proving LexSona-derived constraints locally (that's Stage 2)
- Any changes to Lex's stable 2.0.x public API

---

## Critical Architectural Constraint

**Disconnected mode is first-class.**

The LexSona 0.1.0 release-candidate pass confirmed:

- Persona loading works without a Lex DB
- Constraint derivation works without a Lex DB
- LexSona degrades gracefully when no Lex DB exists

**Implication:** Stage 1 local testing MUST NOT require a Lex database. The harness validates baseline constraints (hardcoded or file-loaded), not database-derived rules.

---

## Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| Turn Lex into a local orchestration engine | That's LexRunner's job |
| Prove full LexRunner autonomy locally | Different layer, different validation |
| Ship a production local model manager | Out of scope forever |
| Add persona execution to Lex | Violates three-layer truth |
| Require a Lex DB for first proofs | Disconnected mode is first-class |
| Expose testing internals in public API | Dev-only utilities |

---

## User Stories

### US-1: Developer validates local model connectivity

> As a developer, I want to run `lex local:doctor` and confirm my local model server is reachable in under 5 minutes.

**Acceptance:**
- [ ] Command exists and is documented
- [ ] Calls `/v1/models` endpoint
- [ ] Calls minimal chat completion
- [ ] Green/red output with clear error messages

### US-2: Developer runs smoke tests against local model

> As a developer, I want to run `lex local:smoke` to verify basic constraint-aware behavior works on my local model.

**Acceptance:**
- [ ] Command runs 3-5 fixed prompts
- [ ] Tests policy recall, constraint summarization, refusal of out-of-scope changes
- [ ] Reports pass/fail for each prompt
- [ ] Exits with appropriate code for CI usage

### US-3: Developer runs A/B harness for constraint effectiveness

> As a developer, I want to run an A/B harness that compares model behavior with and without baseline constraints, producing a JSON report.

**Acceptance:**
- [ ] 10-20 prompts in dataset
- [ ] Two modes: unconstrained vs. constrained
- [ ] JSON output with per-prompt scores
- [ ] Summary statistics (improvement rate)

### US-4: Developer uses VS Code + local model seamlessly

> As a developer, I want to use VS Code with AI Toolkit and a local model in the same workflow as Copilot Chat.

**Acceptance:**
- [ ] Documentation covers AI Toolkit + Ollama setup
- [ ] Model picker shows local model option
- [ ] No Lex code changes required for this (docs only)

---

## Acceptance Criteria (Release Gate)

1. **Doctor works:** `lex local:doctor` returns green with Ollama on WSL2.
2. **Smoke works:** `lex local:smoke` passes on at least one 7B model.
3. **Harness produces evidence:** A/B JSON report shows measurable delta.
4. **No API surface creep:** Lex 2.0.x public exports unchanged.
5. **No DB required:** All Stage 1 tests pass without a Lex database.
6. **Docs exist:** WSL2 + VS Code workflow documented.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Local models don't support all OpenAI endpoints | Medium | Low | Feature-check in provider; graceful degradation |
| Scope creep into orchestration | Medium | High | Non-goals documented; PR review gate |
| Results don't show improvement | Low | High | Prompt dataset curated for constraint-relevant scenarios |
| Maintenance burden for harness | Low | Medium | Keep harness minimal (10-20 prompts, JSON only) |
| Confusion with LexSona/LexRunner | Medium | Medium | Docs reinforce three-layer truth explicitly |

---

## Rollout Plan

### Stage 1: Foundation (This Spec)

- [ ] Provider abstraction (env var wiring)
- [ ] `lex local:doctor` command
- [ ] `lex local:smoke` command
- [ ] WSL2 + Ollama documentation
- [ ] **No Lex DB required**

### Stage 2: Harness + Evidence

- [ ] A/B evaluation harness
- [ ] Prompt dataset (10-20 prompts)
- [ ] JSON report output
- [ ] First founder-facing evidence paragraph

### Stage 3: LexSona Integration (Optional)

- [ ] Hook LexSona-derived constraints into harness
- [ ] Compare baseline vs. LexSona-derived constraints
- [ ] Requires Lex DB for rule storage
- [ ] **Only after Stage 1-2 proven**

---

## Dependencies

- Lex 2.0.x stable (confirmed)
- LexSona 0.1.0+ shipped (trigger condition)
- Ollama available in WSL2 (developer responsibility)
- VS Code + AI Toolkit (optional but recommended)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to green `local:doctor` | < 5 minutes |
| Smoke test pass rate on 7B model | > 80% |
| A/B improvement signal | Measurable delta (any positive) |
| Documentation completeness | All user stories have docs |

---

## Appendix: Three-Layer Truth (Must Remain Intact)

```
Lex stores.       → Memory, policy, behavioral rules socket
LexSona derives.  → Constraint engine, persona resolution
LexRunner applies.→ Gates, execution, real workflows
```

Local testing validates **Lex's storage + constraint foundation** improves behavior. It does NOT validate LexRunner execution or LexSona persona mechanics locally.
