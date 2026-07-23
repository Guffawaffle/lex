# Lex 4.0 migration and recovery guide

Lex 4.0 is the Lex package release in the **Ecosystem 3.1** compatibility train. The
train name and package version serve different purposes: Ecosystem 3.1 identifies the
cross-repository set, while `@smartergpt/lex@4.0.0` records Lex's own compatibility
contract.

This is the canonical operator and agent path from `@smartergpt/lex@3.0.1` to
`@smartergpt/lex@4.0.0`. It covers the CLI, embedded package consumers, SQLite and
PostgreSQL stores, and the matching `@smartergpt/lex-mcp@4.0.0` transport.

## Why this is a major release

Lex 4.0 raises the supported Node.js floor from the published Lex 3.0.1 contract of
`>=20 <25` to `>=24`. Node 20 and Node 22 are no longer tested or supported. Removing a
previously supported runtime is breaking under Semantic Versioning even though many
Lex APIs remain source-compatible.

Ecosystem 3.1 is not a promise that every package has version 3.1. Lex and Lex-MCP use
4.0.0; the other components use independently reviewed versions recorded in the
[Ecosystem 3.1 manifest](../../releases/ecosystem-3.1.json).

### Compatibility classification

| Change since 3.0.1 | Classification | SemVer consequence |
| --- | --- | --- |
| Supported Node range changes from `>=20 <25` to `>=24` | Breaking runtime-support change | Requires Lex 4.0.0 and exact Lex-MCP 4.0.0 |
| KnowledgeFrame v1 contract, compiler, snapshot storage, context, and public provider exports | Additive public contract | Minor-capable on its own |
| Scoped behavioral-store contract and SQLite/PostgreSQL implementations | Additive public contract with explicitly versioned boundaries | Minor-capable on its own |
| Ecosystem 3.1 manifest/schema and release validator | Additive release contract | Minor-capable on its own |
| PostgreSQL quarantine inventory, zero-write planning, and separately authorized recovery ledger/service | Additive administrative and recovery contract | Minor-capable on its own |
| Security dependency upgrades and Windows-safe executable-bit postbuild | Corrective implementation change | Patch-capable on its own |
| Canonical merge-service routing plus CLI/MCP parity and bounded errors | Corrective and additive behavior within existing declared surfaces | Minor-capable on its own |
| Removal of the duplicate source MCP transport and shell launcher | Internal fail-closed cleanup; neither path was a declared package export | Does not independently force a major |

The major version is selected by the Node support-floor change. Additive contracts do
not dilute that decision, and the internal launcher retirement is documented because
operators may still have local configuration pointing at it.

## Supported starting states

This guide supports:

- an application, repository dependency, or global CLI pinned to
  `@smartergpt/lex@3.0.1`;
- an MCP host using `@smartergpt/lex-mcp@3.0.1`;
- an MCP host still pointing at the removed `frame-mcp.mjs` source entrypoint or
  `lex-launcher.sh`;
- a deliberate local SQLite compatibility store;
- a deliberate unscoped PostgreSQL compatibility store using `LEX_STORE=postgres`;
- a trusted embedded host that constructs explicit runtime authority and a
  scope-bound store.

Do not treat an older Lex version, an unknown store, a mixed Lex/Lex-MCP major, or an
unreviewed trusted-host composition as a direct upgrade. First identify its package
versions, selected store contract, workspace, and authority model. If those cannot be
established without guessing, stop and open a bounded migration issue.

## Safety invariants

The migration must preserve these boundaries:

1. Stop normal Lex writers before taking the backup or changing runtime packages.
2. Identify the intended workspace and store from reviewed configuration. Do not scan
   the machine for possible databases or probe every reachable PostgreSQL service.
3. Never print, copy into an issue, commit, or place in a Frame any database password,
   URL containing a password, encryption key, token, or private key.
4. Acceptance is read-only. It must not initialize, migrate, repair, import, delete,
   recreate, or write a test Frame to an existing user or project store.
5. Never delete or recreate an existing store as an upgrade or authentication remedy.
6. A SQLite file and its `-wal`/`-shm` state are one operational unit. Do not copy a
   live database file ad hoc.
7. PostgreSQL environment configuration selects the compatibility adapter; it is not
   tenant authority. Trusted multi-workspace hosts must retain explicit runtime
   authority and a scope-bound store.
8. Keep Lex and Lex-MCP at the exact manifest-selected major/version pair.

An agent that cannot prove one of these conditions should stop before accessing the
store and tell the operator which evidence is missing.

