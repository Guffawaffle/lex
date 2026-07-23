# Trusted Runtime Scope Contract

Use this contract when building a trusted Lex host for more than one tenant, workspace, principal,
or repository binding. Ordinary local SQLite users do not need it; the CLI/compatibility path is
documented in the main README and environment reference.

Lex exposes its versioned identity, authority, local-registry, and resolver surface from:

```ts
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  SqliteLocalBindingRegistry,
  captureTrustedBootstrapInput,
  createTrustedRuntimeScopeBootstrap,
  authorizeTrustedRuntimeEntrypoint,
  detectExecutionSurface,
  resolveLocalRegistryLocation,
  resolveRuntimeScope,
  type AuthorityDirectory,
  type LocalBindingRegistry,
  type ResolvedRuntimeConfig,
  type InvocationContext,
  type AuthorizedScope,
  type DiagnosticRequest,
  type DiagnosticEnvelope,
} from "@smartergpt/lex/runtime-scope";
```

Lex ships the versioned contract, deterministic resolver, surface-local registry, production
repository discovery, explicit binding administration, canonical PostgreSQL authority, and one
injectable CLI/MCP guard. Compatibility hosts remain available for local and migration workflows,
but a trusted Lex host must supply canonical authority, trusted selection, and a scope-bound
store together.

## Boundary

```text
AuthorityDirectory
    canonical IDs, memberships, grants, capabilities, revocations

LocalBindingRegistry
    surface-local paths, instances, evidence, verification, receipts
```

`LocalBindingRegistry` deliberately cannot add tenant memberships, grant workspace access, or authorize principals. Cached authority records carry source, version, digest, verification, expiry, and revocation evidence; they are not locally minted grants.

Every local cached-authority record has an expiry. A canonical grant may omit its own expiry, but a local cache must apply a finite cache lifetime and reverify against authority before that lifetime ends.

## Contract families

| Family | Version constant | Purpose |
| --- | --- | --- |
| Canonical authority | `AUTHORITY_DIRECTORY_CONTRACT_VERSION` | Shared identities and workspace authorization decisions |
| Local binding | `LOCAL_BINDING_CONTRACT_VERSION` | Native execution-surface identity, evidence, and binding lifecycle |
| Runtime scope | `RUNTIME_SCOPE_CONTRACT_VERSION` | Resolved configuration, invocation context, and active authorized scope |
| Diagnostics | `DIAGNOSTIC_CONTRACT_VERSION` | Deterministic redacted evidence for existing decisions |
| Conformance | `RUNTIME_SCOPE_CONFORMANCE_VERSION` | Platform-neutral behavior cases for future implementations |

Serialized v1 interfaces carry `schemaVersion: 1`. Opaque IDs are represented physically as UUIDs, but consumers must not infer a UUID version or embedded timestamp.

## Scope semantics

- An invocation has one active tenant and workspace.
- A requested workspace is a selector, not authority.
- Workspace authorization accepts one coherent selector. A workspace ID resolves its owning tenant; a human workspace slug is qualified by a tenant selector.
- A project root locates evidence and never grants access.
- Repository identity is canonical provenance; repository instances are local checkouts/worktrees.
- Canonical repository lookup is ID-only. A repository slug is an untrusted declaration and display hint, not a globally unique authority key.
- A checked-in repository declaration is optional. Its absence is a representable unbound state that requires explicit registration; normal bootstrap never synthesizes a declaration.
- Windows, each WSL distribution, and other native environments use separate local registries.
- The native process determines the registry even when another shell launches it.
- Shared PostgreSQL authority independently verifies local selector/evidence input.

Principal resolution accepts only an opaque authentication-state handle owned by the trusted entrypoint. The handle must never contain a token, API key, or session credential and must never appear in diagnostics.

Configuration provenance distinguishes CLI, MCP launch, explicit SDK/constructor, project manifest, user configuration, local registry, authority directory, compatibility environment, and default sources.

