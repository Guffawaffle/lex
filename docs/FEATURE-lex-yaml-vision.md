# Lex YAML Vision & Feature Direction (v0.x)

* Status: Draft / Directional (non-contract)
* Date: 2025-11-27
* Authors: Lex, Joseph Gustavson
* Related: ADR-00X Repo-local AI workflow config (`lex.yaml`)

> This document is directional. ADR-00X is the contract for `lex.yaml` v0.1.
> Nothing here changes the schema or guarantees delivery; it describes where we want this feature to go.

---

## 1. Why `lex.yaml` exists

### 1.1 Problem

Today, “how AI is allowed to operate on this repo” is scattered across:

* CLI flags and shell scripts
* Hidden prompt templates
* Editor/IDE plugin settings
* Orchestrator- or tool-specific config files
* Tribal knowledge (“we usually run X before merging”)

That leads to:

* **Undiscoverable workflows** – No obvious answer to “what can the AI do here?” or “what’s the blessed PR review flow?”
* **Implicit policy** – Path constraints, ownership rules, and safety limits live in code and prompts, not in a shared, reviewable config.
* **Inconsistency across tools** – CLI, IDE plugin, and CI bot can all behave slightly differently because they each model “workflow” separately.
* **Tight coupling to specific executors** – Behavior often ends up baked into bespoke configs, making it hard to share or standardize.

### 1.2 Opportunity

`lex.yaml` gives each repo a **single, declarative, versioned description of its AI workflows**:

* Human-readable, checked into git, code-reviewable
* Machine-readable by any Lex-aware tool (CLI, IDE, CI, bots, orchestrators)
* Expressive enough to be useful without leaking any particular executor’s orchestration strategy

It is the **“Docker Compose for AI workflows”**: not a runtime itself, but the canonical *recipe* for how tooling should behave.

Different executors can all consume the same `lex.yaml` and compete on **how well** they realize those workflows.

---

## 2. Vision (short version)

> A repo that has `lex.yaml` checked in feels “AI-native”: any Lex-aware tool can discover, list, and safely run well-defined workflows, with guardrails and expectations encoded in the repo itself instead of in someone’s head.

Concretely:

* **Repo owners** define workflows once in `lex.yaml`.
* **Developers** run those workflows from CLI/IDE with predictable behavior.
* **Lex-aware agents** interrogate the file to understand what they’re allowed to do, instead of hallucinating their own workflow.
* **Policies & limits** live next to the code they protect, not hidden inside executor-specific prompts.
* **Executors** treat `lex.yaml` as a shared language: they read the same config but are free to differ in planning, prompting, and orchestration quality.

---

## 3. Who this is for

1. **Repo owners / tech leads**

   * Want to bless “official” workflows (e.g. `review-pr`, `refactor-module`) and constrain where the AI can edit.
   * Want policies (paths, ownership, limits) to be visible and reviewable.

2. **AI power users / toolsmiths**

   * Want to wire orchestrators (LexRunner and others) into many repos without bespoke config each time.
   * Want a stable contract they can target programmatically.

3. **Lex-aware agents and integrations**

   * Want to ask: “What workflows are available? What inputs do they expect? Which tools and checks are allowed?”

4. **Security / governance**

   * Care about *where* the AI is allowed to touch and *what* has to pass before changes are considered okay.

---

## 4. Design principles

These principles should guide changes to `lex.yaml` over time.

### 4.1 Repo-first, tool-agnostic

* The **repo** owns `lex.yaml`.
* Multiple tools (CLI, orchestrators, IDE integrations, bots) **consume** it.
* The schema should avoid hard-coding any one protocol (e.g. “MCP”) or product.

### 4.2 Declarative, not imperative

* `lex.yaml` describes **what workflows exist and their constraints**, not how to execute them.
* Orchestration logic (planning, step ordering, retries, agent loops) lives entirely in the executor.
* This separation is intentional: `lex.yaml` is the *language*, executors are the *interpreters*.
* Multiple executors can consume the same `lex.yaml` and compete on execution quality, speed, cost, and safety.

### 4.3 Policy as a first-class citizen

* Path constraints (`allowed_paths`, `denied_paths`) and ownership (`lexmap`) are central.
* It should be possible to read `lex.yaml` and immediately understand **where** the AI is allowed to operate.

### 4.4 Limits over vibes

* Behavior like “be conservative” or “don’t touch too much” should be expressed as **limits** (`max_edits`, `max_files`, `timeout_seconds`), not fuzzy adjectives.
* Behavioral “modes” belong in executor configs or future higher-level profiles, not in the v0 schema.

### 4.5 Start small, evolve via ADRs

* v0 is intentionally small: provider, tools, policy, limits, checks, inputs.
* Any expansion should go through ADRs, preserving backwards compatibility where possible.

### 4.6 Security surface