## Phase 1: preflight on 3.0.1

### 1. Pause and record

Pause agents, MCP hosts, CLIs, and applications that can write to the selected Lex
store. Do not stop, reconfigure, or restart a database service merely to perform
package acceptance.

From each consumer checkout, record non-secret evidence:

```bash
node --version
npm --version
npm ls --depth=0 @smartergpt/lex @smartergpt/lex-mcp
npm ls --global --depth=0 @smartergpt/lex @smartergpt/lex-mcp
git status --short
```

An absent package in one of the two npm listings is valid. Record the active MCP
configuration file and command, but redact environment values before sharing evidence.
The operator must confirm the intended absolute workspace and either:

- the exact SQLite path; or
- the PostgreSQL host, port, database, compatibility schema, and secret-injection
  mechanism.

Do not infer the target from a similarly named Docker container, a conventional
database filename, or the launcher's current working directory.

### 2. Confirm that the release exists

Do not install from a branch, workspace link, mutable local tarball, or an assumed
`latest` tag. Wait until both exact public artifacts are visible:

```bash
npm view @smartergpt/lex@4.0.0 version engines dist.integrity --json
npm view @smartergpt/lex-mcp@4.0.0 version engines dependencies dist.integrity --json
```

The results must report Node `>=24`, the reviewed integrity values, and an exact
Lex-MCP dependency on `@smartergpt/lex@4.0.0`. Compare them with the sealed or
candidate release receipt; do not paste mutable `latest` output into evidence as the
only proof.

### 3. Establish a recovery point

For SQLite, while normal Lex writers are paused, run the 3.0.1 backup command against
the explicitly reviewed store:

```bash
lex db backup
```

Record the resulting backup path without moving, editing, or opening it through a
newer Lex version. `lex frames export` is an additional logical export when required
by local policy; it is not a substitute for the database recovery point.

For PostgreSQL, use the deployment's established backup/snapshot procedure and
record its immutable identifier. Do not invent ad hoc SQL, change roles, dump
unrelated schemas, or run Lex migration administration as part of package preflight.
Trusted scope-bound deployments must follow their separately reviewed authority and
schema recovery runbook.

If no recoverable backup can be established, defer the upgrade.

## Phase 2: move every execution surface to Node 24

Verify that every native surface—Linux, macOS, Windows, WSL, CI, container, and agent
host—runs Node 24 or newer:

```bash
node --version
npm --version
```

Do not share `node_modules` between operating systems or Node majors. In a Lex source
checkout, refresh dependencies and the native SQLite binding under Node 24:

```bash
npm ci --ignore-scripts
npm rebuild better-sqlite3-multiple-ciphers
npm run check-sqlite
```

In a consumer repository, use its reviewed clean-install workflow under Node 24.
If the consumer directly owns `better-sqlite3-multiple-ciphers`, rebuild it there as
well. A native ABI load error is a dependency-install problem, not evidence that the
Frame store is corrupt.

Update Node 20/22 CI matrices and container images before claiming support. Lex 4
does not add an unproven upper ceiling.

## Phase 3: update the Lex consumer

### Repository dependency

Update the reviewed consumer lock from the public artifact:

```bash
npm install --save-exact @smartergpt/lex@4.0.0
npm ls --depth=0 @smartergpt/lex
```

Run the consumer's touched and adjacent gates during iteration, then its exhaustive
release or integration gate at the release candidate. Consumers must import only
declared package exports; imports from Lex source paths or undeclared `dist/` paths
are not supported compatibility surfaces.

### Global CLI

If the CLI is intentionally installed globally:

```bash
npm install --global @smartergpt/lex@4.0.0
lex --version
lex --help
```

`--version` and `--help` do not select or open a Frame store.

### Trusted embedded host

A trusted embedded host is not migrated by replacing ambient `LEX_*` variables.
Retain its explicit repository evidence, authority resolver, `AuthorizedScope`,
scope-bound store binder, runtime role, RLS checks, and separate administration
boundary. Recompile against the 4.0 public exports and rerun the host's cross-tenant,
cross-workspace, cancellation, pool-reset, and negative-authority gates before
resuming traffic.

## Phase 4: move MCP to the canonical transport

`@smartergpt/lex-mcp` is the supported stdio launcher. It pins the exact matching Lex
release. Do not launch `frame-mcp.mjs`, `lex-launcher.sh`, a copied transport, or a
Lex `dist/` file.

Use an exact version during migration:

