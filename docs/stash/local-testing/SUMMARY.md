# Lex Local Testing — Executive Summary

> **Status:** Stashed (post-LexSona 0.x)
> **Last Updated:** 2025-12-06
> **Context:** Updated after LexSona 0.1.0 release-candidate pass

---

## One-Paragraph Founder Proof (Target Output)

> "Local models are weaker, but constraints improve adherence and reduce drift. We validated this claim using baseline constraints from Lex's policy layer, running a 20-prompt A/B comparison on qwen2.5-coder:7b via Ollama. Constrained responses showed 25% higher adherence to coding guidelines, tool preferences, and scope boundaries. This proves that **discipline is model-agnostic**—the value comes from policy-aware behavior, not raw model capability. Local-first is a delivery advantage, not a capability compromise."

---

## What We're Proving

| Claim | Evidence Source |
|-------|-----------------|
| Discipline improves outcomes | A/B harness JSON report |
| Works on weaker models | Tested on local Ollama models |
| No cloud dependency required | Disconnected mode validation |
| Lex stays feature-stable | No new runtime features added |

---

## What We're NOT Claiming

| Not Claimed | Why |
|-------------|-----|
| Local can do everything | Local models are weaker; that's honest |
| LexRunner autonomy locally | That's a different, harder problem |
| Lex becomes an orchestrator | Lex stores; LexSona derives; LexRunner applies |
| This replaces cloud | Local-first is an option, not a mandate |

---

## Architecture Boundaries (Unchanged)

```
Lex stores.
LexSona derives.
LexRunner applies.
```

Local testing validates that **Lex's memory/policy/constraints foundation remains useful** even when the model is weaker or self-hosted.

It does **not**:
- Add persona execution to Lex
- Add orchestration to LexSona
- Prove LexRunner-grade autonomy locally

---

## Key Learnings from LexSona 0.1.0 Pass

| Learning | Implication for Local Testing |
|----------|------------------------------|
| LexSona works in disconnected mode | No Lex DB required for Stage 0 |
| Socket interface is stable | Presume this interface, don't redesign |
| MCP adapter has no execution patterns | Preserve boundary discipline |
| Non-goals are documented | Local testing is post-0.x work |

---

## Staged Rollout

| Stage | Scope | DB Required? |
|-------|-------|--------------|
| **Stage 0** | A/B harness + baseline constraints | ❌ No |
| Stage 1 | Provider abstraction | ❌ No |
| Stage 2 | `local:doctor` + `local:smoke` | ❌ No |
| Stage 3 | Documentation | N/A |
| Future | LexSona-derived constraints | ✅ Optional |

---

## Success Metrics

1. Developer runs `lex local:doctor` → green in <5 minutes
2. Developer runs local tests without provisioning a Lex DB
3. Baseline constraints improve adherence in disconnected mode
4. A/B harness shows measurable improvement on at least one local model
5. Local testing becomes a standard pre-release dogfood check

---

## Timing

**Explicitly deferred until after LexSona 0.1.0+ ships.**

Rationale:
- LexSona 0.1.0 is release-ready (94 tests passing)
- Starting now would risk scope creep
- Local testing strengthens the founder narrative, doesn't block shipping

---

## Tone Commitment

**Founder-honest, not hype.**

- We don't claim local can do everything
- We claim discipline improves outcomes even on weaker models
- We have receipts (JSON report)
- We explicitly document non-goals to prevent scope drift

---

## Package Contents

| File | Purpose |
|------|---------|
| `SPEC.md` | PM specification with user stories and acceptance criteria |
| `ADR.md` | Architecture decision record with options and detailed design |
| `IMPLEMENTATION.md` | Staged implementation plan with files and code patterns |
| `SUMMARY.md` | This executive summary |

---

## Three-Layer Truth (Always)

```
┌─────────────────────────────────────────┐
│  LexRunner (execution layer)            │
│  - Applies constraints in real workflows│
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LexSona (constraint engine)            │
│  - Derives constraints from personas    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Lex (memory + policy + storage)        │
│  - Stores; does not enforce             │
└─────────────────────────────────────────┘
```

**Discipline is model-agnostic. Local-first is a delivery advantage.**
