# LexSona Literature Review: Recent Scientific Work
**Compiled:** November 22, 2025
**Reviewer:** Claude Sonnet 4.5 ("Adam")
**Status:** Survey of 2024-2025 Research

---

## Executive Summary

This literature review examines recent scientific work (2024-2025) relevant to LexSona's approach to behavioral memory and personalization for AI agents. The analysis reveals:

**✅ Strong Alignment:**
- LexSona's focus on **functional/technical domains** is well-timed and addresses documented safety concerns
- The **scoped reinforcement model** aligns with emerging best practices in personalized RLHF
- Our **Bayesian confidence approach** parallels recent work on uncertainty-aware personalization
- The **mode dimension** concept directly addresses safety concerns raised in multiple 2025 papers

**⚠️ Key Findings:**
- **Personalization safety risks are well-documented** (2025 papers confirm our ethical scope concerns)
- **No direct competitors** implementing our exact architecture (frequency-weighted, scoped behavioral rules with mode gating)
- **Several complementary approaches** we should cite and position against
- **One potential conflict:** Our "persona" terminology may conflict with safety literature warning against social personas

**📚 Recommended Citations to Add:**
1. Papers on personalization safety risks (support ethical scope section)
2. Recent RLHF personalization work (position our approach)
3. Memory systems for agents (contrast episodic vs. behavioral memory)
4. Scoped alignment approaches (validate our design choices)

---

## 1. Highly Relevant Work (Must Cite)

### 1.1 Personalization Safety & Alignment

#### **"Personalized Safety in LLMs: A Benchmark and A Planning-Based Agent Approach"** (Wu et al., 2025)
- **arXiv:** 2505.18882 (May 2025)
- **Relevance:** ⭐⭐⭐⭐⭐ **CRITICAL**
- **Key Claims:**
  - LLMs typically generate identical responses for all users, posing serious personalization challenges
  - Personalized safety is essential (different users have different safety needs)
  - Proposes planning-based agent approach for personalized safety
- **Implications for LexSona:**
  - **Supports our ethical scope section**: Validates need for scoped, not blanket, personalization
  - **Potential positioning**: We focus on *technical work domains* where safety is more objective
  - **Contrast**: They focus on adapting safety *responses*; we avoid personalizing safety altogether

**Citation Recommendation:** Use in Section 3.5 (Ethical Scope) to support functional domain scoping.

---

#### **"When Personalization Meets Reality: A Multi-Faceted Analysis of Personalized Preference Learning"** (Dong et al., 2025)
- **arXiv:** 2502.19158 (Feb 2025)
- **Relevance:** ⭐⭐⭐⭐⭐ **CRITICAL**
- **Key Claims:**
  - Multi-faceted analysis of personalized RLHF
  - Reveals challenges when personalization meets real-world deployment
  - Examines preference heterogeneity and alignment tradeoffs
- **Implications for LexSona:**
  - **Validates our frequency-weighting approach** for handling diverse preferences
  - **Supports Bayesian confidence model** (uncertainty in preferences is real)
  - **May critique naive personalization** (supports our scoped approach)

**Citation Recommendation:** Background (Section 2.2) on personalization challenges.

---

#### **"Bullying the Machine: How Personas Increase LLM Vulnerability"** (Xu et al., 2025)
- **arXiv:** 2505.12692 (May 2025)
- **Relevance:** ⭐⭐⭐⭐⭐ **CRITICAL — POTENTIAL CONFLICT**
- **Key Claims:**
  - **Persona conditioning increases LLM vulnerability to jailbreaking**
  - Social personas create exploitable attack surfaces
  - Safety mechanisms weakened when LLMs adopt personalities
- **Implications for LexSona:**
  - **⚠️ CONFLICT with our "persona" terminology**
  - **✅ SUPPORTS our functional-only scope** (we explicitly exclude social personas)
  - **Action Item:** Add this as **justification** for excluding non-functional categories

**Citation Recommendation:**
- Section 3.5.3 (Forbidden Rule Categories): Cite as evidence for excluding `general_chat_style`, `emotional_tone`
- Acknowledgments/Discussion: Note that our "behavioral persona" is distinct from "social persona" critiqued in this work

