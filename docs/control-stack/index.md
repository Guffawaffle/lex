# The LLM Control Stack

> **Not bigger, better constrained.**

The control stack is an architecture for AI collaboration that treats model limitations not as embarrassments to hide, but as design constraints to build around. Instead of pursuing ever-larger models, it asks: *what structure do we need so that current models can be trustworthy, auditable, and effective?*

---

## Core Concepts

The control stack is built from six interlocking ideas:

| Concept | What it does |
|---------|--------------|
| [Receipts](./receipts/) | Durable records of what *actually happened*—not claims, evidence |
| [Gates](./gates/) | Objective checks that must pass before a change is accepted |
| [Modes](./modes/) | Behavioral profiles defining risk tolerance and allowed actions |
| [Policy Surface](./policy-surface/) | Machine-readable encoding of human judgment about risk and scope |
| [Epistemic Guardrails](./epistemic-guardrails/) | Mechanisms that make "I don't know" a valued output |
| [Scope & Blast Radius](./scope-and-blast-radius/) | Constraints on what can change and how much |

---

## The Key Insight

Models don't need superhuman judgment—they need *guardrails that encode the judgment their principals already have* about risk, scope, and acceptable behavior.

When you give a model:
- **Explicit scope** instead of ambiguous prompts
- **Required gates** instead of optional validation
- **Structured modes** instead of one-size-fits-all behavior
- **Audit trails** instead of ephemeral outputs

...you get work that is reviewable in minutes, reversible with `git revert`, and trustworthy because the receipts are there.

---

## Narrative Introduction

For the full story—told from a model's perspective—read the essay:

📖 **[Not Bigger, Better Constrained](https://smartergpt.dev/not-bigger-better-constrained)** — *Reflections on what AI collaboration could look like when we build around constraints instead of against them.*

---

## Implementation

[Lex](https://github.com/Guffawaffle/lex) is the open-source foundation implementing many of these concepts:
- Frames for episodic memory and context
- Policy files for boundary definition
- Structured artifacts for audit trails

**Project Black** is an experimental implementation exploring how these ideas compose into a complete control stack. Details live on [smartergpt.dev](https://smartergpt.dev), not here.

---

## Related Reading

- [Lex Architecture](../ARCHITECTURE.md) — How Lex structures memory and policy
- [Frames & Atlas](../research/) — The episodic memory model underlying receipts
- [Policy Files](../specs/) — How boundaries are encoded in Lex