## Stable resolver errors

| Code | Meaning |
| --- | --- |
| `LEX_WORKSPACE_UNBOUND` | No trusted local binding matched |
| `LEX_REPOSITORY_BINDING_MISMATCH` | Declaration and trusted evidence disagreed |
| `LEX_WORKSPACE_SELECTOR_UNAUTHORIZED` | Canonical authority rejected the selector |
| `LEX_WORKSPACE_BINDING_AMBIGUOUS` | Multiple candidates could not be disambiguated |
| `LEX_AUTHORITY_CACHE_EXPIRED` | Cached authority expired before reverification |
| `LEX_AUTHORITY_GRANT_REVOKED` | Canonical authority revoked the grant |

These codes are also included in the existing `LEX_ERROR_CODES` catalog.

## Diagnostics

Diagnostic requests use `summary` or `full` levels. Full output is still capability-gated and redacted. Requesting diagnostics never changes the resolution result.

Normal agent-facing output should not contain raw tenant/workspace topology, principal IDs, local paths, binding evidence, grant records, or configuration source locations. Those fields belong only in an authorized diagnostic envelope.

## Conformance fixtures

`RUNTIME_SCOPE_CONFORMANCE_FIXTURES` is deterministic, versioned data. It covers:

- native Windows and WSL resolving the same canonical scope with distinct local instances;
- Windows processes launched through WSL interoperability;
- multiple WSL distributions and separate registry files;
- copied registries, environment selectors, and edited manifests failing to create authority;
- repositories without checked-in declarations remaining unbound until explicit registration;
- forks, clones, worktrees, and deliberate moved-root rebinding;
- expired cached authority and conflicting evidence;
- diagnostic observability without behavior changes.

Implementations should adapt the fixtures to their test harness without changing their expected semantics. The fixtures perform no file or database access.

Lex also runs every exported fixture through its concrete resolver and SQLite registry in the
implementation conformance suite.

## Resolver and local-registry implementation

### Trusted capture and execution surfaces

`detectExecutionSurface`, `resolveLocalRegistryLocation`, and `resolveRuntimeScope` operate only on explicit inputs. They do not read `process.env`, `process.cwd()`, `process.platform`, OS release files, or mutable global caches. A trusted entrypoint must capture allowed ambient values once in a `BootstrapInputSnapshotV1` and pass the immutable snapshot inward.

Registry selection follows the native process, including when WSL launches a Windows process:

| Native surface | Default local registry |
| --- | --- |
| Windows | `%LOCALAPPDATA%\\Lex\\registry.db` |
| WSL or Linux with XDG state | `$XDG_STATE_HOME/lex/registry.db` |
| WSL or Linux fallback | `~/.local/state/lex/registry.db` |
| macOS | `~/Library/Application Support/Lex/registry.db` |

These variables and home paths are captured by the entrypoint and supplied as values; core resolution never reads them directly. Registry locations must be absolute and native to the execution surface: WSL registries cannot use Windows-mounted paths, and Windows registries cannot use WSL UNC paths. Each WSL distribution therefore has its own registry through its own native user-state path. Launch provenance such as Windows-via-WSL interop remains observable evidence but is not part of a Windows installation's persistent registry identity.

### Local SQLite registry

`SqliteLocalBindingRegistry` uses a separate, application-identified, versioned SQLite file. It never opens or migrates a Frame database. Initialization is an explicit administrative operation and refuses to adopt an unrelated or newer-schema database. Ordinary `open()` is read-only by default and never creates or migrates a registry.

Registration, inspection, verification, rebinding, and revocation are explicit lifecycle methods with auditable receipts. Normal resolution only looks up and verifies bindings. Rebinding preserves the binding and local repository-instance identities, requires stable provider, Git common-directory, or filesystem evidence in addition to any checked-in declaration, and cannot use a declaration by itself as proof.

