# PostgreSQL Scope Security

Lex 3.0 uses two independent controls for shared PostgreSQL Frame storage:

1. every normal query contains explicit tenant, workspace, and active-principal predicates; and
2. PostgreSQL enforces the same tenant/workspace boundary with forced Row-Level Security (RLS).

RLS is defense in depth. It never grants authority and it does not replace trusted runtime-scope
resolution. Normal callers receive a `ScopedFrameStore` only after Lex has resolved an immutable,
attenuated `AuthorizedScopeV1`.

## Runtime and administration are separate

`PostgresScopedFrameStoreBackend` accepts an explicit runtime connection or pool. It can bind a
normal scoped store, but it has no migration, repair, role-management, or admin-binding methods.
Before serving data it verifies that the connected role:

- is not a superuser;
- does not have `BYPASSRLS`;
- does not own `frames`; and
- has no effective `CREATE` privilege on the protected FrameStore schema; and
- is using schema version 3 with RLS enabled and forced.

`PostgresFrameStoreAdministration` is the distinct privileged boundary. It exposes migration
planning, migration execution, and capability-gated ownership inspection. Do not pass it, its
connection, or its credentials to CLI/MCP normal dispatch.

Canonical principal, tenant, workspace, membership, grant, and repository authorization lives in a
separate PostgreSQL directory. Its runtime role is also read-only and non-owner; it must not be
confused with either FrameStore administration or surface-local SQLite bindings. See
[PostgreSQL Canonical Authority](./POSTGRES_AUTHORITY.md).

The migration intentionally does not create login roles or fetch credentials. A database
administrator provisions roles through the deployment's secret/identity system. A representative
grant shape, executed by the schema owner after migration, is:

```sql
ALTER ROLE lex_runtime
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

REVOKE CREATE ON SCHEMA lex_store FROM PUBLIC;
-- Also revoke CREATE from every group role inherited by lex_runtime.
REVOKE CREATE ON SCHEMA lex_store FROM lex_runtime;
GRANT USAGE ON SCHEMA lex_store TO lex_runtime;
GRANT SELECT ON lex_store.lex_frame_store_migrations TO lex_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON lex_store.frames TO lex_runtime;
GRANT EXECUTE ON FUNCTION lex_store.lex_runtime_scope_is_valid() TO lex_runtime;
GRANT EXECUTE ON FUNCTION lex_store.lex_runtime_scope_matches(uuid, uuid) TO lex_runtime;
```

The schema owner/migration role is not a runtime role. Lex fails closed if an owner, superuser,
`BYPASSRLS`, or effective schema-creator role is supplied to
`PostgresScopedFrameStoreBackend` even though PostgreSQL itself could let that role escape policy
enforcement. Use a dedicated protected schema; a direct revoke from the login role does not remove
privileges inherited through `PUBLIC` or group membership.

## Transaction and pool invariant

Every normal operation checks out one pool client and performs this sequence:

1. clear all Lex scope settings on checkout;
2. begin a transaction (read operations also set the transaction read-only);
3. set `lex.tenant_id`, `lex.workspace_id`, and `lex.principal_id` with transaction-local
   `set_config(..., true)` calls;
4. execute only explicitly scoped queries;
5. commit, or roll back after any error/cancellation; and
6. clear all Lex scope settings again before releasing the client.

The pre- and post-transaction resets protect against a client that was contaminated by unrelated
pool code. Transaction-local settings protect normal commit and rollback paths. A cleanup failure
causes the `pg` pool to discard that client instead of reusing it.

The database policy validates all three settings as canonical UUID text. Tenant and workspace
must match the protected row; principal must be a valid active invocation context. Principal does
not equal creator by design: authorized collaborators in one workspace can read shared Frames.
`creator_principal_id` remains immutable provenance stamped by the adapter on first insertion.
PostgreSQL independently requires inserted creator provenance to equal the transaction principal.
A protected trigger rejects any update to tenant, workspace, creator, or scope-version ownership,
while collaborators can still update ordinary Frame content inside their authorized workspace.

## Schema v2 and existing rows

Schema v1 Frames do not contain trustworthy tenant, workspace, or creator ownership. Migration
therefore never guesses it. Within the migration transaction it copies those rows to the
admin-only `lex_frame_store_unowned_frames_v1` quarantine, empties the runtime table, installs
non-null ownership columns and the `(tenant_id, workspace_id, id)` primary key, and enables forced
RLS. Quarantined rows cannot re-enter normal storage until a separately designed administrative
ownership-establishment workflow exists.

Use `PostgresFrameStoreAdministration.planMigration()` to report the current version, pending
versions, and quarantine count without starting a transaction or mutating schema. Migration itself
uses one transaction and an advisory transaction lock; any failure rolls the complete change back.

## Verification

Deterministic fake-pool tests cover every normal operation, explicit predicates, capability and
scope rejection, alternating scopes, commit/rollback cleanup, unsafe runtime roles, migration
dry-run, quarantine, and policy SQL without credentials.

The live suite is opt-in and requires distinct pre-provisioned admin and runtime connections:

```bash
LEX_TEST_POSTGRES_ADMIN_URL='postgresql://…' \
LEX_TEST_POSTGRES_RUNTIME_URL='postgresql://…' \
node --import tsx --test \
  test/memory/store/postgres/scoped-frame-store.integration.test.ts
```

It creates an isolated schema, uses a single-client runtime pool to alternate colliding Frames
across tenants/workspaces, proves missing/malformed settings see no rows, and verifies the runtime
role cannot disable RLS or drop policy. The URLs are read only by that explicitly invoked test;
normal adapter construction takes an explicit connection/pool and does not discover credentials
from environment variables.
