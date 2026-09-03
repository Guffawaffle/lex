# ADR-0012: Typed Policy and Context Resolution

- Status: **Proposed**
- Date: 2026-09-03
- Authors: Guff, Codex, Lex
- Tracking epic: [#832](https://github.com/Guffawaffle/lex/issues/832)

## Context

Operational inputs and guidance are currently distributed across repository instructions, Copilot
and other host instructions, skills, memory, LexRunner contracts, AXF capabilities, authority
declarations, and consumer configuration. Legacy hosts legitimately require different physical
files, but maintaining the same normative directive independently in several files causes semantic
drift, lost provenance, and accidental authority strengthening. Only those normative directives
migrate into this contract; persona identity, memory and facts, orchestration contracts, capability
discovery, and effect authority remain separate domains.

The existing Lex instruction projector is a useful compatibility mechanism: it owns marked regions,
preserves content outside them, and supports deterministic idempotent updates. Its semantic input is
canonical Markdown, however, so it cannot distinguish an obligation from a recommendation, report
whether a target preserved a rule, or prove that persona guidance did not become a lifecycle gate.

Lex also already uses the word policy for the LexMap architectural module-boundary format, while its
behavioral rules describe LexSona input. Neither contract represents general normative policy. A new
namespace is required to avoid changing either existing meaning.

The concrete migration fixture is STFC lifecycle cycling. Global guidance recommends managed
tooling when available, while the public STFC workspace requires its public managed route and
forbids manual or private fallback. The first migrated production declaration should express these
as linked atomic rules without granting permission to cycle or requiring a cycle to occur.

## Decision

### 1. Lex owns an engine-neutral normative policy contract

Lex will introduce an experimental `normative-policy` namespace, distinct from LexMap policy and
LexSona behavioral rules. It owns declaration schemas, canonicalization, compilation, applicability
and override resolution, effective-policy snapshots, semantic target profiles, controlled
renderers, projection receipts, diagnostics, and data-only conformance fixtures. AXF may later own
host installation/routing adapters, but it does not become a policy author or semantic resolver.

Lex does not own repository-specific policy merely because it supplies the schema and compiler.
Canonical production declarations remain under an authenticated domain owner. In particular, the
public STFC managed-route declaration belongs to that public repository/workspace authority. Lex may
carry a production-shaped conformance fixture but not the canonical production declaration.

The package path `@smartergpt/lex/normative-policy` becomes a semver-governed public surface once
published even if its symbols are initially marked experimental. This ADR must be Accepted through
normal repository review before that export is merged or published.

### 2. Context domains remain distinct

Policy, facts, principal/resource identity, persona, memory, capabilities, qualifications,
authority, mission, and runtime state are separate types. They may share a common provenance
vocabulary but will not be collapsed into a universal YAML or context object. LexSona owns
behavioral-profile identity and persona; it does not authenticate principals or own canonical
tenant, workspace, or repository identity.

Their influence is constrained:

- Policy controls applicability, admission, obligations, and prohibitions.
- Verified facts determine policy applicability and may participate in admission.
- Persona controls behavior and may voluntarily narrow the authority an agent requests.
- Memory affects cognition and planning only.
- A capability declaration is a claimed effect envelope and compatibility description.
- A qualification is evidence that one implementation enforces a capability contract.
- ADR-0011 `AuthorizedScopeV1` establishes workspace scope and a capability ceiling, but only a
  current Attempt-bound effect grant plus a qualified enforcing capability can authorize an effect.

Persona and memory never participate in authoritative grant calculation. A capability declaration
or qualification is not a grant.

### 3. Policy is structurally non-authorizing

`PolicyRuleV1`, compiled policy, `EffectivePolicySnapshot`, and projection receipts contain no
credentials, bearer tokens, grants, leases, or live capability handles. Their serialized contracts
carry literal `authorizesExecution: false` where an aggregate might otherwise be mistaken for an
execution token.

A `permit` rule is an affirmative policy-layer allowance for its proposition within its
authenticated issuer and resolved scope. It does not request or require the proposition, bind a
capability, or mint an `AuthorityGrant`. It cannot defeat an applicable `forbid` without an explicit
authorized override relationship, and an unknown permit cannot enable admission. A routing
requirement constrains an operation only after the operation is requested; it does not require the
operation to occur and does not depend on effect authority already existing.

### 4. Declarations group atomic, modality-specific rules

`PolicyDeclarationV1` is durable authored material. It records stable declaration identity and
revision, issuer principal and authority domain, required authoring capability, scope, and one or
more atomic `PolicyRuleV1` records. Source location and exact raw-byte evidence live in a separate
ingestion envelope, so the source cannot contain its own digest. The declaration does not contain a
current or self-asserted verified authority attestation.

Each rule has exactly one closed modality-specific statement:

- `require`, `forbid`, `permit`, and `recommend` carry one typed `PolicyPropositionV1`; and
- `prefer` carries at least two typed propositions in explicit preference order.

The initial proposition vocabulary is closed and reference-based:

- `{ type: "operation", operationId }`; or
- `{ type: "operation_route", operationId, route }`, where route is exactly
  `{ type: "capability", capabilityId }` or `{ type: "route_class", routeClassId }`.

The initial scope vocabulary is `global`, `tenant`, `workspace`, `repository`, or
`workspace_repository`, using the corresponding canonical trusted-runtime-scope IDs. Free-text
directives, catch-all expressions, path/module escape hatches, and arbitrary extension maps are not
semantic inputs. Every rule separately records a stable rule ID, one statement, an activation
condition, dependencies, explicit override/refinement relationships, and `enforcementIntents` as a
non-empty normalized semantic set of prompt guidance, lifecycle precondition, capability gate,
verifier, and/or audit.

Source authority, scope, normative kind, activation, enforcement, and target fidelity are separate
dimensions. No scalar strength orders rules or silently resolves conflicts. File proximity and
narrower path scope do not establish override or refinement authority. Any such relationship is
explicit and validated against authenticated issuer authority.

`PolicyDeclarationAuthorityDecisionV1` is a separate externally supplied resolution input issued
through a trusted verifier. It decides whether the named issuer had authority to author the exact
declaration for its scope and always binds the declaration digest, issuer/domain, evaluation time,
and finite cache horizon. `authorized` additionally binds a current authority version, exact
non-bearer source-attestation reference/digest, granted authoring capabilities, and revocation
evidence. `unauthorized` binds a current authority version, closed reason, and evidence references;
`unknown` binds a closed reason, evidence references, and only an optional last-known authority
version. An authored declaration cannot label itself verified. This is neither a policy admission
decision nor ADR-0011 `AuthorizedScopeV1`, a credential, or an effect grant.

A non-bearer reference is an opaque identifier whose possession alone cannot exercise authority or
retrieve a credential, secret, lease, grant, or live handle. Dereference requires a separately
authenticated and authorized caller appropriate to the owning domain; effect-bound references also
require an exact Attempt binding. Schemas are closed and expose no authority-shaped extension bags.
Fixture scanning for secret-like strings is defense in depth, not a proof about arbitrary
caller-provided text.

#### Slice 1A1 public schema freeze

The first contract increment uses these exact serialized shapes. TypeScript brands keep logical IDs
distinct after validation; the JSON representation remains the shown string. Canonical logical IDs
are 1–200 lowercase characters matching `[a-z0-9][a-z0-9._:/-]*`. Canonical tenant, principal,
workspace, and repository ID input matches
`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$` with no
UUID version-nibble constraint, preserving ADR-0011's opaque UUID semantics; normalized output is
lowercase. A non-bearer reference is 1–512 visible ASCII characters matching
`[A-Za-z0-9][A-Za-z0-9._:/@+-]*`. Digests match `sha256:[a-f0-9]{64}`. `CapabilityId` and
`AuthorityVersion` reuse ADR-0011's non-empty opaque values and are additionally bounded here to
1–200 visible ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:/@+-]*`. `IsoDateTimeV1` is an
actual calendar instant in canonical UTC form `YYYY-MM-DDTHH:mm:ss.sssZ`; parsing and
`toISOString()` must reproduce it exactly.

```ts
const NORMATIVE_POLICY_CONTRACT_VERSION = 1 as const;
const POLICY_CANONICALIZATION_VERSION_V1 = "lex:normative-policy:jcs:v1" as const;

