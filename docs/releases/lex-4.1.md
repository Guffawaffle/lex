# Lex 4.1 release notes and recovery

Status: candidate preparation; not published or tagged.

Lex 4.1.0 adds the experimental, subpath-only `@smartergpt/lex/normative-policy` contract from
[PR #838](https://github.com/Guffawaffle/lex/pull/838), merged as
`7d8e08ee2ab597e16212f626c4f5c8922965a62f`. The approved minor changeset covers the additive public
API. Existing root exports, CLI/MCP operations, stores, and Node `>=24` support remain unchanged.

## Included

- Strict typed policy declarations and non-authorizing source/authority-decision contracts.
- Canonical JSON, domain-separated digests, and pure source/decision binding checks.
- Data-only STFC managed-route and synthetic-permit conformance fixtures.
- Audited lockfile updates for `fast-uri` 3.1.7 and `qs` 6.16.0 within existing dependency ranges.

The API is experimental but becomes semver-governed when published. A binding result is evidence
about supplied inputs; it is not an effect grant. This release does not implement compilation,
applicability/conflict resolution, `EffectivePolicySnapshotV1`, Context Forge, or an Attempt consumer.
Those remain later slices under [ADR-0012](../adr/0012-typed-policy-and-context-resolution.md).

## Release order

Follow [RELEASE.md](../../RELEASE.md) and the [Ecosystem 3.1 SOP](./ecosystem-3.1.md):

1. Review and merge the 4.1.0 release candidate with native Windows and packed-consumer evidence.
2. Build and publish the exact current-main Lex artifact through the protected `npm-release`
   workflow dispatch. Local non-dry-run npm publication remains prohibited.
3. Update the declared Lex-MCP checkout to version 4.1.0 and exact public dependency
   `@smartergpt/lex@4.1.0`; verify and publish its reviewed candidate through its own release process.
4. Verify both immutable public artifacts and their dependency edge before the human maintainer
   creates/pushes signed tags. Complete GitHub releases and the protected Registry publication.

`server.json` and the draft ecosystem manifest select the matching Lex-MCP 4.1.0 target; this is
not a claim that its package already exists. Existing baseline source/integrity fields in the draft
manifest remain historical evidence, not evidence of 4.1.0 publication. Runtime installations are
updated only after the relevant exact public artifacts are verified.

## Migration and rollback

This additive release introduces no store migration. Consumers opting into normative policy import
the explicit subpath; existing users need no API changes. The [4.0 migration guide](./lex-4.0-migration.md)
still governs the existing Node, transport, and storage boundaries for migrations from older majors.

Until this candidate is fully released, retain the verified 4.0.4 package pair as the operational
baseline. Rolling back requires removing any new normative-policy imports and restoring the exact
previous package versions; it does not authorize deleting, initializing, or repairing a Frame store.
Published versions and tags are immutable. Repair any publication defect with a new reviewed version.
