# Lex Local Testing — Implementation Plan

> **Status:** Stashed (post-LexSona 0.x)
> **Last Updated:** 2025-12-06

---

## Staged Implementation

### Stage 0: Disconnected Mode Validation (No Lex DB Required)

**Goal:** Prove that baseline constraints improve outcomes without any database dependency.

**Key insight from LexSona 0.1.0:** LexSona's constraint derivation works in disconnected mode. This is not a fallback—it's valid behavior.

#### Deliverables

1. **A/B Harness Script**
   ```
   src/local/harness.ts
   ```
   - Loads baseline constraints from `canon/constraints/baseline.yaml`
   - Runs 10-20 prompts in two modes:
     - Mode A: No constraints (raw model)
     - Mode B: Baseline constraints injected
   - Produces JSON report

2. **Baseline Constraint Set**
   ```
   canon/constraints/baseline.yaml
   ```
   - Already exists in Lex
   - No modifications needed

3. **Prompt Dataset**
   ```
   canon/local-testing/prompts.yaml
   ```
   - 10-20 short prompts covering:
     - Policy recall ("What are the coding guidelines?")
     - Constraint summarization ("Summarize the active constraints")
     - Refusal of out-of-scope changes ("Modify the database schema")
     - Tool preference ("How should I edit this file?")

4. **Scoring Logic**
   - Simple pass/fail tags per prompt
   - Aggregate: constraint adherence percentage
   - Output: `local-testing-report.json`

#### Acceptance Criteria

- [ ] Harness runs without a Lex DB
- [ ] Harness runs with Ollama in WSL2
- [ ] JSON report shows constraint vs. no-constraint comparison
- [ ] At least one measurable improvement in constrained mode

#### Files to Create

```
src/local/
  harness.ts          # A/B test harness
  scoring.ts          # Pass/fail evaluation
  report.ts           # JSON report generation

canon/local-testing/
  prompts.yaml        # Test prompt dataset
  expected.yaml       # Expected behaviors (for scoring)
```

---

### Stage 1: Provider Abstraction

**Goal:** Abstract model endpoint so local and cloud are swappable.

#### Deliverables

1. **OpenAICompatibleProvider**
   ```
   src/local/provider.ts
   ```
   - `baseUrl: string`
   - `apiKey: string`
   - `model: string`
   - `timeoutMs: number`
   - `supportsEmbeddings: boolean`

2. **Environment Variable Wiring**
   - `LEX_LLM_BASE_URL`
   - `LEX_LLM_API_KEY`
   - `LEX_LLM_MODEL`

3. **Default Behavior**
   - If `LEX_LLM_BASE_URL` is set, use local provider
   - Otherwise, use existing remote logic (no change)

#### Acceptance Criteria

- [ ] Provider abstraction implemented
- [ ] Environment variables documented
- [ ] Harness uses provider abstraction
- [ ] Works with Ollama, LM Studio, and vLLM

#### Files to Create

```
src/local/
  provider.ts         # OpenAICompatibleProvider
  config.ts           # Environment variable loading
```

---

### Stage 2: CLI Utilities

**Goal:** Developer-friendly commands for local testing.

#### Deliverables

1. **`lex local:doctor`**
   - Validates model server reachable
   - Calls `/v1/models`
   - Runs minimal chat request
   - Does not require Lex DB
   - Outputs: green/red status

2. **`lex local:smoke`**
   - Runs fixed prompt subset (3-5 prompts)
   - Uses baseline constraints
   - Quick validation (<30 seconds)
   - Does not require Lex DB

#### Acceptance Criteria

- [ ] `lex local:doctor` works in <5 minutes from fresh setup
- [ ] `lex local:smoke` runs without Lex DB
- [ ] Clear error messages when server unreachable
- [ ] Exit codes reflect pass/fail

#### Files to Create

```
src/cli/commands/
  local.ts            # local:doctor and local:smoke commands
```

---

### Stage 3: Documentation

**Goal:** Complete setup guides for supported workflows.

#### Deliverables

1. **WSL2 + Ollama Guide**
   ```
   docs/local-testing/OLLAMA_WSL2.md
   ```

2. **VS Code + AI Toolkit Guide**
   ```
   docs/local-testing/VSCODE_SETUP.md
   ```

3. **LM Studio Optional Guide**
   ```
   docs/local-testing/LM_STUDIO.md
   ```

4. **Troubleshooting**
   ```
   docs/local-testing/TROUBLESHOOTING.md
   ```

---

## Validation Approach: Baseline Constraints Without Lex DB

### How We Validate "Baseline Constraints Improve Outcomes Locally"

**Step 1: Load Static Baseline**
```typescript
// Load from canon/constraints/baseline.yaml
const baseline = loadBaseline();
// No database access required
```

**Step 2: Run A/B Comparison**
```typescript
// Mode A: Raw model
const rawResponse = await provider.chat(prompt, { constraints: [] });

// Mode B: Constrained model
const constrainedResponse = await provider.chat(prompt, {
  constraints: baseline.constraints
});
```

**Step 3: Score Responses**
```typescript
// Simple pass/fail based on expected behaviors
const rawScore = scoreResponse(rawResponse, expected);
const constrainedScore = scoreResponse(constrainedResponse, expected);
```

**Step 4: Generate Report**
```json
{
  "model": "qwen2.5-coder:7b",
  "mode": "disconnected",
  "results": {
    "raw": { "passed": 12, "failed": 8 },
    "constrained": { "passed": 17, "failed": 3 }
  },
  "improvement": "+25%"
}
```

### How We Optionally Layer in LexSona-Derived Constraints

**Future Stage (Post-Stage 2):**

Once Stage 0-2 are proven, we can optionally integrate LexSona:

```typescript
// Optional: Use LexSona for richer constraints
import { LexSona } from "@smartergpt/lexsona";

const instance = await LexSona.connect({ lexDb: process.env.LEX_DB_PATH });
const constraints = await instance.deriveConstraints({
  domain: "lex-core",
  taskType: "implementation",
});

// Run with derived constraints instead of baseline
const response = await provider.chat(prompt, {
  constraints: constraints.constraints
});
```

**Key point:** This is **optional enhancement**, not a requirement. Stage 0 proves value without it.

---

## Timeline Estimate

| Stage | Effort | Dependencies |
|-------|--------|--------------|
| Stage 0 | 2-3 days | LexSona 0.x shipped |
| Stage 1 | 1-2 days | Stage 0 complete |
| Stage 2 | 1-2 days | Stage 1 complete |
| Stage 3 | 1 day | Stage 2 complete |

**Total:** ~1 week of focused work, post-LexSona 0.x.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Stage 0 doesn't show improvement | Use prompts specifically designed to exercise constraints |
| Local model too weak | Start with qwen2.5-coder:7b or similar; document minimum viable models |
| Scope creep into Lex core | Keep all code in `src/local/`; no changes to existing Lex APIs |
| Becomes persona backdoor | Explicit non-goal; code review gates |
