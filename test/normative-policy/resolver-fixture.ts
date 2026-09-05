import assert from "node:assert/strict";
import {
  compilePolicyV1,
  computePolicyDeclarationAuthorityDecisionDigestV1,
  computePolicyExceptionOverlayDigestV1,
  computePolicySemanticDigestV1,
  parsePolicyDeclarationJsonV1,
  PolicyDeclarationAuthorityDecisionPayloadV1Schema,
  PolicyDeclarationV1Schema,
  PolicyResolutionRequestV1Schema,
  POLICY_CANONICALIZATION_VERSION_V1,
  POLICY_COMPILER_VERSION_V1,
  type PolicyResolutionRequestV1,
  type PolicyRuleV1,
} from "../../src/normative-policy/index.js";

export const asOf = "2026-09-05T12:00:00.000Z";
export const before = "2026-09-05T11:00:00.000Z";
export const after = "2026-09-05T13:00:00.000Z";
export const digest = `sha256:${"1".repeat(64)}`;
export const uuid = "00000000-0000-4000-8000-000000000001";
export const evidence = () => [
  {
    ref: "evidence:test",
    digest,
    verificationProfileId: "test.profile",
    observerQualificationDigest: digest,
    observedAt: before,
    validity: { type: "until", validUntil: after },
  },
];
export function declaration(id = "test.policy", kind: PolicyRuleV1["kind"] = "require") {
  return PolicyDeclarationV1Schema.parse({
    schemaVersion: 1,
    declarationId: id,
    revision: 1,
    issuer: {
      principalId: uuid,
      authorityDomainId: "test.domain",
      requiredAuthoringCapabilityId: "policy.author",
    },
    scope: { type: "global" },
    authorizesExecution: false,
    rules: [
      {
        ruleId: "test.rule",
        kind,
        proposition: { type: "operation", operationId: "test.operation" },
        activationCondition: { type: "operation_requested", operationId: "test.operation" },
        relations: [],
        enforcementIntents: ["audit"],
      },
    ],
  });
}
export function target(value: ReturnType<typeof declaration>) {
  return {
    declarationId: value.declarationId,
    declarationRevision: value.revision,
    ruleId: value.rules[0].ruleId,
    expectedSemanticDigest: computePolicySemanticDigestV1(value.rules[0]),
  };
}
export function request(values: unknown[] = [declaration()]): PolicyResolutionRequestV1 {
  const parsed = values.map((value, i) => {
    const bytes = Buffer.from(JSON.stringify(value));
    const result = parsePolicyDeclarationJsonV1(bytes, {
      type: "synthetic_fixture",
      fixtureId: `resolver.${i}`,
    });
    assert(result.ok);
    return {
      input: result.input,
      raw: {
        declarationDigest: result.input.sourceEvidence!.declarationDigest,
        base64: bytes.toString("base64"),
      },
    };
  });
  const compiled = compilePolicyV1({
    schemaVersion: 1,
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    compilerVersion: POLICY_COMPILER_VERSION_V1,
    inputs: parsed.map((value) => value.input),
  });
  assert(compiled.ok);
  return PolicyResolutionRequestV1Schema.parse({
    schemaVersion: 1,
    compiled: compiled.compiled,
    rawSources: parsed.map((value) => value.raw),
    overlays: [],
    proposal: { operationId: "test.operation", capabilityId: null, implementationDigest: null },
    asOf,
    evidenceRefs: [],
  });
}

// Test-only verifier: deliberately synthetic and never exported by the package.
export function verification(input: { request: PolicyResolutionRequestV1; requestDigest: string }) {
  return {
    schemaVersion: 1,
    requestDigest: input.requestDigest,
    verifierVersion: "test.verifier.v1",
    declarations: input.request.compiled.declarations.map((entry) => {
      const capabilities = new Set([entry.declaration.issuer.requiredAuthoringCapabilityId]);
      for (const rule of entry.declaration.rules)
        for (const relation of rule.relations)
          if (relation.type !== "depends_on")
            capabilities.add(relation.requiredAuthorityCapabilityId);
      const payload = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
        schemaVersion: 1,
        declarationDigest: entry.declarationDigest,
        issuerPrincipalId: entry.declaration.issuer.principalId,
        authorityDomainId: entry.declaration.issuer.authorityDomainId,
        requiredAuthoringCapabilityId: entry.declaration.issuer.requiredAuthoringCapabilityId,
        evaluatedAt: before,
        validUntil: after,
        authorizesExecution: false,
        status: "authorized",
        authorityVersion: "test.v1",
        sourceAttestationRef: "attestation:test",
        sourceAttestationDigest: digest,
        grantedAuthoringCapabilities: [...capabilities],
        revocationEvidence: {
          ref: "revocation:test",
          digest,
          observedAt: before,
          state: "not_revoked",
        },
      });
      return {
        declarationDigest: entry.declarationDigest,
        decision: {
          payload,
          declarationAuthorityDecisionDigest:
            computePolicyDeclarationAuthorityDecisionDigestV1(payload),
        },
        sourceEvidence: entry.sourceEvidence,
        sourceAttestationRef: "attestation:test",
        sourceAttestationDigest: digest,
        approvedRelations: entry.declaration.rules.flatMap((rule) =>
          rule.relations
            .filter((r) => r.type !== "depends_on")
            .map((relation) => ({
              source: {
                declarationId: entry.declaration.declarationId,
                declarationRevision: entry.declaration.revision,
                ruleId: rule.ruleId,
                expectedSemanticDigest: computePolicySemanticDigestV1(rule),
              },
              ...relation,
            }))
        ),
        evidence: evidence(),
      };
    }),
    facts: ["tenantId", "workspaceId", "repositoryId"].map((key) => ({
      key,
      value: uuid,
      status: "verified",
      evidence: evidence(),
    })),
    routeClassifications: [] as {
      capabilityId: string;
      routeClassId: string;
      status: string;
      evidence: ReturnType<typeof evidence>;
    }[],
    selectedImplementation: input.request.proposal.capabilityId
      ? {
          capabilityId: input.request.proposal.capabilityId,
          implementationDigest: input.request.proposal.implementationDigest,
          status: "qualified",
          evidence: evidence(),
        }
      : null,
    overlays: input.request.overlays.map((overlay) => ({
      overlayDigest: computePolicyExceptionOverlayDigestV1(overlay),
      status: "authorized",
      issuer: overlay.issuer,
      target: overlay.target,
      scope: overlay.scope,
      requiredOverrideCapabilityId: overlay.requiredOverrideCapabilityId,
      authorityVersion: "test.v1",
      evaluatedAt: before,
      validUntil: after,
      revocation: "not_revoked",
      evidence: evidence(),
    })),
    authorizesExecution: false,
  };
}
