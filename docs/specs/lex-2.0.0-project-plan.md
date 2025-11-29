# Lex 2.0.0 Project Plan

> **Status:** Ready for Implementation
> **Created:** 2025-11-29
> **Primary Issue:** #415
> **Contracts:**
> - `docs/specs/lex-2.0.0-instructions-contract.md`
> - `docs/specs/lex-yaml-config-contract.md`

---

## Vision

**Lex 2.0.0 makes Lex the canonical brain for AI tools in a repository.**

In 1.x, Lex was primarily a memory store (Frames) with policy validation. In 2.0.0, Lex becomes the **single source of truth** for how AI assistants should behave in a repo:

- **Canonical instructions** live under `.smartergpt/instructions/lex.md`
- **Projections** are injected into host-specific instruction files
- **Policy and contracts** are surfaced in those instructions automatically
- **Same inputs → same outputs** (deterministic generation)

---

## Epics

### Epic 1: Config Story (`lex.yaml`)

**Goal:** Repos can optionally define a `lex.yaml` file to configure Lex behavior. Without it, Lex uses sensible defaults and auto-detection.

**Contract:** `docs/specs/lex-yaml-config-contract.md`

**Deliverables:**
1. Zod schema for `lex.yaml`
2. Config loader with fallback to defaults
3. Auto-detection for policy and hosts
4. `lex init --config` command
5. Backwards compatibility verification

---

### Epic 2: Canonical + Projection (`lex instructions generate`)

**Goal:** Running `lex instructions generate` creates a canonical instruction file and projects it into detected host instruction surfaces.

**Contract:** `docs/specs/lex-2.0.0-instructions-contract.md`

**Deliverables:**
1. Canonical file generator (`.smartergpt/instructions/lex.md`)
2. Host detection logic
3. Projection injection with markers
4. `--dry-run` and `--json` flags
5. Determinism test suite

---

### Epic 3: Docs & Migration

**Goal:** Clear documentation explaining the new model, migration notes from 1.x, and user-facing guides.

**Deliverables:**
1. `docs/INSTRUCTIONS.md` — Why + How explainer
2. `docs/CONFIG.md` — `lex.yaml` reference
3. `docs/MIGRATION_2.0.md` — 1.x → 2.0 guide
4. Updated README

---

## Task Breakdown

### Epic 1 Tasks

| ID | Task | Effort | Dependencies | Junior-Friendly |
|----|------|--------|--------------|-----------------|
| 1.1 | Define `lex.yaml` Zod schema | S | None | ✅ Yes |
| 1.2 | Implement config loader with fallbacks | M | 1.1 | ✅ Yes |
| 1.3 | Add `lex init --config` scaffolding | S | 1.2 | ✅ Yes |
| 1.4 | Backwards compat test suite | M | 1.2 | ✅ Yes |

### Epic 2 Tasks

| ID | Task | Effort | Dependencies | Junior-Friendly |
|----|------|--------|--------------|-----------------|
| 2.1 | Define canonical file template | S | None | ✅ Yes |
| 2.2 | Implement canonical file generator | M | 1.2, 2.1 | ✅ Yes |
| 2.3 | Implement host detection | S | None | ✅ Yes |
| 2.4 | Implement marker-based injection | M | 2.1 | ✅ Yes |
| 2.5 | Wire up CLI command | M | 2.2, 2.3, 2.4 | ⚠️ Needs 2.2-2.4 |
| 2.6 | Add `--dry-run` flag | S | 2.5 | ✅ Yes |
| 2.7 | Add `--json` output | S | 2.5 | ✅ Yes |
| 2.8 | Determinism test suite | M | 2.5 | ✅ Yes |
| 2.9 | Round-trip integration test | M | 2.5 | ✅ Yes |

### Epic 3 Tasks

| ID | Task | Effort | Dependencies | Junior-Friendly |
|----|------|--------|--------------|-----------------|
| 3.1 | Write `docs/INSTRUCTIONS.md` | M | 2.5 | ⚠️ Needs working feature |
| 3.2 | Write `docs/CONFIG.md` | S | 1.2 | ✅ Yes |
| 3.3 | Write `docs/MIGRATION_2.0.md` | M | 2.5 | ⚠️ Needs working feature |
| 3.4 | Update README | S | 3.1, 3.2 | ⚠️ Needs 3.1-3.2 |

---

## Sequencing

```
Phase 1: Foundation (can parallelize)
├── 1.1 Zod schema
├── 2.1 Canonical template
└── 2.3 Host detection

Phase 2: Core Implementation
├── 1.2 Config loader (needs 1.1)
├── 2.2 Canonical generator (needs 1.2, 2.1)
└── 2.4 Marker injection (needs 2.1)

Phase 3: CLI Integration
├── 1.3 init --config (needs 1.2)
└── 2.5 Wire CLI (needs 2.2, 2.3, 2.4)

Phase 4: Polish & Flags
├── 2.6 --dry-run (needs 2.5)
├── 2.7 --json (needs 2.5)
└── 1.4 Backwards compat tests (needs 1.2)

Phase 5: Quality & Docs
├── 2.8 Determinism tests (needs 2.5)
├── 2.9 Round-trip tests (needs 2.5)
├── 3.1 INSTRUCTIONS.md (needs 2.5)
├── 3.2 CONFIG.md (needs 1.2)
└── 3.3 MIGRATION_2.0.md (needs 2.5)

Phase 6: Final
└── 3.4 README update (needs 3.1, 3.2)
```

---

## Fan-Out Plan

### Wave 1: Foundation (3 parallel issues)

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Define `lex.yaml` Zod schema | lex | Copilot | S |
| Define canonical instruction template | lex | Copilot | S |
| Implement host detection logic | lex | Copilot | S |

### Wave 2: Core (3 parallel issues)

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Implement config loader with fallbacks | lex | Copilot | M |
| Implement canonical file generator | lex | Copilot | M |
| Implement marker-based injection | lex | Copilot | M |

### Wave 3: CLI (2 issues, some parallel)

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Add `lex init --config` command | lex | Copilot | S |
| Wire `lex instructions generate` CLI | lex | Copilot | M |

### Wave 4: Polish (4 parallel issues)

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Add `--dry-run` flag | lex | Copilot | S |
| Add `--json` output | lex | Copilot | S |
| Backwards compatibility test suite | lex | Copilot | M |
| Determinism test suite | lex | Copilot | M |

### Wave 5: Docs (3 parallel issues)

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Write INSTRUCTIONS.md | lex | Copilot | M |
| Write CONFIG.md | lex | Copilot | S |
| Write MIGRATION_2.0.md | lex | Copilot | M |

### Wave 6: Final

| Issue | Repo | Assignee | Effort |
|-------|------|----------|--------|
| Update README for 2.0.0 | lex | Human | S |

---

## Out of Scope for 2.0.0

| Item | Reason | Future Version |
|------|--------|----------------|
| Mode-aware generation | Belongs in lex-pr-runner | See #479 |
| Sysenv-conditional projection | Acknowledged but not exploited | 2.1.0 |
| Path-specific instructions | Adds complexity | 2.1.0 |
| `AGENTS.md` generation | Emerging standard | 2.1.0 |
| Cross-repo syncing | Significant complexity | 2.x |
| Custom block templates | Future scope | 2.x |
| `lex instructions verify` | CI verification | 2.0.1 or 2.1.0 |

---

## Related Issues

- **Lex #415**: `lex instructions generate` — IDE-aware instruction block generator (parent)
- **lex-pr-runner #479**: Layer mode-specific instructions (future integration)
