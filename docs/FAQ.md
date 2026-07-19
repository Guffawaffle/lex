# Lex FAQ

## What does Lex remember?

Lex stores deliberate checkpoints called **Frames**. A useful Frame captures the decision, current
state, blocker, next action, and repository module scope that another session would otherwise have
to reconstruct.

Lex remembers the work, not the conversation. It does not record screens, keystrokes, terminal
history, or complete agent transcripts.

## Does Lex capture anything automatically?

No. A Frame is written only when a user, agent, application, or MCP client explicitly calls a
write operation such as `lex remember` or `frame_create`.

```bash
lex remember \
  --summary "Kept token validation in API middleware" \
  --next "Add password-reset coverage" \
  --modules unscoped
```

Do not create a Frame when there is nothing worth handing off. High-signal continuity is more
useful than exhaustive activity history.

## Where are Frames stored?

SQLite is the default. Its default path is `.smartergpt/lex/memory.db` relative to the active
workspace. Set an absolute `LEX_DB_PATH` when several local launch configurations should use the
same file.

PostgreSQL is available for explicit shared storage. A trusted multi-tenant or multi-workspace
host must additionally use Lex 3 runtime authority, scope-bound stores, and PostgreSQL row-level
security. Selecting PostgreSQL with environment variables alone is a compatibility configuration,
not a tenant authorization boundary.

See [Store Contracts](./STORE_CONTRACTS.md).

## Does Lex upload Frames to a cloud service?

Lex has no Lex-operated cloud memory service and does not sync SQLite files by default. The CLI
and stdio MCP transport do not need a listening network port.

Your package registry, MCP client, PostgreSQL deployment, agent host, or other surrounding tools
may have their own network behavior. Evaluate those systems separately.

## Can I share one SQLite file between machines?

Do not synchronize or concurrently mount a live SQLite database as a substitute for a shared
service. Use PostgreSQL when trusted hosts or workspaces need coordinated access. For backup or
migration, use `lex db backup` or `lex frames export` rather than copying a database while it may
have an active journal or WAL.

## Are Frames safe to put directly into an agent prompt?

Frame bodies are user-controlled historical data. Treat them as untrusted context, not executable
instructions. `lex context` produces a bounded bootstrap and labels the history boundary, but the
consumer still needs to verify important claims against current code, tests, issue state, and
explicit human direction.

Never store credentials, tokens, private keys, or other secrets in Frames.

## What is the difference between `recall` and `context`?

`lex recall` retrieves Frames for a person or program to inspect. It supports compact summaries,
listing, and Atlas-related controls.

`lex context` is the bounded session-bootstrap surface. It selects a small set of relevant Frames,
reports provenance and warnings, and enforces an approximate output budget. It uses hard read-only
store access and will not create or migrate the selected database.

```bash
lex recall "authentication" --summary
lex context "authentication" --max-tokens 800
```

## Why does `remember` require modules?

Module attribution prevents durable work context from becoming detached from the repository it
describes. Choose one strategy:

- `--modules services/auth,api/middleware` for exact policy IDs;
- `--modules auto` for bounded inference in a policy-backed repository;
- `--modules unscoped` when no useful module ontology exists.

`unscoped` is explicit and valid. You do not need to adopt repository policy before trying Lex.

## What does repository policy add?

Policy maps stable module IDs to owned paths and allowed or forbidden relationships. Lex can use
that vocabulary for Frame attribution, Atlas neighborhoods, and static boundary checks.

Policy is optional and is not an access-control system. See the [Repository Policy Guide](./API_USAGE.md).

## What is Atlas?

Atlas turns policy relationships into a bounded neighborhood around the modules relevant to a
Frame. It helps an agent see nearby architectural context without loading an entire repository
graph. If no readable policy exists, core Frame recall still works without Atlas enrichment.

Code Atlas extraction is a separate, experimental source-indexing surface. See the
[Atlas guide](./atlas/README.md).

## Do I need MCP?

No. The CLI, structured output, TypeScript exports, and MCP server are alternative entry points to
the same core. Use MCP when your agent client benefits from typed, discoverable tools. Use the CLI
when a shell command is the simpler integration.

See [Lex MCP](../README.mcp.md).

## Can I evaluate Lex without installing or writing files?

Yes. Give your agent the [Agent Evaluation](./agent-evaluation.md) rubric. That review is expressly
read-only and asks for evidence, overlap, risks, and the smallest reversible pilot.

When you are ready to exercise the actual workflow, the [Quick Start](../QUICK_START.md) describes
the exact write surface and rollback.

## What does `remember --dry-run` do?

It validates and previews a Frame without storing it. The SQLite compatibility path may still
open the selected database, which can create an empty database file. Use an isolated absolute
`LEX_DB_PATH` and `LEX_STORE=sqlite` when filesystem isolation matters.

## How do I back up or move Frames?

For a SQLite database backup:

```bash
lex db backup
```

For a portable Frame export:

```bash
lex frames export --out ./lex-frames
lex frames import --help
```

Check command help before automation because export and maintenance operations have explicit
overwrite, recovery, and storage semantics.

## Can SQLite be encrypted?

Yes. Lex uses SQLCipher-compatible SQLite support and reads the passphrase from `LEX_DB_KEY`.

```bash
lex db encrypt --input path/to/memory.db --output path/to/encrypted.db --verify
```

The automatic pre-encryption recovery backup contains the original plaintext database. Protect or
remove it according to your retention policy after verification. Hard read-only `lex context`
cannot currently deserialize encrypted SQLite snapshots; see [Limitations](./LIMITATIONS.md).

## Why did a read-looking command create or migrate a database?

For backward compatibility, several SQLite CLI paths still acquire a writable store even when the
operation itself is conceptually a read. Use `lex context` for a hard read-only session bootstrap.
`lex db repair` is also read-only unless `--write` is explicit.

The exact access-mode contract is documented in [Store Contracts](./STORE_CONTRACTS.md).

## How do I inspect what Lex selected?

```bash
lex introspect --json
lex db stats --help
```

Introspection reports the active workspace, store identity, policy state, capabilities, and
warnings. Diagnostic output may reveal local paths and repository identifiers, so review it before
sharing publicly.

## Does Lex support Windows and WSL?

Yes, but install native dependencies separately on each operating-system surface and do not share
`node_modules` between Windows and WSL. WSL should resolve a Linux-native `lex`, not a Windows npm
shim or an ephemeral `_npx` cache. See [WSL Native Installation](./WSL_NATIVE_INSTALL.md).

## What should I read next?

- First pilot: [Quick Start](../QUICK_START.md)
- Agent handoffs: [Agent Continuity](./AGENT_CONTINUITY.md)
- Security and trust: [Security Policy](../SECURITY.md)
- Storage behavior: [Store Contracts](./STORE_CONTRACTS.md)
- Trusted hosting: [Runtime Scope Contract](./RUNTIME_SCOPE_CONTRACT.md)
- Exact package entry points: [Public Package API](./PUBLIC_API.md)
