import type {
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  RepositoryId,
  TenantId,
  WorkspaceId,
} from "../shared/runtime-scope/index.js";
import type { CompiledPolicyV1 } from "./compiler.js";
import type {
  IsoDateTimeV1,
  NonBearerReferenceV1,
  PolicyDeclarationAuthorityDecisionV1,
  PolicyDeclarationDigestV1,
  PolicyDeclarationIssuerV1,
  PolicyDeclarationSourceEvidenceV1,
  PolicyLogicalIdV1,
  PolicyRuleTargetV1,
  PolicyRuleV1,
  PolicyScopeV1,
  PolicySourceAttestationDigestV1,
} from "./types.js";

export type PolicyImmutableV1<T> = T extends string | number | boolean | null | undefined
  ? T
  : { readonly [K in keyof T]: PolicyImmutableV1<T[K]> };

export type PolicyExceptionOverlayV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  overlayId: PolicyLogicalIdV1;
  issuer: PolicyDeclarationIssuerV1;
  target: PolicyRuleTargetV1;
  requiredOverrideCapabilityId: CapabilityId;
  revocationEvidenceRef: NonBearerReferenceV1;
  scope: PolicyScopeV1;
  rationale: string;
  issuedAt: IsoDateTimeV1;
  expiresAt: IsoDateTimeV1;
  authorizesExecution: false;
}>;

export type PolicyResolutionRequestV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  compiled: CompiledPolicyV1;
  rawSources: { declarationDigest: PolicyDeclarationDigestV1; base64: string }[];
  overlays: PolicyExceptionOverlayV1[];
  proposal: {
    operationId: PolicyLogicalIdV1 | null;
    capabilityId: CapabilityId | null;
    implementationDigest: ContentDigest | null;
  };
  asOf: IsoDateTimeV1;
  evidenceRefs: NonBearerReferenceV1[];
}>;

export type PolicyVerificationEvidenceV1 = PolicyImmutableV1<{
  ref: NonBearerReferenceV1;
  digest: ContentDigest;
  verificationProfileId: PolicyLogicalIdV1;
  observerQualificationDigest: ContentDigest;
  observedAt: IsoDateTimeV1;
  validity:
    | { type: "immutable" }
    | { type: "until"; validUntil: IsoDateTimeV1 }
    | { type: "revalidate_at_use"; revalidatedAt: IsoDateTimeV1 | null };
}>;

export type PolicyVerifiedRelationV1 = {
  source: PolicyRuleTargetV1;
  target: PolicyRuleTargetV1;
  type: "refines" | "overrides";
  requiredAuthorityCapabilityId: CapabilityId;
};

export type PolicyResolverVerificationV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  requestDigest: ContentDigest;
  verifierVersion: PolicyLogicalIdV1;
  declarations: {
    declarationDigest: PolicyDeclarationDigestV1;
    decision: PolicyDeclarationAuthorityDecisionV1;
    sourceEvidence: PolicyDeclarationSourceEvidenceV1;
    sourceAttestationRef: NonBearerReferenceV1;
    sourceAttestationDigest: PolicySourceAttestationDigestV1;
    approvedRelations: PolicyVerifiedRelationV1[];
    evidence: PolicyVerificationEvidenceV1[];
  }[];
  facts: ({ status: "verified" | "unknown"; evidence: PolicyVerificationEvidenceV1[] } & (
    | { key: "tenantId"; value: TenantId | null }
    | { key: "workspaceId"; value: WorkspaceId | null }
    | { key: "repositoryId"; value: RepositoryId | null }
  ))[];
  routeClassifications: {
    capabilityId: CapabilityId;
    routeClassId: PolicyLogicalIdV1;
    status: "member" | "not_member" | "unknown";
    evidence: PolicyVerificationEvidenceV1[];
  }[];
  selectedImplementation: {
    capabilityId: CapabilityId;
    implementationDigest: ContentDigest;
    status: "qualified" | "unqualified" | "unknown";
    evidence: PolicyVerificationEvidenceV1[];
  } | null;
  overlays: {
    overlayDigest: ContentDigest;
    status: "authorized" | "unauthorized" | "unknown";
    issuer: PolicyDeclarationIssuerV1;
    target: PolicyRuleTargetV1;
    scope: PolicyScopeV1;
    requiredOverrideCapabilityId: CapabilityId;
    authorityVersion: AuthorityVersion;
    evaluatedAt: IsoDateTimeV1;
    validUntil: IsoDateTimeV1;
    revocation: "not_revoked" | "revoked" | "unknown";
    revocationEvidence: PolicyVerificationEvidenceV1;
    evidence: PolicyVerificationEvidenceV1[];
  }[];
  authorizesExecution: false;
}>;

export type PolicyResolverDiagnosticV1 = PolicyImmutableV1<{
  code:
    | "verifier_failed"
    | "invalid_verification"
    | "verification_binding_mismatch"
    | "declaration_untrusted"
    | "mandatory_unknown"
    | "mandatory_unsatisfied"
    | "dependency_unsatisfied"
    | "relation_unauthorized"
    | "conflict"
    | "conflict_unknown"
    | "overlay_rejected"
    | "implementation_unqualified";
  rule: PolicyRuleTargetV1 | null;
  related: PolicyRuleTargetV1 | null;
  overlayId: PolicyLogicalIdV1 | null;
}>;

export type PolicyRuleResolutionV1 = {
  target: PolicyRuleTargetV1;
  rule: PolicyRuleV1;
  declarationTrusted: boolean;
  applicability: "applicable" | "not_applicable" | "unknown";
  activation: "active" | "dormant" | "unknown";
  satisfaction: "satisfied" | "unsatisfied" | "unknown" | "not_evaluated";
  disposition: "effective" | "inactive" | "untrusted" | "unknown" | "suppressed";
};
export type PolicyRelationResolutionV1 = {
  source: PolicyRuleTargetV1;
  target: PolicyRuleTargetV1;
  type: "depends_on" | "refines" | "overrides";
  outcome:
    | "additive"
    | "suppressed"
    | "non_conflicting"
    | "inactive"
    | "unauthorized"
    | "unknown"
    | "satisfied"
    | "unsatisfied";
};
export type PolicyConflictV1 = {
  left: PolicyRuleTargetV1;
  right: PolicyRuleTargetV1;
  status: "conflict" | "unknown";
};

export type PolicySnapshotPreimageV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  canonicalizationVersion: "lex:normative-policy:jcs:v1";
  compilerVersion: "lex:normative-policy:compiler:v1";
  resolverVersion: "lex:normative-policy:resolver:v1";
  asOf: IsoDateTimeV1;
  requestDigest: ContentDigest;
  request: PolicyResolutionRequestV1;
  verifierVersion: PolicyLogicalIdV1;
  verification: PolicyResolverVerificationV1 | null;
  rules: PolicyRuleResolutionV1[];
  relations: PolicyRelationResolutionV1[];
  conflicts: PolicyConflictV1[];
  diagnostics: PolicyResolverDiagnosticV1[];
  effectiveRules: PolicyRuleTargetV1[];
  affirmativeAllowances: PolicyRuleTargetV1[];
  policyAdmission: "satisfied" | "blocked";
  authorizesExecution: false;
}>;
export type EffectivePolicySnapshotV1 = PolicyImmutableV1<{
  payload: PolicySnapshotPreimageV1;
  snapshotDigest: ContentDigest;
}>;
