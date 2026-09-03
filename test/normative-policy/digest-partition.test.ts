import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { canonicalizeJson } from "../../src/normative-policy/canonical-json.js";
import {
  computePolicyDeclarationAuthorityDecisionDigestV1,
  computePolicyDeclarationDigestV1,
  computePolicySemanticDigestV1,
  computePolicySourceContentDigestV1,
  createPolicyDeclarationDigestPreimageV1,
} from "../../src/normative-policy/canonical.js";
import {
  PolicyDeclarationAuthorityDecisionPayloadV1Schema,
  PolicyDeclarationV1Schema,
  PolicyRuleV1Schema,
} from "../../src/normative-policy/types.js";

const PRINCIPAL_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PRINCIPAL_ID = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000003";
const SEMANTIC_DIGEST = `sha256:${"1".repeat(64)}`;
const ATTESTATION_DIGEST = `sha256:${"2".repeat(64)}`;
const OTHER_ATTESTATION_DIGEST = `sha256:${"3".repeat(64)}`;
const REVOCATION_DIGEST = `sha256:${"4".repeat(64)}`;

function baseRule() {
  return {
    ruleId: "example.rule",
    kind: "require",
    proposition: { type: "operation", operationId: "stfc.runtime.cycle" },
    activationCondition: { type: "always" },
    relations: [],
    enforcementIntents: ["audit"],
  };
}

function declarationInput() {
  return {
    schemaVersion: 1,
    declarationId: "example.policy",
    revision: 1,
    issuer: {
      principalId: PRINCIPAL_ID,
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
    },
    scope: { type: "global" },
    rules: [baseRule()],
    authorizesExecution: false,
  };
}

function authorizedPayloadInput(declarationDigest: string) {
  return {
    schemaVersion: 1,
    declarationDigest,
    issuerPrincipalId: PRINCIPAL_ID,
    authorityDomainId: "example.domain",
    requiredAuthoringCapabilityId: "policy.author",
    evaluatedAt: "2026-09-03T12:00:00.000Z",
    validUntil: "2026-09-04T12:00:00.000Z",
    authorizesExecution: false,
    status: "authorized",
    authorityVersion: "authority-v1",
    sourceAttestationRef: "attestation:one",
    sourceAttestationDigest: ATTESTATION_DIGEST,
    grantedAuthoringCapabilities: ["policy.override", "policy.author"],
    revocationEvidence: {
      ref: "revocation:one",
      digest: REVOCATION_DIGEST,
      observedAt: "2026-09-03T12:00:00.000Z",
      state: "not_revoked",
    },
  };
}

