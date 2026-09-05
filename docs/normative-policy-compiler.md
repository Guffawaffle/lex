# Normative policy compiler (Slice 1A2)

This experimental, semver-governed library surface extends
`@smartergpt/lex/normative-policy`. It implements [#834](https://github.com/Guffawaffle/lex/issues/834)
under accepted [ADR-0012](adr/0012-typed-policy-and-context-resolution.md). Existing LexMap policy,
instruction projection, CLI/MCP operations, and stores do not call this compiler.

## Input and raw parser profile

`parsePolicyDeclarationJsonV1(rawSource, source)` accepts a `Uint8Array` and a strict
`PolicySourceLocatorV1`. The only advertised format is `json-utf8-v1`: one UTF-8 JSON value,
without a BOM, comments, trailing commas, non-finite numbers, or unpaired Unicode surrogates.
YAML is not supported. The scanner validates the whole grammar and decoded object keys before
constructing an object. Thus `"id"` and `"\u0069d"` are duplicate keys, at any nesting level.
Invalid UTF-8 is rejected rather than replaced. Source size is at most 1,048,576 bytes; nested
value depth is at most 128, counting the root as depth zero. The parser copies accepted input bytes
before computing attribution, so later caller mutation cannot change the result.

Successful parsing returns `{ ok: true, input, diagnostics: [], authorizesExecution: false }`.
`input` contains the normalized declaration and separately constructed source evidence binding its
locator, exact byte digest, and computed declaration digest. Formatting changes the raw digest,
not declaration semantics. Failure returns `{ ok: false, diagnostics, authorizesExecution: false }`;
there is no partial input.

Already-parsed declarations may be compiled with `sourceEvidence: null`. The compiler cannot
recover duplicate raw mapping keys after a different parser has discarded them. Callers retaining
source evidence should use the raw parser. Supplied evidence is strictly validated and its
declaration digest is recomputed; without raw bytes the compiler cannot recheck its raw digest.
Neither successful parsing nor compilation authenticates the locator, issuer, or attestation.
The protected evidence-chain verifier in Slice 1A3 must recheck the raw-byte binding and establish
source trust before allowing effective inclusion.

```ts
import {
  compilePolicyV1,
  parsePolicyDeclarationJsonV1,
  POLICY_CANONICALIZATION_VERSION_V1,
  POLICY_COMPILER_VERSION_V1,
} from "@smartergpt/lex/normative-policy";

const parsed = parsePolicyDeclarationJsonV1(rawBytes, sourceLocator);
if (parsed.ok) {
  const result = compilePolicyV1({
    schemaVersion: 1,
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    compilerVersion: POLICY_COMPILER_VERSION_V1,
    inputs: [parsed.input],
  });
  // result.ok means structurally compiled, not trusted, applicable, or authorized.
}
```

The request is closed and versioned. Each input is exactly `{ declaration, sourceEvidence }`.
All JSON data receives the existing canonicalizer's inert-value checks before schema traversal:
getters, proxies, exotic objects, undefined, symbols, and other non-JSON values are rejected.
Declarations reuse the released strict schemas and modal constraints. Scope and activation remain
separate. Compiler inputs cannot contain persona, facts, memory, grants, or arbitrary extensions.

## CompiledPolicyV1 contract

The closed output has exactly:

```ts
{
  schemaVersion: 1;
  canonicalizationVersion: "lex:normative-policy:jcs:v1";
  compilerVersion: "lex:normative-policy:compiler:v1";
  declarations: readonly {
    declaration: PolicyDeclarationV1;
    declarationDigest: PolicyDeclarationDigestV1;
    sourceEvidence: PolicyDeclarationSourceEvidenceV1 | null;
  }[];
  authorizesExecution: false;
}
```

Declarations form a set sorted by unsigned UTF-16 declaration ID, then numeric revision. Different
revisions of one declaration are allowed; the same ID/revision twice is rejected, with a distinct
code when the digests differ. Rule identity is the exact declaration ID/revision/rule ID tuple.
An empty input set compiles to an empty policy; it does not imply permission or prohibition.

The compiled product retains normalized statements, scope, activation, enforcement intents and
relations unchanged. Preference order is preserved. Source evidence does not enter declaration or
rule semantic identity. There is no new compiled digest or ambient timestamp. Use the existing
`canonicalizeJson` for byte-stable serialization. Output, nested declarations, and diagnostics are
deeply frozen detached data; compilation does not freeze or mutate caller-owned objects.

`CompiledPolicyV1Schema` revalidates closed shapes, versions, recomputed declaration digests,
source/declaration digest joins, duplicate identities and relation graphs. It normalizes declaration
set order and freezes the result. Its structural acceptance conveys no authenticity.

## Relation validation

Every relation resolves an exact declaration revision and rule identity in this input set. The
target's computed semantic digest must match `expectedSemanticDigest`. All three relation types
participate in directed cycle detection, including mixed cycles. Self-relations and more than one
relation type from one source to the same exact target are rejected. Duplicate identical relations
are already rejected by the released declaration schema. Missing revisions and missing rule IDs
are both missing targets; no floating reference is resolved opportunistically.

The iterative graph traversal does not produce precedence or suppress a rule. Acyclic `overrides`
and `refines` are preserved even though relation-specific authoring authority has not been checked.
The compiler never requests operations, issues grants, evaluates activation or applicability,
classifies routes, resolves conflicts, or converts advisory language into a gate. The modality
schemas reject advisory enforcement intents that would claim such a gate.

## Stable diagnostics and failure phases

Every diagnostic has exactly `code`, `inputIndex`, `ruleId`, `target`, and `offset`.
Absent coordinates are explicitly null. `inputIndex` is the zero-based position in the original
request; parser failures have no input index. `ruleId` and `target` use the existing constrained
identity/target schemas. Raw parser `offset` counts UTF-16 code units in decoded source, not bytes;
byte/type/UTF-8 errors have no offset. Diagnostic text never echoes raw source or library messages.

| Phase | Codes |
| --- | --- |
| Raw source | `invalid_source_bytes`, `source_too_large`, `invalid_utf8`, `invalid_json`, `duplicate_json_key`, `source_too_deep` |
| Locator/request | `invalid_source_locator`, `invalid_compilation_input` |
| Declaration/evidence | `invalid_declaration`, `duplicate_rule_id`, `invalid_source_evidence`, `source_declaration_digest_mismatch` |
| Identity | `duplicate_declaration`, `declaration_revision_conflict` |
| Graph | `missing_target`, `self_relation`, `multiple_relation_types`, `target_digest_mismatch`, `relation_cycle` |

Raw parsing reports the first scanner failure, then checks locator and declaration. Compilation
first checks the request shape/versions, then validates each entry (declaration before evidence).
It returns all entry failures before constructing a graph. Identity ambiguity prevents graph
validation. Otherwise graph failures are collected; `relation_cycle` is one graph-level diagnostic,
not a potentially misleading list of downstream nodes. Diagnostics are deduplicated and sorted by
their canonical JSON strings in unsigned UTF-16 order, independent of exception wording or locale.
Failures never include a partial compiled product. Equal explicit input yields equal products and
ordered diagnostics across processes; invalid-input indexes intentionally preserve caller order.

## Verification

`test/normative-policy/compiler.test.ts` exercises the raw profile, all five modal fixtures,
non-authorizing controls, malformed and exact-target graphs, source evidence separation,
immutability, and independent-process serialization. Run the normative-policy tests, build,
type-check, public API check and formatting before review. No host file installation or runtime
cutover is part of this slice.