* `lex.yaml` effectively describes what an AI is allowed to do in a repo.
* Repo owners should treat it with the same care as CI configs:

  * Changes should be code-reviewed.
  * `policy` blocks should be explicit about what is **denied**, not just what is allowed.
  * Sensitive repos may want extra scrutiny on edits to `lex.yaml`.

---

## 5. v0.1 Feature snapshot (what we’ve actually committed)

This summarizes ADR-00X in “feature” language.

### 5.1 Features

* Repo-local config file: `lex.yaml` at repo root.
* One or more **named workflows** under `workflows:`:

  * Each with a `description`, `inputs`, `provider`, `tools`, `policy`, `limits`, and `checks`.
* **Defaults** block to avoid repetition:

  * Shared `provider`, `tools`, `policy`, `limits`, and `checks`.
* **Policy**:

  * `allowed_paths` / `denied_paths` for edit scope.
  * Optional `lexmap` pointer to existing module-ownership policy.
* **Tools**:

  * A **capability allowlist**, not an execution interface. Names what the agent may use (e.g., `read_file`, `write_file`, `search`, `terminal`), not how those capabilities are provided. Executors map these to their own tool/server implementations.
* **Limits**:

  * `max_edits`, `max_files`, `timeout_seconds` as **advisory** runtime constraints. Agents should treat limits as budget guidance and self-limit. Executors may enforce strictly (hard-stop), loosely (warn), or not at all—behavior is not guaranteed by the schema.
* **Checks**:

  * Commands the executor runs **after** the workflow completes. Checks are not agent-invoked. A check passes if its exit code is 0. Executors may expose check output to the agent for debugging, but this is not guaranteed.
* **Inputs**:

  * Required / optional workflow arguments (e.g. `pr_number`, `path`). **Required** inputs must be provided at invocation time. Agents should not hallucinate missing required inputs—they should surface an error or prompt for clarification.
* **Policy enforcement**:

  * Executors are expected to enforce policy at tool invocation time. An agent attempting to write outside `allowed_paths` should receive an explicit error, not a silent no-op. This allows agents to adapt or ask for clarification rather than silently failing.

### 5.2 Non-features (explicitly out-of-scope for v0.1)

* No orchestration graphs:

  * No multi-step workflow graphs, dependency trees, or execution plans encoded here.
  * Those belong in the executor/orchestrator, not in the workflow schema.
* No triggers:

  * `lex.yaml` does not say “run this workflow when a GitHub comment matches X”.
* No cross-repo or multi-branch workflows:

  * Scope is **one repo, one `lex.yaml`**.
* No behavioral “modes” or profiles baked into schema:

  * Executors can interpret `provider.id` however they like.

---

## 6. UX direction: how this should feel in practice

This section is intentionally more “story” than “schema”. Examples here describe **desired** UX; they are not guarantees of v0.1 CLI features.

### 6.1 CLI – discoverable workflows (future UX)

A developer in a repo with `lex.yaml` should eventually be able to run:

* `lex workflows list`

  * See: names, descriptions, required inputs.
* `lex workflows show review-pr`

  * See: provider, tools, policy, limits, checks.
* `lex run review-pr --pr-number 123`

  * The executor uses `lex.yaml` as the authority for:

    * Which paths can be edited
    * Which capabilities/servers can be used
    * Which checks must pass

How the executor plans the run (one-shot vs multi-step, parallel vs sequential) is up to that executor.

### 6.2 IDE – context-aware guardrails

An IDE plugin in a repo with `lex.yaml` should be able to:

* Read `policy.allowed_paths` to constrain which files an AI “apply changes” button can touch.
* Read `limits.max_edits` to throttle aggressive refactors.
* Surface workflows as actions, e.g. right-click on a file → “Run workflow: refactor-module (path: src/foo.ts)`”.

Different IDE integrations can present these workflows differently while still relying on the same underlying config.

### 6.3 Agents – cooperative behavior

LLM-based agents (e.g. Lex-aware bots) should:

* Inspect `lex.yaml` on startup.
* Enumerate workflows they’re allowed to invoke.
* Use `inputs` to know what metadata they must gather (PR number, branch, etc.).
* Respect `policy`/`limits` without requiring humans to restate constraints in every prompt.

Each agent can still bring its own planning/prompting style; `lex.yaml` only constrains *what* is allowed, not *how* they think.

### 6.4 Agent context injection

Executors should **inject workflow context** into the agent's prompt or environment. At minimum, the agent should know:

* Which workflow it's running under (name + description)
* What inputs were provided
* What policy/limits apply

This allows the agent to operate within bounds without re-parsing `lex.yaml` itself. How context is injected (system prompt, environment variables, tool responses) is executor-specific.

---

## 7. Future directions (v0.2+ ideas)

These are *directional*, not commitments. Each bullet here is a candidate for its own ADR later.

### 7.1 Profiles / behavioral presets

Goal: allow repo owners to define reusable “profiles” that executors can map to their own tuning.

Example:

```yaml
profiles:
  conservative:
    limits:
      max_edits: 20
      timeout_seconds: 120
  exploratory:
    limits:
      max_edits: 200
      timeout_seconds: 900

