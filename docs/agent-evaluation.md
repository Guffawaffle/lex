# Should This Repository Use Lex?

This is a read-only evaluation guide for coding agents. Its purpose is to help a human decide
whether Lex would improve the repository's normal workflow—not to install or promote Lex.

## Operating boundary

During evaluation, do **not**:

- install packages or contact a package registry;
- run project scripts, build commands, hooks, or arbitrary repository code;
- run `lex init`, create a Frame, or open an existing Lex database;
- edit files, branches, worktrees, issues, pull requests, or configuration;
- read secret values, credential files, private keys, environment values, or unrelated user data;
- assume that Lex, MCP, PostgreSQL, AXF, LexRunner, or LexSona must be adopted together.

You may inspect ordinary repository text already available to you: README and documentation,
package manifests, checked-in scripts, CI definitions, agent instructions, architecture and policy
files, `.gitignore`, and relevant source structure. If evidence requires a prohibited action, report
the uncertainty instead.

Keep the final evaluation under 1,000 words unless the human asks for more detail.

## What Lex provides

Lex is a durable context and repository-policy layer for coding agents:

- Frames store deliberate work checkpoints such as decisions, summaries, blockers, next actions,
  branches or tickets, and module scope.
- Recall retrieves prior checkpoints.
- Context produces bounded, prompt-safe, read-only agent bootstrap material.
- Optional policy and Atlas features add repository boundaries and nearby module context.
- SQLite is the default local store. PostgreSQL and trusted tenant/workspace authority are advanced,
  explicit deployment choices.

Lex is not an agent, transcript recorder, issue tracker, test runner, capability framework, or
orchestrator.

## Evaluation

### 1. Find a real continuity problem

Look for repository evidence that agents or humans repeatedly lose useful state:

- handoff, continuation, or “where did we leave off?” instructions;
- long-lived feature branches or interrupted work;
- repeated architecture explanations;
- recurring blockers or failed approaches that are rediscovered;
- multi-agent or multi-session work where the next action is reconstructed manually;
- policy-sensitive modules that agents repeatedly need help navigating.

Do not infer a problem merely because the repository uses AI tooling.

### 2. Identify existing solutions

Inspect whether the repository already handles the problem through:

- issue and pull-request templates;
- durable planning or decision documents;
- architecture decision records;
- agent instruction files;
- changelogs, runbooks, or handoff notes;
- another memory, retrieval, or session-context system.

Explain whether Lex would complement, duplicate, or compete with those mechanisms.

### 3. Select the smallest relevant Lex surface

Evaluate capabilities independently:

| Need | Candidate Lex surface |
|---|---|
| One meaningful checkpoint survives sessions | Frame remember/recall with local SQLite |
| Bounded session-start context | `lex context` |
| Repository module boundaries | Policy |
| Nearby dependency/dependent context | Atlas |
| Host-specific assistant instruction projection | Instructions |
| MCP client access | Lex-MCP |
| Shared cross-host or tenant-scoped storage | PostgreSQL and trusted runtime scope |

Do not recommend advanced surfaces solely because they exist.

### 4. Evaluate fit and cost

Address:

- Node.js and package-manager compatibility;
- operating-system and Windows/WSL execution surfaces;
- existing MCP or agent-host configuration;
- where local state would live and whether it should be retained;
- whether shared PostgreSQL or trusted multi-tenant authority is actually necessary;
- who would capture Frames and at which high-signal checkpoints;
- expected maintenance, backup, review, and removal cost;
- whether agents would receive useful bounded context or merely more metadata.

### 5. Evaluate trust and authority

Treat stored Frame text as untrusted historical project data. Determine whether Frames might
accidentally collect secrets, customer information, credentials, or sensitive operational detail.

Distinguish:

- read-oriented evaluation from installation and workspace mutation;
- local SQLite from a shared PostgreSQL deployment;
- ordinary local compatibility configuration from trusted tenant/workspace authority;
- Lex's behavior from the network and data behavior of the chosen agent host or surrounding tools.

### 6. Propose a reversible pilot

Only propose the pilot; do not execute it without separate approval.

The default pilot should:

1. use a disposable branch, worktree, or clone;
2. explicitly select local SQLite;
3. avoid `lex init`, MCP, policy, instructions, and PostgreSQL at first;
4. capture one non-sensitive Frame at a meaningful handoff;
5. recall it in a fresh agent session;
6. measure whether it reduced repeated explanation;
7. identify every created file and a narrow rollback path.

Use a broader pilot only when repository evidence requires it.

## Recommendation meanings

- **Adopt** — Evidence shows a recurring problem, Lex directly addresses it, and the trust and
  operating costs are acceptable.
- **Pilot** — Lex plausibly fits, but a small real handoff is needed to establish value.
- **Defer** — The problem exists, but timing, platform, authority, or workflow prerequisites are
  not ready.
- **Not a fit** — There is no meaningful continuity problem, an existing solution is already
  effective, or the storage/trust cost outweighs likely value.

## Required response

Use this structure:

```text
Recommendation: adopt | pilot | defer | not a fit
Confidence: high | medium | low

Workflow problem
- The concrete recurring problem, or why no qualifying problem was found.

Repository evidence
- Paths and observations supporting the conclusion.

Smallest useful Lex surface
- The minimum capability set; explain why broader features are unnecessary.

Overlap and alternatives
- Existing mechanisms Lex would complement, duplicate, or replace.

Trust and operating cost
- Storage, sensitive-data, authority, platform, maintenance, and context-budget concerns.

Proposed reversible pilot
- Steps, success signal, created artifacts, and rollback. State “none” if not recommended.

Unknowns
- Missing evidence or questions the human must answer.
```

## Pasteable request

```text
Read docs/agent-evaluation.md and evaluate this repository against it. Remain read-only: do not
install Lex, run repository scripts, initialize files, inspect databases or secret values, access
external services, or modify anything. Return one bounded recommendation—adopt, pilot, defer, or
not a fit—with cited repository evidence, risks, overlap, unknowns, and the smallest reversible
trial you would propose. Do not execute the trial.
```