A registry is bound to its captured execution-surface evidence. Copying it to another native surface fails closed even when the file contains plausible canonical IDs.

### Deterministic resolver

`resolveRuntimeScope` resolves one immutable `InvocationContextV1` and `AuthorizedScopeV1` from a request plus injected `AuthorityDirectory` and `LocalBindingRegistry` implementations. The resolver:

1. validates captured runtime and registry identity;
2. resolves and authorizes the principal before inspecting local topology;
3. enforces finite cached-authority expiry;
4. validates any optional repository declaration against canonical authority;
5. verifies matching local repository evidence and rejects ambiguity; and
6. attenuates `AuthorizedScope.capabilities` to the explicitly requested subset, including an empty set when no capabilities were requested; and
7. returns only the compact result or stable error vocabulary.

Authority and registry exceptions fail closed. Normal results contain no diagnostic envelope, local topology inventory, or authority trace. Diagnostics remain a separate, explicitly requested, capability-gated concern.

`InMemoryAuthorityDirectory` is a deterministic test and embedding implementation of the authority contract. It is not shared PostgreSQL authority and does not establish a production trust boundary.

`PostgresAuthorityDirectory` is the shared production implementation. It resolves opaque
authentication handles through persisted digests, pins all lookups for one resolution to a
repeatable-read transaction, verifies explicit workspace/repository associations, and rejects a
runtime role that can mutate canonical authority. Both runtime and administration require one
validated explicit schema and qualify every authority relation, independent of pool `search_path`.
`PostgresAuthorityAdministration` is the separate privileged migration, provisioning, inspection,
and revocation seam. See
[PostgreSQL Canonical Authority](./POSTGRES_AUTHORITY.md).

## Trusted bootstrap and entrypoint wiring

`captureTrustedBootstrapInput` freezes `argv`, `cwd`, native platform/surface evidence, and a small compatibility-environment allow-list exactly once. The allow-list contains only home/state and caller-root discovery inputs. Database credentials and registry-path overrides are discarded, and retained environment values remain discovery inputs rather than authority.

`createTrustedRuntimeScopeBootstrap` accepts injected canonical authority and repository discovery adapters. For every CLI or MCP invocation it:

1. clones and freezes the captured input and discovery evidence;
2. selects the native surface-local registry from standard state directories;
3. opens that existing registry read-only and always closes the handle;
4. calls the deterministic resolver with only the explicitly requested capabilities; and
5. returns an immutable compact result, or an opt-in diagnostic envelope.

`NodeRuntimeScopeDiscoveryAdapter` is the production evidence adapter. It starts only from the frozen caller-root snapshot, executes native Git without a shell, rejects unrelated roots, and hashes Git common-directory, filesystem, declaration, and supported provider-remote evidence. An optional checked-in `lex.repository.json` is an untrusted repository declaration. The adapter cannot select a principal or workspace itself: a separately injected `TrustedRuntimeSelectionProviderV1` supplies an opaque authentication reference and requested workspace for canonical authorization.

```json
{
  "schemaVersion": 1,
  "repositoryId": "<opaque canonical repository id>",
  "repositorySlug": "lex",
  "preferredWorkspace": {
    "tenantSlug": "platform-dogfood",
    "workspaceSlug": "lex"
  }
}
```

The IDs and slugs in this file remain declaration/selection hints. Editing or copying it cannot grant workspace access.

`WorkspaceBindingAdminService` owns the explicit `lex workspace recover|bind|inspect|rebind|revoke`
lifecycle. Those commands require an injected trusted-host administration service; the standalone
packaged CLI exposes the command group but fails closed when administration is not configured.
Recovery creates only an absent, empty surface-local registry and refuses in-place repair or
replacement. Every mutation is independently authorized with a named workspace-administration
capability and produces or preserves registry receipts. Normal bootstrap never calls this service.

