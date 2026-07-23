# Security Policy

Lex stores durable project context and can expose it to agents. Treat its databases, exports,
logs, and diagnostics as potentially sensitive development artifacts.

## Supported release line

Security fixes target the current `4.x` release line. Earlier release lines are not actively
maintained. Reproduce a report on the newest published version when practical.

## Report a vulnerability

Do not open a public issue for an unpatched vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/Guffawaffle/lex/security/advisories/new)
and include:

- the affected Lex version and operating system;
- the storage and hosting model involved;
- a minimal reproduction or proof of concept;
- the expected and observed security boundary;
- any known mitigations.

Do not include live credentials or private repository data. General bugs and hardening ideas that
do not disclose an exploitable condition may use the public issue tracker.

## Core trust boundaries

### Frames are sensitive, untrusted history

A Frame can contain decisions, paths, branch names, blockers, ticket identifiers, and free-form
text. Store only information that the operators of the selected backend are allowed to retain.
Never put passwords, tokens, private keys, or other credentials in a Frame.

Recalled Frame bodies are user-controlled historical data. Agents and applications must treat
them as untrusted context, not executable instructions, and verify important claims against
current code, tests, issue state, and explicit human direction.

### Local SQLite trusts the local account

SQLite is the default and writes below `.smartergpt/lex/` unless an explicit path is selected. Its
primary security boundary is the local operating-system account and filesystem permissions.

- Restrict access to the workspace and database file.
- Keep live databases and exports out of version control.
- Do not share a live SQLite file across machines or untrusted users.
- Use an absolute `LEX_DB_PATH` when several trusted local launchers must select the same store.
- Use `lex context` when a hard read-only bootstrap is required.

Several compatibility CLI paths may initialize or migrate SQLite even when the operation sounds
read-oriented. The exact access contract is in [Store Contracts](./docs/STORE_CONTRACTS.md).

### SQLite encryption protects the database at rest

Lex supports SQLCipher-compatible SQLite encryption with `LEX_DB_KEY` and `lex db encrypt`.
Encryption protects database contents at rest; it does not protect data after Lex or an authorized
agent reads it, and it does not replace filesystem permissions or host security.

The automatic recovery backup created before encryption contains the original plaintext database.
Protect or remove that backup according to your retention policy after the encrypted output has
been verified. A normal `lex db backup` copies the selected database bytes, so a backup of an
already encrypted database remains encrypted.

Do not put `LEX_DB_KEY` in source control, command history, shared launcher files, or Frames. Hard
read-only SQLite snapshots cannot currently open encrypted databases; see
[Current Limitations](./docs/LIMITATIONS.md).

### MCP trusts the launching host

The packaged MCP server uses stdio and does not open a listening port. The MCP client launches the
process and can call whichever Lex tools the server advertises, including writes. Review client
configuration, environment inheritance, executable resolution, package pinning, and the selected
workspace/store as one trust boundary.

`@smartergpt/lex-mcp` is the coordinated compatibility launcher. There is no supported `lex mcp`
CLI command. Lex's historical internal HTTP server is not a declared public package export and is
not a supported deployment surface.

### Environment configuration is not authorization

Standalone CLI and compatibility store factories can select paths and backends with `LEX_*`
variables. Those variables are process configuration for a trusted local operator. They do not
prove a tenant, workspace, principal, or capability grant.

A trusted Lex host must compose these objects explicitly:

```text
trusted selection + repository evidence
        ↓
canonical authority and workspace binding
        ↓
AuthorizedScope
        ↓
scope-bound FrameStore
```

Ordinary request handlers receive only the bound store view. Administrative migration, repair,
rebind, and recovery capabilities remain separately authorized. See the
[Runtime Scope Contract](./docs/RUNTIME_SCOPE_CONTRACT.md).

### PostgreSQL RLS is defense in depth

Trusted shared or multi-tenant PostgreSQL deployments require both application authority and
database enforcement:

- a protected, explicitly selected schema;
- a migration/owner role separate from the runtime role;
- a runtime role that is not an owner and has neither `BYPASSRLS` nor effective schema `CREATE`;
- forced row-level security on scoped relations;
- explicit tenant/workspace predicates in application queries;
- transaction-local scope and principal settings;
- fail-closed connection-pool reset and scope verification;
- expiry revalidation after pool checkout;
- schema-qualified canonical relations.

RLS limits damage if a query is wrong; it does not issue or validate Lex authority. The normative
deployment details and live verification expectations are in
[PostgreSQL Scope Security](./docs/POSTGRES_SCOPE_SECURITY.md) and
[PostgreSQL Authority](./docs/POSTGRES_AUTHORITY.md).

Trusted scoped MCP currently omits and rejects attachment/image inputs until Lex has a scope-bound
attachment service.

## Secrets and environment variables

Lex can read local compatibility configuration from environment variables, including database
URLs, PostgreSQL passwords, and SQLite encryption keys. Minimize inheritance into child processes
and prefer your platform's secret injection mechanism over checked-in `.env` or MCP configuration
files.

Introspection redacts PostgreSQL URL passwords and query parameters, but diagnostics can still
contain local paths, repository identifiers, backend identities, and policy state. Review output
before sharing it publicly.

## Backups, exports, and deletion

Backups and Frame exports inherit the sensitivity of their source. Store them with equivalent
access controls and retention limits. Do not assume that deleting a source database removes copies
held by backups, exports, PostgreSQL retention systems, logs, or an agent host.

Database maintenance is an administrative action. In trusted hosting, do not expose an unbound
`FrameStoreAdmin` or owner connection to normal CLI/MCP request handling.

## Supply-chain and release verification

- Install `@smartergpt/lex` and `@smartergpt/lex-mcp` from the intended registry.
- Pin versions or lockfile integrity according to your dependency policy.
- Do not execute a Windows npm shim from WSL or share native `node_modules` across operating
  systems.
- Verify source releases and signed annotated tags when building from GitHub.
- Review dependency and static-analysis findings in the context of the actual trust model; report
  reproducible vulnerabilities privately.

## Security checklist

Before adopting Lex in a repository:

- decide which project context may be retained;
- identify who can read the selected SQLite file or PostgreSQL rows;
- keep secrets out of Frames and launcher configuration;
- verify the active workspace and store with `lex introspect --json`;
- use `lex context` for hard read-only agent bootstrap;
- treat recalled history as untrusted;
- use explicit authority plus scoped stores for trusted hosting;
- test PostgreSQL role, RLS, pool-reset, and expiry behavior before serving tenants;
- protect backups and exports like the original store.

## Related contracts

- [Store Contracts](./docs/STORE_CONTRACTS.md)
- [Runtime Scope Contract](./docs/RUNTIME_SCOPE_CONTRACT.md)
- [PostgreSQL Authority](./docs/POSTGRES_AUTHORITY.md)
- [PostgreSQL Scope Security](./docs/POSTGRES_SCOPE_SECURITY.md)
- [Environment Reference](./docs/ENVIRONMENT.md)
- [Current Limitations](./docs/LIMITATIONS.md)