declare const normativePolicyDigestBrand: unique symbol;
type PolicyDigestV1<Kind extends string> = ContentDigest & {
  readonly [normativePolicyDigestBrand]: Kind;
};
type PolicySourceContentDigestV1 = PolicyDigestV1<"source-content">;
type PolicySemanticDigestV1 = PolicyDigestV1<"semantic">;
type PolicyDeclarationDigestV1 = PolicyDigestV1<"declaration">;
type PolicySourceAttestationDigestV1 = PolicyDigestV1<"source-attestation">;
type PolicyDeclarationAuthorityDecisionDigestV1 =
  PolicyDigestV1<"declaration-authority-decision">;

type PolicyScopeV1 =
  | { type: "global" }
  | { type: "tenant"; tenantId: TenantId }
  | { type: "workspace"; workspaceId: WorkspaceId }
  | { type: "repository"; repositoryId: RepositoryId }
  | {
      type: "workspace_repository";
      workspaceId: WorkspaceId;
      repositoryId: RepositoryId;
    };

type PolicyRouteV1 =
  | { type: "capability"; capabilityId: CapabilityId }
  | { type: "route_class"; routeClassId: PolicyLogicalIdV1 };

type PolicyPropositionV1 =
  | { type: "operation"; operationId: PolicyLogicalIdV1 }
  | {
      type: "operation_route";
      operationId: PolicyLogicalIdV1;
      route: PolicyRouteV1;
    };

type PolicyActivationConditionV1 =
  | { type: "always" }
  | { type: "operation_requested"; operationId: PolicyLogicalIdV1 };

