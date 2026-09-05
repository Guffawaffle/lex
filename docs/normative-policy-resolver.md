# Normative policy resolver V1

Slice 1A3 is a library-only extension of ADR-0012. Slice 1A2 is merged, and the
maintainer approved one combined 1A2/1A3 release on 2026-09-05. No intermediate
compiler publication is required. Context Forge still requires the released
snapshot contract and Lex #837 ratification.

## Decision freeze before implementation

The following choices close the two implementation decision gates in Lex #836.
They do not install a production verifier or confer effect authority.

### Protected verifier boundary

The host constructs a resolver with a fixed `PolicyResolverVerifierV1`. Its
`verify` method is captured at construction, never selected by request data.
The host is responsible for protecting that installation and its implementation;
an arbitrary caller able to replace host code is outside this library's trust
boundary. There is no public data-to-trust conversion, credential lookup, global
registry, default permissive verifier, or acceptance of caller-provided decisions.

Each invocation supplies inert, strictly parsed data: compiled declarations,
canonical base64 raw source bytes, bounded exception overlays, a typed operation
proposal, explicit `asOf`, and non-bearer evidence references. The verifier receives
a deeply frozen copy and its domain-separated request digest. Its closed response
must bind that digest and the configured verifier version. Failure, malformed
output, missing evidence, or a mismatched binding cannot produce successful policy
admission. An integrity digest alone never authenticates either request or response.

For every included declaration the verifier must authenticate the exact chain:
raw bytes and source locator -> source evidence -> source attestation -> declaration
authority decision. Lex independently parses the raw JSON bytes, recomputes source
and declaration identities, checks the decision digest/issuer/domain/capabilities,
and checks validity at `asOf`. The verifier owns attestation semantics and provenance,
scope authority, current revocation verification, and the sufficiency of each exact
`refines`/`overrides` relation's authoring capability. Grant membership alone is
insufficient, including when a relation target is currently dormant or out of scope.
Relation approvals bind both digest-pinned endpoints and relation type; the complete
authored relation set must be approved before declaration inclusion.

Verified context observations supply tenant, workspace, and repository identities.
Every observation binds its evidence, verification profile, observer qualification,
observation time, and one validity strategy: immutable, finite expiry, or successful
revalidation at this exact `asOf`. Missing, contradictory, stale, or unqualified
observations yield unknown scope applicability. A request cannot submit a
`confidence: verified` label in place of this protected result.

Route-class membership is separately supplied by the protected classifier for an
exact capability/class pair. Missing membership is unknown, not non-membership.
Selected-implementation qualification is a separate protected result bound to the
proposal's exact capability and implementation digest. Membership cannot qualify
an implementation, and qualification cannot invent membership. Neither produces
an effect grant. An incomplete operation proposal produces unknown activation for
request-conditional rules; `always` is active without inventing a request.

An explicitly confirmed absence uses `proposal.operationPresence: "absent"` with
all three selection fields (`operationId`, `capabilityId`, `implementationDigest`)
set to `null`. Request-conditional rules are dormant in this case. Without this
optional field, `operationId: null` retains its existing unknown meaning and digest.
An absent operation does not satisfy an unconditional required operation, disable
an `always` condition, establish workspace facts, or provide effect authority.

### Conflict and relation semantics

Resolution preserves applicability, activation, declaration trust, and proposition
satisfaction as separate dimensions. A missing or unknown mandatory input blocks
policy admission; an unknown permit never enters `affirmativeAllowances`. Admission
here means only that this snapshot has no unresolved policy blocker. It is not
native lifecycle admission or execution eligibility.

Mandatory `require`/`forbid` rules conflict when they concern the same operation and
the forbidden proposition covers the required proposition: an operation-wide
prohibition covers every route, identical capabilities/classes cover themselves,
and capability/class coverage needs protected membership. Two distinct required
capabilities for the same operation conflict because this proposal selects one
implementation. Multiple class requirements are conjunctive, not assumed disjoint.
An operation-wide requirement and a route-specific prohibition are not inherently
contradictory; the selected route is evaluated independently. Missing classifier
evidence for a potential mandatory conflict yields an unresolved conflict.

