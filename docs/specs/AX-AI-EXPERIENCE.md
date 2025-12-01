# AX: Agent eXperience

> **The discipline of designing systems where AI agents are first-class consumers of tools, APIs, workflows, and memory.**

---

## Canonical Definition

**In the Lex/LexRunner universe, AX = Agent eXperience.**

Industry sometimes uses "AX" or "AI Experience" to mean the *human* experience of AI products (how users feel when interacting with AI features). We explicitly stake out the complementary blade:

> **AX is how agents experience our systems, not how humans experience AI.**

This distinction matters. A system can have great human-facing AI UX (friendly chatbot, smooth onboarding) while being hostile to AI agents (unstructured output, no error recovery, no memory). AX focuses on the latter.

---

## Abstract

Just as UX (User Experience) revolutionized how we design for humans, and DX (Developer Experience) emerged when we recognized developers as users, **AX (Agent eXperience)** is the next evolution: designing tools, APIs, workflows, and systems with AI agents as primary consumers.

AX is not about making systems "AI-friendly" as an afterthought. It's about recognizing that AI agents are now:
- Tool users
- API consumers
- Workflow participants
- Context managers
- Decision makers (within bounds)

This spec defines the principles, patterns, and anti-patterns of AX, with concrete application to Lex and LexRunner.

**Binding Contract:** See [AX-CONTRACT.md](./AX-CONTRACT.md) for the enforceable v0.1 guarantees.

---

## The Five AX Principles

### Principle 1: Deterministic First

> AI can't debug randomness. Make preparation deterministic; contain stochasticity.

**Rationale:** LLMs are stochastic by nature. When the environment is also unpredictable, failures become impossible to diagnose. By making everything *before* and *after* the LLM call deterministic, we create a "vacuum" where the model's output is the only variable.

**Patterns:**
- Jordan-mode: deterministic prep → vacuum-ready prompt → single stochastic call
- Gates that produce identical results on identical inputs
- Sorted, stable output (no random ordering)
- Explicit seeds for any randomness

**Anti-patterns:**
- Tests that flake based on timing
- Outputs that vary based on environment
- "It worked on my machine" scenarios

**Lex/LexRunner application:**
- All gates (lint, typecheck, test) are deterministic
- Plan topological sort is stable
- Frame IDs are deterministic UUIDs from content hash

---

### Principle 2: Structured Over Conversational

> JSON > prose. Tables > paragraphs. Schemas > conventions.

**Rationale:** AI agents parse structure efficiently but struggle with ambiguous prose. A schema violation is catchable; a subtle misunderstanding of a paragraph is not.

**Patterns:**
- JSON/NDJSON for machine consumption
- Zod schemas with clear error messages
- Tables for comparative data
- Explicit field names over positional arguments

**Anti-patterns:**
- Unstructured log output
- Prose-heavy documentation without examples
- "See the README for details" without structured summary

**Lex/LexRunner application:**
- CLI `--json` flag on all commands
- MCP tools return structured responses
- Frames have required fields validated by schema
- `StatusResponse` with explicit `nextOptions[]`

---

### Principle 3: Fail Loud, Recover Clear

> When something breaks, tell the AI exactly what went wrong and what to try next.

**Rationale:** An AI encountering a vague error will either hallucinate a fix or give up. Clear errors with recovery paths keep the agent productive.

**Patterns:**
- Error messages include: what failed, why, and what to try
- Exit codes with semantic meaning
- Suggested next actions in failure responses
- Validation errors that list all problems, not just the first

**Anti-patterns:**
- "Error: undefined"
- Silent failures
- Errors without context or recovery hints
- "Something went wrong, please try again"

**Lex/LexRunner application:**
- `lex remember` validates modules against policy with suggestions
- Gate failures include `recommendedActions[]`
- MCP errors return structured error objects with codes

---

### Principle 4: Memory is a Feature

> AI without context is expensive and dumb. Build retrieval into the workflow.

**Rationale:** Every new conversation starts fresh. Without memory, the AI re-learns context, makes repeated mistakes, and burns tokens on rediscovery. Memory transforms AI from stateless function to stateful collaborator.