type PolicyEnforcementIntentV1 =
  | "prompt_guidance"
  | "lifecycle_precondition"
  | "capability_gate"
  | "verifier"
  | "audit";

type PolicyRuleTargetV1 = {
  declarationId: PolicyLogicalIdV1;
  declarationRevision: number;
  ruleId: PolicyLogicalIdV1;
  expectedSemanticDigest: PolicySemanticDigestV1;
};

type PolicyRuleRelationV1 =
  | { type: "depends_on"; target: PolicyRuleTargetV1 }
  | {
      type: "refines" | "overrides";
      target: PolicyRuleTargetV1;
      requiredAuthorityCapabilityId: CapabilityId;
    };

type PolicyNormativeStatementV1 =
  | { kind: "require"; proposition: PolicyPropositionV1 }
  | { kind: "forbid"; proposition: PolicyPropositionV1 }
  | { kind: "permit"; proposition: PolicyPropositionV1 }
  | { kind: "recommend"; proposition: PolicyPropositionV1 }
  | {
      kind: "prefer";
      orderedAlternatives: readonly [
        PolicyPropositionV1,
        PolicyPropositionV1,
        ...PolicyPropositionV1[],
      ];
    };

type PolicyRuleV1 = PolicyRuleCommonV1 & PolicyNormativeStatementV1;

type PolicyRuleCommonV1 = {
  ruleId: PolicyLogicalIdV1;
  activationCondition: PolicyActivationConditionV1;
  relations: readonly PolicyRuleRelationV1[];
  enforcementIntents: readonly PolicyEnforcementIntentV1[];
};

type PolicySourceLocatorV1 =
  | {
      type: "repository_file";
      repositoryId: RepositoryId;
      path: CanonicalRepositoryRelativePathV1;
      revision: PolicyLogicalIdV1;
    }
  | {
      type: "authority_record";
      recordRef: NonBearerReferenceV1;
      revision: PolicyLogicalIdV1;
    }
  | {
      type: "synthetic_fixture";
      fixtureId: PolicyLogicalIdV1;
    };

type PolicyDeclarationIssuerV1 = {
  principalId: PrincipalId;
  authorityDomainId: PolicyLogicalIdV1;
  requiredAuthoringCapabilityId: CapabilityId;
};

type PolicyDeclarationV1 = {
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  declarationId: PolicyLogicalIdV1;
  revision: number;
  issuer: PolicyDeclarationIssuerV1;
  scope: PolicyScopeV1;
  rules: readonly [PolicyRuleV1, ...PolicyRuleV1[]];
  authorizesExecution: false;
};

type PolicyDeclarationSourceEvidenceV1 = {
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  source: PolicySourceLocatorV1;
  sourceContentDigest: PolicySourceContentDigestV1;
  declarationDigest: PolicyDeclarationDigestV1;
  authorizesExecution: false;
};
```

Every `revision` and `declarationRevision` is a positive safe integer. Repository-relative paths use
`/`, contain no empty, `.`, or `..` segments, no backslash or NUL, and do not begin with `/`.
`PolicyDeclarationSourceEvidenceV1` is ingestion metadata constructed from separately supplied raw
bytes and the declaration parsed from them; it is never embedded in those bytes. Slice 1A1 hashes
raw bytes and validates already-constructed values. Slice 1A2 owns format-specific raw parsing and
must reject invalid UTF-8 and duplicate JSON or YAML mapping keys before constructing a value.
Source-evidence construction and verification recompute both the raw-byte digest and declaration
digest; mismatches are rejected. A structurally valid source-evidence object is attribution data,
not proof that its locator or bytes came from a trusted source.

All relation targets are version-pinned. The compiler must resolve the exact
`declarationId`/`declarationRevision` pair and reject the relation unless the target rule's computed
semantic digest equals `expectedSemanticDigest`. Reusing a declaration ID and revision for a
different declaration digest is an input conflict. V1 has no floating relation references.

`rules` is a semantic set normalized by `ruleId`; rule order in source is not semantic. `relations`
is a semantic set sorted by canonical bytes. `enforcementIntents` is a semantic set sorted by the
closed enum order. Duplicate set entries are rejected rather than silently discarded.
`orderedAlternatives` is ordered and permits no duplicate canonical proposition.

The modality/enforcement matrix is:

| Modality | Allowed non-empty `enforcementIntents` |
| --- | --- |
| `require`, `forbid` | any subset of all five intents |
| `permit` | `prompt_guidance`, `lifecycle_precondition`, `capability_gate`, and/or `audit`; never `verifier` |
| `recommend`, `prefer` | `prompt_guidance` and/or `audit` only |

This matrix prevents advisory language from representing a lifecycle/capability gate. A `permit`
with lifecycle or capability intent says where an explicit policy allowance is consulted; the
`permit` kind alone infers no precondition or gate, and the check remains non-authorizing.

Current authority evidence is not part of `PolicyDeclarationV1`. The external verifier product is
a strict union. Only an `authorized` decision binds the exact source-attestation reference/digest
and current revocation evidence; `unauthorized` and `unknown` bind their closed reason and evidence
references instead.

```ts
type PolicyDeclarationAuthorityDecisionPayloadV1 =
  PolicyDeclarationAuthorityDecisionCommonV1 &
  (
    | {
        status: "authorized";
        authorityVersion: AuthorityVersion;
        sourceAttestationRef: NonBearerReferenceV1;
        sourceAttestationDigest: PolicySourceAttestationDigestV1;
        grantedAuthoringCapabilities: readonly [CapabilityId, ...CapabilityId[]];
        revocationEvidence: {
          ref: NonBearerReferenceV1;
          digest: ContentDigest;
          observedAt: IsoDateTimeV1;
          state: "not_revoked";
        };
      }
    | {
        status: "unauthorized";
        authorityVersion: AuthorityVersion;
        reason:
          | "issuer_unknown"
          | "capability_missing"
          | "scope_unauthorized"
          | "attestation_invalid"
          | "attestation_expired"
          | "attestation_revoked";
        evidenceRefs: readonly NonBearerReferenceV1[];
      }
    | {
        status: "unknown";
        lastKnownAuthorityVersion?: AuthorityVersion;
        reason: "authority_unavailable" | "evidence_stale" | "verification_failed";
        evidenceRefs: readonly NonBearerReferenceV1[];
      }
  );

