# Trusted Runtime Scope Contract

Lex exposes its Phase 1 identity and authority vocabulary from:

```ts
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  type AuthorityDirectory,
  type LocalBindingRegistry,
  type ResolvedRuntimeConfig,
  type InvocationContext,
  type AuthorizedScope,
  type DiagnosticRequest,
  type DiagnosticEnvelope,
} from "@smartergpt/lex/runtime-scope";
```

Phase 1 is a public contract, not a resolver or database implementation. Existing CLI, MCP, Frame, and store behavior is unchanged.

## Boundary

```text
AuthorityDirectory
    canonical IDs, memberships, grants, capabilities, revocations

LocalBindingRegistry
    surface-local paths, instances, evidence, verification, receipts
```

`LocalBindingRegistry` deliberately cannot add tenant memberships, grant workspace access, or authorize principals. Cached authority records carry source, version, digest, verification, expiry, and revocation evidence; they are not locally minted grants.

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
- A project root locates evidence and never grants access.
- Repository identity is canonical provenance; repository instances are local checkouts/worktrees.
- Windows, each WSL distribution, and other native environments use separate local registries.
- The native process determines the registry even when another shell launches it.
- Shared PostgreSQL authority independently verifies local selector/evidence input.

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
- forks, clones, worktrees, and deliberate moved-root rebinding;
- expired cached authority and conflicting evidence;
- diagnostic observability without behavior changes.

Implementations should adapt the fixtures to their test harness without changing their expected semantics. The fixtures perform no file or database access.

## Deferred implementation

The following are intentionally absent from Phase 1:

- local SQLite registry schema and services;
- deterministic resolver implementation;
- CLI/MCP bootstrap integration;
- Frame ownership columns or migration;
- PostgreSQL RLS;
- projections and catalog publication;
- offline authority pairing;
- a cross-repository helper package.

See [ADR-0011](./adr/0011-trusted-runtime-scope-and-authority.md) and epic [#749](https://github.com/Guffawaffle/lex/issues/749).