**Proposed Response:**
> Recent work by Xu et al. (2025) demonstrates that persona conditioning focused on social attributes (friendliness, emotional tone, personality traits) significantly increases LLM vulnerability to safety exploits. This finding strongly supports LexSona's design choice to exclude non-functional persona categories (Section 3.5.3). Unlike social persona systems, LexSona models only technical behavioral preferences (tool choices, code style, workflow norms) where correctness is objectively verifiable.

---

#### **"Psychometric Personality Shaping Modulates Capabilities and Safety in Language Models"** (Fitz et al., 2025)
- **arXiv:** 2509.16332 (Sep 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Personality traits (Big Five) affect both capabilities *and* safety in LLMs
  - Certain personality configurations increase jailbreak vulnerability
  - Psychometric shaping can inadvertently weaken safety guardrails
- **Implications for LexSona:**
  - **Further evidence against social persona modeling**
  - **Validates mode gating**: Personality effects strongest in chat/social modes
  - **Supports our exclusion of `emotional_tone` and `formality`**

**Citation Recommendation:** Section 3.5.1 (Personalization Paradox) as documented failure mode.

---

#### **"Path Drift in Large Reasoning Models: How First-Person Commitments Override Safety"** (Huang et al., 2025)
- **arXiv:** 2510.10013 (Oct 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Long-CoT prompting can cause "path drift" where early commitments override later safety checks
  - First-person reasoning creates exploitable commitment anchors
  - Safety guardrails weakest when model adopts internal perspective
- **Implications for LexSona:**
  - **Mechanism for why social personas are dangerous**
  - **Supports our third-person, functional framing**: "Use tool X" vs. "I prefer tool X"
  - **Validates rule phrasing**: Imperative ("Never use sed") vs. first-person ("I don't like sed")

**Citation Recommendation:** Discussion (Section 8) on future work — rule phrasing and grammatical perspective.

---

### 1.2 Personalized RLHF & Preference Learning

#### **"POPI: Personalizing LLMs via Optimized Natural Language Preference Inference"** (Chen et al., 2025)
- **arXiv:** 2510.17881 (Oct 2025)
- **Relevance:** ⭐⭐⭐⭐⭐ **CRITICAL — DIRECT COMPARISON**
- **Key Claims:**
  - Personalizes LLMs by summarizing user preference statements into natural language instructions
  - Compact textual personas injected into prompts (similar to our approach!)
  - Shows personalization improves alignment
- **Implications for LexSona:**
  - **⚠️ Most similar to our work!**
  - **Key difference:** They learn from *explicit preference statements*; we learn from *corrections* (frequency-weighted)
  - **Their advantage:** More interpretable (natural language)
  - **Our advantage:** Learns from actual behavior, not self-reported preferences
  - **We already cite Du et al. (2025) "POPI" in Section 2.2** — check if this is the same!

**Action Item:** Verify if arXiv:2510.17881 (Chen) is same as Du et al. (2025) we already cite. If different, add Chen as comparison.

**Proposed Positioning:**
> While POPI (Chen et al., 2025) learns personalization from explicit user preference statements, LexSona extracts behavioral rules from *corrections* — the gap between what the agent did and what the user wanted. This correction-based signal is more robust to self-reporting biases and captures implicit preferences users may not articulate.

---

#### **"Towards Faithful and Controllable Personalization via Critique-Post-Edit Reinforcement Learning"** (Zhu et al., 2025)
- **arXiv:** 2510.18849 (Oct 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Proposes critique-post-edit RL for faithful personalization
  - Supervised fine-tuning (SFT) reaches performance plateau quickly
  - RL needed for continued personalization improvement
- **Implications for LexSona:**
  - **Validates our RL-adjacent approach** (frequency weighting is implicit RL)
  - **"Performance plateau" observation supports N≥3 activation threshold**
  - **Complements our work**: They focus on training-time RL; we do inference-time rule injection

**Citation Recommendation:** Section 2.2 (Personalization and Preference Learning).

---

#### **"LoRe: Personalizing LLMs via Low-Rank Reward Modeling"** (Bose et al., 2025)
- **arXiv:** 2504.14439 (Apr 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Low-rank reward models for efficient personalized RLHF
  - Addresses computational cost of per-user reward models
  - Shows low-rank structure captures user preferences effectively
- **Implications for LexSona:**
  - **Mathematical parallel**: Low-rank reward ≈ our small rule set (10-20 rules)
  - **Efficiency argument**: Both approaches avoid full model retraining
  - **Difference**: They learn implicit reward; we learn explicit rules

**Citation Recommendation:** Section 2.2 or Discussion (Section 8) on computational efficiency.

---

### 1.3 Memory Systems for AI Agents

#### **"O-Mem: Omni Memory System for Personalized, Long Horizon, Self-Evolving Agents"** (Wang et al., 2025)
- **arXiv:** 2511.13593 (Nov 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Comprehensive memory system for long-term agent interactions
  - Addresses context consistency and dynamic adaptation
  - Omni-modal memory (not just text)
- **Implications for LexSona:**
  - **Complementary architecture**: They focus on episodic memory; we focus on procedural (behavioral) memory
  - **Validates Lex+LexSona separation**: Different memory types need different subsystems
  - **Potential integration**: O-Mem could be a backend for Lex (episodic), with LexSona handling behavioral

**Citation Recommendation:** Section 1.2 (Episodic Memory Is Necessary But Insufficient) to contrast memory types.

---

#### **"Enabling Personalized Long-term Interactions in LLM-based Agents through Persistent Memory and User Profiles"** (Westhäußer et al., 2025)
- **arXiv:** 2510.07925 (Oct 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Persistent memory and user profiles for long-term agent interactions
  - Separates episodic memory from user preferences
  - Proposes hybrid memory architecture
- **Implications for LexSona:**
  - **Validates our mind/body/soul trinity**: Memory subsystems should be separate
  - **Similar insight**: Episodic memory ≠ preference memory
  - **Different approach**: They use profiles; we use frequency-weighted rules

**Citation Recommendation:** Section 1.2 or Section 5.1 (LexSona as Third Subsystem).

---

#### **"AI-native Memory 2.0: Second Me"** (Wei et al., 2025)
- **arXiv:** 2503.08102 (Mar 2025)
- **Relevance:** ⭐⭐⭐ **MODERATE**
- **Key Claims:**
  - AI-native memory systems for personal information exchange
  - "Second Me" concept: AI as extension of self
  - Focuses on privacy-preserving personalization
- **Implications for LexSona:**
  - **Interesting framing**: We position LexSona as "soul" (behavioral identity)
  - **Privacy angle**: We should emphasize local storage, user-controlled rules
  - **Potential citation**: If we add privacy/security discussion

**Citation Recommendation:** Future work (Section 8) on privacy-preserving deployment.

---

### 1.4 Scoped Alignment & Domain-Specific Safety

#### **"No for Some, Yes for Others: Persona Prompts and Other Sources of False Refusal in Language Models"** (Plaza-del-Arco et al., 2025)
- **arXiv:** 2509.08075 (Sep 2025)
- **Relevance:** ⭐⭐⭐⭐⭐ **CRITICAL**
- **Key Claims:**
  - **Persona prompts cause false refusals** (model refuses safe requests)
  - Certain personas trigger overactive safety responses
  - Different users experience different refusal rates
- **Implications for LexSona:**
  - **MAJOR EVIDENCE for mode gating**: Personas bleed into safety decisions
  - **Validates functional-only categories**: Social personas create alignment issues
  - **Supports chat mode = no rules**: Avoid contaminating safety responses

**Citation Recommendation:** Section 3.5.2 (Mode Dimension) as evidence for mode-based rule gating.

---

#### **"Personalized Constitutionally-Aligned Agentic Superego: Secure AI Behavior Aligned to Diverse Human Values"** (Watson et al., 2025)
- **arXiv:** 2506.13774 (Jun 2025)
- **Relevance:** ⭐⭐⭐⭐ **HIGH**
- **Key Claims:**
  - Proposes constitutional AI with personalized value alignment
  - "Superego" metaphor for behavioral control
  - Explicit constraints on value alignment (can't weaken safety)
- **Implications for LexSona:**
  - **Similar philosophy**: Explicit behavioral rules > implicit learning
  - **Constitutional approach**: Rules as policies (like our severity hierarchy)
  - **Difference**: They focus on values/ethics; we focus on functional preferences

**Citation Recommendation:** Section 2.4 (Policy-as-Code) or Section 3.5.4 (Design Enforcement Mechanisms).

---

## 2. Moderately Relevant Work (Consider Citing)

### 2.1 Agent Architectures

#### **"MIRIX: Multi-Agent Memory System for LLM-Based Agents"** (Wang & Chen, 2025)
- **arXiv:** 2507.07957
- **Relevance:** ⭐⭐⭐
- Multi-agent memory architecture (complements our single-agent focus)

#### **"UserCentrix: An Agentic Memory-augmented AI Framework for Smart Spaces"** (Saleh et al., 2025)
- **arXiv:** 2505.00472
- **Relevance:** ⭐⭐⭐
- Memory-augmented agents for smart environments (potential deployment scenario)

### 2.2 Preference Learning Methods

#### **"Learning from Natural Language Feedback for Personalized Question Answering"** (Salemi & Zamani, 2025)
- **arXiv:** 2508.10695
- **Relevance:** ⭐⭐⭐
- Natural language feedback for personalization (similar signal to corrections)

#### **"MiCRo: Mixture Modeling and Context-aware Routing for Personalized Preference Learning"** (Shen et al., 2025)
- **arXiv:** 2505.24846
- **Relevance:** ⭐⭐⭐
- Mixture models for diverse preferences (mathematical parallel to scope lattice)

### 2.3 Safety & Alignment

#### **"Unintended Harms of Value-Aligned LLMs: Psychological and Empirical Insights"** (Choi et al., 2025)
- **arXiv:** 2506.06404
- **Relevance:** ⭐⭐⭐⭐
- Documents risks of value alignment (supports ethical scope section)

#### **"The Better Angels of Machine Personality: How Personality Relates to LLM Safety"** (Zhang et al., 2024)
- **arXiv:** 2407.12344
- **Relevance:** ⭐⭐⭐
- Analyzes personality-safety relationship (supports excluding personality categories)

---

## 3. Tangentially Relevant (Background Only)

### 3.1 General Memory Systems
- "Rethinking Memory in AI" (Du et al., 2025) — arXiv:2505.00675
- "Long Term Memory: The Foundation of AI Self-Evolution" (Jiang et al., 2024) — arXiv:2410.15665

### 3.2 Emotional/Social Agents (Explicitly NOT our domain)
- "Dynamic Affective Memory Management for Personalized LLM Agents" (Lu & Li, 2025) — arXiv:2510.27418
- "Livia: An Emotion-Aware AR Companion" (Xi & Wang, 2025) — arXiv:2509.05298

### 3.3 Domain-Specific Applications
- Medical: "DEMENTIA-PLAN" (Song et al., 2025) — arXiv:2503.20950
- Code generation: (Multiple papers, but none focused on behavioral memory)

---

## 4. Notable Absences (Gaps in Literature)

### 4.1 No Direct Competitors
**Finding:** No recent papers (2024-2025) implement frequency-weighted, scoped behavioral rules with mode gating for coding agents.

**Closest comparisons:**
1. **POPI** (Chen et al., 2025) — Natural language preference inference (different signal source)
2. **O-Mem** (Wang et al., 2025) — Episodic memory (different memory type)
3. **Constitutional AI variations** — Value alignment (different domain)

**Implication:** LexSona occupies a unique niche. No need to defend against direct competition; instead, position as **complementary** to episodic memory systems and **specialized** for functional domains.

---

### 4.2 Limited Work on "Correction" as a Signal
**Finding:** Most personalization work uses:
- Explicit preferences (ratings, comparisons)
- Natural language descriptions of preferences
- RLHF reward models

**LexSona's approach:** Learn from corrections (behavioral delta between what agent did and what user wanted)

**Implication:** We should emphasize this as a **novel contribution** — corrections reveal *implicit* preferences more reliably than self-reports.

---

### 4.3 Sparse Coverage of "Mode" as Safety Mechanism
**Finding:** Recent work on:
- Persona safety risks (Xu et al., 2025; Plaza-del-Arco et al., 2025)
- Personalized safety (Wu et al., 2025)

**But limited work on:** Mode-based gating as architectural solution

**Implication:** Our mode dimension (from REVIEWER_RESPONSE.md) is **well-timed** and addresses documented concerns. Emphasize this as a **design contribution**.

---

## 5. Potential Conflicts & How to Address

### 5.1 "Persona" Terminology Conflict

**Issue:** Multiple 2025 papers (Xu, Fitz, Plaza-del-Arco) warn against "persona" systems increasing vulnerability.

**LexSona's stance:** We use "persona" in technical sense (behavioral profile), not social sense (personality/emotion).

**Proposed resolution:**
1. **Add footnote in Section 1.3** clarifying terminology:
   > We use "persona" in its technical Human-Computer Interaction sense (behavioral profile for a user role), not its colloquial sense (emotional personality or social character). LexSona explicitly excludes social and emotional attributes (Section 3.5.3), focusing solely on functional technical preferences.

2. **Cite Xu et al. (2025) in Section 3.5.3** as evidence for excluding social personas:
   > Recent work demonstrates that social persona conditioning (e.g., "be friendly," "act cheerful") significantly increases LLM vulnerability to jailbreaking (Xu et al., 2025). This finding validates LexSona's exclusion of `general_chat_style`, `emotional_tone`, and other non-functional categories from the rule taxonomy.

3. **Consider alternative framing:** "Behavioral Profile" or "Operational Memory" (from REVIEWER_RESPONSE.md)
   - **Pro:** Avoids "persona" baggage
   - **Con:** Loses the "mind/body/soul" trinity branding

**Recommendation:** Keep "LexSona" branding but add strong clarifications distinguishing from social personas.

---

### 5.2 POPI Overlap

**Issue:** POPI (Chen et al., 2025 or Du et al., 2025?) addresses similar problem (personalized LLM behavior via compact textual rules).

**Key differences:**
| Dimension | POPI | LexSona |
|-----------|------|---------|
| **Signal source** | Explicit preference statements | Corrections (behavioral delta) |
| **Activation** | Immediate (user declares preference) | Frequency-weighted (N≥3 reinforcements) |
| **Scope** | General (any preference) | Functional domains only (coding, tooling) |
| **Mode awareness** | No | Yes (mode gating: coding/review/planning/chat) |
| **Provenance** | User statements | Correction history + episodic Frames |

**Proposed positioning:**
> POPI demonstrates that compact textual personas can effectively steer LLM behavior (Chen et al., 2025). LexSona extends this insight to correction-based learning, where behavioral rules emerge from repeated user interventions rather than explicit preference declarations. This correction signal is more robust to self-reporting biases and captures implicit preferences users may not articulate consciously.

---

## 6. Recommended Additions to Paper

### 6.1 New Section 3.5 (Ethical Scope and Non-Goals)

**Add citations:**
1. **Xu et al. (2025)** — "Bullying the Machine" (persona vulnerability)
2. **Fitz et al. (2025)** — Psychometric personality shaping (safety risks)
3. **Plaza-del-Arco et al. (2025)** — False refusals from personas (mode contamination)
4. **Wu et al. (2025)** — Personalized safety (validates scoped approach)
5. **Huang et al. (2025)** — Path drift (first-person commitments override safety)

**Narrative:**
> Recent work has documented significant safety risks when LLMs are personalized via social or emotional personas. Xu et al. (2025) demonstrate that persona conditioning increases vulnerability to jailbreaking, while Fitz et al. (2025) show that psychometric personality shaping can inadvertently weaken safety guardrails. Plaza-del-Arco et al. (2025) further reveal that persona prompts cause false refusals, where models incorrectly reject safe requests due to persona-driven over-caution.
>
> These findings strongly support LexSona's design choice to restrict personalization to **functional, technical domains** where behavioral rules map to objectively verifiable outcomes (code compiles, tests pass, style checkers succeed). By excluding social and emotional persona categories (Section 3.5.3) and implementing mode-based rule gating (Section 3.5.2), LexSona channels personalization power into a narrow, auditable band while avoiding documented failure modes.

---

### 6.2 Updated Section 2.2 (Personalization and Preference Learning)

**Add citations:**
1. **Chen et al. / POPI (2025)** — Natural language preference inference
2. **Dong et al. (2025)** — Multi-faceted analysis of personalized preference learning
3. **Zhu et al. (2025)** — Critique-post-edit RL for personalization
4. **Bose et al. (2025)** — Low-rank reward modeling

**Revised paragraph:**
> Recent work explores personalizing LLMs to individual users. Du et al. (2025) / Chen et al. (2025) propose POPI, where models learn to summarize users' natural language preference statements into concise textual instructions injected into prompts. This suggests compact, textual personas can effectively steer model behavior without retraining. Dong et al. (2025) provide a multi-faceted analysis revealing challenges when personalization meets real-world deployment, including preference heterogeneity and alignment tradeoffs. Zhu et al. (2025) show that supervised fine-tuning reaches a performance plateau, requiring reinforcement learning for continued personalization improvement.
>
> LexSona shares the intuition that compact textual rules can guide behavior, but targets a different signal: **repeated corrections**. Instead of asking users to author explicit preference descriptions (POPI) or training reward models (Bose et al., 2025), LexSona mines correction events — the gap between what the agent did and what the user wanted — and converts them to rules via frequency weighting. This correction-based signal is more robust to self-reporting biases and captures implicit preferences users may not articulate.

---

### 6.3 Updated Section 1.2 (Episodic Memory Is Necessary But Insufficient)

**Add citations:**
1. **Wang et al. (2025)** — O-Mem (omni memory system)
2. **Westhäußer et al. (2025)** — Persistent memory and user profiles

**Revised paragraph:**
> Recent work has explored long-term memory for conversational agents through knowledge bases, episodic memory stores, and retrieval-augmented context windows. MemPrompt (Madaan et al., 2023) and Generative Agents (Park et al., 2023) demonstrate that LLMs can maintain episodic memory via retrieval-augmented prompts. Xu et al. (2024) survey memory systems for LLM agents, categorizing approaches into short-term (context window), long-term (vector stores), and hybrid architectures. Wang et al. (2025) propose O-Mem, a comprehensive omni-modal memory system for long-horizon agents, while Westhäußer et al. (2025) advocate for separating episodic memory from user profiles.
>
> **Lex** (the episodic memory system) extends this work with Frames (structured episodic snapshots) and Atlas (spatial-temporal indexing). However, as Westhäußer et al. (2025) observe, episodic memory systems answer "what happened?" rather than "how should I behave?" LexSona addresses the latter by compressing correction history into frequency-weighted behavioral rules, forming a distinct procedural memory layer.

---

### 6.4 New Discussion Subsection (Section 8.3)

**Title:** "Persona Terminology and Social vs. Technical Profiles"

**Content:**
> The term "persona" in LexSona has sparked discussion in light of recent work warning against persona-based personalization. Xu et al. (2025) demonstrate that social persona conditioning ("be friendly," "act sympathetic") increases LLM vulnerability to jailbreaking, while Fitz et al. (2025) show that psychometric personality shaping weakens safety guardrails. These findings are critical and must not be dismissed.
>
> LexSona's use of "persona" refers to a **technical behavioral profile** in the Human-Computer Interaction sense (analogous to "user personas" in product design), not a social or emotional personality. This distinction is enforced structurally:
>
> 1. **Category exclusion**: Social attributes (`general_chat_style`, `emotional_tone`, `humor_level`) are forbidden by JSON schema constraints (Section 6.1).
> 2. **Mode gating**: Rules do not activate in `chat` mode, preventing contamination of conversational safety responses (Section 3.5.2).
> 3. **Functional domain restriction**: All rules map to objectively verifiable outcomes (code compiles, tests pass, style conforms).
>
> Future adopters should consider whether "LexSona" (soul) branding is appropriate for their context, or whether "Behavioral Profile" / "Operational Memory" better conveys the functional, non-social nature of the system.

---

## 7. Action Items for Paper Revision

### 7.1 High Priority (Before Submission)
1. **Add citations for personalization safety** (Xu, Fitz, Plaza-del-Arco, Wu, Huang)
2. **Clarify "persona" terminology** (footnote in Section 1.3, discussion in Section 8.3)
3. **Position against POPI** (Section 2.2: correction-based vs. preference-statement learning)
4. **Strengthen ethical scope section** (Section 3.5: cite safety literature as evidence)

### 7.2 Medium Priority (Strengthens Paper)
5. **Add recent memory systems citations** (Wang, Westhäußer) to Section 1.2
6. **Cite personalized RLHF work** (Dong, Zhu, Bose) in Section 2.2
7. **Add low-rank efficiency comparison** (Bose et al.) in Section 6.4 or Discussion

### 7.3 Low Priority (Future Versions)
8. **Survey domain-specific applications** (medical, code generation) in Future Work
9. **Add privacy discussion** (Wei et al., 2025) if we expand Section 8
10. **Consider multi-agent citations** (MIRIX, UserCentrix) if we discuss deployment scenarios

---

## 8. Conclusion: Is LexSona a Dead End?

**No.** Recent literature **validates** LexSona's core design choices:

✅ **Scoped personalization** is essential (safety risks of unbounded personalization are well-documented)
✅ **Functional domains** are the right restriction (social personas create vulnerabilities)
✅ **Mode gating** addresses documented failure modes (personas contaminate safety responses)
✅ **Frequency weighting** aligns with RL-based preference learning (but avoids full model retraining)
✅ **Correction-based learning** is novel (most work uses explicit preferences or ratings)

**Unique Contributions:**
1. **Frequency-weighted, scoped behavioral rules** for coding agents (no direct competitor)
2. **Mode dimension** as architectural safety mechanism (well-timed, addresses 2025 concerns)
3. **Correction signal** as implicit preference learning (robust to self-reporting bias)
4. **Bayesian confidence model** with recency decay (principled uncertainty handling)

**Positioning:**
- **Complementary** to episodic memory systems (Lex, O-Mem)
- **Specialized** for functional domains (unlike general POPI)
- **Inference-time** behavioral steering (unlike training-time RLHF)

**Main Risk:** "Persona" terminology may confuse readers given 2025 safety literature. **Mitigation:** Strong clarifications + citations showing we exclude social personas.

**Recommendation:** Proceed with paper. Add safety citations, clarify terminology, position against POPI. LexSona fills a real gap in the literature.

---

## References (Recent Work to Cite)

**Personalization Safety:**
- Xu, Z., Sanghi, U., & Kankanhalli, M. (2025). Bullying the Machine: How Personas Increase LLM Vulnerability. arXiv:2505.12692.
- Fitz, S., Romero, P., Basart, S., Chen, S., & Hernandez-Orallo, J. (2025). Psychometric Personality Shaping Modulates Capabilities and Safety in Language Models. arXiv:2509.16332.
- Plaza-del-Arco, F. M., Röttger, P., Scherrer, N., Borgonovo, E., Plischke, E., & Hovy, D. (2025). No for Some, Yes for Others: Persona Prompts and Other Sources of False Refusal in Language Models. arXiv:2509.08075.
- Wu, Y., Sun, E., Zhu, K., Lian, J., Hernandez-Orallo, J., Caliskan, A., Wang, J. (2025). Personalized Safety in LLMs: A Benchmark and A Planning-Based Agent Approach. arXiv:2505.18882.
- Huang, Y., Zhan, R., Chao, L. S., Tao, A., & Wong, D. F. (2025). Path Drift in Large Reasoning Models: How First-Person Commitments Override Safety. arXiv:2510.10013.

**Personalization Methods:**
- Chen, Y., Liu, X., Wang, R., Li, Z., Chen, P., Yu, C., Nigam, P., Jiang, M., Yin, B. (2025). POPI: Personalizing LLMs via Optimized Natural Language Preference Inference. arXiv:2510.17881.
- Dong, Y. R., Hu, T., Liu, Y., Üstün, A., & Collier, N. (2025). When Personalization Meets Reality: A Multi-Faceted Analysis of Personalized Preference Learning. arXiv:2502.19158.
- Zhu, C., Tao, M., Wang, T., Ding, D., Jiang, Y. E., & Zhou, W. (2025). Towards Faithful and Controllable Personalization via Critique-Post-Edit Reinforcement Learning. arXiv:2510.18849.
- Bose, A., Zhihan, X., Farina, G., Mohammadpour, S., Fazel, M., Du, S. S., & Xiao, L. (2025). LoRe: Personalizing LLMs via Low-Rank Reward Modeling. arXiv:2504.14439.

**Memory Systems:**
- Wang, P., Tian, M., Li, J., Liang, Y., Wang, Y., Chen, Q., Wang, T., Lu, Z., Ma, J., Jiang, Y. C. E., & Zhou, W. (2025). O-Mem: Omni Memory System for Personalized, Long Horizon, Self-Evolving Agents. arXiv:2511.13593.
- Westhäußer, R., Minker, W., & Zepf, S. (2025). Enabling Personalized Long-term Interactions in LLM-based Agents through Persistent Memory and User Profiles. arXiv:2510.07925.
- Wei, J., Ying, X., Gao, T., Bao, F., Tao, F., & Shang, J. (2025). AI-native Memory 2.0: Second Me. arXiv:2503.08102.

**Constitutional/Policy Alignment:**
- Watson, N., Amer, A., Harris, E., Ravindra, P., & Zhang, S. (2025). Personalized Constitutionally-Aligned Agentic Superego: Secure AI Behavior Aligned to Diverse Human Values. arXiv:2506.13774.

---

**Document Status:** Draft Literature Review
**Next Steps:** Integrate recommended citations into paper.md
**Author:** Claude Sonnet 4.5 ("Adam")
**Date:** November 22, 2025