type PolicyDeclarationAuthorityDecisionCommonV1 = {
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  declarationDigest: PolicyDeclarationDigestV1;
  issuerPrincipalId: PrincipalId;
  authorityDomainId: PolicyLogicalIdV1;
  requiredAuthoringCapabilityId: CapabilityId;
  evaluatedAt: IsoDateTimeV1;
  validUntil: IsoDateTimeV1;
  authorizesExecution: false;
};

type PolicyDeclarationAuthorityDecisionV1 = {
  payload: PolicyDeclarationAuthorityDecisionPayloadV1;
  declarationAuthorityDecisionDigest: PolicyDeclarationAuthorityDecisionDigestV1;
};
```

`validUntil` is required and later than `evaluatedAt` for every cached decision. For
`unauthorized` or `unknown`, it is only the decision cache/retry horizon and never asserts authority
validity. An unavailable authority may have no known version, so only the `unknown` branch uses the
optional `lastKnownAuthorityVersion`; `authorized` and `unauthorized` require `authorityVersion`.
For an authorized decision, `revocationEvidence.observedAt` is no later than `evaluatedAt`, and
an authorized decision matches its declaration only when `grantedAuthoringCapabilities` contains
both `requiredAuthoringCapabilityId` and every distinct `requiredAuthorityCapabilityId` named by a
`refines` or `overrides` relation. The issuer principal, domain, and required capability must equal
the declaration fields whose digest is bound. The protected verifier owns the meaning of
`sourceAttestationDigest`; Lex does not derive it from a caller-provided reference. That ownership
covers the attestation preimage and its domain semantics;
the exchanged value still uses the contract's lowercase `sha256:<64-hex>` wire form. Lex computes
`declarationAuthorityDecisionDigest` over the exact closed
`PolicyDeclarationAuthorityDecisionDigestPreimageV1`, excluding the result field, using its
declaration-authority-decision domain. A consumer recomputes this digest before accepting the
record. The later resolver's protected port, not TypeScript structural assignability, decides
whether a correctly shaped record is trusted.

The digest is unkeyed integrity, not authenticity. A caller-constructed `authorized` object remains
untrusted even when its digest recomputes. The trusted resolver port must validate its provenance,
declaration/issuer/domain/capability binding, current validity at explicit resolver `asOf`, and
status. Payload/digest mismatch is always rejected; expired, `unauthorized`, and `unknown` decisions
never authorize declaration inclusion.

Slice 1A1 also freezes two pure, non-trusting cross-record checks:

```ts
type PolicyDeclarationSourceEvidenceBindingResultV1 =
  | {
      matches: true;
      sourceContentDigest: PolicySourceContentDigestV1;
      declarationDigest: PolicyDeclarationDigestV1;
      authorizesExecution: false;
    }
  | {
      matches: false;
      reason: "source_content_digest_mismatch" | "declaration_digest_mismatch";
      authorizesExecution: false;
    };

function checkPolicyDeclarationSourceEvidenceBindingV1(
  rawSource: Uint8Array,
  declaration: PolicyDeclarationV1,
  evidence: PolicyDeclarationSourceEvidenceV1,
): PolicyDeclarationSourceEvidenceBindingResultV1;

