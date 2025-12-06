# ADR: Lex Local Testing

> **Status:** Proposed (Stashed — post-LexSona 0.x)
> **Last Updated:** 2025-12-06
> **Context:** Updated after LexSona 0.1.0 release-candidate pass

---

## Context

Lex's positioning and internal roadmap rely on the claim that disciplined, policy-aware agent behavior delivers value **independent of where a model runs** (local, hybrid, or cloud). However, we have not yet validated any part of Lex's behavioral/constraints story against a local model in a repeatable way.

### Developer Environment

The practical developer environment for first-party dogfooding is:

- Windows 11 host
- WSL2 Ubuntu default dev platform
- VS Code as primary IDE
- GitHub Copilot Chat for cloud workflows
- Desire to select/use a self-hosted local model inside VS Code

### Local Model Runtime Landscape

VS Code supports multi-model chat selection via the AI Toolkit extension, which includes local models and supports Ollama/ONNX backends.

Local model runtimes expose OpenAI-compatible HTTP APIs:

| Runtime | Default Endpoint | Notes |
|---------|-----------------|-------|
| Ollama | `http://localhost:11434/v1` | WSL2-native, partial OpenAI compat |
| LM Studio | `http://localhost:1234/v1` | Windows-native UI, full compat |
| vLLM | configurable | Advanced GPU scenarios |

### Critical Context from LexSona 0.1.0 RC Pass

The LexSona 0.1.0 release-candidate validation confirmed:

1. **Cross-repo interface is stable:**
   - Lex exports match LexSona imports exactly
   - Socket: `getRules`, `recordCorrection`, `BehaviorRule`, `BehaviorRuleWithConfidence`, `RuleScope`, `RuleContext`, `Correction`, `GetRulesOptions`, `RuleSeverity`, `LEXSONA_DEFAULTS`

2. **Disconnected mode works:**
   - Persona loading works without a Lex DB
   - Constraint derivation works without a Lex DB
   - LexSona degrades gracefully when no DB exists

3. **Public API surface is locked:**
   - LexSona main exports are small and intentional
   - CLI flags use correct terminology: `--domain`, `--module`, `--task`

4. **MCP adapter has no execution patterns:**
   - No `exec`, `spawn`, `fork` in LexSona MCP server
   - Only constraint/memory semantics exposed

**Key implication:** Local testing MUST NOT require a Lex database for first-stage proofs. Disconnected mode is first-class.

### Scope Discipline

To avoid repeating prior scope creep patterns, Lex should not absorb persona execution or orchestration logic under the guise of local testing. Local testing validates that Lex's memory/policy/constraints foundation remains useful even when the model is weaker or self-hosted.

---

## Decision

We will implement a **local testing architecture for Lex** based on an **OpenAI-compatible model abstraction** and a **small, repeatable evaluation harness**.

Key points:

1. **Lex will treat local models as an OpenAI-compatible endpoint** rather than integrating a single vendor SDK directly.

2. The default local backend for dogfooding will be **Ollama** (WSL2-friendly), with optional support for LM Studio and vLLM through the same interface.

3. We will document a workflow where **VS Code + AI Toolkit** allows the developer to select local models in chat, keeping the IDE experience aligned with the product narrative.

4. The goal of local testing is **not** to prove "LexRunner-grade autonomy locally." The goal is to prove that **constraints and policy improve behavior** on weaker models.

5. **Stage 1 does not require a Lex database.** Disconnected mode is first-class.

---

## Options Considered

### Option A: Direct Ollama SDK integration inside Lex

**Pros:**
- Quick initial integration
- Simple for first-party usage

**Cons:**
- Couples Lex to a single runtime
- Encourages future "just add one more Ollama feature" scope drift
- Harder to generalize to other local runtimes

### Option B: OpenAI-compatible HTTP abstraction (Chosen)

**Pros:**
- Swappable local and cloud backends
- Aligns with Ollama and LM Studio compatibility paths
- Keeps Lex behavior testing focused on contracts rather than vendor plumbing

**Cons:**
- Feature mismatch risk (some local servers may lag specific OpenAI endpoints)
- Requires careful error messaging and fallback behavior

### Option C: Rely solely on VS Code AI Toolkit for local validation

**Pros:**
- Minimal code changes in Lex
- Great developer UX

**Cons:**
- Not sufficient for CI-adjacent, repo-owned test evidence
- Makes product claims harder to back with Lex-native artifacts

---

## Detailed Design

### 1. Provider Interface

Introduce a small provider module in Lex:

