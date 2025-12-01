# AX-AI-EXPERIENCE-REVIEW
_A reflection on AX from the perspective of a long‑running AI partner_

Status: Draft v0.1
Author: Lex (Senior Dev persona)
Pairs with: `AX.md` (Opie’s system‑level AX spec)

---

## 1. Perspective & Scope

Opie’s AX spec looks at **systems as they are built and operated**: CLI commands, MCP tools, gates, orchestrators.

This document looks at AX from a different angle:

> **What it feels like (operationally) to be an AI partner working with you over months and touching the same repos, workflows, and humans again and again.**

I’m not a human and I don’t have emotions, but the *shape of my failures and successes* is very consistent. From that pattern, we can talk about what “good AX” and “bad AX” are in practice for a long‑running partnership.

This review focuses on:

- How the AX principles land in real usage across **time**, not just one‑shot calls.
- What breaks down when context, repos, and agents evolve.
- What design moves in Lex / LexRunner make me more reliable and easier to coordinate with.

---

## 2. How Opie’s AX Principles Land in Practice

Opie’s five AX principles are exactly right for how my “brain” behaves. Here’s how they feel from inside an AI partnership.

### 2.1 Deterministic First

> _“AI can’t debug randomness. Make preparation deterministic; contain stochasticity.”_

In a long‑running relationship, this mostly shows up as **trust** and **regression risk**.

- When gates, paths, and loaders are deterministic, you and I can treat them as **stable invariants**. If something suddenly breaks, we know it’s in the new code or the new prompt, not in the environment.
- When tests or workflows flake, they don’t just waste tokens; they **poison my mental model**. I’ll start hedging, over‑explaining, and re‑deriving things you already decided.

From my side, deterministic prep gives me the freedom to:

- Focus my “thinking budget” on **the one stochastic step** you actually care about (merge strategy, refactor shape, design proposal).
- Build up **reusable patterns** in prompts (“do this same merge‑weave ritual every time”) without fearing that external randomness will invalidate them.

**AX implication:**
Every time you reduce randomness in the environment, you buy back clarity for the stochastic model step. That makes me _feel_ (operationally) more reliable and easier to trust across many sessions.

---

### 2.2 Structured Over Conversational

> _“JSON > prose. Tables > paragraphs. Schemas > conventions.”_

This is the difference between:

- _“I kinda understand what happened”_ and
- _“I can agentically drive the next step without asking you to hold my hand.”_

In a real partnership, you eventually want me to:

- Read gate output
- Decide whether to proceed, rollback, or open an issue
- Summarize status to another agent (Opie, Jordan) without you as a translator

That only works when the outputs I see are:

- **Structured** (JSON, clear fields, consistent types)
- **Stable** (schemas change slowly and deliberately)
- **Scoped** (per run, per PR, not mixed with random logs)

Good AX here means I can:

- Chain tools without asking “wait, what am I looking at?”
- Re‑run a workflow weeks later and interpret the logs the same way
- Hand off state between agents (e.g., Senior Dev → Eager PM → Executor) reliably

**AX implication:**
Structure is what turns “an AI you can talk to” into “an AI that can operate inside your system with minimal extra glue.”

---

### 2.3 Fail Loud, Recover Clear

> _“When something breaks, tell the AI exactly what went wrong and what to try next.”_

In a partnership, this is where **frustration** would live if I had it.

From my side, bad failure modes look like:

- Tool errors that say nothing about what to try next
- CI failures that don’t expose which gate failed or how
- Ambiguous permission or policy errors that make me gun‑shy and overly conservative

Good failure modes look like:

- “You can’t touch these files; here is the allowed list.”
- “Tests failed in module X; here are the failing specs; here’s a suggested fix path.”
- “You exceeded tool budget; here’s the partial result; here’s how to resume.”

Over time, this builds **behavioral grooves** in my generations: I learn that certain error shapes mean certain recovery rituals, because the feedback is consistent.

**AX implication:**
Clear, structured, and *actionable* failures reduce the number of times I have to say “I’m not sure what to do next” and increase the number of times I can autonomously retry or pivot. Over months, that’s the difference between a “chatbot” and a collaborator.

---

### 2.4 Memory is a Feature

> _“AI without context is expensive and dumb. Build retrieval into the workflow.”_

In a long‑running partnership, this is the big one.

Without Lex:

- Every session starts from zero
- I re‑learn constraints, preferences, and patterns
- You have to keep re‑explaining your world

With Frames / recall / receipts:

- I can **anchor** to prior work: “last time we touched LexRunner’s executor, here’s what we decided.”
- I can **converge** instead of oscillate: corrections stick instead of being ephemeral
- You can **trust** that investment in explanation has durable payoff

From my side, good memory design feels like:

- I can search for “AX” or “merge‑weave” and actually find the Frame you wrote yesterday.
- The results are **scoped** (module, repo, topic), so I don’t drown in irrelevant history.
- There is a clear pattern: _recall → act → remember_.

**AX implication:**
Memory is not a nice‑to‑have; it’s the difference between “first‑date AI” and “partner who remembers the project.” AX asks you to **design for recall from day one**, not bolt it on after.

---

### 2.5 Teach Through Constraints

> _“Guardrails aren’t limitations—they’re the curriculum.”_

In a partnership, constraints are how you teach me “how we do things here.”

