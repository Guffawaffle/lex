# Founder's Note

## What Lex Is

**Lex is the part I want to outlive me.**

It's a contract layer for AI-assisted development:
- Schemas that define what memory, policy, and instructions look like
- Primitives that any tool can consume without guessing
- Invariants that don't change based on who's reading them

If the only thing that survives is a clear way for humans and AI to work together—one that doesn't suck—that's enough.

## What Lex Is Not

Lex is not a workflow. It's not a runner. It's not the answer.

It's the **drill**, not the house. It's the **socket standard**, not the wrench.

If you've never used a drill, that's on you to learn. Lex will be documented well enough that a stranger with an AI could reconstruct the rest. But Lex won't build your house for you.

## What LexRunner Is

**LexRunner is my reference implementation.**

It's one runner, built on Lex, that does things my way:
- Opinionated about workflows
- Sharp about edge cases
- Weird in ways that work for me

LexRunner is not required to use Lex. It's not the only way to build on Lex. But it's the one I'll keep sharpest, because it's mine.

## The Contract

Any tool that calls itself "Lex-compatible" must:

1. **Respect Lex schemas** — Frames, Policy, and Instructions have defined shapes. Don't invent your own.
2. **Honor Lex invariants** — If Lex says something is immutable, it's immutable. If Lex says something is optional, it's optional.
3. **Consume, don't extend** — Lex is not a framework to fork. It's a contract to target.

You don't get my workshop. You get the drill design.

## The Promise

I will:
- Keep Lex's contract surface stable and versioned
- Document clearly enough that you don't need me
- Not break things without a major version bump

I won't:
- Explain every trick I've figured out
- Make your runner as good as mine
- Apologize for keeping LexRunner differentiated

## Why This Matters

Most AI tooling fails because it's either:
- Too closed (no ecosystem)
- Too open (no differentiation)

Lex is the open part. LexRunner is the closed part. The boundary is the contract surface.

If you're building a runner and you respect the contracts, you're welcome here. If you're building on Lex and you want to do things differently, go ahead. The constitution doesn't care which government you form—as long as you follow the constitution.

---

*— Joe (Guffawaffle), November 2025*