type PolicyDeclarationAuthorityBindingResultV1 =
  | {
      matches: true;
      declarationDigest: PolicyDeclarationDigestV1;
      declarationAuthorityDecisionDigest: PolicyDeclarationAuthorityDecisionDigestV1;
      authorizesExecution: false;
    }
  | {
      matches: false;
      reason:
        | "decision_digest_mismatch"
        | "declaration_digest_mismatch"
        | "issuer_principal_mismatch"
        | "authority_domain_mismatch"
        | "required_authoring_capability_mismatch"
        | "granted_authoring_capability_missing"
        | "relation_authority_capability_missing";
      authorizesExecution: false;
    };

function checkPolicyDeclarationAuthorityBindingV1(
  declaration: PolicyDeclarationV1,
  decision: PolicyDeclarationAuthorityDecisionV1,
): PolicyDeclarationAuthorityBindingResultV1;
```

Both functions first parse to normalized strict values. The source check recomputes source then
declaration digest. The authority check uses the failure precedence shown in its reason union:
decision digest, declaration digest, issuer principal, domain, declared authoring capability, its
authorized grant membership, then relation-capability membership. The decision schema enforces
closed shape, scalars, timestamp ordering, authorized revocation-observation timing, and set
invariants, but deliberately does not enforce either grant-membership rule without the declaration;
the binding check owns both corresponding mismatch reasons. Grant-membership checks run only when
`status` is `authorized`; an internally consistent `unauthorized` or `unknown` record can return
`matches: true` without grants. A matching result proves only internal binding. It does not
authenticate either input, check currentness, change decision status, or authorize execution; those
remain responsibilities of the later protected verifier port.

### 5. Scope applicability and runtime activation are separate

Scope applicability is `applicable`, `not_applicable`, or `unknown`. Missing, stale, contradictory,
or unverified facts produce `unknown` rather than a guessed Boolean.

Activation is independently `active`, `dormant`, or `unknown`. It is evaluated against a typed
lifecycle proposal only after the applicable policy is known. V1 activation is either `always` or
an exact named `operation_requested` condition. It never asks whether effect authority has already
been granted; policy resolution therefore does not depend on a later authority decision.

Unknown applicability or activation for `require` or `forbid` is never silently treated as not
applicable. Native lifecycle admission remains indeterminate or blocked until the required inputs
are verified. Unknown `permit` cannot enable admission. A legacy text target may preserve a
condition only when its target profile can render it without weakening or strengthening it.

All applicable mandatory rules and their declared dependencies are closed before relevance or
context-size selection. Relevance may reduce advisory material but cannot omit mandatory closure.

### 6. Security-relevant facts require validation evidence

A confidence label is descriptive and cannot satisfy mandatory applicability. A security-relevant
fact observation identifies evidence and verification profiles, observer qualification, observation
time, and one explicit validity strategy: immutable, valid until a timestamp, or revalidate at use.

The policy resolver consumes validated observations and their verification result; it does not let a
fact self-assert that it is verified.

### 7. Canonical bytes and identities are specified and domain-separated

V1 uses an RFC 8785 JCS-compatible profile after strict schema validation:

- inputs contain JSON values only; the in-memory canonicalizer rejects `undefined`, non-finite
  numbers, and sparse arrays;
- the Slice 1A2 raw-source parser/compiler detects duplicate JSON or YAML mapping keys before object
  construction and digesting, because an in-memory object canonicalizer cannot recover them;
- schema integers remain integers and numbers use RFC 8785 / ECMAScript serialization;
- object keys are sorted by unsigned UTF-16 code units, never locale collation;
- parsed strings receive no implicit Unicode normalization;
- ordered arrays retain order, while fields explicitly declared semantic sets reject duplicates and
  are sorted by their specified key or canonical bytes before JCS serialization;
- `null` remains distinct from an absent optional field;
- canonical output is UTF-8; and
- a digest hashes exact ASCII domain tag + NUL byte + canonical bytes and is encoded as lowercase
  `sha256:<64-hex>`.

The policy-aware pipeline is fixed: (1) strict closed shape and scalar validation, (2) lowercase
UUID normalization, (3) cross-field validation and duplicate rejection using normalized members,
(4) declared-set sorting, (5) construction of a fresh normalized result, (6) construction of the
closed typed digest preimage, and (7) generic JCS serialization. Every exported v1 Zod policy
schema's `.parse()` returns the fresh normalized result and never mutates its input. The generic JSON
canonicalizer performs JSON-value validation and JCS object-key/number/string serialization only;
it never knows policy fields, lowercases IDs, rejects policy-set duplicates, or sorts semantic sets.
Digest builders accept the normalized schema outputs and do not silently repair unvalidated input.

The initial tags are `lex:normative-policy:source:v1`,
`lex:normative-policy:semantic:v1`, `lex:normative-policy:declaration:v1`,
`lex:normative-policy:declaration-authority-decision:v1`,
`lex:normative-policy:snapshot:v1`, and, when projection lands,
`lex:normative-policy:projection-target:v1` and
`lex:normative-policy:projection-artifact:v1`.

The Slice 1A1 digest preimages are exact closed objects:

```ts
type PolicyRuleSemanticDigestPreimageV1 = {
  canonicalizationVersion: typeof POLICY_CANONICALIZATION_VERSION_V1;
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  statement: PolicyNormativeStatementV1;
  activationCondition: PolicyActivationConditionV1;
  enforcementIntents: readonly PolicyEnforcementIntentV1[];
};

