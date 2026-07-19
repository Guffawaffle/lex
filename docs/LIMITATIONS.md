# Current Limitations

This document describes constraints in Lex 3. It is not a roadmap and does not promise a delivery
date for missing capabilities.

## Checkpoints are explicit

Lex does not watch a session and decide what to remember. A user, agent, application, or MCP client
must explicitly create each Frame. This protects consent and signal quality, but a useful handoff
can still be lost when no checkpoint is written.

Frame quality also depends on the caller: vague summaries and next actions remain vague when
recalled.

## Context budgets are approximate

`lex context --max-tokens` and Atlas auto-tuning use deterministic estimates, not a target model's
exact tokenizer. The budget is a practical bound for selecting and formatting context, not a
guarantee that every model will count the result identically.

## SQLite is a local store

SQLite is well suited to one local workspace and trusted user. It is not the cross-machine or
multi-tenant coordination boundary. Do not synchronize or concurrently mount the live database as
a replacement for a shared service; use PostgreSQL for coordinated trusted hosts.

Several compatibility CLI paths acquire a writable SQLite store and may initialize or migrate it,
even when the requested operation sounds read-oriented. `lex context` is the hard read-only
bootstrap surface.

## Hard read-only SQLite has snapshot constraints

To avoid touching WAL or shared-memory sidecars, read-only SQLite access uses a detached snapshot.
Lex fails closed rather than returning potentially stale data when an active non-empty WAL or
rollback journal prevents a coherent snapshot.

Encrypted SQLite stores are not currently available through this snapshot path. Consequently,
hard read-only `lex context` cannot read an encrypted SQLite database. Ordinary read-write
compatibility paths can use the configured encryption key.

## PostgreSQL deployment is intentionally explicit

The compatibility `LEX_STORE=postgres` adapter can provide shared unscoped storage, but it is not
a tenant authorization boundary. Trusted multi-tenant and multi-workspace use requires explicit
runtime authority, a scope-bound store binder, a protected schema, separate migration/runtime
roles, forced row-level security, and fail-closed pool hygiene.

That is more operational work than the default SQLite path. See
[PostgreSQL Scope Security](./POSTGRES_SCOPE_SECURITY.md).

## Trusted scoped attachments are unavailable

Trusted scoped MCP requests currently reject attachments, images, and caller-supplied `image_ids`
because Lex does not yet expose a scope-bound attachment service. The unscoped SQLite compatibility
path retains its existing attachment behavior.

## Policy and module inference depend on repository modeling

Policy is only as accurate as its path ownership and relationship declarations. `--modules auto`
uses bounded evidence from paths, intent, branch state, and recent Frames; it records confidence
and evidence, but it cannot manufacture a correct ontology.

Use explicit module IDs when accuracy matters, and use `--modules unscoped` when the repository
does not yet have a useful policy. Aliases help vocabulary alignment but do not replace deliberate
policy maintenance.

## Scanner coverage is partial

The built-in Code Atlas extractor focuses on TypeScript/JavaScript and Python source. Policy
scanner support is language-specific; Python and PHP examples exist, while Java, C#, Go, Rust, and
other ecosystems require additional scanner work or external fact generation.

Static scanners emit structural evidence. They cannot fully model runtime dispatch, generated
code, reflection, or every framework convention.

## Code Atlas persistence remains experimental

The `CodeAtlasStore` extension surface is experimental. Its API may change before it receives the
same stability guarantees as the Frame and scoped-store contracts.

## Historical Frames can become stale or hostile

Frames are durable evidence, not current truth. Branches move, decisions change, and stored text
can contain mistaken or adversarial instructions. Consumers must treat Frame bodies as untrusted
history and verify important claims against current sources.

## Compatibility adapters are not the trusted Lex 3 boundary

Lex retains unscoped 2.x store adapters and environment-driven composition for migration and local
compatibility. Trusted hosts must not reconstruct tenant/workspace authority from ambient
environment variables or pass an unbound administrative store to ordinary request handling.

See [Runtime Scope](./RUNTIME_SCOPE_CONTRACT.md), [Store Contracts](./STORE_CONTRACTS.md), and
[Security](../SECURITY.md) for the current boundary.
