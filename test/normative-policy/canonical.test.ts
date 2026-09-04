import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, test } from "node:test";

import { canonicalizeJson } from "../../src/normative-policy/canonical-json.js";
import * as normativePolicyPublic from "../../src/normative-policy/index.js";
import {
  checkPolicyDeclarationAuthorityDecisionBindingV1,
  checkPolicyDeclarationSourceEvidenceBindingV1,
  computePolicyDeclarationAuthorityDecisionDigestV1,
  computePolicyDeclarationDigestV1,
  computePolicySemanticDigestV1,
  computePolicySourceContentDigestV1,
  createPolicyDeclarationAuthorityDecisionDigestPreimageV1,
  createPolicyDeclarationDigestPreimageV1,
  createPolicyRuleSemanticDigestPreimageV1,
} from "../../src/normative-policy/canonical.js";
import {
  PolicyDeclarationAuthorityDecisionDigestV1Schema,
  PolicyDeclarationAuthorityDecisionPayloadV1Schema,
  PolicyDeclarationDigestV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyDeclarationV1Schema,
  PolicyRuleV1Schema,
  type PolicyDeclarationAuthorityDecisionPayloadV1,
  type PolicyDeclarationAuthorityDecisionV1,
  type PolicyDeclarationV1,
} from "../../src/normative-policy/types.js";

const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const ONE_DIGEST = `sha256:${"1".repeat(64)}`;
const OTHER_DIGEST = `sha256:${"f".repeat(64)}`;
const OTHER_DECLARATION_DIGEST = PolicyDeclarationDigestV1Schema.parse(OTHER_DIGEST);
const OTHER_DECISION_DIGEST = PolicyDeclarationAuthorityDecisionDigestV1Schema.parse(OTHER_DIGEST);

const EXPECTED_SOURCE_DIGEST =
  "sha256:c2ea4835bdb0fc3c13999d9cdac7d37b1e979eeaee4aa3968ddfa1b53b43b937";
const EXPECTED_SEMANTIC_DIGEST =
  "sha256:d81f2fdd1500a35d163d929437d8434f9da750775cdc16286423bbc9d6a91835";
const EXPECTED_DECLARATION_DIGEST =
  "sha256:a74719154937b4c8c3274e34eddddec163c5d4b249d9aef1caa4a750fb3fa49c";
const EXPECTED_DECISION_DIGEST =
  "sha256:5aa7e5a7cfd11e401c6e832a60d85b232c7327b776345bf95d7d80d598002459";

const EXPECTED_SEMANTIC_CANONICAL =
  '{"activationCondition":{"type":"always"},"canonicalizationVersion":"lex:normative-policy:jcs:v1","enforcementIntents":["audit"],"schemaVersion":1,"statement":{"kind":"recommend","proposition":{"operationId":"stfc.runtime.cycle","type":"operation"}}}';
const EXPECTED_DECLARATION_CANONICAL =
  '{"authorizesExecution":false,"canonicalizationVersion":"lex:normative-policy:jcs:v1","declarationId":"example.policy","issuer":{"authorityDomainId":"example.domain","principalId":"00000000-0000-4000-8000-000000000001","requiredAuthoringCapabilityId":"policy.author"},"revision":1,"rules":[{"relations":[],"ruleId":"example.rule","semanticDigest":"sha256:d81f2fdd1500a35d163d929437d8434f9da750775cdc16286423bbc9d6a91835"}],"schemaVersion":1,"scope":{"type":"global"}}';
const EXPECTED_DECISION_CANONICAL =
  '{"canonicalizationVersion":"lex:normative-policy:jcs:v1","payload":{"authorityDomainId":"example.domain","authorityVersion":"authority-v1","authorizesExecution":false,"declarationDigest":"sha256:a74719154937b4c8c3274e34eddddec163c5d4b249d9aef1caa4a750fb3fa49c","evaluatedAt":"2026-09-03T12:00:00.000Z","grantedAuthoringCapabilities":["policy.author"],"issuerPrincipalId":"00000000-0000-4000-8000-000000000001","requiredAuthoringCapabilityId":"policy.author","revocationEvidence":{"digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","observedAt":"2026-09-03T12:00:00.000Z","ref":"revocation:example","state":"not_revoked"},"schemaVersion":1,"sourceAttestationDigest":"sha256:0000000000000000000000000000000000000000000000000000000000000000","sourceAttestationRef":"attestation:example","status":"authorized","validUntil":"2026-09-04T12:00:00.000Z"}}';

