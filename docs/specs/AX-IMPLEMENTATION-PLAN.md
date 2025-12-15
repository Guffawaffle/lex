# AX Implementation Plan

> Reconciliation of AX-AI-EXPERIENCE.md, AX-AI-EXPERIENCE_REVIEW.md, and AX-CONTRACT.md into a clear implementation roadmap.

**Owner:** Opie (with Senior Dev, Jordan executing)
**Last Updated:** 2025-12-01
**Contract Version:** AX v0.1

---

## 1. Source Documents Reconciled

| Document | Purpose | Status |
|----------|---------|--------|
| `AX-AI-EXPERIENCE.md` | Philosophy + principles (the "why") | ✅ Updated with canonical AX definition |
| `AX-AI-EXPERIENCE_REVIEW.md` | Lex's perspective on long-running partnership | ✅ Committed |
| `AX-CONTRACT.md` | Enforceable v0.1 guarantees (the "what") | ✅ Committed, **source of truth** |
| `AX-CONTRACT.v0.1.yaml` | Machine-readable specification | ✅ Committed |

**Relationship:** The spec provides philosophy and patterns. The contract provides enforceable guarantees. The review provides operational perspective. The YAML provides machine-readable tracking.

---

## 2. Compliance Status Matrix

### Legend
- ✅ **Compliant** - Meets AX v0.1 guarantee
- 🟡 **Partial** - Some compliance, gaps remain
- ❌ **Missing** - Not yet implemented
- ⬜ **N/A** - Not applicable to this repo

### Lex (Target: 2.0.0)

| AX Requirement | Guarantee | Status | Notes |
|----------------|-----------|--------|-------|
| **AX-001: --json flag** | 2.1 Structured Output | 🟡 Partial | `recall` has `--json`; `remember`, `timeline` need it |
| **AX-002: Recall semantics** | 2.4 Memory and Recall | ✅ Compliant | Fixed 2025-12-01 (commit 5d29125) |
| **AX-003: AXError schema** | 2.3 Recoverable Errors | ❌ Missing | Need to define and export AXError |
| **AX-005: Frame schema** | 2.5 Frame Emission | 🟡 Partial | Schema exists; needs stability guarantee doc |
| Deterministic loaders | 2.2 Deterministic Prep | ✅ Compliant | Instruction/policy loaders are deterministic |

### LexRunner (Target: 1.0.0)

| AX Requirement | Guarantee | Status | Notes |
|----------------|-----------|--------|-------|
| **AX-001: --json flag** | 2.1 Structured Output | 🟡 Partial | Some commands have it; needs audit |
| **AX-001: MCP JSON** | 2.1 Structured Output | 🟡 Partial | Most tools return JSON; some return prose |
| **AX-003: AXError schema** | 2.3 Recoverable Errors | ❌ Missing | Need to consume from Lex and apply |
| **AX-004: MCP/CLI parity** | 2.1 Structured Output | ❌ Missing | Need parity audit |
| **AX-005: Frame emission** | 2.5 Frame Emission | ❌ Missing | merge-weave, executor need Frame emission |
| Deterministic planning | 2.2 Deterministic Prep | ✅ Compliant | Topo sort is stable |

---

## 3. Release Gates

### Lex 2.0.0 Release Gates

**Must be ✅ before release:**

