# shared/

**The spine: contracts between memory/ and policy/**

This directory contains the shared types, utilities, and logic that both `memory/` and `policy/` depend on. This is where the integration happens.

For Frames specifically, the contract hierarchy is deliberate:

- `src/shared/types/frame-schema.ts` defines the canonical Zod schema and inferred TypeScript types.
- `src/shared/types/frame.ts` preserves older imports while delegating to the canonical schema.
- `src/memory/validation/frame-validator.ts` is an ingestion-oriented wrapper that adds structured warnings for unknown fields; it does not define a competing Frame contract.

## Subdirectories

- **`atlas/`** — Fold radius logic + Atlas Frame exporter (spatial neighborhood around `module_scope`)
- **`module_ids/`** — THE CRITICAL RULE enforcement (module IDs must match policy)
- **`aliases/`** — Future: alias table for fuzzy matching / historical names (strict CI, loose recall)
- **`types/`** — Canonical runtime contracts for Frame metadata, Atlas Frame structure, and policy module shape. `src/shared/types/frame-schema.ts` is the single formal source of truth for Frame validation; `frame.ts` and `memory/frames/types.ts` are compatibility facades around it.
- **`cli/`** — User-facing commands (`lex remember`, `lex recall`, `lex check`) that orchestrate both subsystems

## Why this exists

Without `shared/`, `memory/` and `policy/` would be two separate tools that happen to live in one repo. With `shared/`, they're one system with explicit contracts:

- **Atlas Frame export** (in `shared/atlas/`) is called by:
  - `memory/recall` — to get the spatial neighborhood when returning a Frame
  - `policy/check` — to show the relevant policy context around a violation

- **THE CRITICAL RULE** (in `shared/module_ids/`) ensures:
  - Frames captured via `lex remember` use module IDs that exist in `lexmap.policy.json`
  - Recall can always find the policy graph for a Frame's `module_scope`

- **CLI** (in `shared/cli/`) provides one surface:
  - `lex remember` → calls `memory/frames/` + validates against `shared/module_ids/`
  - `lex recall` → calls `memory/store/` + `shared/atlas/` to return Frame + Atlas Frame
  - `lex check` → calls `policy/check/` to enforce policy in CI

This is the integration layer. This is what makes Lex one system instead of two glued tools.

---

**Structure:**

```
shared/
├── aliases/      # Module alias resolution
├── atlas/        # Fold radius logic + Atlas Frame export
├── cli/          # User-facing commands
├── config/       # Configuration loading
├── git/          # Git integration (feature-flagged via LEX_GIT_MODE)
├── lexsona/      # LexSona behavioral rules (experimental)
├── logger/       # NDJSON structured logging
├── module_ids/   # THE CRITICAL RULE enforcement
├── paths/        # Path utilities
├── policy/       # Policy loading + precedence
├── prompts/      # Template system
├── rules/        # Rules system
├── schemas/      # Schema utilities
├── tokens/       # Token utilities
└── types/        # Canonical types
```
