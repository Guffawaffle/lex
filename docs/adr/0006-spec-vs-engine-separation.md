# ADR-0006: Spec vs Engine Separation

**Status:** Proposed
**Date:** 2025-11-25
**Authors:** Lex, Guff, Opie

---

## Context

Lex YAML files (gates.yml, scope.yml, stack.yml, deps.yml, merge-policy.yml) have emerged as a de facto configuration format for AI development workflows. The question arose: should this become a public, engine-agnostic spec—analogous to Docker Compose for containers?

Two paths were available:
1. Keep YAML files as internal configuration for LexRunner
2. Formalize YAML as a public spec with LexRunner as the reference implementation

---

## Decision

We choose the spec-first approach:

> **Today:** LexRunner config designed as if it were a spec.
> **Tomorrow:** LexWorkflow YAML spec with LexRunner as first engine.

### Principles

1. **Lex (MIT) owns the spec** — Schema definitions, validation, documentation
2. **LexRunner implements the spec** — Execution, orchestration, merge logic (proprietary)
3. **Clean IP boundary** — Spec is public and engine-agnostic; engine contains proprietary execution

### Spec Components (Public, in Lex)

- `gates.yml` — Gate definitions with commands, required flags, retry policies
- `scope.yml` — File patterns, blast radius limits, module ownership
- `deps.yml` — Dependency edges between PRs/tasks
- `stack.yml` — Prioritization hints for merge ordering
- `merge-policy.yml` — Merge rules, required gates, override policies

### Engine Components (Proprietary, in LexRunner)

- Merge-weave algorithm
- Dependency inference heuristics
- Integration branch management
- Run lifecycle state machine
- Persona system (senior-dev, eager-pm)

### Extension Namespace

Engines may add custom fields using the `x-<engine>-*` namespace:

```yaml
gates:
  - name: lint
    run: npm run lint
    x-lexrunner-retry: { max: 2, backoff: 30s }
```

This keeps the base spec clean while allowing engine-specific extensions.

---

## Consequences

### Positive

- **Ecosystem potential** — Other engines can implement the spec
- **Clear IP boundary** — Proprietary logic stays in LexRunner
- **Community contribution** — Public spec invites collaboration
- **Validation reuse** — Zod schemas in Lex validate for any engine

### Negative

- **Maintenance burden** — Two repos to coordinate
- **Spec governance** — Changes require careful versioning
- **Incomplete today** — Proto-spec exists but formal v0.1 not yet published

---

## Implementation Status

- ✅ YAML files exist and are validated
- ✅ Zod schemas defined in Lex
- ✅ IP boundary documented in AGENTS.md and copilot-instructions
- ⏳ Formal v0.1 spec publication pending
- ⏳ Unified `lexrun.yml` format under consideration
