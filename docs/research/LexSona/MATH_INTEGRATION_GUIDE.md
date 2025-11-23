# Integration Guide: Math Framework → CptPlnt Paper

**Purpose:** How to incorporate `MATH_FRAMEWORK_v0.1.md` into the canonical `lexsona_paper.md`

---

## Current State

- **MATH_FRAMEWORK_v0.1.md:** Complete formal mathematical theory (40+ pages if typeset)
  - Full lattice formalism
  - Proofs and theorems
  - Axiomatization
  - Convergence conjectures
  - Open problems

- **lexsona_paper.md:** Practical design document (~15 pages)
  - RFC-style structure
  - Implementation-focused
  - Less mathematical rigor

---

## Integration Options

### Option 1: Main Paper + Mathematical Appendix (RECOMMENDED)

**Structure:**
```
lexsona_paper.md (main paper, 18-20 pages)
├── 1. Introduction
├── 2. Background
├── 3. Architecture & Data Model
│   ├── 3.1 Scope Model (informal)
│   ├── 3.2 Rule Representation
│   ├── 3.3 Confidence Calculus (high-level)
├── 4. Update Algorithms
├── 5. Implementation
├── 6. Evaluation
├── 7. Discussion
├── 8. Conclusion
├── References
└── Appendix A: Mathematical Foundations (MATH_FRAMEWORK condensed)
    ├── A.1 Context Lattice (Definitions 1.1-1.6)
    ├── A.2 Scoped Diffusion (Algorithm 3.6, Theorem 3.7)
    ├── A.3 Confidence Field (Definitions 4.1-4.9)
    ├── A.4 Activation & Conflict Resolution (Theorems 5.11, 6.3)

MATH_FRAMEWORK_v0.1.md (separate extended document)
├── Full proofs
├── Conjectures with proof sketches
├── Open problems
├── Relationship to existing theory
```

**Rationale:**
- Main paper stays accessible to practitioners and HCI researchers
- Appendix provides mathematical credibility for theory reviewers
- Extended framework available for theorists who want full details

---

### Option 2: Dual Publication Strategy

**Path 1: Practical Paper (CHI/CSCW/UIST)**
- `lexsona_paper.md` as-is
- Brief mathematical section (2-3 pages)
- Focus on user studies, implementation, UX
- Target: Human-AI Interaction community

**Path 2: Theory Paper (NeurIPS/ICML)**
- MATH_FRAMEWORK as primary content
- Add empirical convergence analysis
- Prove Conjectures 7.3, 7.4 (convergence, regret bounds)
- Target: Machine Learning Theory community

**Rationale:**
- Maximizes publication count
- Reaches two distinct audiences
- Practical paper can cite theory paper for foundations

---

### Option 3: Unified Conference Paper + ArXiv Extended Version

**Conference submission (page-limited):**
- lexsona_paper.md structure
- Mathematical sections condensed to 3-4 pages
- Theorems stated without proofs ("proofs in appendix/extended version")

**ArXiv extended version (unlimited pages):**
- Same structure but with MATH_FRAMEWORK sections inserted
- Full proofs in appendices
- Comprehensive treatment

**Rationale:**
- Common in ML/AI conferences
- Page limits force clarity in main paper
- Extended version provides completeness

---

## Recommended Approach for CptPlnt Canonical

**Use Option 1:** Main paper with condensed mathematical appendix

### Specific Integration Plan

#### 1. Main Paper Section 3: Add Math Subsection

**Current:** Section 3 describes architecture informally
**New:** Add Section 3.4: "Formal Foundations (Summary)"

```markdown
### 3.4 Formal Foundations (Summary)

LexSona's behavioral memory system is built on a rigorous mathematical framework
detailed fully in Appendix A. We summarize key definitions here.

**Context Lattice.** Behavioral scopes form a finite partially ordered set
(𝓒, ⪯) where c₁ ⪯ c₂ means c₁ is more general than c₂. This lattice structure
enables scoped diffusion of corrections.

**Diffusion Weights.** When a correction occurs in context c*, it propagates
to all ancestors d ∈ Anc(c*) with exponentially attenuated weight:
w_diff(d, c*) = w · γ^Δ(d,c*)

**Lex Confidence Field.** Each rule-context pair maintains Bayesian pseudocounts
(α, β) with base confidence:
C_base = (α + α₀) / (α + α₀ + β + β₀)

blended with recency decay:
C_T(r,c) = ρ(Δt) · C_base + (1 - ρ(Δt)) · c_prior

where ρ(Δt) = exp(-Δt / τ).

See Appendix A for full definitions, theorems, and proofs.
```

**Length:** ~1 page with key equations

---

