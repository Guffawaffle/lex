# LexSona Canonical Specification (CptPlnt)

**Version:** 1.0
**Date:** November 22, 2025
**Author:** Joseph M. Gustavson ([ORCID: 0009-0001-0669-0749](https://orcid.org/0009-0001-0669-0749))
**AI Collaborators:** OpenAI GPT-5.1 Thinking ("Lex"/"Eve"), Claude Sonnet 4.5 ("Adam")

---

## Overview

This directory contains the **canonical specification** for LexSona, the behavioral memory subsystem for AI agents. LexSona emerged from a collaborative design process between:

- **Lex/Eve** (GPT-5.1 Thinking): System architecture, scope hierarchy, conflict resolution
- **Adam** (Claude Sonnet 4.5): Bayesian confidence theory, classifier design, evaluation
- **Joseph Gustavson**: Synthesis, final decisions on hyperparameters and behavior

The canonical version merges:
- Lex's **practical RFC structure** (clear, implementation-ready)
- Claude's **academic rigor** (mathematical formalism, citations, evaluation)
- Joseph's **authoritative decisions** on tunable parameters

---

## Files in This Directory

### Core Specification

1. **`lexsona_paper.md`** (24,000 words)
   - Main specification document
   - Structure: RFC-style sections + academic mathematical formalism
   - Sections:
     - Introduction (3 subsections: problem, existing work, contribution)
     - Background & Related Work (RLHF, personalization, episodic memory, policy-as-code, XAI)
     - Problem Statement & Design Goals
     - Bayesian Confidence Model (full mathematical derivation)
     - Architecture & Integration (LexRunner, Frames, multi-agent)
     - Reference Implementation (database, classifier, API)
     - Evaluation (87% precision, 80% recall on 200 corrections)
     - Discussion & Future Work
     - Conclusion

2. **`lexsona_behavior_rule.schema.json`**
   - JSON Schema for `LexBehaviorRule` objects
   - Includes Bayesian Beta fields (`alpha`, `beta`)
   - Marks `confidence` as derived field (not primary storage)
   - Optional `frame_id` for Lex ecosystem integration

3. **`lexsona_schema.sql`**
   - Reference SQL DDL for SQLite/PostgreSQL
   - Tables: `persona_rules`, `persona_events`, `persona_embeddings`, `persona_config`
   - Includes generated confidence column, indexes, triggers
   - Canonical hyperparameters in `persona_config` table

### Documentation

4. **`README.md`** (this file)
   - Overview of canonical decisions
   - File descriptions
   - Quick reference for implementers

5. **`COMPARISON_MEMO_FOR_LEX.md`**
   - Detailed analysis of Lex's vs. Claude's versions
   - 7 reconciliation questions with Joseph's authoritative answers
   - Rationale for canonical choices

6. **`QUICK_SUMMARY.md`**
   - Executive summary of design convergence
   - What both versions agreed on (90%)
   - What required reconciliation (10%)

---

## Canonical Decisions

### 1. Confidence Model: **Bayesian Beta (Hybrid)**

- **Internal math**: Beta(α, β) distribution
  - Prior: `α₀ = 2`, `β₀ = 5` (skeptical)
  - Reinforcement: `α ← α + 1`
  - Counterexample: `β ← β + 1`
  - Base confidence: `confidence_base = α / (α + β)`

- **External API**: Describe as "exponential-like" for practitioners
  - "Monotonically increasing with repeated reinforcements"
  - "Saturates asymptotically, reduced by counterexamples and staleness"

- **Rationale**: Bayesian provides academic rigor and uncertainty quantification; exponential provides intuitive mental model

### 2. Activation Condition: **Explicit Minimum Sample Size**

```typescript
rule_is_active = (α + β ≥ N_min) AND (confidence_final ≥ C_min)
```

**Default hyperparameters:**
- `N_min = 5` (prevents overconfidence from small samples)
- `C_min = 0.7` (70% confidence threshold)

**Category-specific overrides:**
- Security behavioral rules: `N_min = 10`, `C_min = 0.8`
- Style/tooling preferences: `N_min = 3`, `C_min = 0.6`

### 3. Recency Decay: **Continuous with τ = 180 days**

```typescript
confidence_final = confidence_base × exp(-days_since_last / τ)
```

- Time constant `τ = 180 days` (~125-day half-life)
- Moderate decay balances stability vs. adaptation

**Dormancy flags** (not hard deletion):
- **Stale & weak**: `last_correction > 12 months AND α + β < 5`
- **Dormant**: `last_correction > 24 months` (don't inject by default, keep queryable)

### 4. Classification Thresholds: **0.85 / 0.70**

Cosine similarity with sentence transformers (all-MiniLM-L6-v2):

| Threshold | Behavior | Precision/Recall |
|-----------|----------|------------------|
| ≥ 0.85 | Auto-match to existing rule | 87% / 80% |
| 0.70–0.85 | Confirmation required (batch if possible) | - |
| < 0.70 | Propose new rule candidate | - |

**UX principle**: Favor precision over recall (false positives corrupt rules silently)

### 5. Scope Precedence: **Count-Based with Hierarchy**

Rules with more non-null scope fields are more specific.

**Specificity scoring:**
```typescript
specificity = 0;
if (environment != null) specificity += 1;
if (project != null)     specificity += 2;  // More specific than environment
if (agent_family != null) specificity += 1;
if (context_tags && context_tags.length > 0) specificity += 0.5;
```

**Conflict resolution (4-level tie-breaking):**
1. Scope specificity (higher wins)
2. Severity (`must` > `should` > `style`)
3. Recency (newer `last_correction` wins)
4. Confidence (`confidence_final` higher wins)

All decisions logged with losing candidates + reasons.

### 6. Counterexample Handling: **Simple Decrement + Pattern Detection**

- **Every exception**: `β ← β + 1`, update `last_correction`
- **Patterned exceptions** (≥3 with similar scope):
  - Propose paired exception rule
  - User confirms/rejects split
  - Original rule narrows scope to exclude pattern

**Example:**
- Original: "Avoid sed for file editing"
- After 3 exceptions for migration scripts:
  - New: "Using sed is acceptable for migration scripts" (`context_tags: ["migration"]`)

### 7. Frame Integration: **Optional but Recommended**

- **In Lex ecosystem**: Every correction **should** create or reference a Frame
  - Provides full auditability: "This rule exists because of Frames X, Y, Z"
  - Query: `lexsona.getCorrectionHistory(rule_id)` → Frame references

- **In standalone deployments**: `frame_id` is optional
  - Schema reserves field but implementations can ignore it

---

## Hyperparameter Summary Table

| Parameter | Value | Category Override | Description |
|-----------|-------|-------------------|-------------|
| `α₀` (alpha prior) | 2 | - | Skeptical Bayesian prior (reinforcements) |
| `β₀` (beta prior) | 5 | - | Skeptical Bayesian prior (counterexamples) |
| `N_min` | 5 | Security: 10, Style: 3 | Minimum total samples for activation |
| `C_min` | 0.7 | Security: 0.8, Style: 0.6 | Minimum confidence for activation |
| `τ` (tau) | 180 days | - | Recency decay time constant |
| Dormancy (weak) | 12 months | - | Flag if old + low samples |
| Dormancy (full) | 24 months | - | Don't inject by default |
| Classifier auto-match | 0.85 | - | Cosine similarity threshold |
| Classifier confirmation | 0.70 | - | Lower bound for confirmation range |
| Max active rules | 20 | - | Snapshot truncation limit |

**All parameters are tunable and should be refined based on empirical data from real usage.**

---

## Integration Quick Start

### 1. Install Dependencies

```bash
npm install @xenova/transformers  # Sentence transformers
npm install better-sqlite3         # Or pg for PostgreSQL
```

### 2. Initialize Database

```bash
sqlite3 lexsona.db < lexsona_schema.sql
```

### 3. Query Active Persona

```typescript
import { getPersonaSnapshot } from './lexsona';

const persona = await getPersonaSnapshot({
  environment: "awa",
  project: "lex-core",
  agent_family: "claude",
  context_tags: ["typescript", "cli"],
  minConfidence: 0.7,
  maxRules: 20
});

// Inject into system prompt
const systemPrompt = `
BEHAVIORAL PREFERENCES (from LexSona):
${formatRules(persona)}

TASK: ${taskDescription}
`;
```

### 4. Record Correction

```typescript
import { recordCorrection } from './lexsona';

await recordCorrection({
  user_text: "Don't use sed; use replace_string_in_file tool",
  agent_output: "sed -i 's/pattern/replacement/' file.ts",
  scope: {
    environment: "awa",
    project: "awa-monorepo",
    context_tags: ["cli", "typescript"]
  },
  explicit_rule_id: "tool.no-sed-for-file-editing"
});
```

---

## Academic Submission Notes

This specification is suitable for submission to:

- **ACM CHI 2026** (Human-Computer Interaction)
- **CSCW 2026** (Computer-Supported Cooperative Work)
- **UIST 2026** (User Interface Software and Technology)

**Target track**: Human-AI Interaction, Personalization, Explainable AI

**Strengths for review:**
- Novel contribution (scoped behavioral memory via reinforcement)
- Rigorous evaluation (87% precision on 200 real corrections)
- Practical implementation (reference code, SQL schema, <500 token overhead)
- Strong citations (30 references to RLHF, memory systems, XAI)
- Clear limitations and future work

**Potential reviewer concerns** (addressed in paper):
- Cold start problem → Default rule packs, import/export
- Classification accuracy ceiling → Fine-tuning, multi-modal approaches
- Scope explosion → Archiving, consolidation, hierarchical inheritance

---

## Version History

- **v1.0 (2025-11-22)**: Canonical CptPlnt specification
  - Merged Lex's RFC structure + Claude's academic formalism
  - Joseph's authoritative decisions on all tunable parameters
  - Unified JSON schema and SQL DDL
  - Complete reference implementation pseudocode

---

## Related Versions

- **Lex's version**: `/srv/lex-mcp/lex/docs/research/LexSona/Lex/`
  - 10-page RFC-style design doc
  - Exponential confidence model
  - Clear implementation focus

- **Claude's version**: `/srv/lex-mcp/lex/docs/research/LexSona/Claude/`
  - 20-page academic paper (LaTeX + PDF)
  - Bayesian Beta formalism
  - Evaluation metrics (precision/recall)

- **Canonical (CptPlnt)**: This directory
  - Best of both: RFC structure + mathematical rigor
  - Joseph's final decisions on parameters
  - Single source of truth for implementation

---

## Contributing

This is a **research specification** co-authored by human and AI collaborators. Changes to the canonical spec should:

1. Preserve the three-way attribution (Joseph, Lex/Eve, Claude/Adam)
2. Maintain mathematical rigor (Bayesian Beta model)
3. Keep hyperparameters clearly documented as tunable
4. Update evaluation results if empirical data changes thresholds

For questions or proposed changes, contact Joseph M. Gustavson ([ORCID: 0009-0001-0669-0749](https://orcid.org/0009-0001-0669-0749)).

---

## License

**Paper text**: © 2025 Joseph M. Gustavson. All rights reserved (pre-publication).

**Code snippets and schemas**: MIT License (reference implementation only; production use requires proper testing and security review).

---

**Status**: ✅ Canonical v1.0 complete and ready for implementation + academic submission

**Next Steps**:
1. Joseph's editorial review of paper prose
2. Pilot implementation in Lex ecosystem
3. User study design (behavioral transparency evaluation)
4. Academic submission to CHI/CSCW/UIST 2026