```typescript
interface OpenAICompatibleProvider {
  baseUrl: string;
  apiKey: string;  // dummy accepted for some local servers
  model: string;
  timeoutMs: number;
  supportsEmbeddings: boolean;  // capability flag
}
```

Configured via environment variables:

| Variable | Purpose |
|----------|---------|
| `LEX_LLM_BASE_URL` | Model server endpoint |
| `LEX_LLM_API_KEY` | API key (can be dummy for local) |
| `LEX_LLM_MODEL` | Model identifier |

Default behavior:
- If `LEX_LLM_BASE_URL` is defined, Lex uses it
- Otherwise, Lex uses current default remote provider logic

**Location:** `src/shared/llm/provider.ts` (dev-only, not exported in public API)

### 2. Local Test Commands

Add CLI commands under `lex local:*` namespace:

#### `lex local:doctor`

Validates model server reachability:
- Calls `/v1/models` endpoint
- Calls minimal chat completion
- Reports green/red with clear error messages

#### `lex local:smoke`

Runs a tiny fixed prompt set covering:
- Policy recall
- Constraint summarization
- Refusal of out-of-scope changes

### 3. Minimal Evaluation Harness

A lightweight A/B harness:

| Component | Description |
|-----------|-------------|
| Dataset | 10-20 short prompts |
| Mode A | No constraints |
| Mode B | Baseline constraints injected |
| Output | JSON report with pass/fail tags |

**Baseline constraints source:** Static file (`canon/constraints/baseline.yaml`), NOT database-derived rules. This enables disconnected mode.

---

## Developer Workflow (Windows 11 + WSL2)

### Recommended: Ollama in WSL2

```bash
# 1. Install Ollama in WSL2
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model
ollama pull qwen2.5-coder:7b

# 3. Configure Lex
export LEX_LLM_BASE_URL="http://localhost:11434/v1"
export LEX_LLM_API_KEY="ollama"
export LEX_LLM_MODEL="qwen2.5-coder:7b"

# 4. Validate
lex local:doctor
lex local:smoke
```

### Alternative: LM Studio on Windows Host

```bash
export LEX_LLM_BASE_URL="http://localhost:1234/v1"
export LEX_LLM_API_KEY="lm-studio"
export LEX_LLM_MODEL="your-model-name"

lex local:doctor
```

### VS Code + AI Toolkit

Install:
- GitHub Copilot
- GitHub Copilot Chat
- AI Toolkit

The AI Toolkit model catalog includes local models (Ollama/ONNX) and supports using those models with Copilot's model picker.

---

## Consequences

### Positive

- Validates the "disciplined agent value" claim across compute venues
- Gives concrete, repo-owned evidence for founder conversations
- Reduces risk of Lex becoming vendor-specific
- Reinforces three-layer architecture discipline

### Negative

- Some local runtimes may not fully match every OpenAI endpoint
- Additional docs and small maintenance burden for harness
- Prompt dataset requires curation to avoid LexRunner overlap

---

## Security and Privacy

Local testing reduces data exfiltration risk by keeping prompts and code context on-device. This supports the broader strategy of local-first, cloud-optional workflows without forcing a single deployment model.

---

## Rollout Plan

| Stage | Deliverables | DB Required |
|-------|--------------|-------------|
| 1 | Provider abstraction, `local:doctor`, `local:smoke`, docs | **No** |
| 2 | A/B harness, JSON report, founder evidence | **No** |
| 3 | LexSona integration (optional) | Yes |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to green `local:doctor` | < 5 minutes |
| Smoke test pass rate on 7B model | > 80% |
| A/B improvement signal | Measurable delta |
| Local testing as pre-release gate | Manual gate adopted |

---

## Non-Goals

- Turning Lex into a full local orchestration engine
- Proving full LexRunner autonomy on local models
- Shipping a production-grade local model manager inside Lex
- Adding persona execution to Lex
- Requiring a Lex DB for Stage 1-2

---

## Open Questions

1. Which 10-20 prompts best represent "Lex discipline" without drifting into LexRunner behaviors?
2. Do we want a small published "Lex Local Baseline" model recommendation list, or keep it informal?
3. Should the harness support custom prompt datasets for domain-specific validation?

---

## References

- [Ollama OpenAI Compatibility](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI Compat Endpoints](https://lmstudio.ai/docs/developer/openai-compat)
- [vLLM OpenAI-Compatible Server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/)
- [VS Code AI Toolkit](https://code.visualstudio.com/docs/intelligentapps/overview)
- [VS Code AI Language Models](https://code.visualstudio.com/docs/copilot/customization/language-models)
