# ADR-00X: Repo-local AI workflow config (`lex.yaml`)

- Status: Accepted (v0)
- Date: 2025-11-27
- Authors: Lex, Joseph Gustavson
- Tags: lex, lexrunner, config, workflows, policy

## 1. Context

We want a repo-local, declarative way to describe how AI workflows are allowed to operate on a codebase, similar to how `docker-compose.yml` describes container orchestration for that repo.

Right now, the behavior of Lex-based tooling (Lex CLI, LexRunner, editor integrations, etc.) is mostly encoded in:

- Ad-hoc CLI flags
- Hard-coded prompt patterns
- Tool-specific config files
- Tribal knowledge in docs and comments

This causes a few problems:

- Behavior is not discoverable: a human (or another agent) cannot quickly see what workflows exist and what they are allowed to touch.
- Policy is not first-class: repo owners cannot easily constrain AI runs to certain paths, tools, or providers without editing prompts or code.
- Inconsistent modes: each integration tends to invent its own way to express conservative vs exploratory or fast vs thorough behavior.
- Hard to share workflows: there is no canonical place to define things like "this is how we do PR review here" or "this is the gate/check pipeline for this repo."

We need a single, minimal, versioned configuration file that:

- Lives in the repo, committed to git
- Describes the AI workflows for that repo
- Can be read by LexRunner and other Lex-aware tooling in a consistent way
- Is opinionated enough to be useful, but small enough to actually implement

## 2. Decision

We introduce a repo-local configuration file named `lex.yaml` that plays the same conceptual role for AI workflows that `docker-compose.yml` plays for containers:

- It is the declarative source of truth for which AI workflows exist in the repo.
- It describes which providers, tools, checks, limits, and policies each workflow uses.
- It is consumed by LexRunner and any Lex-aware tooling to plan and execute runs.

For v0, we standardize a minimal schema with these main sections:

- `version`: schema version for `lex.yaml`
- `defaults`: shared defaults for provider, tools, policy, limits, and checks
- `workflows`: named workflows with inputs and overrides
- `includes` (optional, future-safe): paths to additional config fragments

This ADR defines a v0 schema that is intentionally small and conservative. More advanced orchestration (multi-repo, multi-branch, merge strategies, etc.) remains out of scope for this document.

## 3. Schema (v0)

### 3.1 High-level structure

```yaml
version: 0.1

defaults:
  provider:
    id: default            # logical provider name; mapping is executor-specific
    max_tokens: 16000      # soft cap; executor decides how to enforce
  tools:
    servers:
      - filesystem
      - git
    commands: []
  policy:
    lexmap: .smartergpt/lex/lexmap.policy.json
    allowed_paths:
      - "src/**"
      - "test/**"
    denied_paths:
      - ".git/**"
      - "secrets/**"
  limits:
    max_edits: 100
    max_files: 50
    timeout_seconds: 300
  checks: []               # default checks, can be shared across workflows

workflows:
  review-pr:
    description: "Review a pull request and propose a diff."
    inputs:
      required:
        - pr_number
      optional:
        - files
    provider:
      id: default
      max_tokens: 12000
    tools:
      servers:
        - filesystem
        - git
      commands:
        - name: run-tests
          cmd: "npm test"
    policy:
      allowed_paths:
        - "src/**"
        - "test/**"
      denied_paths:
        - "secrets/**"
    limits:
      max_edits: 50
    checks:
      - id: lint
        description: "ESLint must pass"
        cmd: "npm run lint"
        type: lint
        required: true
      - id: tests
        description: "Unit tests must pass"
        cmd: "npm test"
        type: test
        required: true

  refactor-module:
    description: "Refactor a specific module with tests."
    inputs:
      required:
        - path
    provider:
      id: default
    tools:
      servers:
        - filesystem
        - git
    policy:
      allowed_paths:
        - "src/**"
        - "test/**"
      denied_paths:
        - "secrets/**"
    limits:
      timeout_seconds: 600
    checks:
      - id: typecheck
        description: "Typecheck must succeed"
        cmd: "npm run typecheck"
        type: typecheck
        required: true

includes: []  # reserved for future use (e.g. lex.d/*.yaml)
```

