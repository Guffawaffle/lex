# Lex (MIT) — Atlas/Memory Core

![MIT License](https://img.shields.io/badge/License-MIT-green)
![OSS](https://img.shields.io/badge/Community-OSS-blue)

**Policy-aware work continuity with receipts.**

Lex powers the paid **LexRunner** CLI; development stays OSS-first. See the [LexRunner repo](https://github.com/Guffawaffle/lex-pr-runner) for the orchestration layer.

When you ask `/recall TICKET-123`, you don't get vague summarization or context-free git log replay. You get:

- **What you were doing** — the Frame you captured with `/remember`: which modules you touched, what the blocker was, what the next action is.
- **Why you stopped** — the architectural policy that was in your way: which edge is forbidden, which permission you don't have yet, which feature flag isn't live.
- **The exact neighborhood** — a fold-radius-1 Atlas Frame showing only the modules relevant to your work, not the entire codebase.

This is continuity for humans and assistants working on large systems where "just read the whole repo" doesn't scale and "trust the LLM to figure it out" breaks in prod.

## Core ideas

### Frames (lex/memory)
Frames are timestamped work session snapshots. You create them with `/remember` at meaningful moments ("this button is still disabled because access wiring isn't allowed yet"). A Frame stores:
- a rendered "memory card" image (high-signal logs, diffs, active flags, next step),
- the raw text behind that card,
- structured metadata: branch, blockers, `status_snapshot.next_action`, and `module_scope`.

Frames live locally (e.g. SQLite). No telemetry. No forced HTTP service. Access is via MCP over stdio.

### Policy (lex/policy)
Policy is machine-readable architecture boundaries. `lexmap.policy.json` defines which modules own which code, which calls are allowed, which are forbidden, which permissions/flags gate them, and which kill patterns are being removed. Language scanners ("dumb by design") emit facts from code; `lex check` compares facts vs policy and can fail CI.

### Fold radius & Atlas Frame (lex/shared/atlas)
When you recall a Frame, Lex does **not** dump the whole monolith into context. Instead, it exports an Atlas Frame: the touched modules (`module_scope`) plus their 1-hop neighborhood in the policy graph (allowed callers, forbidden callers, required flags/permissions). That's fold radius = 1.

That gives you and your assistant a "map page," not a firehose.

### THE CRITICAL RULE
Every module name in `module_scope` MUST match a module ID in `lexmap.policy.json`. No ad hoc naming. If the vocabulary drifts, you lose the ability to line up:
- "what happened last night"
with
- "what the architecture is supposed to allow."

This shared vocabulary is what lets Lex answer:
> "You left this button disabled because this module was still calling a forbidden dependency. Your declared next step was to route through the approved service."

**Module ID Validation & Aliasing:** To help prevent typos and improve usability, Lex provides fuzzy matching with helpful suggestions when module IDs don't match. When you use an invalid module ID, you'll get suggestions for similar modules. In the future, explicit alias tables will support team shorthand conventions (e.g., `auth` → `services/auth-core`) and historical renames. See `shared/aliases/README.md` for details.

## Status
Early alpha. We are actively converging two previously separate codebases:
- LexBrain (episodic Frames and recall)
- LexMap (policy graph, scanners, CI enforcement)

The goal of this repo is to ship them as one system called **Lex** with one CLI (`lex`), one policy contract, and one recall surface.

## Learn More

- [Overview](./docs/OVERVIEW.md) — the pain, the solution, the moat
- [Mind Palace Guide](./docs/MIND_PALACE.md) — reference points and Atlas Frames for natural recall
- [Architecture Loop](./docs/ARCHITECTURE_LOOP.md) — the full explainability story
- [Adoption Guide](./docs/ADOPTION_GUIDE.md) — how to roll out Lex in phases
- [Limitations](./docs/LIMITATIONS.md) — known constraints and future work

## License

MIT