describe("normative-policy digest partition", () => {
  test("keeps exact source formatting separate from semantic and declaration identity", () => {
    const compact = Buffer.from('{"schemaVersion":1}\n', "utf8");
    const formatted = Buffer.from('{ "schemaVersion": 1 }\n', "utf8");
    const declaration = PolicyDeclarationV1Schema.parse(declarationInput());

    assert.notEqual(
      computePolicySourceContentDigestV1(compact),
      computePolicySourceContentDigestV1(formatted)
    );
    assert.equal(
      computePolicySemanticDigestV1(declaration.rules[0]),
      computePolicySemanticDigestV1(PolicyRuleV1Schema.parse(baseRule()))
    );
    assert.equal(
      computePolicyDeclarationDigestV1(declaration),
      computePolicyDeclarationDigestV1(PolicyDeclarationV1Schema.parse(declarationInput()))
    );
  });

  test("assigns scope, issuer, rule identity, relations, activation, and meaning to exact domains", () => {
    const baseDeclaration = PolicyDeclarationV1Schema.parse(declarationInput());
    const baseSemanticDigest = computePolicySemanticDigestV1(baseDeclaration.rules[0]);
    const baseDeclarationDigest = computePolicyDeclarationDigestV1(baseDeclaration);

    const variants = {
      scope: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        scope: { type: "workspace", workspaceId: WORKSPACE_ID },
      }),
      issuer: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        issuer: { ...declarationInput().issuer, principalId: OTHER_PRINCIPAL_ID },
      }),
      ruleId: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        rules: [{ ...baseRule(), ruleId: "example.renamed-rule" }],
      }),
      relation: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        rules: [
          {
            ...baseRule(),
            relations: [
              {
                type: "depends_on",
                target: {
                  declarationId: "base.policy",
                  declarationRevision: 1,
                  ruleId: "base.rule",
                  expectedSemanticDigest: SEMANTIC_DIGEST,
                },
              },
            ],
          },
        ],
      }),
      activation: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        rules: [
          {
            ...baseRule(),
            activationCondition: {
              type: "operation_requested",
              operationId: "stfc.runtime.cycle",
            },
          },
        ],
      }),
      meaning: PolicyDeclarationV1Schema.parse({
        ...declarationInput(),
        rules: [
          {
            ...baseRule(),
            proposition: { type: "operation", operationId: "stfc.runtime.restart" },
          },
        ],
      }),
    };

    for (const key of ["scope", "issuer", "ruleId", "relation"] as const) {
      assert.equal(
        computePolicySemanticDigestV1(variants[key].rules[0]),
        baseSemanticDigest,
        `${key} must not change semantic identity`
      );
      assert.notEqual(
        computePolicyDeclarationDigestV1(variants[key]),
        baseDeclarationDigest,
        `${key} must change declaration identity`
      );
    }

    for (const key of ["activation", "meaning"] as const) {
      assert.notEqual(
        computePolicySemanticDigestV1(variants[key].rules[0]),
        baseSemanticDigest,
        `${key} must change semantic identity`
      );
      assert.notEqual(
        computePolicyDeclarationDigestV1(variants[key]),
        baseDeclarationDigest,
        `${key} must change declaration identity`
      );
    }
  });

  test("normalizes only declared sets while preserving preference order", () => {
    const relationA = {
      type: "depends_on",
      target: {
        declarationId: "base.policy",
        declarationRevision: 1,
        ruleId: "base.a",
        expectedSemanticDigest: SEMANTIC_DIGEST,
      },
    };
    const relationB = {
      type: "overrides",
      target: {
        declarationId: "base.policy",
        declarationRevision: 1,
        ruleId: "base.b",
        expectedSemanticDigest: SEMANTIC_DIGEST,
      },
      requiredAuthorityCapabilityId: "policy.override",
    };
    const ruleA = {
      ...baseRule(),
      ruleId: "example.a",
      relations: [relationB, relationA],
      enforcementIntents: ["audit", "capability_gate"],
    };
    const ruleB = {
      ...baseRule(),
      ruleId: "example.b",
      kind: "recommend",
      relations: [],
    };
    const left = PolicyDeclarationV1Schema.parse({
      ...declarationInput(),
      rules: [ruleB, ruleA],
    });
    const right = PolicyDeclarationV1Schema.parse({
      ...declarationInput(),
      rules: [
        {
          ...ruleA,
          relations: [relationA, relationB],
          enforcementIntents: ["capability_gate", "audit"],
        },
        ruleB,
      ],
    });

    assert.deepEqual(left, right);
    assert.equal(
      canonicalizeJson(createPolicyDeclarationDigestPreimageV1(left)),
      canonicalizeJson(createPolicyDeclarationDigestPreimageV1(right))
    );
    assert.equal(computePolicyDeclarationDigestV1(left), computePolicyDeclarationDigestV1(right));

    const declarationDigest = computePolicyDeclarationDigestV1(left);
    const authorityLeft = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse(
      authorizedPayloadInput(declarationDigest)
    );
    const authorityRight = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...authorizedPayloadInput(declarationDigest),
      grantedAuthoringCapabilities: ["policy.author", "policy.override"],
    });
    assert.equal(
      computePolicyDeclarationAuthorityDecisionDigestV1(authorityLeft),
      computePolicyDeclarationAuthorityDecisionDigestV1(authorityRight)
    );

    const unknownCommon = {
      schemaVersion: 1,
      declarationDigest,
      issuerPrincipalId: PRINCIPAL_ID,
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
      evaluatedAt: "2026-09-03T12:00:00.000Z",
      validUntil: "2026-09-03T12:05:00.000Z",
      authorizesExecution: false,
      status: "unknown",
      reason: "verification_failed",
    };
    const unknownLeft = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...unknownCommon,
      evidenceRefs: ["evidence:z", "evidence:a"],
    });
    const unknownRight = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...unknownCommon,
      evidenceRefs: ["evidence:a", "evidence:z"],
    });
    assert.equal(
      computePolicyDeclarationAuthorityDecisionDigestV1(unknownLeft),
      computePolicyDeclarationAuthorityDecisionDigestV1(unknownRight)
    );

    const preferCommon = {
      ruleId: "example.preference",
      activationCondition: { type: "always" },
      relations: [],
      kind: "prefer",
      enforcementIntents: ["audit"],
    };
    const preferLeft = PolicyRuleV1Schema.parse({
      ...preferCommon,
      orderedAlternatives: [
        { type: "operation", operationId: "operation.a" },
        { type: "operation", operationId: "operation.b" },
      ],
    });
    const preferRight = PolicyRuleV1Schema.parse({
      ...preferCommon,
      orderedAlternatives: [
        { type: "operation", operationId: "operation.b" },
        { type: "operation", operationId: "operation.a" },
      ],
    });
    assert.notEqual(
      computePolicySemanticDigestV1(preferLeft),
      computePolicySemanticDigestV1(preferRight)
    );
  });

  test("changes decision identity when source-attestation evidence rotates", () => {
    const declaration = PolicyDeclarationV1Schema.parse(declarationInput());
    const declarationDigest = computePolicyDeclarationDigestV1(declaration);
    const before = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse(
      authorizedPayloadInput(declarationDigest)
    );
    const after = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...authorizedPayloadInput(declarationDigest),
      sourceAttestationRef: "attestation:two",
      sourceAttestationDigest: OTHER_ATTESTATION_DIGEST,
    });

    assert.equal(computePolicyDeclarationDigestV1(declaration), declarationDigest);
    assert.notEqual(
      computePolicyDeclarationAuthorityDecisionDigestV1(before),
      computePolicyDeclarationAuthorityDecisionDigestV1(after)
    );
  });
});