**Patterns:**
- Frames with searchable `reference_point` and `keywords`
- Recall before action (check what's been done)
- Context injection at decision points
- Session receipts that persist learning

**Anti-patterns:**
- Every session starts from zero
- No way to retrieve prior decisions
- Context exists only in chat history
- Learning that dies with the session

**Lex/LexRunner application:**
- `lex recall` before starting work
- `lex remember` after completing work
- Frames with structured `module_scope` for retrieval
- Senior Dev behavior: "ALWAYS recall relevant Frames before starting"

---

### Principle 5: Teach Through Constraints

> Guardrails aren't limitations—they're the curriculum.

**Rationale:** Unbounded AI makes unbounded mistakes. Constraints (tool budgets, allowed paths, required outputs) shape behavior toward correctness. Over time, the constraints themselves become learned patterns.

**Patterns:**
- Explicit tool budgets per task
- Guardrail profiles that define boundaries
- Required outputs (must emit Frame, must produce artifact)
- Scope limits (only these files, only these modules)

**Anti-patterns:**
- "Do whatever you think is best"
- Unlimited tool access
- No validation of outputs
- Implicit expectations

**Lex/LexRunner application:**
- Executor manifests with `toolBudget` and `guardrailProfile`
- Keystone issue governance (max 2 per wave, ideal 0)
- Frame emission requirement (every session produces a receipt)
- Module ownership in `lexmap.policy.json`

---

## AX Evaluation Checklist

When designing or reviewing a feature, ask:

| Question | Principle |
|----------|-----------|
| Can an AI predict what this will do before calling it? | Deterministic First |
| Is the output parseable without natural language understanding? | Structured Over Conversational |
| If this fails, will an AI know what to try next? | Fail Loud, Recover Clear |
| Can an AI retrieve relevant context before acting? | Memory is a Feature |
| Are the boundaries clear enough to learn from? | Teach Through Constraints |

---

## AX Maturity Model

### Level 0: AI-Hostile
- Unstructured output only
- No error recovery paths
- No memory or context
- Implicit conventions

### Level 1: AI-Tolerant
- Some structured output (`--json` flag)
- Basic error messages
- Documentation exists
- Manual context gathering

### Level 2: AI-Friendly
- Structured by default
- Errors include recovery hints
- Retrieval mechanisms exist
- Explicit constraints documented

### Level 3: AI-Native
- Designed for AI-first consumption
- Deterministic preparation built-in
- Memory integrated into workflow
- Constraints as learning curriculum
- Continuous AX improvement via dogfooding

**Lex/LexRunner target: Level 3 (AI-Native)**

---

## Dogfooding as AX Research

The best AX research is using AI agents to build and operate the system. When friction occurs:

1. **Capture it** — Note the friction with 🐕 marker
2. **Classify it** — Which AX principle was violated?
3. **Fix or track** — Trivial fixes inline; non-trivial as issues
4. **Learn** — Update patterns based on real usage

This creates a feedback loop where the AI's experience directly improves the system.

---

## Relationship to Other Disciplines

| Discipline | Focus | Overlap with AX |
|------------|-------|-----------------|
| UX | Human users | Both care about clear feedback, recovery |
| DX | Developer users | Both care about tooling, error messages |
| API Design | Interface contracts | Both care about structure, predictability |
| MLOps | Model operations | AX is about model *consumption*, not training |
| Prompt Engineering | Input optimization | Prompt eng is *using* AX; AX is *building* for AI |

---

## Implementation in Lex/LexRunner

### Already Aligned ✅

- Jordan-mode protocol (Principle 1)
- JSON output flags (Principle 2)
- Frame system with recall (Principle 4)
- Guardrail profiles (Principle 5)
- Executor tool budgets (Principle 5)

### Needs Improvement 🔧

- Some CLI commands lack `--json` (Principle 2)
- Recall search doesn't match hyphenated reference points (Principle 4)
- Not all errors include `nextAction` (Principle 3)

### Future Work 📋

- AX linting for new features
- AX metrics in CI (structured output coverage, error recovery paths)
- Model-agnostic validation (same tool works across Claude/GPT/Gemini)

---

## Conclusion

AX is not a feature—it's a design philosophy. Every decision in Lex and LexRunner should be evaluated against AX principles:

1. Is it deterministic where it can be?
2. Is it structured for machine consumption?
3. Does it fail with clear recovery paths?
4. Does it integrate with memory?
5. Does it teach through constraints?

When we build for AI Experience first, we create systems that AI agents can reliably operate, learn from, and improve. The result: less token waste, fewer failures, better outcomes, and AI that gets smarter over time.

---

*Coined: December 1, 2025*
*Authors: Guffawaffle (Joe) & Senior Dev (Lex/Claude)*
*Status: Living Document*

> "Apprentices cut standard blocks. Master handles keystone pieces. Standard should be all-apprentice; Master implements only when genuinely unavoidable."
> — LexRunner Senior Dev Persona

---

## References

- [UX Design Principles](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Developer Experience (DX)](https://developerexperience.io/)
- Lex Frame Schema: `schemas/frame-v3.json`
- LexRunner AGENTS.md: Core operating principles
- Jordan-mode: Deterministic prep → vacuum-ready prompt → stochastic call
