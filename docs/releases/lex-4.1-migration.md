# Lex 4.1 migration and recovery guide

This guide covers the candidate pair `@smartergpt/lex@4.1.0` and `@smartergpt/lex-mcp@4.1.0`.
Neither version should be installed from the registry until its exact public artifact is verified.
See [release notes](./lex-4.1.md) for the additive policy API and [RELEASE.md](../../RELEASE.md)
for candidate evidence and publication order.

## Existing consumers

Node.js `>=24` remains required. Upgrading from 4.0.4 requires no store migration and does not
change existing CLI or MCP operations. Normative-policy consumers opt into the explicit experimental
subpath. No resolver, Context Forge linker, or new execution permission is included.

After both packages are verified public, pin the wrapper in the MCP host:

```toml
command = "npx"
args = ["--yes", "@smartergpt/lex-mcp@4.1.0"]
env_vars = ["LEX_POSTGRES_PASSWORD"]
```

Forward `LEX_POSTGRES_PASSWORD` from the host's existing secret configuration when the PostgreSQL
deployment uses it; never paste a password into source or logs. Preserve the exact trusted-host
scope and runtime binding. Environment configuration alone does not establish tenant authority.

For migrations from pre-4.0 versions, the [4.0 guide](./lex-4.0-migration.md) remains the detailed
record of Node-floor, MCP transport, and storage changes. The removed legacy entrypoint still emits
`LEX_MCP_LEGACY_ENTRYPOINT_REMOVED`; use the dedicated exact-version wrapper rather than restoring
the removed transport.

## Human-only publication boundary

Agents may prepare and test retained candidates and dry-run publication. Actual npm publication
uses the reviewed protected `npm-release` workflow and npm Trusted Publishing. The human maintainer
owns signed annotated tag creation/push and any protected-environment approvals. Both packages must
be public with matching immutable identities before the Lex tag and Registry sequence. A local
candidate, successful test, or unsigned ref is not publication evidence.

## Failure and recovery matrix

| Observation | Required response |
| --- | --- |
| Windows build fails because `chmod` is unavailable | Stop the build. Use the reviewed portable build scripts; do not fabricate executable-bit evidence or substitute another artifact. |
| SCRAM says the password must be a string | Check explicit `LEX_POSTGRES_PASSWORD` forwarding without printing the value. Do not switch stores or bypass authentication. |
| Workspace, branch, or credential-free store identity is unexpected | Stop store access and reconcile the expected identity before any mutation. |
| Quarantined legacy Frames exist | Use the existing explicit inspect/plan/apply migration workflow from the 4.0 guide. Package installation does not authorize repairs. |
| A dependent lock still resolves Lex 3.0.1 or another version | Refresh that dependent lock from the exact verified public 4.1.0 artifact; reject local links and mismatched integrity for release proof. |
| Lex is public but its tag, Lex-MCP, GitHub release, or Registry entry is incomplete | Preserve the verified immutable Lex artifact and finish the missing stage in dependency order. Never republish the same version with different bytes. |
| Native Windows or another downstream packed consumer fails | Stop publication or sealing at that stage; retain the failing command and exact artifact identity. |

## Rollback

Keep the exact prior 4.0.4 package pair until acceptance completes. Remove new normative-policy
imports before restoring it. A package rollback does not authorize deleting, initializing, repairing,
or recreating a Frame store. Published package versions and signed tags remain immutable; repair
release defects through a new reviewed version.
