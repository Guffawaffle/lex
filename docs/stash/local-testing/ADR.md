# ADR: Lex Local Testing

> **Status:** Proposed (Stashed until post-LexSona 0.x)
> **Last Updated:** 2025-12-06
> **Context:** Updated after LexSona 0.1.0 release-candidate pass

## Status

Proposed

## Context

Lex's positioning and internal roadmap increasingly rely on the claim that disciplined, policy-aware agent behavior can deliver value independent of where a model runs (local, hybrid, or cloud). However, we have not yet validated any part of Lex's behavioral/constraints story against a local model in a repeatable way.

### Practical Developer Environment

The practical developer environment for first-party dogfooding is:

* Windows 11 host
* WSL2 Ubuntu default dev platform
* VS Code as primary IDE
* Preference to use GitHub Copilot Chat when possible
* Desire to select/use a self-hosted local model inside VS Code

VS Code supports multi-model chat selection and can be extended with additional providers. Installing the AI Toolkit adds access to a model catalog that includes local models and supports local backends such as ONNX and Ollama.

### Local Model Runtime Landscape

Local model runtimes increasingly expose OpenAI-compatible HTTP APIs:

* **Ollama** provides partial OpenAI API compatibility, allowing existing OpenAI clients to point at `http://localhost:11434/v1`.
* **LM Studio** exposes OpenAI-compatible endpoints and supports switching clients by changing the base URL (default `http://localhost:1234/v1`).
* **vLLM** provides an OpenAI-compatible server for more advanced self-hosted/GPU scenarios.

### Disconnected Mode Reality (Fresh from LexSona 0.1.0 Pass)

The LexSona 0.1.0 release-candidate pass confirmed several key architectural facts:

1. **LexSona works in disconnected mode** — Persona loading and constraint derivation work without a Lex DB.
2. **Graceful degradation** — LexSona degrades gracefully when no Lex DB exists.
3. **Socket is stable** — Lex exports and LexSona imports match exactly for: `getRules`, `recordCorrection`, `BehaviorRule`, `BehaviorRuleWithConfidence`, `RuleScope`, `RuleContext`, `Correction`, `GetRulesOptions`, `RuleSeverity`, `LEXSONA_DEFAULTS`.

**Implication:** Local testing must support **disconnected mode as a first-class scenario**. A Lex DB is not required for Stage 0/Stage 1 proofs. This is not a fallback hack; it is valid behavior.

### Boundary Discipline

To avoid repeating prior scope creep patterns, Lex should not absorb persona execution or orchestration logic under the guise of local testing. Local testing should validate that Lex's memory/policy/constraints foundation remains useful even when the model is weaker or self-hosted.

The LexSona 0.1.0 MCP adapter risk check confirmed:
- No execution patterns (`exec`, `spawn`, `fork`) in LexSona
- Only 5 tools, all constraint/memory semantics
- No orchestration or tool-calling

**Implication:** The local testing plan must preserve this boundary discipline. Do not allow "local testing" to become a backdoor for tool-execution capability inside LexSona or Lex.

## Decision

We will implement a **local testing architecture for Lex** based on an **OpenAI-compatible model abstraction** and a **small, repeatable evaluation harness**.

Key points:

1. **Lex will treat local models as an OpenAI-compatible endpoint** rather than integrating a single vendor SDK directly.
2. The default local backend for dogfooding will be **Ollama** (WSL2-friendly), with optional support for LM Studio and vLLM through the same interface.
3. We will document and support a workflow where **VS Code + AI Toolkit** allows the developer to select local models in chat, keeping the IDE experience aligned with the product narrative.
4. The goal of local testing is **not** to prove "LexRunner-grade autonomy locally." The goal is to prove that **constraints and policy improve behavior** on weaker models.
5. **Local testing will support disconnected mode** as a first-class scenario. A Lex DB is not required for first-stage proofs.

## Options Considered

### Option A: Direct Ollama SDK integration inside Lex

**Pros**
* Quick initial integration
* Simple for first-party usage

**Cons**
* Couples Lex to a single runtime
* Encourages future "just add one more Ollama feature" scope drift
* Harder to generalize to other local runtimes

### Option B: OpenAI-compatible HTTP abstraction (Chosen)

**Pros**
* Swappable local and cloud backends
* Aligns with Ollama and LM Studio compatibility paths
* Keeps Lex behavior testing focused on contracts rather than vendor plumbing

**Cons**
* Feature mismatch risk (some local servers may lag specific OpenAI endpoints)
* Requires careful error messaging and fallback behavior

### Option C: Rely solely on VS Code AI Toolkit for local validation

**Pros**
* Minimal code changes in Lex
* Great developer UX

**Cons**
* Not sufficient for CI-adjacent, repo-owned test evidence
* Makes product claims harder to back with Lex-native artifacts

## Detailed Design