| Gate | Requirement | Issue | Status |
|------|-------------|-------|--------|
| AX-001 | `--json` on `remember`, `timeline` | [#452](https://github.com/Guffawaffle/lex/issues/452) | ❌ |
| AX-002 | Recall searches keywords, reference_point, summary_caption | — | ✅ Done |
| AX-003 | AXError schema defined and exported | [#450](https://github.com/Guffawaffle/lex/issues/450) | ❌ |
| AX-005 | Frame schema v3 stable and documented | [#451](https://github.com/Guffawaffle/lex/issues/451) | ❌ |

**Lex 2.0.0 is gated on AX being real, not just documented.**

### LexRunner 1.0.0 Release Gates

**Must be ✅ before release:**

| Gate | Requirement | Issue | Status |
|------|-------------|-------|--------|
| AX-001 | `--json` on all data commands | [#482](https://github.com/Guffawaffle/lexrunner/issues/482) | ❌ |
| AX-001 | MCP tools return JSON, not prose | [#482](https://github.com/Guffawaffle/lexrunner/issues/482) | ❌ |
| AX-003 | AXError with nextActions[] everywhere | [#483](https://github.com/Guffawaffle/lexrunner/issues/483) | ❌ |
| AX-004 | MCP/CLI parity documented | [#485](https://github.com/Guffawaffle/lexrunner/issues/485) | ❌ |
| AX-005 | merge-weave emits Frame | [#484](https://github.com/Guffawaffle/lexrunner/issues/484) | ❌ |
| AX-005 | executor runs emit Frame | [#484](https://github.com/Guffawaffle/lexrunner/issues/484) | ❌ |

**LexRunner 1.0.0 is the first AX-native release. AX is the value prop.**

---

## 4. Implementation Waves

### Wave 1: Foundation (No Dependencies)

**Target: Complete before any other AX work**

| Task | Repo | Issue | Effort |
|------|------|-------|--------|
| Define AXError schema in Zod | lex | [#450](https://github.com/Guffawaffle/lex/issues/450) | S |
| Export AXError from `src/shared/errors/` | lex | [#450](https://github.com/Guffawaffle/lex/issues/450) | S |
| Document Frame schema v3 as stable | lex | [#451](https://github.com/Guffawaffle/lex/issues/451) | S |

### Wave 2: Lex CLI (Depends on Wave 1)

**Target: Lex 2.0.0 release**

| Task | Repo | Issue | Effort |
|------|------|-------|--------|
| Add `--json` to `lex remember` | lex | [#452](https://github.com/Guffawaffle/lex/issues/452) | S |
| Add `--json` to `lex timeline` | lex | [#452](https://github.com/Guffawaffle/lex/issues/452) | S |
| Apply AXError to core CLI errors | lex | [#450](https://github.com/Guffawaffle/lex/issues/450) | M |

### Wave 3: LexRunner CLI/MCP (Depends on Wave 1)

**Target: LexRunner 1.0.0 release**

| Task | Repo | Issue | Effort |
|------|------|-------|--------|
| Audit CLI commands for `--json` | lexrunner | [#482](https://github.com/Guffawaffle/lexrunner/issues/482) | M |
| Audit MCP tools for JSON output | lexrunner | [#482](https://github.com/Guffawaffle/lexrunner/issues/482) | M |
| Document MCP/CLI parity matrix | lexrunner | [#485](https://github.com/Guffawaffle/lexrunner/issues/485) | M |
| Apply AXError to MCP tools | lexrunner | [#483](https://github.com/Guffawaffle/lexrunner/issues/483) | M |
| Apply AXError to gate failures | lexrunner | [#483](https://github.com/Guffawaffle/lexrunner/issues/483) | M |

### Wave 4: Frame Emission (Depends on Waves 1-3)

**Target: LexRunner 1.0.0 release**

| Task | Repo | Issue | Effort |
|------|------|-------|--------|
| merge-weave emits Frame on completion | lexrunner | [#484](https://github.com/Guffawaffle/lexrunner/issues/484) | M |
| executor runs emit Frame | lexrunner | [#484](https://github.com/Guffawaffle/lexrunner/issues/484) | M |
| Significant orchestrations emit Frame | lexrunner | [#484](https://github.com/Guffawaffle/lexrunner/issues/484) | L |

---

## 5. Post-2.0 / Post-1.0 Improvements

These are valuable but **not release blockers**:

| Improvement | Repo | Priority | Notes |
|-------------|------|----------|-------|
| Full CLI/MCP parity (not just docs) | lexrunner | P2 | Audit first, then implement gaps |
| AXError in all error paths (not just core) | both | P2 | Gradual retrofit |
| Recall scoring/ranking improvements | lex | P3 | FTS5 works; ranking can improve |
| Frame emission for more workflows | lexrunner | P3 | Core workflows first |
| AX level self-reporting | both | P3 | System can report its own AX level |

---

## 6. Model-Agnostic Commitment

AX v0.1 is explicitly **model-agnostic**:

- Contracts, Frames, and tools work for Claude, GPT, Gemini, Copilot, or any future model.
- The system (Lex) remembers; not any single model.
- No model-specific workarounds in core AX guarantees.
- Agent persona (Senior Dev, Eager PM) works regardless of underlying model.

This is a design constraint, not an accident.

---

## 7. AX Bug Definition

Per Guff's directive, the following are **AX bugs**, not "rough edges":

> If something in our current stack would make a capable agent quietly give up or work around us, treat that as an AX bug.

Examples:
- CLI command that only outputs prose (no `--json`) → AX-001 violation
- Error message without recovery suggestion → AX-003 violation
- Recall that can't find relevant Frames → AX-002 violation (fixed)
- Core workflow that leaves no trace in memory → AX-005 violation

These should be tracked as bugs with `ax` label, not "enhancements."

---

## 8. Contract Versioning

- **AX v0.1** is now live law for Lex and LexRunner.
- All new features and changes MUST comply.
- Retrofit of existing features is **top-priority cleanup**, not wish-list.
- If reading this past v0.1 and the contract looks stale, either:
  - Find the newer AX Contract, **OR**
  - Immediately raise an issue.

---

## 9. Open Questions

None currently. AX v0.1 as written is enforceable.

If conflicts with reality emerge during implementation, amendments will be proposed through the version contract pact process.

---

*This plan is owned by Opie and will be updated as implementation progresses.*