An explicit authorized `overrides` edge may also resolve a permit/forbid opposition
when the forbidden proposition covers the permit. No implicit permit precedence
exists. An overriding permit must also be satisfied by this exact proposal;
an unmatched or unknown route-specific permit cannot remove a broader prohibition
for a different route. Recommendations and preferences never suppress mandatory policy.
`refines` records additive lineage only. A non-conflicting override records a trace
without suppression. Every suppression requires authenticated, applicable, active
source and target plus an exact protected relation approval. Edges are processed
source-before-target in the compiler's acyclic graph: a suppressed source never
suppresses another target. This does not infer transitive override authority.

Mandatory dependencies are checked after explicit suppression, recursively through
their exact graph. Every dependency must be authenticated, applicable, active, and
unsuppressed. A missing, unknown, dormant, out-of-scope, or suppressed dependency
blocks its mandatory consumer. No relevance pruning occurs in this slice.

### Bounded overlays and snapshot identity

An exception overlay identifies its issuer, exact parent rule, override capability,
rationale, exact scope, issuance and expiry. It can suppress only that parent and
requires an independent protected approval binding the overlay digest, issuer,
scope, target, current authority, and revocation evidence. Expired, future,
revoked, unauthorized, or unknown requested exceptions fail closed. Overlays never
become durable declarations or silently broaden their parent scope. V1 permits
identical scopes, narrowing a global parent, or narrowing a workspace/repository
parent to a matching workspace-repository pair. Other containment needs an explicit
future contract rather than inferred cross-tenant membership.
The overlay's `revocationEvidenceRef` must match the proof's separate
`revocationEvidence` record, whose qualification and freshness are checked independently
of the other approval evidence.

The immutable snapshot binds compiler/resolver/canonicalization versions, explicit
`asOf`, the request digest, compiled declaration/source evidence, normalized verifier
evidence (including attestation and authority-decision digests), overlays and their
decisions, per-rule results, exact relation traces, conflicts, diagnostics, and
ordered effective rules. The snapshot domain is `lex:normative-policy:snapshot:v1`.
Every semantic set rejects duplicates before canonical sorting. Request order of
declarations, raw sources, evidence references, and overlays is non-semantic;
preference alternative order remains semantic. No ambient time or random ID enters
resolution. The result is `{ payload, snapshotDigest }`; `payload.rules` retains
full rules and separate evaluation dimensions, `effectiveRules` identifies the
unsuppressed effective set, and `affirmativeAllowances` identifies only satisfied
effective permits. A caller must not use an arbitrary effective permit as an
allowance or treat `policyAdmission: satisfied` as an effect grant.

The synthetic baseline in `test/normative-policy/resolver-fixture.ts` has snapshot
digest `sha256:0b8a13f54fee2cff6b6f1da4fbf1e2b71dd52f93b633746df29f1bcf4a4c2386`.
Tests bind that fixed vector and compare complete canonical bytes across processes.

Snapshot parsing and digest verification establish integrity only;
downstream hosts must retain the trusted provenance and currentness boundary.

## Host usage

```ts
const resolver = createPolicyResolverV1(protectedVerifier);
const snapshot = await resolver.resolve(request);
```

The host supplies a real protected verifier; the test fixture is not a production
adapter. `resolve` rejects malformed request data before calling that verifier.
Provider errors and invalid responses return a blocked snapshot with bounded
diagnostic codes, without copying provider exception text. A serializable response
binds `requestDigest` and `verifierVersion`; its field schemas are exported as
`PolicyResolverVerificationV1Schema`. Source bytes use canonical base64 because the
request is inert JSON, and Lex re-parses those bytes with the 1A2 bounded JSON parser.

No production LexThority adapter, host installation, instruction projection, game
configuration change, runtime upgrade, native admission, or effect execution is
included. These remain separate integrations and must not treat this library's
synthetic verification as their acceptance evidence.
