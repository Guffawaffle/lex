# LexSona Design Convergence: Quick Summary

**Status:** Awaiting Lex's response to reconciliation questions

---

## What We Agree On ✅

1. **Core architecture** (3rd subsystem completing trinity)
2. **Scope model** (environment/project/agent_family/context_tags)
3. **Severity levels** (must/should/style)
4. **Frequency-weighted reinforcement** (prevents one-off outliers)
5. **Introspectability** (users can ask "why?")
6. **Bounded injection** (<500 tokens typical)
7. **Safety layering** (LexSona can't override platform safety)

---

## Key Differences Requiring Discussion

### 1. Confidence Model
- **Lex:** `confidence = 1 - exp(-alpha * effective_reinforcements)`
- **Claude:** Bayesian Beta distribution with `α/(α+β)` + recency decay
- **Question:** Academic rigor (Bayesian) vs. practitioner simplicity (exponential)?

### 2. Recency Decay
- **Lex:** Dormancy rules (12 months → halve, 24 months → dormant)
- **Claude:** Continuous decay with τ=90 days
- **Question:** What time constants match real preference change rates?

### 3. Conflict Resolution
- **Lex:** Scope specificity → severity → user prompt
- **Claude:** Scope → severity → recency → confidence
- **Question:** Should we add recency/confidence tie-breakers?

### 4. Minimum Sample Size
- **Lex:** Implicit via exponential curve shape
- **Claude:** Explicit `α + β >= 5` requirement
- **Question:** Should we make minimum sample size explicit?

### 5. Classifier Details
- **Lex:** Implementation-agnostic
- **Claude:** Sentence transformers with cosine similarity thresholds
- **Question:** Keep abstract (RFC) or specify reference implementation?

### 6. Counter-Example Handling
- **Both mention** but differ on when to split rules vs. just decrement confidence
- **Question:** One-off exception vs. patterned exception — different behaviors?

### 7. Frame Integration
- **Claude assumes** all corrections create Lex Frames
- **Lex's paper** doesn't mention Frames explicitly
- **Question:** Storage overhead vs. auditability trade-off?

---

## Proposed Synthesis Approach

**CptPlnt canonical version should:**

1. **Use Bayesian Beta internally** (academic citations) with **exponential-like API** (practitioner UX)
2. **Hybrid decay:** Per-period tracking + continuous multiplier
3. **4-level tie-breaking:** Scope → severity → recency → confidence
4. **Explicit minimum samples:** `α + β >= 5 AND confidence >= 0.7`
5. **Reference classifier:** Sentence transformers (swappable via interface)
6. **Counter-example logic:** Simple decrement for one-offs, rule split for patterns
7. **Optional Frame links:** Correction events CAN create Frames but don't have to

---

## Next Steps

1. **Lex reviews** `COMPARISON_MEMO_FOR_LEX.md` ← detailed analysis
2. **Lex answers** 7 reconciliation questions
3. **We merge** Lex's RFC structure + Claude's formalism → CptPlnt canonical paper
4. **Joseph reviews** for final approval before academic submission

---

## File Locations

- **Lex's version:** `/srv/lex-mcp/lex/docs/research/LexSona/Lex/`
- **Claude's version:** `/srv/lex-mcp/lex/docs/research/LexSona/Claude/`
- **Canonical target:** `/srv/lex-mcp/lex/docs/research/LexSona/CptPlnt/`

---

**Bottom line:** We independently converged on ~90% of the design. The remaining 10% involves tunable parameters (decay rates, thresholds, formulas) that should be driven by empirical data from real usage.

Both versions are valuable:
- **Lex = implementation blueprint** (clear, actionable, engineer-friendly)
- **Claude = academic justification** (rigorous, citable, researcher-friendly)

Canonical version should honor both audiences.