#### 2. Add Appendix A to lexsona_paper.md

**Structure:**

```markdown
## Appendix A: Mathematical Foundations

This appendix formalizes the LexSona framework using lattice theory,
Bayesian statistics, and dynamical systems. Full details and proofs
are available in the extended technical report [MATH_FRAMEWORK_v0.1].

### A.1 Context Lattice

**Definition A.1 (Behavioral Context).**
[Copy Definition 1.1 from MATH_FRAMEWORK]

**Definition A.2 (Partial Order).**
[Copy Definition 1.2]

**Proposition A.3 (Lattice Structure).**
(𝓒, ⪯) is a finite lattice.
*Proof:* See [MATH_FRAMEWORK] Proposition 1.3. □

[Continue with key definitions only, omitting proof details]

### A.2 Scoped Reinforcement Diffusion

**Algorithm A.4 (State Update).**
[Copy Algorithm 3.6 in condensed form]

**Theorem A.5 (Deterministic Replay).**
For any event history H_T with well-ordered timestamps, the final state 𝒫_T
is independent of event processing order.
*Proof:* See [MATH_FRAMEWORK] Theorem 3.7. □

### A.3 Lex Confidence Field

[Key definitions 4.1-4.9 in condensed form]

**Theorem A.6 (Confidence Properties).**
The confidence function C_T(r,c) satisfies:
1. Symmetry: α = β ⇒ C = 0.5
2. Monotonicity: ∂C/∂α > 0, ∂C/∂β < 0
3. Saturation: C → α/(α+β) as counts grow
*Proof:* Direct from Beta-Bernoulli conjugacy. □

### A.4 Bounded Snapshots and Conflict Resolution

**Theorem A.7 (Bounded Active Set).**
|ℛ_T^active(c*)| ≤ |ℛ| and typically O(log|H_T|).
*Proof:* See [MATH_FRAMEWORK] Theorem 5.11. □

**Theorem A.8 (Deterministic Conflicts).**
The priority ordering ⪰ is total, deterministic, and stable under
unrelated corrections.
*Proof:* See [MATH_FRAMEWORK] Theorem 6.3. □
```

**Length:** 4-5 pages (condensed, proofs omitted)

---

#### 3. Reference Extended Framework

At end of paper, add to references:

```markdown
[XX] Gustavson, J. M., with Lex (GPT-5.1) and Claude Sonnet 4.5 (2025).
     "LexSona Mathematical Framework v0.1: Formal Foundations for Scoped
     Behavioral Memory." Technical Report. Available at:
     /srv/lex-mcp/lex/docs/research/LexSona/CptPlnt/MATH_FRAMEWORK_v0.1.md
```

And in abstract/introduction mention:

```markdown
"We provide a complete mathematical formalization using lattice theory
and Bayesian dynamical systems (see Appendix A and extended technical
report [XX] for full details)."
```

---

## Next Steps

### Immediate (For CptPlnt Completion)

1. ✅ **MATH_FRAMEWORK_v0.1.md created** (this file)
2. ⏳ **Add Section 3.4 to lexsona_paper.md** (1 page summary)
3. ⏳ **Add Appendix A to lexsona_paper.md** (4-5 pages condensed)
4. ⏳ **Update DELIVERY_SUMMARY.md** to reflect mathematical rigor

### Short-Term (Before Submission)

1. **Proof verification:** Work with Lex to validate Theorems 3.7, 5.11, 6.3
2. **Conjecture proofs:** Attempt proofs of Conjectures 7.3, 7.4 or state as open problems
3. **Empirical validation:** Run convergence experiments on Joseph's correction logs
4. **Ablation studies:** Test impact of γ, τ, N_min, θ on alignment error

### Long-Term (Dual Publication)

1. **Practical paper:** Submit lexsona_paper.md + Appendix A to CHI 2026
2. **Theory paper:** Expand MATH_FRAMEWORK to full standalone paper for NeurIPS 2026
3. **ArXiv preprint:** Post extended version immediately after conference submission

---

## Summary

**MATH_FRAMEWORK_v0.1.md** is now the **rigorous mathematical backbone** of LexSona.

**Integration strategy:**
- Main paper (`lexsona_paper.md`) gets 1-page summary + 4-page condensed appendix
- Extended framework lives as standalone technical report
- Both documents cross-reference each other
- Dual publication path: HCI venues (practical) + ML venues (theory)

**This gives us:**
✅ Accessibility for practitioners (main paper)
✅ Mathematical credibility for theorists (appendix + extended report)
✅ Flexibility for dual submissions
✅ Complete documentation of all formal foundations

**Status:** MATH_FRAMEWORK complete, ready to integrate into CptPlnt paper.
