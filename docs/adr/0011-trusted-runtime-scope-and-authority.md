# ADR-0011: Trusted Runtime Scope and Authority Boundary

- Status: **Accepted**
- Date: 2026-07-17
- Authors: Guff, Sol, Lex
- Tracking epic: #749
- Phase 1 issue: #753
- Phase 2 issue: #755

## Context

Lex runs from native Windows, WSL, Linux, macOS, CLI, MCP, local SQLite, and shared PostgreSQL environments. Historically, project roots, current working directories, Git state, environment variables, and database locations helped locate data and policy. Those inputs are useful discovery evidence, but they cannot safely define resource ownership or authorization.

The dogfood topology also requires one principal to operate across two tenants and five workspaces without an invocation accidentally becoming an “all accessible data” query. The same repository may have multiple clones and worktrees, one workspace may contain multiple repositories, and one repository may participate in more than one workspace.

Windows and WSL sharpen the distinction. Two native runtimes may access the same checkout bytes through different paths while using different OS users, permissions, Git installations, credential providers, and SQLite VFS implementations. Sharing one mutable local registry file would conflate canonical identity with surface-local evidence.

## Decision

### 1. Identity concepts remain distinct

Lex defines separate canonical identities for tenants, principals, workspaces, and repositories, plus local identities for workspace instances, repository instances, execution surfaces, registry installations, and runtimes.

- A tenant is the broader trust and ownership realm.
- A workspace is persistent logical memory, policy, and retrieval context.
- A repository is stable source provenance and a policy namespace.
- A workspace instance is one local realization of a workspace.
- A repository instance is one checkout or worktree.
- A project root is an invocation-local path used for discovery.
- Branches and revisions are provenance and filtering inputs only.

Canonical IDs are opaque immutable UUIDs. Human selectors use scoped slugs; display names are cosmetic. Public contracts never expose or depend on a UUID generation version.

Workspace authorization accepts one coherent workspace selector. A canonical workspace ID resolves its owning tenant; a workspace slug is qualified by a tenant selector. Canonical repository lookup is ID-only because no globally unique repository-slug namespace is ratified. Repository slugs remain declaration and display hints.

### 2. Canonical authority and local binding state are different abstractions

`AuthorityDirectory` resolves shared canonical identities and evaluates principal membership, workspace grants, capabilities, revocations, and authority versions.

`LocalBindingRegistry` records how one native execution environment realizes and verifies repositories and workspaces. It stores local paths, local instance IDs, binding evidence, receipts, verification times, and visibly cached canonical evidence.

Every locally cached authority record has a finite expiry and must be reverified. Canonical grants may omit their own expiry; that does not permit an indefinite local cache.

The local registry does not grant workspace access, add tenant membership, or authorize principals. Correct UUIDs in a copied or edited registry cannot create server authority.

When shared PostgreSQL authority is configured, it is authoritative for canonical membership and grants. In isolated local mode, a user-owned registry may bootstrap authority only for that local principal and store.

### 3. One local registry exists per native execution surface

Native Windows Lex uses the Windows user-state registry. Native Lex in each WSL distribution uses that distribution’s Linux user-state registry. Separate WSL distributions do not share mutable binding state.

The native process selects the registry, not its launching shell. A Windows Lex process launched through WSL interoperability still uses the Windows registry. Linux Lex operating against `/mnt/c/...` uses its WSL distribution’s registry.

Windows and WSL bindings may resolve to the same canonical principal, tenant, workspace, and repository while retaining distinct execution-surface, registry, workspace-instance, and repository-instance IDs.

Lex will not share a mutable SQLite registry through `/mnt/*`, `\\wsl$`, or another cross-filesystem path. Optional evidence that two surface-local instances expose the same checkout is descriptive and never merges authority or instance identity.

### 4. Repository declarations are claims, not grants

A checked-in Lex manifest may declare stable repository identity and optional preferred workspace hints. It cannot grant tenant membership or permanently assign the repository to one workspace.

The absence of a repository declaration is a normal, representable state. Provider, Git, registry, and authority evidence may support an explicit administrative registration, but normal bootstrap fails closed and never synthesizes a declaration or binding.

Normal bootstrap verifies the declaration against surface-local registry bindings, provider/Git evidence, and canonical authority. Forks, copied manifests, moved roots, clones, worktrees, missing bindings, and ambiguous evidence become explicit states.

Binding creation, rebinding, inspection, and revocation are administrative operations. Normal recall, remember, CLI startup, and MCP startup never create or repair bindings opportunistically.

### 5. Configuration, invocation, and authorization are immutable separate values

`ResolvedRuntimeConfig` records deterministic configuration resolution, backend selection, source evidence, module references, and digests.

`InvocationContext` records the runtime, active project root, requested workspace selector, repository claim/evidence, local binding, runtime surface, and source revision.