```toml
command = "npx"
args = ["--yes", "@smartergpt/lex-mcp@4.0.0"]
```

For JSON-based hosts:

```json
{
  "command": "npx",
  "args": ["--yes", "@smartergpt/lex-mcp@4.0.0"]
}
```

Preserve the reviewed `LEX_WORKSPACE_ROOT`, `LEX_STORE`, `LEX_DB_PATH`, and
`LEX_DATABASE_URL` values. Change a value only through a separate store-routing
review.

### Pass secrets without storing them

Some MCP hosts pass only explicitly allowlisted parent environment variables. A
password present in the desktop application or terminal environment may therefore be
absent from the Lex-MCP child. Do not solve this by writing the password into a
checked-in or shared MCP configuration.

For a Codex TOML configuration, forward the already-present parent variable by name:

```toml
[mcp_servers.lex]
command = "npx"
args = ["--yes", "@smartergpt/lex-mcp@4.0.0"]
env_vars = ["LEX_POSTGRES_PASSWORD"]

[mcp_servers.lex.env]
LEX_WORKSPACE_ROOT = "/absolute/path/to/repository"
LEX_STORE = "postgres"
LEX_DATABASE_URL = "postgresql://lex@127.0.0.1:5433/lex"
```

The example contains no password. Other hosts must use their documented secret
reference or environment pass-through mechanism. Do not assume parent inheritance:
confirm it without printing the value, then restart or reload the MCP host so the
child receives the new environment.

`LEX_POSTGRES_PASSWORD` is needed only when the reviewed URL omits a password.
Embedding a password in `LEX_DATABASE_URL` is supported but is less suitable for
shared configuration.

### Removed-entrypoint diagnostic

`LEX_MCP_LEGACY_ENTRYPOINT_REMOVED` is an intentional fail-closed response. It means
the host still launches the removed source transport or shell wrapper. It does not
mean Frames were deleted or the store is corrupt.

The recovery is:

1. preserve all reviewed `LEX_*` routing values;
2. replace only the command and arguments with the canonical package invocation;
3. preserve secret pass-through by variable name;
4. restart the MCP host; and
5. run the read-only transport acceptance below.

## Phase 5: read-only acceptance

Acceptance has two layers. Stop at the first failure.

### Package and transport acceptance—no store access

First verify package identity and CLI startup:

```bash
npx --yes --package @smartergpt/lex@4.0.0 lex --version
npx --yes --package @smartergpt/lex@4.0.0 lex --help
```

Then send only MCP initialization, its notification, and `tools/list`:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"lex-migration-check","version":"1.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' |
  npx --yes @smartergpt/lex-mcp@4.0.0
```

Success means initialization and `tools/list` return JSON-RPC responses and
`notifications/initialized` returns none. This checks the canonical transport
without calling a store-backed tool.

Do **not** use `frame_create`, `remember`, `init`, `db`, or another write-capable
operation for acceptance. Do not use MCP `system_introspect` or `frame_list` against
an existing store for this migration gate: compatibility introspection and ordinary
listing paths may initialize or migrate the selected store.

### Explicit store acceptance—hard read-only

Only after the operator has confirmed the intended store identity, use `lex context`.
It requests the hard read-only store mode and does not initialize or migrate either
backend.

For an existing SQLite store, substitute the one operator-reviewed absolute path:

```bash
LEX_STORE=sqlite \
LEX_DB_PATH=/absolute/reviewed/path/to/memory.db \
npx --yes --package @smartergpt/lex@4.0.0 \
  lex --json context --project-root /absolute/reviewed/workspace --limit 1 --max-tokens 200
```

For PostgreSQL, run from a shell or host that already receives the reviewed
credential-free URL and separately injected password:

```bash
LEX_STORE=postgres \
npx --yes --package @smartergpt/lex@4.0.0 \
  lex --json context --project-root /absolute/reviewed/workspace --limit 1 --max-tokens 200
