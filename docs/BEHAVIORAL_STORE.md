# Scoped Behavioral Store

The scoped behavioral store is Lex's authorized persistence socket for LexSona. Normal consumers
receive `ScopedBehavioralReadStore` and/or `ScopedBehavioralWriteStore`; they never receive a
SQLite `Database`, PostgreSQL `Pool`/`PoolClient`, query builder, database path, or connection
metadata.

## Authority and capability boundary

Trusted composition binds one immutable tuple before normal operations are available:

```text
(tenant, workspace, repository, repository instance, principal, capability grant)
```

Paths, branches, environment variables, record payloads, and LexSona selectors cannot mint or
change this tuple. Read and write views are independently attenuated:

| Capability | Operations |
|---|---|
| `behavior:read` | compact persona/rule lookup and deterministic snapshots |
| `behavior:write` | immutable persona/rule revisions and append-only evidence |
| `behavior:promote` | reviewed applicability promotion |
| `behavior:provenance` | opt-in creator, source Frame, and repository-instance evidence |

Ordinary queries have no authority selector. Compact output omits tenant, workspace, principal,
repository provenance, source Frame IDs, timestamps, backend identity, and credentials. Detailed
provenance is both opt-in and capability-gated.

## Data, revision, and receipt contract

Personas and rules are immutable `(resource ID, revision)` records with canonical SHA-256 content
digests. Evidence is append-only: observations/corrections increase alpha evidence while
counterexamples/trust gaps increase beta evidence. Confidence is derived from immutable priors plus
event counts, so concurrent observations cannot overwrite one another or fabricate a successful
counter update.

Every write requires an idempotency key. Repeating the same key and canonical payload returns a
`replayed` receipt. Reusing the key for another payload or trying to replace an immutable revision
returns a deterministic `conflict` receipt. Receipts contain operation, resource/revision, payload
digest, and receipt digest—not database details.

Snapshot revision evidence covers selected persona/rule revisions, effective applicability,
confidence inputs, and reviewed baseline revisions. `contentDigest` additionally covers the full
content needed by LexSona to construct a `ConstraintSnapshot_v1` without opening a Lex database.

## Ownership lattice and reviewed baselines

Tenant-owned rows remain exact workspace/repository-instance records. Their applicability can be
workspace-, repository-, module-, or task-specific. This preserves the canonical ownership tuple
while allowing narrower behavioral selection.

Curated global baselines and tenant defaults are separate immutable, reviewed source revisions.
Every tenant default carries its canonical tenant ID and is projected only into bindings for that tenant;
supplied by the trusted host. They are not nullable “global” rows, ambient fallback queries, or a
reason to relax workspace RLS. The host may supply only the tenant defaults authorized for the
active tenant. The store validates every supplied baseline digest and includes its revision evidence
in snapshots. Acceptance of one baseline by one workspace never exposes another tenant or
workspace's persisted rows.

## SQLite

`SqliteBehavioralStoreBackend` uses dedicated `lex_behavioral_*` relations. One database can host
the two-tenant/five-workspace conformance topology, but every query still uses the complete bound
tuple. Legacy `lexsona_behavior_rules` and `personas` tables are neither queried nor adopted.

The SQLite rollout procedure is:

1. take a recoverable database backup;
2. run the read-only internal inventory and record its counts;
3. open the new backend, which transactionally creates only dedicated version-1 relations;
4. run shared conformance and compare inventory counts; and
5. enable the LexSona socket only after verification.

Rollback disables the socket and explicitly runs the generated operator rollback SQL (or restores
the backup). It drops only `lex_behavioral_*` relations in foreign-key-safe order. Tests prove both
inventory and rollback leave legacy unowned rows byte-for-byte available to their compatibility
owner.

## PostgreSQL and RLS

The PostgreSQL runtime adapter requires an explicit protected schema and a non-owner runtime role.
Every transaction clears prior settings, sets transaction-local tenant/workspace/repository/
repository-instance/principal values, executes explicitly scoped SQL, then commits or rolls back and
clears settings again before pool release.

All five behavioral relations have forced RLS. Policies validate canonical UUID settings and match
tenant, workspace, repository, and repository instance. Insert policies also require creator
provenance to equal the active principal. The adapter fails closed if any relation is missing forced
RLS or the role is an owner, superuser, `BYPASSRLS`, or effective schema creator.

Administration is separate. The internal migration planner inventories the dedicated ledger and
the presence of legacy tables without reading/adopting their rows. Migration is protected by a
transaction advisory lock; failed migrations roll back as a unit. A committed rollout is reversed
only through the explicit generated rollback SQL after disabling runtime traffic and taking a
backup. The rollback script names only dedicated behavioral objects.

Deterministic unit tests cover qualified SQL, all explicit scope predicates, transaction-local
settings and cleanup, unsafe-boundary checks, migration inventory, forced-RLS policy SQL, and
legacy non-adoption. A live suite runs the same shared conformance and two-tenant/five-workspace
topology and proves bad-filter reads/writes are stopped by PostgreSQL itself when distinct
`LEX_TEST_POSTGRES_ADMIN_URL` and `LEX_TEST_POSTGRES_RUNTIME_URL` credentials are supplied.