### 1. Provider Interface

Introduce a small provider module in Lex:

* `OpenAICompatibleProvider`
  * `baseUrl`
  * `apiKey` (dummy accepted for some local servers)
  * `model`
  * `timeoutMs`
  * `supportsEmbeddings` (boolean capability flag)

Configured via environment variables:

* `LEX_LLM_BASE_URL`
* `LEX_LLM_API_KEY`
* `LEX_LLM_MODEL`

Default behavior:

* If `LEX_LLM_BASE_URL` is defined, Lex uses it.
* Otherwise, Lex uses the current default remote provider logic.

This mirrors how local servers expect integration: point an OpenAI client at a local base URL.

### 2. Disconnected Mode Support

Local testing must support disconnected mode as a first-class scenario:

* **No Lex DB required** for Stage 0 and Stage 1 proofs
* Baseline constraints can be loaded from static files (e.g., `canon/constraints/baseline.yaml`)
* The harness validates constraint adherence without requiring Frame storage or behavioral rule lookup

This aligns with LexSona's proven behavior: constraint derivation works without a database.

### 3. Local Test Commands

Add:

* `lex local:doctor`
  * Validates that a model server is reachable
  * Calls `/v1/models` and a minimal chat request
  * Does not require a Lex DB

* `lex local:smoke`
  * Runs a tiny fixed prompt set covering:
    * policy recall
    * constraint summarization
    * refusal of out-of-scope changes
  * Works in disconnected mode

### 4. Minimal Evaluation Harness

Add a lightweight A/B harness:

* Dataset: 10-20 short prompts
* Two modes:
  * **No constraints**
  * **Baseline constraints injected**
* Output: JSON report with simple scoring (pass/fail tags)

This will allow you to say:

> "Even on local models, baseline constraints reduce drift."

…and actually have receipts.

## Developer Workflow (Windows 11 + WSL2)

### Recommended baseline: Ollama in WSL2

1. Install and run Ollama in WSL2.
2. Pull a small coder-capable model.
3. Ensure the API is reachable at `http://localhost:11434/v1`

Set:

```bash
export LEX_LLM_BASE_URL="http://localhost:11434/v1"
export LEX_LLM_API_KEY="ollama"
export LEX_LLM_MODEL="qwen2.5-coder:7b"  # example
```

Run:

```bash
lex local:doctor
lex local:smoke
```

### Optional: LM Studio on Windows host

If you prefer a Windows-native UI and serve from LM Studio, point Lex at:

* `http://localhost:1234/v1` (default)

### VS Code + Copilot Chat Alignment

Install:

* GitHub Copilot
* GitHub Copilot Chat
* AI Toolkit

The AI Toolkit model catalog includes local models (Ollama/ONNX) and supports using those models with Copilot's model picker.

This keeps your day-to-day dev narrative consistent with the product narrative.

## Consequences

### Positive

* Validates the "disciplined agent value" claim across compute venues
* Gives you concrete, repo-owned evidence to reference in founder conversations
* Reduces the risk of Lex becoming vendor-specific
* Proves discipline is model-agnostic; local-first is a delivery advantage

### Negative

* Some local runtimes may not fully match every OpenAI endpoint
* Additional docs and small maintenance burden for the harness

## Security and Privacy

Local testing reduces data exfiltration risk by keeping prompts and code context on-device. This supports the broader strategy of local-first, cloud-optional workflows without forcing a single deployment model.

## Success Metrics

* A developer can run `lex local:doctor` and get a green result in <5 minutes
* **A developer can run local tests without provisioning a Lex DB**
* **Baseline constraints improve adherence in disconnected mode**
* The A/B harness shows measurable improvement in constraint adherence on at least one local model family
* Local testing becomes a standard pre-release dogfood check (manual gate)

## Non-Goals

* Turning Lex into a full local orchestration engine
* Proving full LexRunner autonomy on local models
* Shipping a production-grade local model manager inside Lex
* **Local testing will not add new persona/mode runtime features to Lex**
* Expanding Lex 2.0.0 beyond AX improvements from natural dogfooding
* Introducing new public API surface beyond minimal provider abstraction

## Open Questions

* Which 10-20 prompts best represent "Lex discipline" without drifting into LexRunner behaviors?
* Do we want a small published "Lex Local Baseline" model recommendation list, or keep it informal to avoid overpromising?

## References

* [AI language models in VS Code](https://code.visualstudio.com/docs/copilot/customization/language-models)
* [OpenAI compatibility - Ollama](https://docs.ollama.com/api/openai-compatibility)
* [OpenAI Compatibility Endpoints | LM Studio Docs](https://lmstudio.ai/docs/developer/openai-compat)
* [OpenAI-Compatible Server - vLLM](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/)
* [AI Toolkit for Visual Studio Code](https://code.visualstudio.com/docs/intelligentapps/overview)