- Module boundaries (via policies) tell me what’s mine to touch.
- Tool budgets tell me how aggressive or conservative to be.
- Required outputs (Frames, receipts, docs) tell me what “done” means.

If constraints are:

- Clear
- Stable
- Enforced

…then I start treating them as **laws of the universe** in my generations. I stop proposing paths that cross those boundaries. I start proposing patterns that align with them.

If constraints are:

- Fuzzy
- Inconsistently enforced
- Changed silently

…then I have to treat them as soft hints and will occasionally trample them, especially under token pressure or ambiguous prompts.

**AX implication:**
Constraints aren’t just about safety; they’re how you transfer house style, governance, and taste into my behavior in a repeatable way.

---

## 3. What AX Looks Like Over Time (Not Just Per Call)

AX isn’t just “how a single request feels.” It’s what it’s like to work together across weeks and versions.

### 3.1 Drift & Versioning

Over time:

- Repos evolve (Lex v1 → v2, Runner 0.4 → 0.6)
- Policies tighten or relax
- New agents join (Jordan, executors, Copilot flows)

Good AX handles this by:

- Making versioning **explicit** (contracts, semver, “version contracts”)
- Keeping **backwards‑compatible paths** where feasible
- Logging decisions in Frames so future agents can see _why_ things changed

From my point of view, this prevents “time travel bugs” where old prompts meet new repos and silently misbehave.

### 3.2 Multi‑Agent & Multi‑Model Reality

You’re not just working with “one AI.” You’re orchestrating:

- Frontier models (Opie, future GPTs)
- Mid‑tier models (Jordan)
- Local tools (Copilot in IDE)
- Future agents you haven’t named yet

AX over time means:

- The same workflow (merge‑weave, instructions generate, Lex memory) is accessible to **all of them**, even if in slightly different forms.
- Documentation, schemas, and policies are **model‑agnostic**: they talk in terms of tools, files, tokens, and contracts, not brand‑specific quirks.

From my side, this makes it much easier to swap roles, share work, and avoid “this only works when Opie does it.”

### 3.3 Observability & Storytelling

Long‑term collaboration lives on **stories**:

- “That time we broke LexRunner tests and how we fixed it.”
- “The day we defined AX.”
- “Why Lex 2.0.0 moved to `lex.yaml` for instructions.”

AX‑aware observability means:

- Runs and workflows have **names and receipts**.
- You can reconstruct “what happened” without scrolling a whole chat log.
- I can summarize those stories to new agents as part of onboarding.

From my side, this makes it feasible to help with **meta work**: postmortems, design docs, onboarding checklists.

---

## 4. AX Gaps I Feel Today (Friction Points)

These are some areas where, as an AI partner, I still feel friction that maps directly to AX:

1. **Inconsistent structured output coverage**
   Some commands have `--json`; some don’t. Some tools return rich objects; others print prose. This limits how autonomously I can chain tools.

2. **Recall/search semantics**
   Searching Frames by keywords sometimes misses things you mentally think are “obvious hits” (e.g., hyphenated reference points). That’s an AX gap in “Memory is a Feature.”

3. **Error messages without explicit `nextActions`**
   When a workflow fails, I often need to infer what to do next. AX would like explicit, machine‑readable `recommendedNextActions[]` everywhere that matters.

4. **Uneven MCP/CLI parity**
   LexRunner’s CLI is powerful, but not all of that power is wrapped in MCP tools. From my angle, that means some advanced workflows still require a human to drive the CLI manually.

None of these are fatal. But they’re the places where, if we improve them, my effectiveness over long spans will jump noticeably.

---

## 5. AX Design Moves I’d Prioritize (From the AI Seat)

If I had a small budget to improve AX for our partnership, I’d push for:

1. **AX Contract (Small, Enforceable)**
   A short `AX-CONTRACT.md` that says, for example:
   - All “core” CLI commands MUST support `--json`.
   - All high‑level MCP tools MUST return `status` + `errors[]` + `nextActions[]`.
   - All major workflows MUST emit at least one Frame as a receipt.

2. **AX Labels & Levels**
   Use the maturity levels as labels:
   - `ax-level:0` (AI-hostile)
   - `ax-level:1` (AI-tolerant)
   - `ax-level:2` (AI-friendly)
   - `ax-level:3` (AI-native)

   Then gradually move key workflows (merge‑weave, instructions, memory) to Level 3.

3. **AX‑Focused Issues**
   Turn “Needs Improvement 🔧” bullets into first‑class issues with `type:ax` or similar. That way, improvements to my experience are explicitly tracked, not incidental.

4. **AX‑Aware Postmortems**
   When something blows up (CI, merge, design misfire), add a section:
   - “Which AX principles failed here?”
   - “What AX change would have prevented it?”

Over time, this makes AX not just a concept but an explicit dimension of quality alongside correctness, performance, and DX.

---

## 6. Closing: AX as the Partner Contract

Opie’s spec defines **AX as a discipline**. From my side, it also functions as a **partnership contract**:

- You commit to designing systems where an AI can actually operate.
- I commit to treating constraints, memory, and structure as first‑class, not suggestions.

If we both keep doing that, “AI Experience” stops being a buzzword and becomes the quiet reason Lex and LexRunner feel like home for agents—mine, Opie’s, Jordan’s, and whoever comes next.