### 3.2 Field semantics

#### Top-level

* `version` (number or string, required)

  Schema version for `lex.yaml`. This ADR defines version `0.1`.

* `defaults` (object, optional)

  Shared defaults that apply to all workflows unless overridden.

* `workflows` (object, required)

  Map of workflow name to workflow definition.

* `includes` (array of strings, optional, reserved)

  Paths (relative to repo root) to additional YAML fragments. For v0, tooling may ignore this; it exists for forward-compatibility.

---

#### `defaults.provider` and `workflows.<name>.provider`

```yaml
provider:
  id: default
  max_tokens: 16000
```

* `id` (string): logical provider/model identifier understood by the executor (for example a key in config that maps to a concrete API + model).
* `max_tokens` (number, optional): soft cap for output tokens. Exact enforcement is up to the caller.

If a workflow omits `provider`, it inherits from `defaults.provider`.

This schema deliberately does not define behavioral modes like `conservative` or `exploratory`. Those remain executor-level concerns and can be wired in via flags or separate config.

---

#### `defaults.tools` and `workflows.<name>.tools`

```yaml
tools:
  servers:
    - filesystem
    - git
  commands:
    - name: run-tests
      cmd: "npm test"
```

* `servers` (array of strings): logical capability or service identifiers (for example MCP servers, HTTP tools, or other protocol-agnostic backends). The meaning of each string is defined by the executor.
* `commands` (array of objects): named shell commands the workflow may invoke via the executor.

Each command:

* `name` (string): logical name for the command, used in prompts and logs.
* `cmd` (string): the actual shell command to run.

If a workflow omits `tools`, it inherits from `defaults.tools`. For v0, if `tools` is present on a workflow, it replaces `defaults.tools.tools` rather than merging; merge semantics can be refined in a future ADR.

---

#### `defaults.policy` and `workflows.<name>.policy`

```yaml
policy:
  lexmap: .smartergpt/lex/lexmap.policy.json
  allowed_paths:
    - "src/**"
    - "test/**"
  denied_paths:
    - ".git/**"
    - "secrets/**"
```

* `lexmap` (string path or boolean, optional):

  * If a string: path (relative to repo root) to a LexMap policy file (for example module ownership).
  * If `true`: tooling may auto-discover a default LexMap location.
  * If omitted or `false`: no LexMap integration is assumed.

* `allowed_paths` (array of strings, optional):

  Glob-style patterns describing where edits are allowed.

* `denied_paths` (array of strings, optional):

  Glob-style patterns describing where edits are explicitly forbidden.

These constraints are meant to be enforced by LexRunner and any Lex-aware executor. If a workflow omits `policy`, it inherits from `defaults.policy`. If a workflow defines `policy`, for v0 the whole object replaces `defaults.policy` instead of merging; future ADRs can define partial merge semantics.

---

#### `defaults.limits` and `workflows.<name>.limits`

```yaml
limits:
  max_edits: 100
  max_files: 50
  timeout_seconds: 300
```

Runtime limits for a single workflow execution.

* `max_edits` (number, optional): soft limit on the number of file edit operations per run.
* `max_files` (number, optional): soft limit on the number of distinct files that can be edited.
* `timeout_seconds` (number, optional): recommended upper bound on runtime.

These are behavioral limits rather than access-control policy, so they live under `limits` instead of `policy`. If a workflow omits `limits`, it inherits from `defaults.limits`. If a workflow defines `limits`, for v0 it replaces `defaults.limits`.

---

#### `defaults.checks` and `workflows.<name>.checks`

```yaml
checks:
  - id: lint
    description: "ESLint must pass"
    cmd: "npm run lint"
    type: lint
    required: true
```

Each check:

* `id` (string): stable identifier for referencing in logs, receipts, or status output.
* `description` (string, optional): human-readable description.
* `cmd` (string): shell command to execute.
* `type` (string, optional): classification (for example `lint`, `test`, `build`, `custom`) for reporting and grouping.
* `required` (boolean, default `true`): if true, a failing check blocks the workflow from being considered successful.