type PolicyDeclarationDigestRuleV1 = {
  ruleId: PolicyLogicalIdV1;
  semanticDigest: PolicySemanticDigestV1;
  relations: readonly PolicyRuleRelationV1[];
};

type PolicyDeclarationDigestPreimageV1 = {
  canonicalizationVersion: typeof POLICY_CANONICALIZATION_VERSION_V1;
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  declarationId: PolicyLogicalIdV1;
  revision: number;
  issuer: PolicyDeclarationIssuerV1;
  scope: PolicyScopeV1;
  rules: readonly [
    PolicyDeclarationDigestRuleV1,
    ...PolicyDeclarationDigestRuleV1[],
  ];
  authorizesExecution: false;
};

type PolicyDeclarationAuthorityDecisionDigestPreimageV1 = {
  canonicalizationVersion: typeof POLICY_CANONICALIZATION_VERSION_V1;
  payload: PolicyDeclarationAuthorityDecisionPayloadV1;
};
```

The semantic preimage's `statement` is the rule's `kind` plus `proposition` or
`orderedAlternatives`; it deliberately excludes `ruleId` and `relations`. The declaration preimage
replaces each full rule with its `ruleId`, computed `semanticDigest`, and normalized `relations`.
Source evidence is not a declaration-digest member. The declaration-authority-decision preimage
wraps the exact strict payload and excludes the result field.

Digest membership is fixed:

| Identity | Canonical members |
| --- | --- |
| `sourceContentDigest` | source domain tag, NUL, then exact raw source bytes; no JSON normalization |
| `semanticDigest` | exact `PolicyRuleSemanticDigestPreimageV1` |
| `declarationDigest` | exact `PolicyDeclarationDigestPreimageV1`; source evidence is excluded |
| `sourceAttestationDigest` | verifier-supplied, authority-owned digest of the exact source attestation selected by its non-bearer reference; its digest profile is external to Lex |
| `declarationAuthorityDecisionDigest` | exact `PolicyDeclarationAuthorityDecisionDigestPreimageV1`; excludes the wrapper's own digest field |
| `snapshotDigest` | compiler/resolver/canonicalization versions, explicit `asOf`, declaration digests, source-attestation digests, declaration-authority-decision digests, verified fact/evidence digests, overlay digests and authority decisions, resolution results, conflicts, diagnostics, ordered effective rules |

An exact raw-source `sourceContentDigest` hashes the source domain tag, NUL byte, and raw bytes.
Formatting and line-ending changes therefore remain visible evidence without changing semantic or
declaration identity. Array behavior is field-specific:

| Array field | Semantics and normalization |
| --- | --- |
| `PolicyDeclarationV1.rules`, declaration-preimage `rules` | semantic set; reject duplicate `ruleId`, then sort by `ruleId` using unsigned UTF-16 code-unit order |
| `PolicyRuleV1.relations`, declaration-preimage `relations` | semantic set; reject duplicate canonical relation, then sort by canonical bytes |
| `PolicyRuleV1.enforcementIntents`, semantic-preimage `enforcementIntents` | non-empty semantic set; reject duplicates, then sort by `prompt_guidance`, `lifecycle_precondition`, `capability_gate`, `verifier`, `audit` |
| authorized `grantedAuthoringCapabilities` | non-empty semantic set; reject duplicates, then sort by canonical bytes |
| unauthorized/unknown `evidenceRefs` | semantic set, possibly empty; reject duplicates, then sort by canonical bytes |
| `prefer.orderedAlternatives` | ordered; preserve source order and reject duplicate canonical propositions |

Every other array is ordered unless its schema explicitly declares set semantics. Scope is excluded
from `semanticDigest` and included in `declarationDigest`; typed proposition text does not duplicate
scope.

The following ASCII-only vectors are normative. `canonical` is one line with no trailing newline.
The raw-source vector alone ends in LF.

```text
source raw UTF-8 (escaped for display): {"schemaVersion":1}\n
sourceContentDigest: sha256:c2ea4835bdb0fc3c13999d9cdac7d37b1e979eeaee4aa3968ddfa1b53b43b937
```

```text
semantic canonical: {"activationCondition":{"type":"always"},"canonicalizationVersion":"lex:normative-policy:jcs:v1","enforcementIntents":["audit"],"schemaVersion":1,"statement":{"kind":"recommend","proposition":{"operationId":"stfc.runtime.cycle","type":"operation"}}}
semanticDigest: sha256:d81f2fdd1500a35d163d929437d8434f9da750775cdc16286423bbc9d6a91835
```

```text
declaration canonical: {"authorizesExecution":false,"canonicalizationVersion":"lex:normative-policy:jcs:v1","declarationId":"example.policy","issuer":{"authorityDomainId":"example.domain","principalId":"00000000-0000-4000-8000-000000000001","requiredAuthoringCapabilityId":"policy.author"},"revision":1,"rules":[{"relations":[],"ruleId":"example.rule","semanticDigest":"sha256:d81f2fdd1500a35d163d929437d8434f9da750775cdc16286423bbc9d6a91835"}],"schemaVersion":1,"scope":{"type":"global"}}
declarationDigest: sha256:a74719154937b4c8c3274e34eddddec163c5d4b249d9aef1caa4a750fb3fa49c
```

```text
declaration authority canonical: {"canonicalizationVersion":"lex:normative-policy:jcs:v1","payload":{"authorityDomainId":"example.domain","authorityVersion":"authority-v1","authorizesExecution":false,"declarationDigest":"sha256:a74719154937b4c8c3274e34eddddec163c5d4b249d9aef1caa4a750fb3fa49c","evaluatedAt":"2026-09-03T12:00:00.000Z","grantedAuthoringCapabilities":["policy.author"],"issuerPrincipalId":"00000000-0000-4000-8000-000000000001","requiredAuthoringCapabilityId":"policy.author","revocationEvidence":{"digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","observedAt":"2026-09-03T12:00:00.000Z","ref":"revocation:example","state":"not_revoked"},"schemaVersion":1,"sourceAttestationDigest":"sha256:0000000000000000000000000000000000000000000000000000000000000000","sourceAttestationRef":"attestation:example","status":"authorized","validUntil":"2026-09-04T12:00:00.000Z"}}
declarationAuthorityDecisionDigest: sha256:5aa7e5a7cfd11e401c6e832a60d85b232c7327b776345bf95d7d80d598002459
```

Deterministic products do not read an ambient clock, create random IDs, or depend on unordered
diagnostics. `asOf`, timestamps, and build identity are explicit canonical inputs or excluded.
Cross-process golden tests must produce byte-identical canonical output.

### 8. Durable policy and temporary exceptions use different contracts

Durable normative changes are declarations or amendments and may be indefinite. An exception or
bypass overlay is a separate bounded type requiring issuer, parent rule, override authority,
rationale, exact scope, issuance time, expiry, and a separately verified revocation-evidence
reference. An overlay cannot self-assert that it remains unrevoked.

This prevents a missing expiry from turning a temporary bypass into permanent policy. A durable
workspace prohibition is authored as policy, not represented as an immortal exception overlay.

### 9. Projection fidelity and enforcement are separate

The semantic projection flow is:

```text
PolicyDeclarationV1[]
    -> EffectivePolicySnapshotV1
    -> PolicyProjectionTargetProfileV1
    -> controlled deterministic renderer
    -> shadow artifact + PolicyProjectionReceiptV1