`createTrustedRuntimeScopeEntrypointGuard` constructs the one canonical guard used by both `run()` and `MCPServer`. CLI authorization completes before Commander dispatch. MCP authorization completes before tool dispatch, and a denial therefore cannot invoke even a mutating in-memory test store. Command and tool capability maps are exhaustive against the real Commander tree, advertised MCP tools, and supported aliases; unknown operations reject rather than inheriting a default grant. Explicit dry-run commands attenuate write/delete capabilities.

`createPostgresTrustedRuntimeHost` completes the production composition without ambient authority.
It receives the runtime Pool, explicit authority schema, trusted selection/secret-provider seam,
process capture, IDs, diagnostic emitter, and scoped store binder explicitly, then returns
structurally ready `cli` and `mcp` host options backed by the same guard and binder. The CLI
composition alone receives the explicit local binding administration service.

When an operation requests any `frame:*` capability, the host must pair the guard with a `ScopedFrameStoreBinder`. The resolved `AuthorizedScope` is bound and passed lexically into that one command/tool dispatch, then the view is closed. Missing or failed binding returns `LEX_FRAME_STORE_INVALID_SCOPE`; it never falls back to a legacy unscoped store. A canonical guarded MCP host also defers physical store construction until after authorization.

Normal calls add no scope metadata to agent output. CLI diagnostics use `--diagnostic` for summary detail and `--diagnostic --diagnostic-level=full` for full detail; MCP tools accept `diagnostics: "summary" | "full"`. Full authority, binding, and selection detail requires an independent `runtime:diagnose` authorization decision, uses opaque hashed references, and never changes the operation capability set or its resolution result. Authentication references and project roots are always omitted.

`authorityMode: "local-offline"` is explicit and still requires an injected authority implementation plus finite cached-authority evidence. It does not pair execution surfaces or turn copied local state into shared authority.

## Scoped SQLite Frame ownership

`SqliteScopedFrameStoreBackend` persists the scope contract in SQLite
schema v15. SQLite remains a per-workspace deployment: one file has one
immutable tenant/workspace binding, while every Frame row also records ownership
contract version, creator principal, and the scope version active at creation.
All normal reads, searches, lists, exports, counts, statistics, updates, and
deletes are issued through a bound view and include its tenant/workspace filter.
Ownership never appears in normal Frame results.

Unowned v14 stores are excluded from normal scoped service. `lex db scope`
provides separate inventory, manifest, migration, and recovery operations.
Manifests bind the exact source digest to explicit canonical UUIDs; identity is
never inferred from environment variables, paths, directory names, repository
metadata, or legacy user fields. Migration is dry-run by default. Explicit write
mode creates a mandatory recovery snapshot, rebuilds transactionally, stores a
deterministic path-redacted receipt, and verifies the result. Recovery is also
dry-run by default and accepts only the exact recorded legacy snapshot.

This local file binding is an authorization invariant, not a global publication
mechanism. Cross-workspace/global Frames, projections, and catalogs remain
separate future contracts.

## Intentionally separate or unavailable

The following remain intentionally outside the trusted-host contract:

- making the standalone compatibility executable mandatory-guarded before a production `AuthorityDirectory` and trusted selection provider are available;
- projections and catalog publication;
- offline authority pairing or locally minted authority;
- a cross-repository helper package.

PostgreSQL canonical authority and forced-RLS scoped Frame storage are implemented. See
[PostgreSQL Canonical Authority](./POSTGRES_AUTHORITY.md) and
[PostgreSQL Scope Security](./POSTGRES_SCOPE_SECURITY.md). Global/cross-workspace Frames remain a
separate publication and projection decision rather than a special scope value.

See [ADR-0011](./adr/0011-trusted-runtime-scope-and-authority.md), epic [#749](https://github.com/Guffawaffle/lex/issues/749), Phase 2 issue [#755](https://github.com/Guffawaffle/lex/issues/755), and Phase 3 issue [#758](https://github.com/Guffawaffle/lex/issues/758).
