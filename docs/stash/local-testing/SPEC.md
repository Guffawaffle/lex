# Lex Local Testing — PM Spec

> **Status:** Stashed (post-LexSona 0.x)
> **Last Updated:** 2025-12-06
> **Context:** Updated after LexSona 0.1.0 release-candidate pass

---

## Problem Statement

Lex's positioning increasingly relies on the claim that **disciplined, policy-aware agent behavior delivers value independent of where a model runs**. However, we have not yet validated any part of Lex's behavioral/constraints story against a local model in a repeatable way.

Without this validation:
- The "compute-agnostic discipline" claim remains unproven
- Founder conversations lack concrete receipts
- We cannot honestly say "discipline is model-agnostic; local-first is a delivery advantage"

## Why Now (Timing: After LexSona 0.x Ships)

This initiative is **explicitly deferred** until after LexSona 0.1.0+ ships. Rationale:

1. **LexSona 0.1.0 is release-ready** — 94 tests passing, all checks green
2. **Cross-repo integration is stable** — The socket between Lex and LexSona is proven
3. **Disconnected mode works** — LexSona constraint derivation functions without a Lex DB
4. **Non-goals are documented** — 0.1.x scope is locked; local testing is post-0.x work

Starting local testing now would:
- Risk scope creep into LexSona 0.1.x
- Distract from shipping the constraint engine
- Conflate validation work with feature work

## Scope

### In Scope

1. **OpenAI-compatible model abstraction** in Lex
2. **Disconnected-mode validation** as Stage 0 (no Lex DB required)
3. **CLI utilities**: `lex local:doctor`, `lex local:smoke`
4. **Minimal A/B harness** producing JSON report
5. **Documentation** for WSL2 + VS Code + AI Toolkit workflows

### Out of Scope

- Full LexRunner autonomy on local models
- New persona/mode runtime features in Lex
- Production-grade local model manager
- Any changes to LexSona's constraint engine
- Expanding Lex 2.0.0 beyond AX improvements

## Non-Goals

Explicitly, local testing will **NOT**:

1. ❌ Turn Lex into a local orchestration engine
2. ❌ Prove full LexRunner autonomy on local models
3. ❌ Ship a production-grade local model manager inside Lex
4. ❌ Add new persona/mode runtime features to Lex
5. ❌ Introduce new public API surface beyond minimal provider abstraction
6. ❌ Require a Lex DB for Stage 0/Stage 1 proofs
7. ❌ Allow "local testing" to become a backdoor for tool-execution capability

## User Stories

### Developer (First-Party Dogfood)

1. **As a developer**, I want to run `lex local:doctor` and confirm my local model is reachable in <5 minutes.

2. **As a developer**, I want to run `lex local:smoke` without provisioning a Lex DB.

3. **As a developer**, I want to see a JSON report showing that baseline constraints improved adherence on my local model.

### Founder

4. **As a founder**, I want concrete, repo-owned evidence that "discipline improves outcomes even on weaker models."

5. **As a founder**, I want to say "local models are weaker, but constraints improve adherence and reduce drift" and have receipts.

## Acceptance Criteria

### Stage 0: Disconnected Mode Validation

- [ ] A/B harness runs with baseline constraints only
- [ ] No Lex DB required
- [ ] JSON report produced showing constraint vs. no-constraint comparison
- [ ] Works on at least one Ollama model in WSL2

### Stage 1: Provider Wiring

- [ ] `OpenAICompatibleProvider` abstraction implemented
- [ ] Environment variables: `LEX_LLM_BASE_URL`, `LEX_LLM_API_KEY`, `LEX_LLM_MODEL`
- [ ] Default behavior: if `LEX_LLM_BASE_URL` defined, use it; otherwise use existing remote logic

### Stage 2: CLI Utilities

- [ ] `lex local:doctor` validates model server reachable
- [ ] `lex local:doctor` calls `/v1/models` and minimal chat request
- [ ] `lex local:smoke` runs fixed prompt set (policy recall, constraint summarization, refusal)
- [ ] Developer can run local tests without provisioning a Lex DB

### Stage 3: Documentation

- [ ] WSL2 + Ollama setup documented
- [ ] VS Code + AI Toolkit workflow documented
- [ ] LM Studio optional path documented

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep into Lex core | Medium | High | Explicit non-goals; provider-only abstraction |
| Feature mismatch with local servers | Low | Medium | Graceful error messaging; capability flags |
| Distracts from LexSona shipping | Medium | High | Explicitly deferred until post-0.x |
| Becomes persona/orchestration backdoor | Low | High | Non-goal documented; code review gates |
| Overpromising local capability | Medium | Medium | Founder-honest narrative; concrete claims only |

## Rollout Plan

### Phase 0: Stash (Current)
- Document spec, ADR, implementation plan
- Do not implement
- Revisit after LexSona 0.1.0+ ships

### Phase 1: Stage 0 Implementation (Post-LexSona 0.x)
- A/B harness with baseline constraints
- Disconnected mode only
- JSON report output

### Phase 2: Provider Wiring
- `OpenAICompatibleProvider` abstraction
- Environment variable configuration
- Default to existing remote logic

### Phase 3: CLI Utilities
- `lex local:doctor`
- `lex local:smoke`
- Integration with provider abstraction

### Phase 4: Documentation & Dogfood
- Complete setup guides
- Integrate into pre-release dogfood checks
- Gather receipts for founder narrative

---

## Three-Layer Truth (Unchanged)

This local testing initiative reinforces, and must not violate, the canonical layering:

```
┌─────────────────────────────────────────┐
│  LexRunner (execution layer)            │
│  - Applies constraints in real workflows│
│  - Runs gates, executes tools           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LexSona (constraint engine)            │
│  - Derives constraints from personas    │
│  - Returns constraints, never executes  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Lex (memory + policy + storage)        │
│  - Frames, policy, behavioral socket    │
│  - Stores rules; does not enforce       │
└─────────────────────────────────────────┘
```

Local testing validates that **Lex's memory/policy/constraints foundation remains useful** even when the model is weaker or self-hosted. It does **not** prove LexRunner autonomy locally.
