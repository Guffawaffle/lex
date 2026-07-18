# PostgreSQL Canonical Authority

Lex 3.0 separates shared canonical authority from every surface-local binding registry. The
PostgreSQL authority owns principal, tenant, workspace, repository, membership, grant, version,
expiry, and revocation records. Windows and WSL may resolve the same canonical UUIDs while each
continues to use its own native SQLite registry and local instance IDs.

## Runtime boundary

`PostgresAuthorityDirectory` accepts an explicit PostgreSQL `Pool` and a required lower-case
schema name. Every authority relation is schema-qualified; an earlier writable `search_path`
entry cannot shadow canonical tables. It never reads a connection string, password, token,
authentication reference, tenant, or workspace from `process.env`.
Authentication references are opaque handles supplied by a trusted selection provider; only their
SHA-256 digests are persisted.

Every resolver or workspace-administration decision uses one `REPEATABLE READ READ ONLY`
transaction. The runtime role is rejected if it is a superuser, has `BYPASSRLS`, owns an authority
table, or can mutate any identity, alias, membership, repository-association, or grant table.
Runtime methods expose no provisioning or revocation operation.
The runtime role receives read-only access to the schema-version ledger because the directory
checks that version before every authority snapshot; it receives no migration write privilege.

Workspace grants remain capability-bearing canonical records, but the directory returns and
`resolveRuntimeScope` copies only the capabilities requested for the current CLI command or MCP
tool into `AuthorizedScope`.
Repository authorization is also explicit: a globally recognized repository must have an active
workspace association before it can be bound or used as provenance for that workspace. Cached
local authority versions and digests must exactly match the current grant; stale cache evidence
fails closed and requires an explicit rebind.

## Administration boundary

`PostgresAuthorityAdministration` is a separately constructed privileged object with the same
explicit schema target. Its migration method receives the read-only runtime role name explicitly,
revokes schema creation, grants schema usage, revokes all table privileges, and grants only the
required schema-qualified table reads. Provisioning is transactional and protected by a
schema-specific advisory lock.

`seedTopology()` is deterministic and idempotent for an identical declaration. Immutable identity
conflicts—such as an authentication handle mapped to another principal, a workspace moved to
another tenant, a grant moved to another scope, or an alias retargeted—roll back instead of
returning a successful receipt. Reapplying a seed never clears a prior revocation. Receipts contain
only counts and digests; authentication handles and credentials are absent.

The built-in `createLex3DogfoodAuthorityTopology(authenticationRef)` fixture declares one principal,
two tenants, five workspaces, five repositories, explicit repository associations, two tenant
memberships, and one attenuable grant per workspace. Its UUIDs are stable machine-readable fixture
identities. Calling the fixture has no runtime effect; an administrator must explicitly pass it to
`seedTopology()`.

## Trusted CLI and MCP composition

`createPostgresTrustedRuntimeHost()` accepts the runtime Pool, `authoritySchema`, trusted
authentication/workspace selection provider, process snapshot, runtime/trace IDs, diagnostic
emitter, and scope-bound FrameStore binder as explicit inputs. It returns two ready compositions:

```ts
const host = createPostgresTrustedRuntimeHost(options);

await run(argv, host.cli);
const mcp = new MCPServer(host.mcp);
```

Both entrypoints share the exact authority, discovery, captured process facts, and binder. The CLI
composition additionally includes the explicit local binding lifecycle service. MCP has no
authority-administration surface. Normal CLI/MCP results remain unchanged; authority and binding
details appear only through the existing opt-in, capability-gated diagnostic envelope.

The packaged compatibility launchers still need a deployer-owned bootstrap to obtain Pool and
secret-provider handles and pass them to this factory. They intentionally do not reconstruct those
handles from ambient environment variables. Until such a launcher supplies explicit handles, the
legacy unguarded compatibility path remains separate and must not be described as PostgreSQL
canonical authority.

## Deployment order

1. Construct `PostgresAuthorityAdministration` with the privileged administration Pool and the
   explicit canonical schema.
2. Call `migrate(runtimeRole)` and review its receipt.
3. Explicitly seed or provision canonical records; for dogfood, review the fixture before applying
   it.
4. Construct a distinct read-only runtime Pool and pass the same explicit schema to
   `PostgresAuthorityDirectory`.
5. Construct the scoped PostgreSQL FrameStore binder with a non-owner, non-`BYPASSRLS` runtime
   role.
6. Pass both explicit runtime handles to `createPostgresTrustedRuntimeHost()`.
7. Bind each native Windows/WSL repository instance through its own local registry.

Authority administration and FrameStore administration may share an operator workflow, but neither
privileged object belongs in normal CLI command dispatch, MCP tool dispatch, or an agent-facing
response.