const GOLDEN_RULE_INPUT = {
  ruleId: "example.rule",
  kind: "recommend",
  proposition: { type: "operation", operationId: "stfc.runtime.cycle" },
  activationCondition: { type: "always" },
  enforcementIntents: ["audit"],
  relations: [],
} as const;

const GOLDEN_DECLARATION_INPUT = {
  schemaVersion: 1,
  declarationId: "example.policy",
  revision: 1,
  issuer: {
    principalId: "00000000-0000-4000-8000-000000000001",
    authorityDomainId: "example.domain",
    requiredAuthoringCapabilityId: "policy.author",
  },
  scope: { type: "global" },
  rules: [GOLDEN_RULE_INPUT],
  authorizesExecution: false,
} as const;

function goldenDeclaration(): PolicyDeclarationV1 {
  return PolicyDeclarationV1Schema.parse(GOLDEN_DECLARATION_INPUT);
}

function authorityPayload(
  overrides: Record<string, unknown> = {}
): PolicyDeclarationAuthorityDecisionPayloadV1 {
  return PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
    schemaVersion: 1,
    declarationDigest: EXPECTED_DECLARATION_DIGEST,
    issuerPrincipalId: "00000000-0000-4000-8000-000000000001",
    authorityDomainId: "example.domain",
    requiredAuthoringCapabilityId: "policy.author",
    evaluatedAt: "2026-09-03T12:00:00.000Z",
    validUntil: "2026-09-04T12:00:00.000Z",
    authorizesExecution: false,
    status: "authorized",
    authorityVersion: "authority-v1",
    sourceAttestationRef: "attestation:example",
    sourceAttestationDigest: ZERO_DIGEST,
    grantedAuthoringCapabilities: ["policy.author"],
    revocationEvidence: {
      ref: "revocation:example",
      digest: ONE_DIGEST,
      observedAt: "2026-09-03T12:00:00.000Z",
      state: "not_revoked",
    },
    ...overrides,
  });
}

function wrapAuthorityPayload(
  payload: PolicyDeclarationAuthorityDecisionPayloadV1,
  digest = computePolicyDeclarationAuthorityDecisionDigestV1(payload)
): PolicyDeclarationAuthorityDecisionV1 {
  return { payload, declarationAuthorityDecisionDigest: digest };
}

describe("normative-policy digest vectors", () => {
  test("matches all four normative golden vectors and exact canonical bytes", () => {
    const source = Buffer.from('{"schemaVersion":1}\n', "utf8");
    const rule = PolicyRuleV1Schema.parse(GOLDEN_RULE_INPUT);
    const declaration = goldenDeclaration();
    const payload = authorityPayload();

    assert.equal(computePolicySourceContentDigestV1(source), EXPECTED_SOURCE_DIGEST);
    assert.throws(
      () => computePolicySourceContentDigestV1("not-bytes" as unknown as Uint8Array),
      /rawSource must be a Uint8Array/
    );
    assert.equal(
      canonicalizeJson(createPolicyRuleSemanticDigestPreimageV1(rule)),
      EXPECTED_SEMANTIC_CANONICAL
    );
    assert.equal(computePolicySemanticDigestV1(rule), EXPECTED_SEMANTIC_DIGEST);
    assert.equal(
      canonicalizeJson(createPolicyDeclarationDigestPreimageV1(declaration)),
      EXPECTED_DECLARATION_CANONICAL
    );
    assert.equal(computePolicyDeclarationDigestV1(declaration), EXPECTED_DECLARATION_DIGEST);
    assert.equal(
      canonicalizeJson(createPolicyDeclarationAuthorityDecisionDigestPreimageV1(payload)),
      EXPECTED_DECISION_CANONICAL
    );
    assert.equal(
      computePolicyDeclarationAuthorityDecisionDigestV1(payload),
      EXPECTED_DECISION_DIGEST
    );
  });

  test("produces the same semantic vector in a separate process and locale", () => {
    const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
    const program = [
      'import { PolicyRuleV1Schema } from "./src/normative-policy/types.ts";',
      'import { computePolicySemanticDigestV1 } from "./src/normative-policy/canonical.ts";',
      "const input = JSON.parse(process.env.LEX_POLICY_VECTOR);",
      "process.stdout.write(computePolicySemanticDigestV1(PolicyRuleV1Schema.parse(input)));",
    ].join("\n");
    const result = spawnSync(process.execPath, [tsxCli, "--eval", program], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        LANG: "tr_TR.UTF-8",
        LC_ALL: "tr_TR.UTF-8",
        LEX_POLICY_VECTOR: JSON.stringify(GOLDEN_RULE_INPUT),
      },
      windowsHide: true,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, EXPECTED_SEMANTIC_DIGEST);
  });
});

