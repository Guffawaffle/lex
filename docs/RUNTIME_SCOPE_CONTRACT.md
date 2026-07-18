# Trusted Runtime Scope Contract

Lex exposes its versioned identity, authority, local-registry, and resolver surface from:

```ts
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  SqliteLocalBindingRegistry,
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

Phase 1 froze the public contract. Phase 2 adds opt-in deterministic resolver and local-registry services. Existing CLI, MCP, Frame, and FrameStore behavior is unchanged; no existing entrypoint invokes these services yet.

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

Lex also runs every exported fixture through its concrete Phase 2 resolver and SQLite registry in the implementation conformance suite.

## Phase 2 implementation

### Trusted capture and execution surfaces

`detectExecutionSurface`, `resolveLocalRegistryLocation`, and `resolveRuntimeScope` operate only on explicit inputs. They do not read `process.env`, `process.cwd()`, `process.platform`, OS release files, or mutable global caches. A trusted entrypoint must capture allowed ambient values once in a `BootstrapInputSnapshotV1` and pass the immutable snapshot inward.

Registry selection follows the native process, including when WSL launches a Windows process:

| Native surface | Default local registry |
| --- | --- |
| Windows | `%LOCALAPPDATA%\\Lex\\registry.db` |
| WSL or Linux with XDG state | `$XDG_STATE_HOME/lex/registry.db` |
| WSL or Linux fallback | `~/.local/state/lex/registry.db` |
| macOS | `~/Library/Application Support/Lex/registry.db` |

These variables and home paths are captured by the entrypoint and supplied as values; core resolution never reads them directly. Each WSL distribution therefore has its own registry through its own native user-state path.

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
6. returns only the compact result or stable error vocabulary.

Authority and registry exceptions fail closed. Normal results contain no diagnostic envelope, local topology inventory, or authority trace. Diagnostics remain a separate, explicitly requested, capability-gated concern.

`InMemoryAuthorityDirectory` is a deterministic test and embedding implementation of the authority contract. It is not shared PostgreSQL authority and does not establish a production trust boundary.

## Deferred implementation

The following remain intentionally absent after Phase 2:

- CLI/MCP bootstrap integration;
- Frame ownership columns or migration;
- PostgreSQL RLS;
- projections and catalog publication;
- offline authority pairing;
- a cross-repository helper package.

See [ADR-0011](./adr/0011-trusted-runtime-scope-and-authority.md), epic [#749](https://github.com/Guffawaffle/lex/issues/749), and Phase 2 issue [#755](https://github.com/Guffawaffle/lex/issues/755).
