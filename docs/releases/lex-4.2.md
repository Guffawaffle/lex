# Lex 4.2 release notes and recovery

Status: candidate preparation; not published or tagged.

Lex 4.2.0 combines Slice 1A2 ([PR #840](https://github.com/Guffawaffle/lex/pull/840))
and Slice 1A3 ([PR #841](https://github.com/Guffawaffle/lex/pull/841)) in one additive
minor release of `@smartergpt/lex/normative-policy`. The compiler and resolver remain
library-only; existing root imports, CLI/MCP operations, stores, and Node `>=24`
support remain compatible with the released 4.1.0 baseline.

## Included

- Bounded JSON-only UTF-8 ingestion with duplicate decoded-key rejection.
- Strict immutable compiled declarations and digest-pinned acyclic relation graphs.
- Host-installed protected verifier contracts for exact source authentication,
  qualified facts, route classification, and separate implementation qualification.
- Deterministic applicability, activation, conflict, override and dependency outcomes.
- Bounded exceptions with independently bound, current revocation evidence.
- Immutable effective snapshots with explanation traces, satisfied affirmative
  allowances, and fixed domain-separated identities.

An unknown or unmatched permit cannot enable an allowance or suppress a prohibition
for an unrelated route. Every result retains `authorizesExecution: false`.
The [resolver decision freeze and host guide](../normative-policy-resolver.md) specifies
the trust boundary. A digest checks integrity; a caller-constructed verification
record or serialized snapshot does not establish authentic provenance.

This release does not install a production verifier, implement native admission or
effect grants, change instructions or game configuration, or implement Context Forge.
Context Forge still needs the released snapshot contract and #837 ratification.

## Release order

Follow [RELEASE.md](../../RELEASE.md) and the [Ecosystem SOP](./ecosystem-3.1.md):

1. Review and merge the 4.2.0 candidate with native Windows and retained-tarball proof.
2. Build the exact current-main artifact and verify its Linux and Windows gates.
3. Publish those exact bytes through the protected `npm-release` workflow dispatch.
4. Update and verify the declared Lex-MCP checkout against exact public Lex 4.2.0;
   publish its reviewed matching 4.2.0 wrapper through its own protected workflow.
5. Verify both public artifacts and their exact dependency edge, then have the human
   maintainer create and push the personal signed tags. Verify GitHub releases and
   approve the protected MCP Registry publication.

The Registry manifest and draft ecosystem target versions select 4.2.0; they are
not evidence of publication. Historical baseline integrity/source fields remain
unchanged. Existing installed 4.1.0 runtimes remain the operational baseline until
the exact public pair and downstream acceptance are verified.

## Migration and rollback

See the [4.2 migration guide](./lex-4.2-migration.md). No store migration is introduced.
Consumers opt into the additive policy APIs through the explicit subpath. Preserve
trusted host and store bindings; rollback restores the exact prior package pair
and removes new compiler/resolver imports. Never rewrite a published version or tag.