describe("normative-policy source evidence binding", () => {
  test("checks source bytes before declaration identity and remains non-authorizing", () => {
    const rawSource = Buffer.from('{"schemaVersion":1}\n', "utf8");
    const declaration = goldenDeclaration();
    const evidence = PolicyDeclarationSourceEvidenceV1Schema.parse({
      schemaVersion: 1,
      source: { type: "synthetic_fixture", fixtureId: "example.source" },
      sourceContentDigest: EXPECTED_SOURCE_DIGEST,
      declarationDigest: EXPECTED_DECLARATION_DIGEST,
      authorizesExecution: false,
    });

    assert.deepEqual(
      checkPolicyDeclarationSourceEvidenceBindingV1(rawSource, declaration, evidence),
      {
        matches: true,
        sourceContentDigest: EXPECTED_SOURCE_DIGEST,
        declarationDigest: EXPECTED_DECLARATION_DIGEST,
        authorizesExecution: false,
      }
    );
    assert.deepEqual(
      checkPolicyDeclarationSourceEvidenceBindingV1(Buffer.from("different", "utf8"), declaration, {
        ...evidence,
        declarationDigest: OTHER_DECLARATION_DIGEST,
      }),
      {
        matches: false,
        reason: "source_content_digest_mismatch",
        authorizesExecution: false,
      }
    );
    assert.deepEqual(
      checkPolicyDeclarationSourceEvidenceBindingV1(rawSource, declaration, {
        ...evidence,
        declarationDigest: OTHER_DECLARATION_DIGEST,
      }),
      {
        matches: false,
        reason: "declaration_digest_mismatch",
        authorizesExecution: false,
      }
    );
  });
});