`AuthorizedScope` records the single active tenant/workspace grant for an invocation. It is minted by trusted authority and stamps scope into later store operations.

Only a trusted entrypoint may capture ambient CLI, environment, path, and platform inputs. Core modules receive immutable values and do not reread `process.env`, `cwd`, or mutable global caches.

Authentication enters this boundary only as an opaque reference to entrypoint-owned state. The reference is never a credential and is excluded from diagnostics. Configuration provenance distinguishes already-known CLI, MCP-launch, explicit SDK/constructor, project-manifest, user-config, local-registry, authority-directory, compatibility-environment, and default sources.

### 6. Resolution fails closed with stable errors

The v1 vocabulary includes:

- `LEX_WORKSPACE_UNBOUND`
- `LEX_REPOSITORY_BINDING_MISMATCH`
- `LEX_WORKSPACE_SELECTOR_UNAUTHORIZED`
- `LEX_WORKSPACE_BINDING_AMBIGUOUS`
- `LEX_AUTHORITY_CACHE_EXPIRED`
- `LEX_AUTHORITY_GRANT_REVOKED`

Compatibility environment variables and flags may select an existing authorized binding. They cannot create membership, choose another authority registry, or mint scope.

### 7. Diagnostics are structured observability

Per-operation diagnostics and runtime-wide introspection share a versioned vocabulary. Diagnostics report decisions already made; they do not rerun resolution, change behavior, or grant access.

Full diagnostic fields are capability-gated and redacted. Normal agent-facing results remain compact and omit tenant/principal envelopes, local paths, binding evidence, grants, and policy traces. Projected content may carry an opaque origin reference when attribution matters.

`--verbose` remains operational logging and is not the diagnostic response contract.

### 8. Ownership and sharing remain explicit

An episodic Frame has one owning tenant/workspace scope. Same-tenant cross-workspace use is an explicit immutable projection requiring source-share and target-accept authority. Cross-tenant or public reuse requires publication of a new immutable content-addressed artifact and explicit workspace acceptance.

These storage and sharing behaviors are architectural constraints but are not implemented by Phase 1 or Phase 2.

### 9. Legacy ownership is assigned only through deterministic evidence

Existing Frame rows do not prove tenant/workspace ownership. Explicit source-store mappings and preserved binding/migration receipts may support assignment. Branches, module names, paths, Jira values, keywords, and current Git state may only suggest classifications.

Ambiguous records remain in admin-only migration staging and cannot enter normal recall or projections. Only approved import creates the first scoped Frame and its immutable ownership receipt.

## Public contract and conformance surface

Phase 1 publishes the TypeScript contract through `@smartergpt/lex/runtime-scope`. It includes opaque ID types, authority and binding interfaces, immutable runtime envelopes, diagnostic envelopes, stable errors, and data-only conformance fixtures.

The fixtures describe Windows/WSL identity separation, multiple WSL distributions, registry selection, clones, worktrees, moved roots, forks, manifest edits and absence, environment selectors, registry copies, expired grants, conflicting evidence, and diagnostic non-interference. They do not open databases or alter runtime behavior.

Phase 2 implements pure execution-surface and registry-location resolution, a separate versioned SQLite local registry, explicit binding lifecycle operations, and a deterministic fail-closed resolver over injected authority and registry interfaces. All exported fixtures execute against the implementation in tests. The implementation remains opt-in and does not change CLI, MCP, Frame, or FrameStore behavior.

## Consequences

### Positive

- Paths and ambient configuration cannot silently become authority.
- Shared identity and surface-local topology can evolve independently.
- One principal can safely operate in multiple tenants without broad queries.
- Windows and WSL dogfood the isolation boundary directly.
- Agent context stays compact while authorized diagnostics remain explainable.
- Later store, RLS, projection, and publication work has a reviewable contract.

### Costs

- Every execution surface must register and maintain its own local binding.
- Bootstrap must coordinate local evidence with canonical authority.
- Offline cross-surface identity requires an explicit future policy.
- Legacy data cannot be assigned through convenient heuristics.

## Deferred decisions

- UUID generation version.
- Exact public binding command spelling.
- Offline authority snapshots and cross-surface pairing.
- CLI/MCP integration and diagnostics implementation (Phase 3).
- Scoped FrameStore behavior and physical ownership migration (Phase 4 and later).
- PostgreSQL RLS, same-tenant projections, and catalog publication.
- A shared runtime helper package; contracts must survive implementation in Lex and AXF first.

## Related work

- #715 owns caller-root behavior and should consume this boundary later.
- #736 owns authoritative Frame/FrameStore reconciliation.
- #750 owns explicit SQLite structural repair.
- #734 owns the narrower Markdown-derived KnowledgeFrame vertical slice.
- #755 owns deterministic runtime-scope resolution and the local registry implementation.