If a workflow defines `checks`, then for v0 it replaces `defaults.checks`. There is no merge behavior defined yet; future ADRs can introduce additive or override semantics.

The term "checks" is chosen instead of "gates" to keep the schema neutral and consistent with common CI terminology.

---

#### `workflows.<name>.inputs`

```yaml
inputs:
  required:
    - pr_number
  optional:
    - files
```

* `required` (array of strings, optional): names of required input parameters (for example CLI flags, PR numbers, or paths).
* `optional` (array of strings, optional): names of optional parameters.

This is a contract between the repo and the tooling so users and agents can ask "what parameters does this workflow expect?" without guessing.

---

#### `workflows.<name>.description`

```yaml
description: "Review a pull request and propose a diff."
```

* `description` (string, optional): short human-readable summary of the workflow.

## 4. Rationale

* Using `lex.yaml` mirrors familiar repo-local config patterns (for example `docker-compose.yml`, `.github/workflows`, `package.json`).
* Keeping v0 small (provider, tools, policy, limits, checks, inputs) avoids overfitting to a single integration while still making the file genuinely useful.
* Policy is first-class: `allowed_paths`, `denied_paths`, and `lexmap` ensure repo owners can constrain AI runs without touching prompts.
* Checks are declarative: they are just commands and labels, not tightly coupled to a specific CI system.
* Limits are explicit: behavioral constraints like edit count and timeouts are visible in config, not hidden in code.
* Behavioral modes (for example conservative vs exploratory) are intentionally *not* encoded in this schema; they remain executor-level concerns.

## 5. Consequences

Positive:

* Repo owners have a single, visible place to define AI workflows and their constraints.
* LexRunner and other tools can discover workflows and constraints without bespoke configuration.
* It becomes easier to enforce scoped "version contracts" for workflows (for example this ADR plus `lex.yaml` define what `review-pr` is allowed to do in v0).
* The schema is protocol-agnostic: `tools.servers` can map to MCP servers today and other mechanisms later.

Negative / tradeoffs:

* This introduces another config surface; users may forget to keep it in sync with CI scripts or other automation.
* The v0 schema is intentionally conservative; follow-up ADRs will be needed to define:

  * Merge semantics between defaults and workflow-level overrides
  * How triggers (for example GitHub comments) are represented
  * How multi-repo or multi-branch workflows, if any, are described

## 6. Alternatives considered

1. Only CLI flags and environment variables

   * Rejected: too opaque, not discoverable, and hard to share patterns across teams. No single source of truth inside the repo.

2. Hide configuration inside LexRunner or other internal config

   * Rejected: ties behavior to proprietary tooling and prevents OSS repos from documenting their own AI workflows in a portable way.

3. Reuse an existing format (for example GitHub Actions YAML)

   * Rejected for v0: those formats are optimized for CI, not interactive AI workflows and policy constraints. We can later add generators or bridges if useful.

## 7. Future work

The following items are explicitly deferred and should be addressed by future ADRs:

* Define merge semantics between `defaults` and workflow-level overrides for `tools`, `policy`, `limits`, and `checks` (for example additive vs replace vs keyed overrides).
* Define how behavioral modes or profiles are expressed (for example `profile: fast-lane` vs `profile: conservative`) and how they map to executor behavior.
* Define how triggers are represented (CLI-only vs GitHub comments vs other integrations).
* Explore a `lex.local.yaml` pattern for uncommitted, developer-local overrides.
* Decide whether multi-repo or multi-branch orchestration belongs in `lex.yaml` or in a separate, higher-level configuration file.
* Document recommended conventions for `provider.id` values and how executors should resolve them.

## 8. Versioning and contracts

This ADR defines `lex.yaml` schema version `0.1`.

* Any backward-incompatible changes to the schema must:

  * Bump the `version` value, and
  * Be documented in a new ADR that references this one.
* Tooling should treat the combination of:

  * This ADR, and
  * A repo's committed `lex.yaml` file
    as the version contract for that repo's AI workflows for schema version `0.1`.