describe("normative-policy declaration authority-decision binding", () => {
  test("exports the decision-specific API without the ambiguous pre-freeze alias", () => {
    assert.equal(
      typeof normativePolicyPublic.checkPolicyDeclarationAuthorityDecisionBindingV1,
      "function"
    );
    assert.equal("checkPolicyDeclarationAuthorityBindingV1" in normativePolicyPublic, false);
    assert.equal("PolicyDeclarationAuthorityBindingResultV1Schema" in normativePolicyPublic, false);
  });

  test("matches internally consistent records without treating integrity as authority", () => {
    const declaration = goldenDeclaration();
    const payload = authorityPayload();

    assert.deepEqual(
      checkPolicyDeclarationAuthorityDecisionBindingV1(declaration, wrapAuthorityPayload(payload)),
      {
        bindingMatches: true,
        decisionStatus: "authorized",
        declarationDigest: EXPECTED_DECLARATION_DIGEST,
        declarationAuthorityDecisionDigest: EXPECTED_DECISION_DIGEST,
        authorizesExecution: false,
      }
    );

    const unknownPayload = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      schemaVersion: 1,
      declarationDigest: EXPECTED_DECLARATION_DIGEST,
      issuerPrincipalId: "00000000-0000-4000-8000-000000000001",
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
      evaluatedAt: "2026-09-03T12:00:00.000Z",
      validUntil: "2026-09-03T12:05:00.000Z",
      authorizesExecution: false,
      status: "unknown",
      reason: "authority_unavailable",
      evidenceRefs: [],
    });
    const unauthorizedPayload = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      schemaVersion: 1,
      declarationDigest: EXPECTED_DECLARATION_DIGEST,
      issuerPrincipalId: "00000000-0000-4000-8000-000000000001",
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
      evaluatedAt: "2026-09-03T12:00:00.000Z",
      validUntil: "2026-09-03T12:05:00.000Z",
      authorizesExecution: false,
      status: "unauthorized",
      authorityVersion: "authority-v1",
      reason: "scope_unauthorized",
      evidenceRefs: [],
    });

    for (const nonAuthorizedPayload of [unauthorizedPayload, unknownPayload]) {
      const result = checkPolicyDeclarationAuthorityDecisionBindingV1(
        declaration,
        wrapAuthorityPayload(nonAuthorizedPayload)
      );
      assert.equal(result.bindingMatches, true);
      if (!result.bindingMatches) assert.fail("expected internally bound decision");
      assert.equal(result.decisionStatus, nonAuthorizedPayload.status);
      assert.equal(result.authorizesExecution, false);
    }
  });

  test("uses the fixed mismatch precedence", () => {
    const declaration = goldenDeclaration();
    const validPayload = authorityPayload();
    const wrongDigestDecision = wrapAuthorityPayload(validPayload, OTHER_DECISION_DIGEST);
    assert.deepEqual(
      checkPolicyDeclarationAuthorityDecisionBindingV1(declaration, wrongDigestDecision),
      {
        bindingMatches: false,
        reason: "decision_digest_mismatch",
        authorizesExecution: false,
      }
    );

    const cases = [
      {
        reason: "declaration_digest_mismatch",
        payload: authorityPayload({ declarationDigest: OTHER_DIGEST }),
      },
      {
        reason: "issuer_principal_mismatch",
        payload: authorityPayload({
          issuerPrincipalId: "00000000-0000-4000-8000-000000000002",
        }),
      },
      {
        reason: "authority_domain_mismatch",
        payload: authorityPayload({ authorityDomainId: "other.domain" }),
      },
      {
        reason: "required_authoring_capability_mismatch",
        payload: authorityPayload({ requiredAuthoringCapabilityId: "policy.other" }),
      },
      {
        reason: "granted_authoring_capability_missing",
        payload: authorityPayload({ grantedAuthoringCapabilities: ["policy.other"] }),
      },
    ] as const;

    for (const fixture of cases) {
      assert.deepEqual(
        checkPolicyDeclarationAuthorityDecisionBindingV1(
          declaration,
          wrapAuthorityPayload(fixture.payload)
        ),
        { bindingMatches: false, reason: fixture.reason, authorizesExecution: false }
      );
    }
  });

  test("requires every relation-specific authoring capability for authorized decisions", () => {
    const relatedDeclaration = PolicyDeclarationV1Schema.parse({
      ...GOLDEN_DECLARATION_INPUT,
      declarationId: "related.policy",
      rules: [
        {
          ...GOLDEN_RULE_INPUT,
          ruleId: "related.rule",
          relations: [
            {
              type: "overrides",
              target: {
                declarationId: "base.policy",
                declarationRevision: 1,
                ruleId: "base.rule",
                expectedSemanticDigest: EXPECTED_SEMANTIC_DIGEST,
              },
              requiredAuthorityCapabilityId: "policy.override",
            },
          ],
        },
      ],
    });
    const declarationDigest = computePolicyDeclarationDigestV1(relatedDeclaration);
    const payload = authorityPayload({ declarationDigest });

    assert.deepEqual(
      checkPolicyDeclarationAuthorityDecisionBindingV1(
        relatedDeclaration,
        wrapAuthorityPayload(payload)
      ),
      {
        bindingMatches: false,
        reason: "relation_authority_capability_missing",
        authorizesExecution: false,
      }
    );
  });
});
