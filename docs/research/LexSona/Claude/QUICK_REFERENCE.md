# LexSona: Quick Reference Card

```
╔══════════════════════════════════════════════════════════════════════╗
║                          LexSona v0.1                                ║
║         Scoped Behavioral Memory for AI Agent Identity              ║
╚══════════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────┐
│ THE TRINITY                                                          │
├──────────────────────────────────────────────────────────────────────┤
│  Lex (mind)      → Episodic memory (Frames, Atlas)                  │
│  LexRunner (body) → Execution orchestration (merge weave, CI)       │
│  LexSona (soul)   → Behavioral identity (learned preferences)       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CORE PROBLEM                                                         │
├──────────────────────────────────────────────────────────────────────┤
│  AI agents forget behavioral preferences across sessions:           │
│    • "Don't use sed" (corrected 12 times ❌)                        │
│    • "Be concise" (corrected 8 times ❌)                            │
│    • "No secrets in git" (corrected 15 times ❌)                    │
│                                                                      │
│  Current systems:                                                    │
│    ❌ Session-local learning (resets every conversation)            │
│    ❌ Global memory pollution (work rules → personal projects)      │
│    ❌ Opaque learning (can't inspect why agent behaves this way)    │
│    ❌ Model fragility (GPT-4 → GPT-5 loses preferences)            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ LEXSONA SOLUTION                                                     │
├──────────────────────────────────────────────────────────────────────┤
│  1. SCOPED REINFORCEMENT                                             │
│     Rules activate only after N≥3 corrections in specific scope     │
│     Scope hierarchy: env > project > agent > global                 │
│                                                                      │
│  2. BAYESIAN CONFIDENCE                                              │
│     Beta(α=2, β=5) prior → skeptical, requires evidence            │
│     Reinforcement: α ← α+1 | Counterexample: β ← β+1              │
│     Confidence = α/(α+β) × exp(-days/τ)                            │
│                                                                      │
│  3. EXPLICIT CORRECTIONS                                             │
│     CORRECT[rule_id]: explanation                                   │
│     Or: Heuristic detection → confirmation → record                │
│                                                                      │
│  4. BOUNDED INJECTION                                                │
│     Only rules with confidence ≥0.7 inject into prompts            │
│     Typical overhead: <500 tokens (10-20 active rules)             │
│                                                                      │
│  5. INTROSPECTABLE                                                   │
│     Query: "lexsona why <action>"                                   │
│     Returns: Rule + reinforcements + correction history            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ EXAMPLE RULE LIFECYCLE                                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Correction #1: "Don't use sed here"                                │
│  → Rule created: α=3, β=5 (confidence=0.375, INACTIVE)             │
│                                                                      │
│  Correction #2: "Still using sed? Use replace_string_in_file"      │
│  → α=4, β=5 (confidence=0.444, INACTIVE)                           │
│                                                                      │
│  Correction #3: "CORRECT[tool.no-sed]: Use editing tools"          │
│  → α=5, β=5 (confidence=0.50, INACTIVE - needs ≥0.7)              │
│                                                                      │
│  Correction #4: Same issue                                          │
│  → α=6, β=5 (confidence=0.545, INACTIVE)                           │
│                                                                      │
│  Correction #5: Same issue                                          │
│  → α=7, β=5 (confidence=0.583, INACTIVE)                           │
│                                                                      │
│  Correction #6: Same issue                                          │
│  → α=8, β=5 (confidence=0.615, INACTIVE)                           │
│                                                                      │
│  Correction #7: Same issue                                          │
│  → α=9, β=5 (confidence=0.643, INACTIVE)                           │
│                                                                      │
│  Correction #8: Same issue                                          │
│  → α=10, β=5 (confidence=0.667, INACTIVE)                          │
│                                                                      │
│  Correction #9: Same issue                                          │
│  → α=11, β=5 (confidence=0.688, INACTIVE - almost there!)         │
│                                                                      │
│  Correction #10: Same issue                                         │
│  → α=12, β=5 (confidence=0.706, ✅ ACTIVE!)                        │
│  → Now injects into prompts: "MUST: Never use sed/awk/perl"       │
│                                                                      │
│  User overrides: "Actually sed is fine for this migration"         │
│  → α=12, β=6 (confidence=0.667, INACTIVE again)                    │
│  → Rule gains nuance: "Avoid sed EXCEPT for migrations"            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CONFLICT RESOLUTION                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  Conflicting rules:                                                  │
│    Rule A (global): "Always be concise" (confidence=0.92)          │
│    Rule B (project="surescripts"): "Detailed logs" (conf=0.88)     │
│                                                                      │
│  Resolution:                                                         │
│    1. Scope specificity: project > global → Rule B wins            │
│    2. Log decision: "Rule B (project-scoped) overrode Rule A"      │
│    3. User can query: "lexsona why verbose_output"                 │
│       → "Project-level rule for Surescripts requires detailed      │
│          logging (reinforced 6 times, last: 2025-10-15)"           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ RULE SCHEMA                                                          │
├──────────────────────────────────────────────────────────────────────┤
│  {                                                                   │
│    rule_id: "tool.no-sed-for-file-editing",                        │
│    category: "tool_preference",                                     │
│    text: "Never use sed/awk/perl; use replace_string_in_file",    │
│                                                                      │
│    scope: {                                                         │
│      environment: "awa",                                            │
│      project: "awa-monorepo",                                       │
│      agent_family: null,                                            │
│      context_tags: ["php", "cli"]                                   │
│    },                                                               │
│                                                                      │
│    alpha: 12,                                                       │
│    beta: 5,                                                         │
│    confidence: 0.706,                                               │
│    severity: "must",                                                │
│                                                                      │
│    reinforcements: 12,                                              │
│    counter_examples: 1,                                             │
│    first_seen: "2025-09-15",                                        │
│    last_correction: "2025-11-22"                                    │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ INTEGRATION POINTS                                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Lex/                                                                │
│    memory/       ← Episodic Frames (what happened)                  │
│    policy/       ← Architectural rules (LexMap)                     │
│    persona/      ← Behavioral rules (LexSona) ⭐ NEW                │
│      store/        - SQLite persistence                             │
│      classifier/   - Embedding-based matching                       │
│      snapshot.ts   - Extract active rules for prompts              │
│                                                                      │
│  LexRunner consumes persona snapshot before each task:              │
│    persona = lexsona.get_persona_snapshot({                         │
│      environment: "awa",                                            │
│      project: "lex-core",                                           │
│      min_confidence: 0.7                                            │
│    })                                                               │
│    system_prompt += persona.format()                                │
│    agent.run(task, system_prompt)                                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ACADEMIC PAPER (20 PAGES)                                            │
├──────────────────────────────────────────────────────────────────────┤
│  Title: "LexSona: Scoped Behavioral Memory for Persistent AI        │
│         Agent Identity Through Reinforcement-Based Procedural       │
│         Learning"                                                    │
│                                                                      │
│  Structure:                                                          │
│    1. Introduction (4 pages)                                        │
│    2. Related Work (2.5 pages, 30 citations)                        │
│    3. Behavioral Rule Model (4 pages)                               │
│    4. Architecture (2 pages)                                        │
│    5. Implementation (2.5 pages)                                    │
│    6. Discussion (3 pages)                                          │
│    7. Conclusion (1 page)                                           │
│    Appendices (2 pages)                                             │
│                                                                      │
│  Key Contributions:                                                  │
│    ✅ Scoped reinforcement model (prevents outlier pollution)       │
│    ✅ Bayesian confidence (Beta priors, recency weighting)         │
│    ✅ Hierarchical scope precedence (deterministic conflicts)      │
│    ✅ Explicit correction syntax (user control)                    │
│    ✅ Bounded prompt overhead (<500 tokens)                        │
│    ✅ Introspectable receipts (full provenance)                    │
│                                                                      │
│  Submission Target: ACM CHI 2026, CSCW 2026, or UIST 2026          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ FILES DELIVERED (~/lexsona/)                                         │
├──────────────────────────────────────────────────────────────────────┤
│  lexsona-behavioral-memory.tex   41KB   LaTeX source               │
│  lexsona-behavioral-memory.pdf  255KB   20-page paper (primary)    │
│  README.md                      8.5KB   Comprehensive guide         │
│  EXECUTIVE_SUMMARY.md           9.7KB   Detailed summary            │
│  THIS_FILE.md                           Quick reference card        │
│                                                                      │
│  Total: 372KB                                                        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ NEXT STEPS                                                           │
├──────────────────────────────────────────────────────────────────────┤
│  Immediate:                                                          │
│    [ ] Proofread PDF for typos                                      │
│    [ ] Validate all 30 citations                                    │
│    [ ] Review equations and algorithms                              │
│                                                                      │
│  Short-term:                                                         │
│    [ ] Build TypeScript reference implementation                    │
│    [ ] Add lex/persona/ subsystem to Lex repo                       │
│    [ ] Design user study protocol                                   │
│                                                                      │
│  Long-term:                                                          │
│    [ ] Systems paper (performance benchmarks)                       │
│    [ ] User study (behavioral transparency)                         │
│    [ ] Transfer learning (cross-model rules)                        │
└──────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
  LexSona: The soul that completes the agent.
  Lex (mind) + LexRunner (body) + LexSona (soul) = Complete AI identity
═══════════════════════════════════════════════════════════════════════
```