```

Do not add a credential on the command line and do not print the environment. The
PostgreSQL read-only mode checks the existing compatibility schema version without
starting a migration transaction. It is an application-level no-write contract, not
a replacement for database permissions.

A successful result must identify the expected workspace, branch evidence, and
credential-free store identity. An empty result is valid. A mismatch is a stop
condition, not permission to search for another database.

Hard read-only SQLite intentionally refuses unsafe cases. A missing file, active
non-empty WAL or rollback journal, unsupported schema, or encrypted database can
produce a stable failure rather than risk touching the canonical file. Preserve that
failure and use the recovery matrix; do not make the file writable to force the
acceptance check.

## Failure and recovery matrix

| Signal | Meaning | Safe next action | Operator explanation |
| --- | --- | --- | --- |
| npm reports `EBADENGINE`, or Node is below 24 | Runtime is outside Lex 4 support | Keep 3.0.1 installed or upgrade that surface to Node 24; do not bypass engine checks | “Lex 4 was not started because this host is below its supported runtime floor.” |
| Native module reports a Node ABI or `NODE_MODULE_VERSION` mismatch | SQLite native binding was installed for another Node or OS | Reinstall/rebuild dependencies under Node 24 on that same surface; rerun `check-sqlite` where available | “The package runtime is mismatched; no Frame-store repair is indicated.” |
| `LEX_MCP_LEGACY_ENTRYPOINT_REMOVED` | Host still uses a removed duplicate transport | Preserve environment routing and switch only to exact `@smartergpt/lex-mcp@4.0.0` | “Lex refused an unsafe legacy launch path before accessing the store; this is not data loss.” |
| Windows build fails because `chmod` is unavailable | The checkout predates the cross-platform postbuild helper or is not the reviewed candidate | Stop; verify the exact candidate commit and rerun from a clean Node 24 install. Do not hand-edit packed output to manufacture a pass | “The source build used a stale Unix-only postbuild path; no package or store recovery was attempted.” |
| PostgreSQL SCRAM says the password must be a string, or authentication fails after the launcher change | The MCP child may not receive the separately injected password, or routing/credentials are wrong | Confirm host, port, database, user, and secret pass-through by name; restart the MCP host; never expose the value | “The canonical client reached PostgreSQL without usable authentication; no database recovery was attempted.” |
| Expected PostgreSQL service is stopped or a different port responds | Store routing is not proven | Stop; have the operator restore the intended service/configuration through its runbook | “Lex did not probe alternate databases because the approved target was unavailable.” |
| Workspace, branch, or credential-free store identity is unexpected | Launcher context or routing is wrong | Stop before store-backed MCP calls or writes; restore the reviewed workspace/store settings | “Acceptance found an identity mismatch and halted before mutation.” |
| SQLite hard read-only reports missing file, active journal/WAL, encryption, or `STORE_UNAVAILABLE` | A coherent detached read-only snapshot cannot be proven | Keep writers paused; use the established backup/snapshot process or validate with the existing 3.0.1 operator path | “Lex failed closed rather than touching a live or unreadable SQLite store.” |
| Store schema is older, newer, or structurally unsupported | 4.0 cannot safely read it in acceptance mode | Do not run repair or force migration; preserve evidence and open a store-specific migration issue | “Acceptance found an unsupported schema and made no changes.” |
| Quarantined legacy Frames exist or recovery planning is required | Ownership cannot be inferred safely | Use the separately authorized, redacted inventory and zero-write plan; require an operator-approved manifest before any apply step | “Lex preserved ambiguous Frames and refused to guess ownership.” |
| MCP initialization or `tools/list` fails | Package, protocol, or launcher configuration is wrong before store use | Restore the exact 3.0.1 MCP command or fix the reviewed 4.0 configuration; keep the store paused | “Transport acceptance failed before any store-backed tool was called.” |
| npm integrity or exact dependency differs from the release receipt | Artifact is not the reviewed candidate | Stop installation and investigate registry/lock provenance | “The downloaded identity was not the approved release, so execution was refused.” |
| A dependent lock still resolves Lex 3.0.1 or different 4.0.0 bytes | The dependency was not refreshed from the verified public Lex artifact | Regenerate only that dependent lock from exact public 4.0.0, verify `sha512-` integrity, and rerun packed-consumer gates | “The dependent candidate was stale and was stopped before publication.” |
| `@smartergpt/lex@4.0.0` or matching Lex-MCP is absent | Release train has not reached that publication step | Remain on exact 3.0.1; do not substitute a branch, tarball, or `latest` | “The reviewed public artifact is not available yet.” |
| Lex is public but its tag, Lex-MCP, GitHub release, or Registry entry is incomplete | The immutable release train stopped between publication transitions | Continue from observed state: do not republish Lex; repair the dependent candidate or retry the failed tag/release/Registry step | “The published Lex artifact remains valid; only the incomplete downstream transition will be retried.” |
| Native Windows or another downstream packed consumer fails | The release has not met cross-surface acceptance | Stop the train, preserve the exact package/integrity and first failure, and fix forward in the owning repository before tags or sealing | “The public candidate did not satisfy its downstream native contract, so later release steps were withheld.” |

## Rollback boundaries

If 4.0 has performed only the package/transport checks and hard read-only `context`,
rollback is configuration-only:

1. stop the 4.0 CLI/MCP/application process;
2. restore the exact reviewed 3.0.1 package pin and MCP command;
3. reinstall native dependencies for the active Node/OS if required;
4. rerun 3.0.1's non-mutating startup checks; and
5. resume writers only after workspace and store routing match the baseline.

Node 24 is compatible with the published Lex 3.0.1 `>=20 <25` engine range, so a
package rollback does not require returning the host to Node 20 or 22.

Once any 4.0 process has opened a store through a writable compatibility path, do not
assume that reinstalling 3.0.1 reverses database state:

- stop writers and preserve logs with secrets redacted;
- do not downgrade a schema in place;
- do not overwrite the live SQLite file during diagnosis;
- validate a SQLite backup at a separate explicit recovery path before any operator
  replacement;
- use the PostgreSQL deployment's reviewed snapshot/schema recovery procedure; and
- prefer a reviewed forward fix when a published artifact or migration is at fault.

npm package versions and pushed Git tags are immutable. If published 4.0.0 bytes or
metadata are wrong, stop the release train and publish a reviewed patch; never
republish or overwrite 4.0.0.

## Ecosystem 3.1 order

The release and downstream migration order follows actual dependency direction:

1. publish and verify `@smartergpt/lex@4.0.0`;
2. refresh dependent locks from that public artifact and verify integrity;
3. publish and verify the manifest-selected LexSona release;
4. publish and verify the manifest-selected LexRunner release in both LexSona-off and
   selected-LexSona modes;
5. complete AXF provider conformance and the STFC-Mod shadow proof without adding Lex
   as an AXF runtime dependency;
6. publish `@smartergpt/lex-mcp@4.0.0` last with an exact
   `@smartergpt/lex@4.0.0` dependency;
7. create and verify signed tags and non-draft GitHub releases;
8. approve and verify the protected Lex-MCP Registry publication;
9. rerun native consumers against public artifacts; and
10. seal the Ecosystem 3.1 manifest.

Do not reverse an edge, manufacture a dependent lock from unpublished local state, or
guess versions that remain unresolved in the draft manifest.

## Human-only publication boundary

Agents may prepare a release commit, run gates, pack and inspect a tarball, perform
dry runs, verify public metadata, and print the next command. The authenticated
maintainer performs non-dry-run npm publication, signed tag creation/push, and
protected deployment approval.

Immediately before publishing Lex, the maintainer—not an agent—runs:

```bash
npm whoami
npm access list packages smartergpt --json
git status --short
git rev-parse HEAD
npm publish --access public
```

The expected npm identity is `guffawaffle`; the worktree must be clean and `HEAD` must
equal the reviewed release commit. After publication:

```bash
npm view @smartergpt/lex@4.0.0 version engines dist.integrity --json
```

Lex-MCP is also public, but it is published only at its later release-train step from
its own clean, reviewed checkout. LexSona and LexRunner remain restricted unless
their release issues explicitly change that policy.

## Agent-to-operator handoff

At every stop condition, report:

- the phase and first failing gate;
- Node/npm and exact package versions;
- the expected workspace and a credential-free store identity;
- whether any store-backed operation ran;
- whether any writable operation ran;
- what was deliberately not attempted;
- the smallest safe next action; and
- the backup/snapshot identifier when one exists, without secret-bearing paths or
  values.

Use direct language:

> I stopped before writable store access. The failure is in the runtime, package,
> transport, or routing layer described above; it is not evidence of Frame loss. I
> did not delete, recreate, repair, initialize, migrate, or search for another store.
> The next action is the single bounded recovery step listed for this signal.

Do not tell an operator to “reset Lex,” delete `.smartergpt`, recreate PostgreSQL, or
rotate credentials unless a separate evidence-based incident response explicitly
requires it.

## Related contracts

- [Node 24 migration](./node-24-migration.md)
- [Ecosystem 3.1 release SOP](./ecosystem-3.1.md)
- [MCP configuration](../MCP_CONFIG.md)
- [Compatibility environment](../ENVIRONMENT.md)
- [Store contracts](../STORE_CONTRACTS.md)
- [Runtime scope contract](../RUNTIME_SCOPE_CONTRACT.md)
- [PostgreSQL scope security](../POSTGRES_SCOPE_SECURITY.md)