workflows:
  refactor-module:
    profile: exploratory
```

Executors can then decide how `conservative` vs `exploratory` maps to temperature, sampling, or other knobs, without baking those into the schema.

### 7.2 Reusable workflow fragments

Goal: avoid copy-pasting common definitions across repos or workflows.

Possible direction:

* `includes:` can pull in shared fragments:

  * `lex.d/frontend-workflows.yaml`
  * `lex.d/backend-workflows.yaml`
* Workflows can extend/override base ones with a clean merge story.

This needs a precise merge-semantics ADR before it’s real.

### 7.3 Triggers and integration points (brief)

Goal: connect workflows to external signals **without** moving orchestration into the schema.

Directional stance:

* Trigger mappings (e.g. “GitHub comment → workflow”) will likely live in a **separate artifact** (e.g. `.lex-triggers.yaml`) to keep `lex.yaml` orchestration-agnostic.

### 7.4 Per-user/local overrides

Goal: allow developers to tweak behavior locally without modifying committed `lex.yaml`.

Examples:

* `lex.local.yaml` (gitignored) that can:

  * Configure different `provider.id` (e.g. local model vs cloud).
  * Tighten or loosen limits within a safe envelope.

Tooling would merge `lex.local.yaml` on top of `lex.yaml` for that user. This requires careful thought about what is safe to override without defeating policy.

---

## 8. Graceful degradation / Doing nothing is OK

A repo **without** `lex.yaml` is not broken.

* Lex-aware tools should fall back to safe defaults or prompt-based workflows.
* The presence of `lex.yaml` is a **signal** that the repo has explicitly defined its AI workflows, not a gate for basic functionality.
* Adoption should feel incremental:

  * Start without `lex.yaml`.
  * Add it when you want explicit, reviewable workflows and policies.
  * Remove it later if needed without breaking everything.

This stance is important for adoption: `lex.yaml` is opt-in, not mandatory.

---

## 9. Migration / Adoption story (v0.x)

A simple path for teams going from “no `lex.yaml`” to “has `lex.yaml`”:

1. **Scaffold a minimal file**

   * A future `lex init` could:

     * Detect languages/tooling (e.g. Node, Python).
     * Propose a minimal `lex.yaml` with a single workflow (`check-all` or `review-pr`).

2. **Start with one workflow**

   * Pick one high-value workflow (often `review-pr` or `check-all`).
   * Define its `inputs`, `policy`, `limits`, and `checks`.
   * Wire the CLI/IDE to run just that.

3. **Iterate**

   * Add more workflows over time.
   * Refine `policy` and `limits` as the team gets comfortable.
   * Optionally introduce `includes` or profiles once the core is stable.

4. **Reversibility**

   * If a team decides `lex.yaml` is not worth the complexity, deleting it should:

     * Return tools to safe defaults.
     * Not silently expand permissions beyond what `lex.yaml` allowed.

---

## 10. Open questions

These are deliberately left open and should be referenced in future ADRs.

1. **Merge semantics for defaults vs workflows**

   * Do we want deep merges (additive lists, override by `id`) or simple replace-once-present?
   * How do we avoid surprising behavior when both `defaults` and workflow-level blocks specify `tools`, `policy`, `limits`, or `checks`?

2. **How much of LexMap to expose**

   * Is `policy.lexmap: path` enough?
   * Do we ever want finer-grained settings here, or should LexMap remain its own artifact entirely?

3. **Error handling semantics**

   * What should executors do when `checks` fail?
   * When should they hard-stop vs allow partial results?
   * How should this be surfaced to users (CLI exit codes, IDE notifications, receipts)?

4. **Schema ownership and validation**

   * Where do we document the canonical JSON Schema/versioning rules for `lex.yaml`?
   * Validation should live in Lex core / OSS tooling, not in any single orchestrator.
   * How do third-party tools validate `lex.yaml` in a consistent way?

5. **Relationship to other policy/artifact files**

   * Long term, how does `lex.yaml` sit alongside:

     * LexMap policy
     * Mode/profile definitions
     * Executor-specific configs and secrets?
   * Where is the boundary between “Lex OSS artifacts” and “orchestrator-private configuration”?

---

## 11. How to read this alongside ADR-00X

* **ADR-00X** is the *contract* for `lex.yaml` v0.1:

  * It defines the actual schema and semantics implemented in code.

* **This document** is the *direction*:

  * It explains why `lex.yaml` exists, what user experience we want, and which future doors we’re intentionally leaving open.

If there’s ever a conflict:

* ADR-00X wins for v0.1 behavior.
* This doc should be updated to match reality or clearly marked where it’s aspirational.