```

Projection fidelity is `exact`, `lossy_advisory`, or `unsupported`. Semantic strengthening and
mandatory omission are errors, not fidelity states. Lossy advisory output carries a visible
diagnostic. Renderers use controlled templates; model-generated paraphrase is outside compilation.

Enforcement realization is reported on a separate axis. Prompt text may be semantically exact while
remaining operationally unenforced. Generated output records its declaration and snapshot digests,
resolver and adapter versions, target-profile digest, exact artifact/owned-region content digest,
fidelity, enforcement realization, and enough evidence to detect staleness or hand editing. The
output never becomes a new canonical source. Receipt time/build values are explicit canonical
inputs; no ambient timestamp prevents reproducibility.

The current instruction projector's marker and atomic-write mechanics may be reused during a later
installation phase. Its Markdown-copy transformation is not the new semantic adapter.

### 10. Semantic linking, lifecycle binding, and live effects are separate strata

A pure context linker may combine an effective policy snapshot with separately typed verified facts,
LexSona behavior, scoped memory, mission, identity, and capability requirements to produce a
minimal, dependency-closed `ResolvedContextBundle`. The bundle is serialized non-authorizing data.

LexRunner may bind that bundle to a Run, Attempt, packet, base, workspace-lease references,
qualification references, and effect-authority-decision references as an
`AttemptExecutionDescriptor`. Those references are non-bearer audit identities; descriptor preview
does not acquire or exercise authority.

Only a live Attempt-bound grant plus a qualified enforcing capability and current fences may reach
an effect boundary. The protected broker revalidates that authority at every effect. There is one
authoritative effect-decision protocol per Attempt; participating components may have distinct
issuers and storage, but none maintains an independently decisive effect-authority truth.

The name `AgentInstance` remains reserved until identity, mission, WorkItem, Run, and Attempt
cardinality is separately decided.

This decision qualifies ADR-0004's historical statement that a Mode bundles permissions and
defines tools/autonomy: those values are requested configuration, declared capabilities, or
ceilings, never effect grants. Likewise, legacy LexSona severities such as `must` or
`zero-tolerance` remain behavioral emphasis and cannot become policy admission or lifecycle gates
without separately authored policy.

### 11. The first production declaration groups atomic routing rules

The provisional declaration ID is:

`stfc.lifecycle.cycle.managed-route`

Verified public-STFC workspace facts make the declaration applicable. It contains three linked rules
with activation `operation_requested(stfc.runtime.cycle)`:

1. `stfc.lifecycle.cycle.require-public-managed-route` (`require`) requires the proposed operation
   route to be the qualified public managed-cycle capability.
2. `stfc.lifecycle.cycle.forbid-manual-fallback` (`forbid`) prohibits a manual lifecycle route.
3. `stfc.lifecycle.cycle.forbid-private-fallback` (`forbid`) prohibits a private lifecycle route.

With no cycle request, the rules are dormant and create no duty. On a request, they activate before
effect authority is evaluated. Missing qualified public routing makes the required proposition
unsatisfied and blocks policy/capability admission; the two prohibitions prevent fallback. Missing
Attempt-bound authority independently denies the effect even if the requested route satisfies
policy.

A broader recommendation to use managed tooling may coexist with the workspace declaration. Scope
alone does not infer conflict or refinement; any refinement is explicit and authority-validated.

A synthetic `permit stfc.runtime.cycle` fixture is nevertheless required to prove that policy
permission never creates an authority grant, implicitly overrides a forbid, or enables admission
while its applicability is unknown.

### 12. Delivery is split into bounded slices

Slice 1A is delivered in independently reviewable increments:

1. strict declaration, atomic statement, scope, activation, external declaration-authority-decision,
   and digest contracts, canonicalization, and five-modal conformance fixtures;
2. compiler, strict `CompiledPolicyV1`, and stable diagnostics;
3. resolver and effective snapshots;
4. Codex and Copilot target profiles, controlled renderers, shadow artifacts, and receipts; and
5. the downstream public STFC declaration and shadow dogfood proof.

Slice 1B separately introduces the pure `ResolvedContextBundle` and LexRunner's read-only preview of
`AttemptExecutionDescriptor`.

No consumer instruction is installed and no live effect is invoked merely because either shadow
slice passes.

## Consequences

### Positive

- One canonical rule can feed multiple legacy consumers without duplicate semantic authorship.
- Modal meaning, authority source, applicability, projection fidelity, and enforcement remain
  independently explainable.
- Policy and context products cannot be mistaken for bearer authority by type.
- Unknown mandatory conditions and unsupported target semantics fail conservatively.
- Existing Lex projection mechanics can be evolved incrementally without preserving their
  Markdown-first semantic limitation.
- LexRunner can consume a stable public semantic contract without Lex owning orchestration.

### Costs

- Authors must identify source authority, scope, dependencies, and evidence rather than relying on
  file location and prose convention.
- Targets require explicit capability profiles and controlled templates.
- Legacy hosts may be unable to represent some mandatory conditions and will reject projection.
- Cross-repository rollout requires compatibility and release coordination.
- More identities and receipts exist because semantic meaning, declaration authority, and live
  effect authority are deliberately not conflated.

## Non-goals

Slice 1 does not:

- modify or replace `lexmap.policy.json`;
- migrate all existing instructions;
- install generated artifacts into live host files;
- issue, store, or refresh authority grants;
- define the LexThority wire protocol;
- invoke AXF capabilities or cycle the STFC client;
- redesign LexRunner scheduling, retries, or the Attempt DAG;
- use the existing argv classifier/action hash as an effect-security identity;
- define `AgentInstance`;
- make provider-owned system or safety instructions canonical Lex policy; or
- build a universal context object.

## Deferred decisions

- The exact public STFC declaration format and repository path.
- The protected declaration-authority verifier port while LexThority lacks a native Windows checkout;
  the declaration/decision data separation is fixed here.
- The full conflict and override algebra beyond the fixed rules that precedence is never implicit,
  permit never defeats forbid, and refinement/override relationships name authenticated authority.
- The exact security-relevant fact keys and verification profiles for STFC workspace identity.
- The enforcement-realization vocabulary used in projection receipts.
- Per-target handling of unknown mandatory conditionals.
- Ownership and package direction for the pure context linker.
- `AgentInstance` semantics and cardinality.
- Live broker, revocation, fencing, receipt, and verification protocols.

## Related work

- ADR-0011 defines trusted runtime scope and the authority boundary.
- ADR-0006 separates public Lex contracts from LexRunner engine behavior.
- Lex #833, #834, #836, and #835 own Slice 1A in dependency order; #837 owns the pure-linker
  placement decision.
- Lex #800 tracks Windows and STFC policy/continuity work.
- LexRunner #839, #858, #859, and #879 cover related Attempt authority, packet, Frame projection,
  and route-over-bridge work.
- LexSona #125 tracks the behavioral-constraint boundary.
- AXF #50 tracks future decision-bound execution enforcement.
- [Lex #832](https://github.com/Guffawaffle/lex/issues/832) is the remotely recoverable program
  ledger and links the native control-workspace execution packet.
