# Lex Quick Start

This guide proves one thing: whether a durable checkpoint helps a later agent session continue
without making you reconstruct the work.

The pilot uses local SQLite. It does not require MCP, policy, Atlas, PostgreSQL, instruction
projection, AXF, LexRunner, or LexSona.

## Before you begin

You need:

- Node.js 24 or newer;
- a Git repository;
- a disposable branch, worktree, or clone if you want complete filesystem isolation;
- approval to create `.smartergpt/lex/memory.db` in the pilot workspace.

`npx` may fetch and execute `@smartergpt/lex` when the package is not already cached. Pin or
install it first if your repository's supply-chain policy requires an approved lockfile or exact
version.

Do not put passwords, tokens, private keys, customer data, or other secret material in a Frame.

If you have not decided whether Lex is worth trying, stop here and use the read-only
[Agent Evaluation](./docs/agent-evaluation.md) first.

## 1. Record the baseline

Before the pilot, inspect the workspace so you can distinguish existing files from pilot output:

```bash
git status --short
```

The narrow pilot does not call `lex init`. It creates only the SQLite store beneath
`.smartergpt/lex/`.

## 2. Validate a Frame

```bash
LEX_STORE=sqlite npx @smartergpt/lex remember \
  --dry-run \
  --reference-point "Lex pilot" \
  --summary "Evaluating whether durable agent handoffs help this repository" \
  --next "Recall this checkpoint in a new session" \
  --modules unscoped
```

The explicit `LEX_STORE=sqlite` prevents an existing PostgreSQL configuration in the shell from
redirecting the pilot into a shared store.

`--dry-run` validates the Frame without storing it. The SQLite adapter may create an empty
`.smartergpt/lex/memory.db` when it opens; this is the only expected pilot artifact at this point.

`--modules unscoped` is an explicit statement that this first Frame is workspace-level. You can
introduce a module policy later if the pilot proves useful.

## 3. Store the Frame

After reviewing the validation output, remove `--dry-run`:

```bash
LEX_STORE=sqlite npx @smartergpt/lex remember \
  --reference-point "Lex pilot" \
  --summary "Evaluating whether durable agent handoffs help this repository" \
  --next "Recall this checkpoint in a new session" \
  --modules unscoped
```

This writes one Frame to `.smartergpt/lex/memory.db`.

## 4. Recall it

```bash
LEX_STORE=sqlite npx @smartergpt/lex recall "Lex pilot"
```

You should see the summary, next action, reference point, timestamp, and explicit
`workspace/unscoped` attribution.

## 5. See the agent-facing context

```bash
LEX_STORE=sqlite npx @smartergpt/lex context "Lex pilot" --max-tokens 500
```

The context response is read-only and bounded. It identifies the active project, branch, store,
selection reasons, warnings, and approximate token use. Stored Frame text is labeled as untrusted
historical data.

## 6. Test the actual value

Start a fresh agent session and provide the recalled or bounded context. Ask the agent:

```text
Using this Lex context, state what was happening, what should happen next, and what information is
still missing. Do not change the repository.
```

The pilot succeeds only if the checkpoint reduces repeated explanation or prevents lost context.
A successful command by itself is not evidence that Lex belongs in the workflow.

## Decide

- **Adopt** when the value is already clear and the local operating cost is acceptable.
- **Pilot** when more than one real handoff is needed to judge the value.
- **Defer** when the problem is real but current workflow, platform, or trust constraints make this
  the wrong time.
- **Not a fit** when Lex duplicates a working continuity system or stores context you should not
  retain.

Use [Agent Evaluation](./docs/agent-evaluation.md) for the complete decision rubric.

## Roll back

First compare the workspace with the baseline:

```bash
git status --short
```

For the narrow pilot, `.smartergpt/lex/memory.db` is the expected Lex-created artifact. Remove only
files that did not exist before the pilot. Empty `.smartergpt/lex/` and `.smartergpt/` directories
may remain after the database is removed; remove them only when the baseline confirms the pilot
created them. If you used a disposable worktree or clone, remove that isolated workspace through
your normal Git workflow.

Do not use a broad cleanup command in a repository that already had `.smartergpt/`, `lex.yaml`, or
Lex-managed instruction files.

## Expand deliberately

Once the local handoff is useful, add one capability at a time:

| Need | Next step |
|---|---|
| Agent session bootstrap | [Agent Continuity](./docs/AGENT_CONTINUITY.md) |
| MCP client access | [MCP Server](./README.mcp.md) |
| Repository module boundaries | [Policy usage](./docs/API_USAGE.md) |
| Nearby module context | [Atlas](./docs/atlas/README.md) |
| Canonical assistant instructions | [Instructions](./docs/INSTRUCTIONS.md) |
| Shared cross-host storage | [Store Contracts](./docs/STORE_CONTRACTS.md) and [PostgreSQL Scope Security](./docs/POSTGRES_SCOPE_SECURITY.md) |
| Trusted tenant/workspace scope | [Runtime Scope](./docs/RUNTIME_SCOPE_CONTRACT.md) |

`lex init` is the broader bootstrap for these features. Inspect `lex init --help` and its planned
outputs before using it in an established repository.
