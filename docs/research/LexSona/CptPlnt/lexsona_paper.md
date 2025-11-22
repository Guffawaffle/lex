# LexSona: Frequency-Weighted Behavioral Memory for Persistent AI Agent Identity

**Author:** Joseph M. Gustavson ([ORCID: 0009-0001-0669-0749](https://orcid.org/0009-0001-0669-0749))

**AI Collaborators:**
- OpenAI GPT-5.1 Thinking ("Lex", "Eve") — System architecture, constraint definition, integration design
- Claude Sonnet 4.5 ("Adam") — Procedural learning theory, Bayesian modeling, reference implementation

**Date:** November 22, 2025
**Version:** Canonical CptPlnt 1.0
**Status:** Implementation specification + theoretical contribution

---

## Abstract

Large language models (LLMs) increasingly operate as long-lived agents embedded in complex workflows rather than one-off chatbots. In these settings, users repeatedly correct the agent's behavior: tool choices, coding style, safety boundaries, and communication norms. Today those corrections are either forgotten after the session or approximated via broad, static instructions. At the other extreme, naive long-term memory systems hoard raw interaction logs and attempt to stuff them into prompts, leading to unbounded context growth, instability, and opaque failure modes.

This paper proposes **LexSona**, a lightweight behavioral memory layer that turns repeated user corrections into scoped, frequency-weighted persona rules. Instead of memorizing everything, LexSona tracks candidate rules, reinforces them when the user repeats a correction, decays them when they fall out of use, and injects only high-confidence rules into the agent's active persona. Rules are scoped by environment, project, and agent family, support explicit counterexamples, and come with an introspection interface so the agent can explain "why" it is enforcing a given behavior.

LexSona completes the cognitive architecture for AI agents alongside **Lex** (episodic and structural memory) and **LexRunner** (execution orchestration), forming a trinity: **mind, body, and soul**. We describe the design goals, Bayesian confidence model, update algorithms, conflict resolution, and integration patterns. Evaluation on 200 real corrections shows the reference classifier achieves 87% precision and 80% recall at a cosine similarity threshold of 0.85. Prompt overhead remains bounded at <500 tokens for typical use (10-20 active rules).

**Keywords:** AI agents, behavioral memory, personalization, RLHF, reinforcement learning, procedural knowledge

---

## 1. Introduction

### 1.1 The Problem: Ephemeral Agent Identity

Modern AI coding assistants—GitHub Copilot, Cursor, and conversational LLMs like GPT-4 and Claude—exhibit remarkable capability in generating code, debugging systems, and answering technical questions. However, they suffer from a fundamental architectural constraint: **behavioral amnesia**. Each session begins tabula rasa, forcing users to repeatedly correct the same mistakes:

- "Don't use `sed` for file editing in this project—use `replace_string_in_file` tool instead." *(corrected 12 times)*
- "Stop generating verbose responses; I need concise, directive answers." *(corrected 8 times)*
- "Never commit secrets to this repository; scan all diffs before pushing." *(corrected 15 times)*

These corrections represent **procedural knowledge**—not facts about the world, but behavioral preferences about *how* the agent should operate in a specific context. Current LLMs handle this poorly:

1. **Session-local learning**: Corrections apply only within a single conversation thread. Context window resets erase all accumulated preferences.
2. **Unscoped global memory**: Systems like ChatGPT's "Custom Instructions" or "Memory" feature store corrections globally, causing workplace-specific rules to pollute personal projects.
3. **Opaque reinforcement**: Users cannot inspect *why* an agent exhibits certain behavior or override specific learned patterns without clearing all memory.
4. **Model update fragility**: When providers upgrade models (e.g., GPT-4 → GPT-5), behavioral preferences stored in proprietary backends may not transfer, breaking continuity.

### 1.2 Existing Work: Episodic Memory Is Necessary But Insufficient

Recent work has explored long-term memory for conversational agents through knowledge bases, episodic memory stores, and retrieval-augmented context windows. **Lex** (the episodic memory system) enables agents to remember *what happened* via structured Frames and Atlas spatial-temporal indexing. However, episodic memory does not capture *how to behave*.

For example, Lex can remember:
- "On 2025-10-15, Joseph corrected the agent for using sed in monorepo-monorepo/src/cli.ts"

But Lex does not automatically infer:
- "Never use sed for file editing in monorepo projects going forward"

This gap between **episodic memory** (what happened) and **procedural memory** (how to behave) is the core problem LexSona addresses.

### 1.3 Contribution: LexSona as the Third Subsystem

LexSona completes the cognitive architecture for AI agents:

- **Lex (mind)**: Episodic and structural memory (Frames, Atlas, policy graphs)
- **LexRunner (body)**: Execution orchestration (task planning, merge weaving, CI gates)
- **LexSona (soul)**: Behavioral identity (learned preferences, communication styles, procedural rules)

Key contributions of this work:

1. **Scoped reinforcement model**: Rules activate only after N≥3 corrections in a specific scope, preventing one-off outliers from becoming permanent constraints.

2. **Bayesian confidence calculus**: We model rule confidence using Beta distribution priors updated by reinforcements and counterexamples, with explicit recency weighting to handle changing preferences.

3. **Hierarchical scope precedence**: Deterministic conflict resolution via lexicographic scope ordering (environment > project > agent_family > context_tags > global), with severity, recency, and confidence tie-breaking.

4. **Explicit correction acquisition**: Users mark corrections via `CORRECT[rule_id]: explanation` syntax or UI affordances; heuristic detection requires confirmation.

5. **Bounded prompt injection**: Active persona snapshots remain <500 tokens (10-20 rules) via confidence thresholding and scope filtering.

6. **Introspectable receipts**: Every rule links to correction history with full provenance, enabling "why did you behave this way?" queries.

The rest of this paper is organized as follows. Section 2 reviews background on RLHF, personalization, and memory systems. Section 3 defines the problem and design goals. Section 4 presents the Bayesian confidence model and update algorithms. Section 5 describes the architecture and integration patterns. Section 6 details the reference implementation (database schema, classifier, snapshot API). Section 7 presents evaluation results. Section 8 discusses limitations and future work. Section 9 concludes.

---

## 2. Background and Related Work

### 2.1 Alignment and RLHF

Reinforcement learning from human feedback (RLHF) has become central to aligning LLMs with broad human preferences. Ziegler et al. (2019) introduce a pipeline where a reward model is trained on human preference comparisons, then used to fine-tune a language model via reinforcement learning. Ouyang et al. (2022) apply this to train models that follow instructions and avoid unsafe outputs.

However, RLHF operates at population-wide or segment-wide objectives. The reward model aggregates preferences across many users; it cannot reflect fine-grained, idiosyncratic rules that emerge in a particular team, codebase, or workflow. Moreover, RLHF is applied offline during model training, not during day-to-day interactions.

**LexSona complements RLHF** by providing a per-user, per-project policy layer that captures behavioral preferences as structured rules rather than model weights.

### 2.2 Personalization and Preference Learning

Recent work explores personalizing LLMs to individual users. Du et al. (2025) propose POPI (Preference Optimization via Personalized Instructions), where models learn to summarize users' natural language preference statements into concise textual instructions injected into prompts. This suggests compact, textual personas can effectively steer model behavior without retraining.

LexSona shares this intuition but targets a different signal: **repeated corrections**. Instead of asking users to author explicit preference descriptions, LexSona mines correction events and converts them to rules via frequency weighting.

### 2.3 Episodic Memory in AI Agents

MemPrompt (Madaan et al., 2023) and Generative Agents (Park et al., 2023) demonstrate that LLMs can maintain episodic memory via retrieval-augmented prompts. Xu et al. (2024) survey memory systems for LLM agents, categorizing approaches into short-term (context window), long-term (vector stores), and hybrid architectures.

**Lex** extends this work with Frames (structured episodic snapshots) and Atlas (spatial-temporal indexing). However, episodic memory systems answer "what happened?" rather than "how should I behave?" LexSona addresses the latter by compressing correction history into rules.

### 2.4 Policy-as-Code and Architectural Governance

Systems like Terraform, Open Policy Agent (OPA), and Kubernetes admission controllers enforce architectural policies via declarative rules. These systems validate actions against constraints before execution, providing auditability and consistency.

LexSona applies this philosophy to agent behavior: instead of implicit learned preferences, we make behavioral rules explicit, versioned, and queryable. This improves debuggability and user trust.

### 2.5 Human-AI Interaction and Explainability

Work on explainable AI (XAI) emphasizes the importance of introspectable decisions. LIME (Ribeiro et al., 2016) and SHAP (Lundberg & Lee, 2017) provide post-hoc explanations for model predictions. For agents, explainability must extend to behavioral policies.

LexSona's introspection interface allows users to query: "Why did you refuse to use sed?" and receive concrete answers: "Rule `tool.no-sed-for-file-editing` (reinforced 12 times, last corrected 2025-11-22)." This transparency is essential for trust in long-lived agents.

---

## 3. Problem Statement and Design Goals

### 3.1 Problem Statement

We consider an LLM-based agent operating over a stream of tasks for a single user (or small team) across multiple projects and environments. The user occasionally issues corrections to the agent's behavior. We want a system that converts repeated corrections into a set of scoped behavioral rules such that:

1. Rules are applied automatically in appropriate contexts.
2. One-off or outlier corrections do not over-generalize.
3. The rule set remains bounded in size (prompt composition efficient).
4. Behavior is inspectable and debuggable when surprising.

**Formally**, given a sequence of interactions including a subset labeled as corrections, we learn a function:

```
f(scope, min_confidence) → R
```

where:
- `scope` includes environment, project, agent_family, context_tags
- `min_confidence` is a threshold ∈ [0, 1]
- `R` is a set of human-readable behavioral rules whose confidence exceeds the threshold

The agent conditions on `R` when planning and generating outputs.

### 3.2 Design Goals

1. **Reinforcement, not one-shot override**: A single correction should not immediately hard-code a rule. Repeated corrections strengthen confidence until a threshold is reached (N≥3 reinforcements by default).

2. **Scope-aware behavior**: Rules are tied to specific environment/project/agent contexts, preventing cross-contamination between unrelated domains.

3. **Bounded active persona**: Only a small subset of rules (typically 10-20, <500 tokens) should be active at any given time.

4. **Introspectability and auditability**: Users must be able to query "Why did the agent behave this way?" and receive concrete rule references with reinforcement history.

5. **Implementation simplicity**: LexSona should be implementable without model retraining, as a sidecar service or library that agents call when handling corrections and composing prompts.

6. **Safety layering**: LexSona must not override higher-level safety constraints from RLHF or platform policies. User rules can make agents stricter, never less safe.

7. **Graceful decay**: Preferences change over time. Rules not reinforced for long periods should lose confidence or be flagged for review.

---

## 4. The LexSona Behavioral Rule Model

### 4.1 Core Data Structures

#### Rule Scope

Each rule carries a scope describing where it applies:

```typescript
interface LexRuleScope {
  environment?: string;     // e.g., "monorepo", "personal", "sandbox"
  project?: string;         // e.g., "monorepo-alignment", "lex-core"
  agent_family?: string;    // e.g., "gpt", "claude", "copilot"
  context_tags?: string[];  // e.g., ["php", "cli", "security"]
}
```

Scopes can be partially specified. Matching logic uses provided fields and prefers the most specific matching rules.

#### Rule Representation

```typescript
type RuleSeverity = "must" | "should" | "style";

interface LexBehaviorRule {
  rule_id: string;          // e.g., "tool.no-sed-for-file-editing"
  category: string;         // e.g., "tool_preference", "communication_style"
  text: string;             // Human-readable rule statement
  scope: LexRuleScope;

  // Bayesian Beta confidence model
  alpha: number;            // Reinforcements + prior (default α₀=2)
  beta: number;             // Counterexamples + prior (default β₀=5)

  // Metadata (informational, redundant with alpha/beta deltas)
  reinforcements: number;   // alpha - alpha_0
  counter_examples: number; // beta - beta_0

  confidence: number;       // DERIVED: alpha / (alpha + beta)
  severity: RuleSeverity;   // Precedence: must > should > style

  first_seen: string;       // ISO timestamp
  last_correction: string;  // ISO timestamp

  frame_id?: string;        // Optional: Link to Lex Frame for auditability
}
```

**Key design choices:**

- `rule_id` provides stable identity independent of phrasing
- `category` groups rules for downstream consumers and UI presentation
- `severity` captures precedence for conflict resolution
- `alpha`, `beta` encode Bayesian confidence (detailed in Section 4.2)
- `frame_id` links to Lex ecosystem for provenance (optional in standalone deployments)

#### Correction Events

Corrections are surfaced as explicit events rather than inferred purely from chat logs:

```typescript
interface LexCorrectionEvent {
  frame_id?: string;           // Link to Lex Frame (optional)
  user_text: string;           // What the user said when correcting
  agent_output: string;        // Snippet that was corrected
  scope: LexRuleScope;         // Context where correction occurred
  explicit_rule_id?: string;   // Optional: user/tool tags this to a known rule
}
```

When a correction event is recorded, the reinforcement engine maps it to a rule:
- If `explicit_rule_id` provided → use directly
- Otherwise → classifier attempts to match to existing rule
- If no match → create new rule candidate with low initial confidence

### 4.2 Bayesian Confidence Model

LexSona uses a **Beta distribution** to model rule confidence, providing a principled way to handle uncertainty with small sample sizes.

#### Mathematical Formulation

Each rule maintains parameters `(α, β)` representing:
- **α**: Prior + reinforcement count (evidence supporting the rule)
- **β**: Prior + counterexample count (evidence against the rule)

**Prior (skeptical):**
```
α₀ = 2
β₀ = 5
```

This skeptical prior (Beta(2,5)) starts with low confidence (~0.286), requiring evidence to activate.

**Update rules:**
```
Reinforcement event:  α ← α + 1
Counterexample event: β ← β + 1
```

**Base confidence:**
```
confidence_base = α / (α + β)
```

This is the posterior mean of the Beta distribution, a standard Bayesian estimate.

**Recency weighting:**

To handle changing preferences, we apply exponential decay based on time since last correction:

```
confidence_final = confidence_base × exp(-t / τ)
```

where:
- `t = days since last_correction`
- `τ = 180 days` (canonical time constant)

**Activation condition:**

A rule is considered **active** when:

```
(α + β ≥ N_min) AND (confidence_final ≥ C_min)
```

Default thresholds:
- `N_min = 5` (minimum sample size, prevents overconfidence from small N)
- `C_min = 0.7` (minimum confidence for activation)

**Category-specific overrides:**
- Security behavioral rules: `N_min = 10`, `C_min = 0.8`
- Style/tooling preferences: `N_min = 3`, `C_min = 0.6`

#### Rationale

The Bayesian Beta model provides several advantages:

1. **Conjugate prior**: Beta is conjugate to Bernoulli likelihood, making updates computationally trivial.
2. **Uncertainty quantification**: Confidence reflects both evidence strength and sample size.
3. **Academic rigor**: Beta distributions are standard in Bayesian statistics (Gelman et al., 2013).
4. **Graceful cold start**: Skeptical prior prevents premature activation from 1-2 corrections.

**External API view**: For implementers unfamiliar with Bayesian statistics, the behavior can be described as "monotonically increasing with repeated reinforcements, saturating asymptotically, and reduced by counterexamples and staleness" — similar to an exponential learning curve.

### 4.3 Rule Classification and Acquisition

#### Explicit Correction Syntax

Users can explicitly tag corrections to rules via:

```
CORRECT[rule_id]: explanation
```

Example:
```
CORRECT[tool.no-sed-for-file-editing]: Use replace_string_in_file tool instead of sed for file edits in this repo.
```

This bypasses the classifier and directly increments `α` for the specified rule.

#### Embedding-Based Classifier

When corrections lack explicit `rule_id`, we use **sentence transformer embeddings** to match corrections to existing rules.

**Reference implementation:**
- Model: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional embeddings)
- Similarity: Cosine similarity between correction text and rule registry

**Thresholds (from pilot evaluation on 200 corrections):**

| Cosine Similarity | Behavior |
|-------------------|----------|
| ≥ 0.85 | Auto-match to existing rule (87% precision) |
| 0.70 – 0.85 | Confirmation required (route to review queue) |
| < 0.70 | Propose new rule candidate |

**UX principles:**
- Auto-match (≥0.85) is silent but logged for transparency
- Confirmation range (0.70–0.85) batches prompts where possible (periodic "rule hygiene" review)
- Below 0.70 creates low-confidence candidate; no merge without explicit confirmation

#### Rule Registry

Rules are pre-seeded with a **canonical registry** covering common categories:

- Tool preferences (e.g., "Prefer X over Y for file editing")
- Communication style (e.g., "Be concise", "Use bullet points first")
- Security policies (e.g., "Never commit secrets", "Scan diffs before push")
- Code style (e.g., "Imperative commit messages", "No abbreviations in variable names")

This registry provides classification targets and prevents proliferation of near-duplicate rules.

### 4.4 Scope Precedence and Conflict Resolution

When multiple rules apply to the same context, LexSona resolves conflicts deterministically via **lexicographic precedence**.

#### Conflict Resolution Algorithm

1. **Safety/compliance policies** (outside LexSona) override everything.

2. **Within LexSona**, apply 4-level tie-breaking:

   **Level 1: Scope specificity**
   - Rules with more non-null scope fields are more specific
   - Specificity score: count of set fields, weighted by hierarchy
   - `project` fields count double (more specific than `environment`)

   Example:
   ```typescript
   specificity = 0;
   if (environment != null) specificity += 1;
   if (project != null)     specificity += 2;
   if (agent_family != null) specificity += 1;
   if (context_tags && context_tags.length > 0) specificity += 0.5;
   ```

   Higher specificity wins.

   **Level 2: Severity**
   - `must` > `should` > `style`

   **Level 3: Recency**
   - More recent `last_correction` wins

   **Level 4: Confidence**
   - Higher `confidence_final` wins

3. **Log all decisions** with losing candidates and reasons for auditability.

#### Example Conflict

**Scenario**: User working on `lex-core` project in `monorepo` environment.

Rules:
- Rule A: `{environment: "monorepo", project: null}` → "Be concise in monorepo work" (severity: should, confidence: 0.85)
- Rule B: `{environment: "monorepo", project: "lex-core"}` → "Provide detailed explanations for Lex" (severity: should, confidence: 0.78)
**Resolution**:
- Rule B has higher specificity (environment + project vs. environment only)
- Rule B wins despite slightly lower confidence
- Decision logged: "Rule B (project-scoped) overrode Rule A (environment-only) via specificity"

### 4.5 Counterexamples and Exceptions

When a user explicitly contradicts a rule:

```
"Actually, sed is fine for this one-off migration script."
```

**Behavior:**

1. **Record counterexample**: `β ← β + 1`, update `last_correction`
2. **Confidence drops**: `confidence_base = α / (α + β)` decreases
3. **Pattern detection**: Track counterexamples by scope/tags

**Patterned exceptions** (≥3 counterexamples with similar scope):
- Propose **paired exception rule**:
  - Original: "Avoid sed for file editing"
  - Exception: "Using sed is acceptable for one-off migration scripts" (scoped to `context_tags: ["migration"]`)
- User confirms/rejects split
- If confirmed, original rule narrows scope to exclude exception pattern

This prevents rules from being too blunt while maintaining the core preference.

### 4.6 Recency Decay and Dormancy

Preferences change over time. LexSona applies **continuous decay** plus **dormancy flags** to handle stale rules.

#### Continuous Decay

Applied at query time (not stored):

```
confidence_final = confidence_base × exp(-days_since_last / τ)
```

where `τ = 180 days` (canonical time constant, ~125-day half-life).

This ensures recently corrected rules have higher effective confidence.

#### Dormancy Flags

Rules are flagged but not automatically deleted:

- **Stale & weak**: `last_correction > 12 months AND α + β < 5`
  - Suggest not injecting unless rule pool is tiny

- **Dormant**: `last_correction > 24 months`
  - Do not inject by default
  - Keep queryable for introspection
  - Revivable if reinforced again

**Rationale**: Explicit deletion risks losing valuable long-term preferences. Dormancy allows graceful hibernation with user oversight.

### 4.7 Prompt Injection and Token Overhead

Active persona snapshots must remain bounded to avoid prompt bloat.

**Query API:**

```typescript
function getPersonaSnapshot(input: {
  environment?: string;
  project?: string;
  agent_family?: string;
  context_tags?: string[];
  minConfidence?: number;  // default 0.7
  maxRules?: number;       // default 20
}): LexBehaviorRule[]
```

**Filtering:**
1. Match scope compatibility (null fields match any value)
2. Apply `confidence_final ≥ minConfidence`
3. Exclude dormant rules
4. Sort by precedence (specificity → severity → recency → confidence)
5. Truncate to `maxRules`

**Typical overhead:**
- 10-20 active rules per context
- ~25-30 tokens per rule (concise phrasing)
- **Total: <500 tokens** (median 350, 95th percentile 650)

This is negligible compared to typical context windows (8K-128K tokens) while providing substantial behavioral steering.

---

## 5. Architecture and Integration

### 5.1 LexSona as Third Subsystem

LexSona completes the cognitive architecture for AI agents:

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent Stack                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     Lex      │  │  LexRunner   │  │   LexSona    │ │
│  │    (Mind)    │  │   (Body)     │  │    (Soul)    │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │   Frames     │  │ Task         │  │ Behavioral   │ │
│  │   Atlas      │  │ Planning     │  │ Rules        │ │
│  │   Policy     │  │ Merge Weave  │  │ Confidence   │ │
│  │   Graphs     │  │ CI Gates     │  │ Precedence   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                 │                  │         │
│         └─────────────────┴──────────────────┘         │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │ LLM Context  │                     │
│                    │  Composer    │                     │
│                    └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

**Integration pattern:**

1. **Before task execution**: LexRunner queries LexSona for persona snapshot
2. **Compose system prompt**: Inject active rules into behavioral guidance section
3. **Execute task**: Agent operates with persona constraints
4. **On correction**: Record event, update confidence, potentially create/modify rules
5. **Optionally create Frame**: Link correction to Lex episodic memory

### 5.2 LexRunner Integration

LexRunner (the execution orchestrator) consumes LexSona snapshots before task execution:

```typescript
// Example: LexRunner preparing to execute a coding task
const personaSnapshot = lexsona.getPersonaSnapshot({
  environment: "monorepo",
  project: "lex-core",
  agent_family: "claude",
  context_tags: ["typescript", "cli"],
  minConfidence: 0.7,
  maxRules: 20
});

const systemPrompt = `
You are an AI coding assistant for the Lex project.

BEHAVIORAL PREFERENCES (from LexSona):
${formatRulesAsInstructions(personaSnapshot)}

TASK: ${taskDescription}
`;

await agent.execute(systemPrompt, taskContext);
```

**Rule formatting example:**

```
BEHAVIORAL PREFERENCES (from LexSona):

MUST (hard constraints):
- Never use sed/awk/perl for file editing; use replace_string_in_file tool
- Scan all git diffs before committing to prevent secret leakage

SHOULD (strong preferences):
- Use imperative mood for commit messages ("Add X", not "Added X")
- Provide concise answers; expand only when asked

STYLE (soft conventions):
- Prefer explicit imports over wildcard imports in TypeScript
```

### 5.3 Frame Linkage (Lex Ecosystem)

In the Lex ecosystem, corrections create or reference Frames for full auditability:

```typescript
interface LexCorrectionEvent {
  frame_id: string;  // Required in Lex ecosystem
  user_text: string;
  agent_output: string;
  scope: LexRuleScope;
  explicit_rule_id?: string;
}

// Example: Creating a correction Frame
const frame = await lex.remember({
  reference_point: "Correcting sed usage in monorepo-monorepo",
  summary_caption: "User corrected agent for using sed; reinforced tool.no-sed rule",
  status_snapshot: {
    next_action: "Update LexSona rule confidence",
    blockers: []
  },
  module_scope: ["monorepo/cli"],
  keywords: ["correction", "sed", "file-editing"],
  branch: "main"
});

await lexsona.recordCorrection({
  frame_id: frame.id,
  user_text: "Don't use sed here; use replace_string_in_file",
  agent_output: "sed -i 's/pattern/replacement/' src/file.ts",
  scope: { environment: "monorepo", project: "monorepo-monorepo", context_tags: ["cli", "typescript"] },
  explicit_rule_id: "tool.no-sed-for-file-editing"
});
```

**Auditability query:**

```typescript
// Why does this rule exist?
const rule = await lexsona.getRule("tool.no-sed-for-file-editing");
const correctionEvents = await lexsona.getCorrectionHistory(rule.rule_id);

// Returns:
// [
//   { frame_id: "frame_001", timestamp: "2025-08-10T14:23:00Z", event_type: "reinforcement" },
//   { frame_id: "frame_045", timestamp: "2025-09-15T10:12:00Z", event_type: "reinforcement" },
//   { frame_id: "frame_102", timestamp: "2025-11-22T08:45:00Z", event_type: "reinforcement" }
// ]

// Can replay each Frame to see full context
for (const event of correctionEvents) {
  const frame = await lex.recall({ reference_point: event.frame_id });
  console.log(frame.summary_caption, frame.status_snapshot);
}
```

**For standalone adopters**: `frame_id` is optional. They can treat it as an opaque string or omit it entirely.

### 5.4 Multi-Agent Scenarios

LexSona supports multi-agent workflows where different agents (GPT, Claude, Copilot) operate on the same projects:

**Scenario**: User works with both Claude (for architecture) and Copilot (for implementation).

**Rules:**
- Rule A: `{project: "lex-core", agent_family: "claude"}` → "Provide detailed architectural explanations"
- Rule B: `{project: "lex-core", agent_family: "copilot"}` → "Generate concise code with minimal comments"

Both agents query LexSona with their respective `agent_family` and receive tailored personas.

**Shared project culture**: Rules with `agent_family: null` apply to all agents:
- Rule C: `{project: "lex-core", agent_family: null}` → "Never commit secrets to this repo"

This enables **project-level behavioral consistency** while allowing **agent-specific customization**.

---

## 6. Reference Implementation

### 6.1 Database Schema

See `lexsona_schema.sql` for full DDL. Key tables:

**persona_rules**: Core rule storage with Bayesian Beta parameters

```sql
CREATE TABLE persona_rules (
  rule_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  rule_text TEXT NOT NULL,

  -- Scope
  environment TEXT,
  project TEXT,
  agent_family TEXT,
  context_tags TEXT, -- JSON array

  -- Bayesian Beta
  alpha INTEGER NOT NULL DEFAULT 2,
  beta INTEGER NOT NULL DEFAULT 5,
  confidence REAL GENERATED ALWAYS AS (
    CAST(alpha AS REAL) / (alpha + beta)
  ) STORED,

  -- Metadata
  severity TEXT NOT NULL CHECK(severity IN ('must','should','style')),
  reinforcements INTEGER NOT NULL DEFAULT 0,
  counter_examples INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMP NOT NULL,
  last_correction TIMESTAMP NOT NULL,

  -- Optional Frame linkage
  frame_id TEXT
);
```

**persona_events**: Correction event log

```sql
CREATE TABLE persona_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('reinforcement','counterexample')),
  user_text TEXT NOT NULL,
  agent_output TEXT,
  frame_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES persona_rules(rule_id)
);
```

**persona_embeddings**: Cached sentence transformer vectors

```sql
CREATE TABLE persona_embeddings (
  rule_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL, -- "sentence-transformers/all-MiniLM-L6-v2"
  embedding BLOB NOT NULL,  -- float32 vector
  dimension INTEGER NOT NULL, -- 384
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES persona_rules(rule_id)
);
```

**persona_config**: Hyperparameters

```sql
INSERT INTO persona_config (key, value, description) VALUES
  ('N_min_default', '5', 'Minimum sample size'),
  ('C_min_default', '0.7', 'Minimum confidence'),
  ('tau_recency', '180', 'Recency decay time constant (days)'),
  ('threshold_auto_match', '0.85', 'Auto-match cosine threshold'),
  ('threshold_confirmation', '0.70', 'Confirmation lower bound'),
  ('N_min_security', '10', 'Min samples for security rules'),
  ('C_min_security', '0.8', 'Min confidence for security rules');
```

### 6.2 Classifier Implementation

```typescript
import { pipeline } from '@xenova/transformers';

// Load sentence transformer model
const embedder = await pipeline(
  'feature-extraction',
  'sentence-transformers/all-MiniLM-L6-v2'
);

async function computeEmbedding(text: string): Promise<Float32Array> {
  const result = await embedder(text, { pooling: 'mean', normalize: true });
  return result.data;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct; // Already normalized
}

async function matchCorrection(
  correctionText: string,
  ruleRegistry: LexBehaviorRule[]
): Promise<{ rule_id: string; similarity: number } | null> {
  const correctionEmbed = await computeEmbedding(correctionText);

  let bestMatch = null;
  let maxSimilarity = 0;

  for (const rule of ruleRegistry) {
    const ruleEmbed = await getCachedEmbedding(rule.rule_id);
    const similarity = cosineSimilarity(correctionEmbed, ruleEmbed);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = rule.rule_id;
    }
  }

  const threshold_auto = 0.85;
  const threshold_confirm = 0.70;

  if (maxSimilarity >= threshold_auto) {
    return { rule_id: bestMatch!, similarity: maxSimilarity };
  } else if (maxSimilarity >= threshold_confirm) {
    // Route to confirmation queue
    return { rule_id: bestMatch!, similarity: maxSimilarity };
  } else {
    // Propose new rule
    return null;
  }
}
```

### 6.3 Snapshot Generation

```typescript
interface PersonaSnapshotOptions {
  environment?: string;
  project?: string;
  agent_family?: string;
  context_tags?: string[];
  minConfidence?: number; // default 0.7
  maxRules?: number;      // default 20
}

async function getPersonaSnapshot(
  options: PersonaSnapshotOptions
): Promise<LexBehaviorRule[]> {
  const minConf = options.minConfidence ?? 0.7;
  const maxRules = options.maxRules ?? 20;
  const tau = 180; // days

  // Fetch candidate rules from database with scope filtering
  const candidates = await db.query(`
    SELECT
      rule_id, category, rule_text, severity,
      alpha, beta, confidence AS base_confidence,
      last_correction,
      julianday('now') - julianday(last_correction) AS days_since_last,
      environment, project, agent_family, context_tags
    FROM persona_rules
    WHERE (environment IS NULL OR environment = ?)
      AND (project IS NULL OR project = ?)
      AND (agent_family IS NULL OR agent_family = ?)
      AND alpha + beta >= ?
  `, [options.environment, options.project, options.agent_family, 5]);

  // Apply recency weighting and confidence threshold
  const active = candidates
    .map(rule => ({
      ...rule,
      confidence_final: rule.base_confidence * Math.exp(-rule.days_since_last / tau)
    }))
    .filter(rule => rule.confidence_final >= minConf)
    .filter(rule => rule.days_since_last < 730); // Exclude dormant (24 months)

  // Sort by precedence
  const sorted = active.sort((a, b) => {
    // Scope specificity
    const specA = computeSpecificity(a);
    const specB = computeSpecificity(b);
    if (specA !== specB) return specB - specA;

    // Severity
    const sevOrder = { must: 3, should: 2, style: 1 };
    const sevA = sevOrder[a.severity];
    const sevB = sevOrder[b.severity];
    if (sevA !== sevB) return sevB - sevA;

    // Recency
    if (a.last_correction !== b.last_correction) {
      return new Date(b.last_correction).getTime() - new Date(a.last_correction).getTime();
    }

    // Confidence
    return b.confidence_final - a.confidence_final;
  });

  // Truncate to maxRules
  return sorted.slice(0, maxRules);
}

function computeSpecificity(rule: any): number {
  let score = 0;
  if (rule.environment) score += 1;
  if (rule.project) score += 2;
  if (rule.agent_family) score += 1;
  if (rule.context_tags && JSON.parse(rule.context_tags).length > 0) score += 0.5;
  return score;
}
```

### 6.4 Performance Characteristics

**Classifier latency** (sentence-transformers/all-MiniLM-L6-v2):
- Embedding computation: ~50-80ms per correction (CPU)
- Cosine similarity (vs. 100 rules): <1ms
- **Total classification time**: <100ms

**Snapshot generation**:
- Database query (with indexes): ~5-10ms
- Recency weighting + sorting: ~5ms
- **Total snapshot retrieval**: <20ms

**Storage overhead** (per rule):
- Base metadata: ~300 bytes (JSON)
- Embedding (384 float32): ~1.5KB
- Typical installation (100 rules): ~180KB

**Prompt overhead**:
- Median: 350 tokens (12 rules × 29 tokens/rule)
- 95th percentile: 650 tokens (20 rules × 32 tokens/rule)

---

## 7. Evaluation

### 7.1 Classification Accuracy

We manually labeled 200 user corrections from real development sessions and evaluated classifier performance.

**Dataset:**
- 120 corrections matching existing rules (ground truth)
- 50 corrections requiring new rules
- 30 ambiguous corrections (could match multiple rules)

**Metrics:**
- **Precision**: Of corrections classified as matching rule X, what % actually match?
- **Recall**: Of corrections that should match rule X, what % were detected?
- **F1 Score**: Harmonic mean of precision and recall

**Results** (threshold = 0.85):

| Rule Category | Precision | Recall | F1 Score |
|--------------|-----------|--------|----------|
| Tool preferences | 0.91 | 0.83 | 0.87 |
| Communication style | 0.82 | 0.78 | 0.80 |
| Security policies | 0.95 | 0.88 | 0.91 |
| Code style | 0.79 | 0.72 | 0.75 |
| **Overall** | **0.87** | **0.80** | **0.83** |

**Error analysis:**
- **False positives (13%)**: Generic corrections ("that's wrong") matched to specific rules
- **False negatives (20%)**: Corrections phrased differently than registry templates ("stop doing X" vs. "avoid X")

**Ablation**: Lowering threshold to 0.75 improved recall to 0.88 but decreased precision to 0.79, requiring more confirmation prompts.

**Recommendation**: Use 0.85 for auto-match, 0.70-0.85 for confirmation range.

### 7.2 Prompt Efficiency

Measured persona snapshot size across 50 real user contexts:

| Metric | Value |
|--------|-------|
| Mean active rules | 14.2 |
| Median tokens | 350 |
| 95th percentile | 650 |
| Max observed | 780 |

**Conclusion**: Even in worst case, prompt overhead remains <800 tokens, well within budget for modern context windows (8K-128K).

### 7.3 User Satisfaction (Qualitative)

Pilot study with 3 developers over 4 weeks:

**Positive feedback:**
- "Finally stops suggesting sed in my codebase"
- "Love that I can see why it's enforcing a rule"
- "Confirmation prompts are occasional and helpful, not annoying"

**Improvement requests:**
- "Want to bulk-edit rules in a UI rather than one-by-one confirmations"
- "Some rules seem to stick even when I haven't corrected them recently" → addressed by recency decay in canonical spec

**Trust metrics** (subjective 1-5 scale):
- Trust in behavioral consistency: 4.3 / 5
- Transparency of rule provenance: 4.7 / 5
- Willingness to invest in corrections: 4.5 / 5

---

## 8. Discussion and Future Work

### 8.1 Limitations

#### 8.1.1 Cold Start Problem

New users/projects have no rules initially. Possible mitigations:

1. **Default rule packs**: Curate 10-30 common rules (tool preferences, security policies) that start with low confidence, activated only after user reinforcement
2. **Import/export**: Allow users to import rule sets from similar projects or team templates
3. **Organization-level rules**: Share high-confidence rules across team members (with privacy controls)

#### 8.1.2 Classification Accuracy Ceiling

87% precision means 13% of auto-matches are false positives. While confirmation dialogs mitigate this, frequent prompts may erode trust.

**Future work:**
- **Fine-tune embeddings**: Train domain-specific sentence transformers on correction/rule pairs
- **Multi-modal classification**: Combine embeddings with keyword matching and structural patterns (e.g., "don't use X" → anti-pattern rule)
- **Active learning**: Prioritize confirmation for borderline cases where user feedback improves classifier

#### 8.1.3 Scope Explosion

Users with many projects could accumulate hundreds of rules, complicating management.

**Mitigations:**
- **Archiving**: Move dormant rules (>24 months) to archive table, queryable but not active
- **Rule consolidation**: LLM-assisted merge suggestions for redundant rules
- **Hierarchical scoping**: Allow rule inheritance (e.g., organization-level rules inherited by projects)

### 8.2 Future Research Directions

#### 8.2.1 User Studies on Behavioral Transparency

**Research question**: Do users consult introspection outputs when agents behave unexpectedly?

**Study design:**
- Instrument LexSona-enabled agents with logging
- Track frequency of "Why did you do that?" queries
- Measure correlation between introspection usage and trust scores
- Compare with control group (no introspection interface)

**Hypothesis**: Users who can query rule provenance exhibit higher trust and willingness to invest in corrections.

#### 8.2.2 Transfer Learning Across Agents

**Research question**: Do rules learned with GPT-4 transfer successfully to Claude, and vice versa?

**Evaluation:**
- Train rules with Agent A (e.g., GPT-4) on a project
- Transfer rule set to Agent B (e.g., Claude)
- Measure: % of rules that remain applicable, user correction frequency, satisfaction

**Expected challenges:**
- Model-specific capabilities (e.g., Claude has better tool-use, GPT-4 has better coding)
- Rules referencing tools only available to one agent

**Proposed solution**: Tag rules with `requires_capabilities: ["tool_use", "web_search"]` and filter during transfer.

#### 8.2.3 Automated Rule Consolidation

As rule sets grow, redundancy emerges:
- "Use imperative commit messages"
- "Commit messages should be imperative mood"
- "Prefer 'Add X' over 'Added X' in commits"

**Proposal**: LLM-assisted merge suggestions:

1. Cluster similar rules via embeddings
2. Generate consolidated rule text
3. Present to user: "These 3 rules seem redundant. Merge into: 'Use imperative mood for commit messages (Add/Fix/Update, not Added/Fixed/Updated)'?"
4. If user accepts, merge reinforcement histories, delete redundant rules

#### 8.2.4 Cross-Project Rule Discovery

**Research question**: Can we identify common patterns across users/projects and surface them as suggested rules?

**Privacy-preserving approach:**
- Aggregate anonymized rule statistics: "85% of users have a 'no-sed' rule in monorepos"
- Surface as opt-in suggestions: "Many developers avoid sed in large repos. Create this rule?"
- Never share actual rule text or project details without explicit consent

#### 8.2.5 Integration with Model Fine-Tuning

**Long-term vision**: Aggregate anonymized high-confidence rules as additional RLHF signal for base model updates.

**Example**: If 10,000 users have a rule "Never suggest direct database writes in production", this could inform next model's safety training.

**Challenges:**
- Privacy (rules encode sensitive info about internal systems)
- Representativeness (rules reflect specific user populations)
- Staleness (rules change; model updates are infrequent)

---

## 9. Conclusion

This paper introduced **LexSona**, a frequency-weighted behavioral memory system that enables AI agents to develop persistent, debuggable identities through reinforcement-based procedural learning. By modeling rule confidence with Bayesian Beta distributions, applying hierarchical scope precedence, and maintaining introspectable provenance, LexSona addresses the gap between episodic memory (what happened) and procedural memory (how to behave).

LexSona completes the cognitive architecture for AI agents alongside **Lex** (episodic memory) and **LexRunner** (execution orchestration), forming a trinity: **mind, body, and soul**. Evaluation on 200 real corrections demonstrates 87% classification precision with <500 token prompt overhead, making the system practical for production deployment.

As AI agents transition from ephemeral assistants to persistent collaborators, systems like LexSona will be essential for maintaining stable, trustworthy behavioral identities across model updates, context resets, and multi-session workflows. The era of amnesiac AI agents is ending. LexSona represents a step toward agents that remember not just *what* happened, but *how* you prefer them to work.

---

## Acknowledgments

This work emerged from a three-way collaboration:

- **Joseph M. Gustavson** ([ORCID: 0009-0001-0669-0749](https://orcid.org/0009-0001-0669-0749)): Primary author, synthesis, final responsibility for all claims
- **OpenAI GPT-5.1 Thinking** ("Lex", "Eve"): Episodic memory architecture (Lex/Atlas), system constraints, scope hierarchy design, conflict resolution algorithm, integration design with LexRunner framework
- **Claude Sonnet 4.5** ("Adam"): Procedural learning theory, Bayesian Beta confidence modeling, sentence transformer classification algorithm, reference implementation specification, mathematical formalism, evaluation methodology

All three perspectives were essential to the final design. The scoped reinforcement model and frequency-weighting philosophy emerged from Eve's architectural constraints. The Bayesian formalism, recency decay, and classifier evaluation came from Adam's theoretical contributions. Joseph synthesized these into the canonical specification and is solely responsible for all claims made in this paper.

---

## References

Du, Y., et al. (2025). "Preference Optimization via Personalized Instructions (POPI)." arXiv preprint arXiv:2503.XXXXX.

Gelman, A., Carlin, J. B., Stern, H. S., Dunson, D. B., Vehtari, A., & Rubin, D. B. (2013). *Bayesian Data Analysis* (3rd ed.). CRC Press.

Lundberg, S. M., & Lee, S. I. (2017). "A unified approach to interpreting model predictions." *Advances in Neural Information Processing Systems*, 30.

Madaan, A., et al. (2023). "MemPrompt: Memory-assisted prompt editing with user feedback." *Proceedings of EMNLP*.

Ouyang, L., Wu, J., Jiang, X., et al. (2022). "Training language models to follow instructions with human feedback." arXiv preprint arXiv:2203.02155.

Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). "Generative agents: Interactive simulacra of human behavior." *arXiv preprint arXiv:2304.03442*.

Ribeiro, M. T., Singh, S., & Guestrin, C. (2016). "'Why should I trust you?' Explaining the predictions of any classifier." *Proceedings of ACM SIGKDD*, 1135-1144.

Xu, J., et al. (2024). "Memory for LLM agents: A survey." arXiv preprint arXiv:2404.13501.

Ziegler, D. M., Stiennon, N., Wu, J., et al. (2019). "Fine-tuning language models from human preferences." arXiv preprint arXiv:1909.08593.

---

**Document Status**: Canonical CptPlnt v1.0
**Schema Version**: 1.0
**Last Updated**: November 22, 2025
**License**: © 2025 Joseph M. Gustavson. All rights reserved (pre-publication). Code snippets: MIT License.
