import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AuthorityVersionV1Schema,
  CanonicalRepositoryRelativePathV1Schema,
  CapabilityIdV1Schema,
  ContentDigestV1Schema,
  IsoDateTimeV1Schema,
  NORMATIVE_POLICY_CONTRACT_VERSION,
  NonBearerReferenceV1Schema,
  POLICY_CANONICALIZATION_VERSION_V1,
  POLICY_ENFORCEMENT_INTENTS_V1,
  POLICY_UNAUTHORIZED_REASONS_V1,
  POLICY_UNKNOWN_AUTHORITY_REASONS_V1,
  PolicyDeclarationAuthorityDecisionDigestPreimageV1Schema,
  PolicyDeclarationAuthorityDecisionCommonV1Schema,
  PolicyDeclarationAuthorityDecisionPayloadV1Schema,
  PolicyDeclarationAuthorityDecisionV1Schema,
  PolicyDeclarationDigestPreimageV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyDeclarationV1Schema,
  PolicyLogicalIdV1Schema,
  PolicyNormativeStatementV1Schema,
  PolicyRuleSemanticDigestPreimageV1Schema,
  PolicyRuleV1Schema,
  PolicyScopeV1Schema,
  PolicySourceLocatorV1Schema,
  PositiveSafeIntegerV1Schema,
  PrincipalIdV1Schema,
} from "../../src/normative-policy/types.js";

const PRINCIPAL_ID_UPPER = "00000000-0000-4000-8000-0000000000AA";
const PRINCIPAL_ID = PRINCIPAL_ID_UPPER.toLowerCase();
const WORKSPACE_ID_UPPER = "10000000-0000-4000-8000-0000000000BB";
const WORKSPACE_ID = WORKSPACE_ID_UPPER.toLowerCase();
const REPOSITORY_ID_UPPER = "20000000-0000-4000-8000-0000000000CC";
const REPOSITORY_ID = REPOSITORY_ID_UPPER.toLowerCase();

const semanticDigest = `sha256:${"1".repeat(64)}`;
const declarationDigest = `sha256:${"2".repeat(64)}`;
const sourceContentDigest = `sha256:${"3".repeat(64)}`;
const sourceAttestationDigest = `sha256:${"4".repeat(64)}`;
const decisionDigest = `sha256:${"5".repeat(64)}`;
const revocationDigest = `sha256:${"6".repeat(64)}`;

function operation(operationId = "example.operation") {
  return { type: "operation", operationId } as const;
}

function operationRoute(routeClassId: string, operationId = "example.operation") {
  return {
    type: "operation_route",
    operationId,
    route: { type: "route_class", routeClassId },
  } as const;
}

function ruleFor(
  kind: "require" | "forbid" | "permit" | "recommend" | "prefer",
  enforcementIntents: string[],
  ruleId = `example.${kind}`
) {
  const common = {
    ruleId,
    activationCondition: { type: "always" },
    relations: [],
    enforcementIntents,
  };
  return kind === "prefer"
    ? {
        ...common,
        kind,
        orderedAlternatives: [operationRoute("route.first"), operationRoute("route.second")],
      }
    : { ...common, kind, proposition: operation() };
}

function validDeclarationInput() {
  const relationTarget = {
    declarationId: "base.policy",
    declarationRevision: 1,
    ruleId: "base.rule",
    expectedSemanticDigest: semanticDigest,
  };
  return {
    schemaVersion: 1,
    declarationId: "example.policy",
    revision: 3,
    issuer: {
      principalId: PRINCIPAL_ID_UPPER,
      authorityDomainId: "example.authority",
      requiredAuthoringCapabilityId: "policy.author",
    },
    scope: {
      type: "workspace_repository",
      workspaceId: WORKSPACE_ID_UPPER,
      repositoryId: REPOSITORY_ID_UPPER,
    },
    rules: [
      ruleFor("prefer", ["audit", "prompt_guidance"], "example.z-prefer"),
      {
        ...ruleFor(
          "require",
          ["audit", "verifier", "capability_gate", "lifecycle_precondition", "prompt_guidance"],
          "example.a-require"
        ),
        relations: [
          {
            type: "overrides",
            target: relationTarget,
            requiredAuthorityCapabilityId: "policy.override",
          },
          { type: "depends_on", target: relationTarget },
        ],
      },
      ruleFor("permit", ["audit", "capability_gate"], "example.m-permit"),
      ruleFor("forbid", ["verifier"], "example.b-forbid"),
      ruleFor("recommend", ["audit"], "example.n-recommend"),
    ],
    authorizesExecution: false,
  };
}

function authorityCommonInput() {
  return {
    schemaVersion: 1,
    declarationDigest,
    issuerPrincipalId: PRINCIPAL_ID_UPPER,
    authorityDomainId: "example.authority",
    requiredAuthoringCapabilityId: "policy.author",
    evaluatedAt: "2026-09-03T12:00:00.000Z",
    validUntil: "2026-09-04T12:00:00.000Z",
    authorizesExecution: false,
  };
}

function authorizedDecisionPayloadInput() {
  return {
    ...authorityCommonInput(),
    status: "authorized",
    authorityVersion: "authority-v1",
    sourceAttestationRef: "attestation:example",
    sourceAttestationDigest,
    grantedAuthoringCapabilities: ["policy.override", "policy.author"],
    revocationEvidence: {
      ref: "revocation:example",
      digest: revocationDigest,
      observedAt: "2026-09-03T11:59:59.999Z",
      state: "not_revoked",
    },
  };
}

describe("normative-policy v1 scalar contracts", () => {
  test("pins contract and canonicalization versions", () => {
    assert.equal(NORMATIVE_POLICY_CONTRACT_VERSION, 1);
    assert.equal(POLICY_CANONICALIZATION_VERSION_V1, "lex:normative-policy:jcs:v1");
    assert.equal(Object.isFrozen(POLICY_ENFORCEMENT_INTENTS_V1), true);
    assert.equal(Object.isFrozen(POLICY_UNAUTHORIZED_REASONS_V1), true);
    assert.equal(Object.isFrozen(POLICY_UNKNOWN_AUTHORITY_REASONS_V1), true);
  });

  test("validates logical, opaque, non-bearer, and digest wire values", () => {
    assert.equal(PolicyLogicalIdV1Schema.parse("stfc.runtime/cycle:v1"), "stfc.runtime/cycle:v1");
    assert.equal(PrincipalIdV1Schema.parse(PRINCIPAL_ID_UPPER), PRINCIPAL_ID);
    assert.equal(CapabilityIdV1Schema.parse("policy.author"), "policy.author");
    assert.equal(AuthorityVersionV1Schema.parse("authority:v1"), "authority:v1");
    assert.equal(NonBearerReferenceV1Schema.parse("authority:record/@v1"), "authority:record/@v1");
    assert.equal(ContentDigestV1Schema.parse(declarationDigest), declarationDigest);

    for (const invalid of ["Uppercase", "-leading", "has space", "", "a".repeat(201)]) {
      assert.equal(PolicyLogicalIdV1Schema.safeParse(invalid).success, false, invalid);
    }
    assert.equal(
      PrincipalIdV1Schema.safeParse("00000000-0000-4000-7000-000000000001").success,
      false
    );
    assert.equal(CapabilityIdV1Schema.safeParse("has space").success, false);
    assert.equal(NonBearerReferenceV1Schema.safeParse("bad?reference").success, false);
    assert.equal(ContentDigestV1Schema.safeParse(`sha256:${"A".repeat(64)}`).success, false);
  });

  test("requires actual canonical UTC instants", () => {
    assert.equal(IsoDateTimeV1Schema.parse("2026-09-03T12:00:00.000Z"), "2026-09-03T12:00:00.000Z");
    for (const invalid of [
      "2026-02-30T12:00:00.000Z",
      "2026-09-03T12:00:00Z",
      "2026-09-03T12:00:00.000+00:00",
      "not-a-date",
    ]) {
      assert.equal(IsoDateTimeV1Schema.safeParse(invalid).success, false, invalid);
    }
  });

  test("requires positive safe revisions", () => {
    for (const valid of [1, 10, Number.MAX_SAFE_INTEGER]) {
      assert.equal(PositiveSafeIntegerV1Schema.parse(valid), valid);
    }
    for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      assert.equal(PositiveSafeIntegerV1Schema.safeParse(invalid).success, false, String(invalid));
    }
  });

  test("validates canonical repository-relative paths", () => {
    assert.equal(
      CanonicalRepositoryRelativePathV1Schema.parse("policy/rules.v1.json"),
      "policy/rules.v1.json"
    );
    for (const invalid of [
      "",
      "/policy.json",
      "C:/policy/rule.json",
      "C:policy/rule.json",
      "policy\\rule.json",
      "policy//rule",
      ".",
      "a/../b",
      "a/\0b",
      "a/\ud800b",
    ]) {
      assert.equal(
        CanonicalRepositoryRelativePathV1Schema.safeParse(invalid).success,
        false,
        invalid
      );
    }
  });
});

describe("normative-policy v1 declarations", () => {
  test("strictly parses and freshly normalizes a five-modality declaration", () => {
    const input = validDeclarationInput();
    const before = structuredClone(input);
    const declaration = PolicyDeclarationV1Schema.parse(input);

    assert.deepEqual(input, before, "parse must not mutate caller input");
    assert.notEqual(declaration, input);
    assert.equal(declaration.issuer.principalId, PRINCIPAL_ID);
    assert.deepEqual(declaration.scope, {
      type: "workspace_repository",
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
    });
    assert.deepEqual(
      declaration.rules.map(({ ruleId }) => ruleId),
      [
        "example.a-require",
        "example.b-forbid",
        "example.m-permit",
        "example.n-recommend",
        "example.z-prefer",
      ]
    );
    assert.deepEqual(declaration.rules[0]?.enforcementIntents, [
      "prompt_guidance",
      "lifecycle_precondition",
      "capability_gate",
      "verifier",
      "audit",
    ]);
    assert.deepEqual(
      declaration.rules[0]?.relations.map(({ type }) => type),
      ["overrides", "depends_on"]
    );
    assert.equal(declaration.authorizesExecution, false);
  });

  test("accepts only the exact closed scope union", () => {
    assert.deepEqual(PolicyScopeV1Schema.parse({ type: "global" }), { type: "global" });
    assert.equal(
      PolicyScopeV1Schema.safeParse({ type: "global", workspaceId: WORKSPACE_ID }).success,
      false
    );
    assert.equal(
      PolicyScopeV1Schema.safeParse({ type: "workspace", workspaceId: WORKSPACE_ID, extra: true })
        .success,
      false
    );
    assert.equal(PolicyScopeV1Schema.safeParse({ type: "directory", path: "src" }).success, false);
  });

  test("rejects unknown keys throughout the declaration graph", () => {
    const withTopLevelExtension = { ...validDeclarationInput(), extensions: {} };
    assert.equal(PolicyDeclarationV1Schema.safeParse(withTopLevelExtension).success, false);

    const withIssuerExtension = validDeclarationInput();
    Object.assign(withIssuerExtension.issuer, { proof: "self-asserted" });
    assert.equal(PolicyDeclarationV1Schema.safeParse(withIssuerExtension).success, false);

    const withPropositionExtension = validDeclarationInput();
    Object.assign(
      (withPropositionExtension.rules[2] as { proposition: Record<string, unknown> }).proposition,
      { text: "do it" }
    );
    assert.equal(PolicyDeclarationV1Schema.safeParse(withPropositionExtension).success, false);

    const withRelationTargetExtension = validDeclarationInput();
    Object.assign(withRelationTargetExtension.rules[1]!.relations[0]!.target, { floating: true });
    assert.equal(PolicyDeclarationV1Schema.safeParse(withRelationTargetExtension).success, false);
  });

  test("requires literal non-authorizing declarations", () => {
    const missing = validDeclarationInput() as Record<string, unknown>;
    delete missing.authorizesExecution;
    assert.equal(PolicyDeclarationV1Schema.safeParse(missing).success, false);
    assert.equal(
      PolicyDeclarationV1Schema.safeParse({
        ...validDeclarationInput(),
        authorizesExecution: true,
      }).success,
      false
    );
  });

  test("rejects duplicate semantic-set members instead of deduplicating", () => {
    const duplicateRuleIds = validDeclarationInput();
    duplicateRuleIds.rules.push(structuredClone(duplicateRuleIds.rules[0]!));
    assert.equal(PolicyDeclarationV1Schema.safeParse(duplicateRuleIds).success, false);

    const duplicateIntents = ruleFor("require", ["audit", "audit"]);
    assert.equal(PolicyRuleV1Schema.safeParse(duplicateIntents).success, false);

    const duplicateRelations = ruleFor("require", ["audit"]);
    const relation = {
      type: "depends_on",
      target: {
        declarationId: "base.policy",
        declarationRevision: 1,
        ruleId: "base.rule",
        expectedSemanticDigest: semanticDigest,
      },
    };
    (duplicateRelations.relations as unknown[]).push(relation, structuredClone(relation));
    assert.equal(PolicyRuleV1Schema.safeParse(duplicateRelations).success, false);

    assert.equal(
      PolicyNormativeStatementV1Schema.safeParse({
        kind: "prefer",
        orderedAlternatives: [operation(), structuredClone(operation())],
      }).success,
      false
    );
  });

  test("enforces the modality-to-enforcement matrix", () => {
    const all = [
      "prompt_guidance",
      "lifecycle_precondition",
      "capability_gate",
      "verifier",
      "audit",
    ];
    assert.equal(PolicyRuleV1Schema.safeParse(ruleFor("require", all)).success, true);
    assert.equal(PolicyRuleV1Schema.safeParse(ruleFor("forbid", all)).success, true);
    assert.equal(
      PolicyRuleV1Schema.safeParse(
        ruleFor("permit", ["prompt_guidance", "lifecycle_precondition", "capability_gate", "audit"])
      ).success,
      true
    );
    assert.equal(PolicyRuleV1Schema.safeParse(ruleFor("permit", ["verifier"])).success, false);
    assert.equal(
      PolicyRuleV1Schema.safeParse(ruleFor("recommend", ["prompt_guidance", "audit"])).success,
      true
    );
    assert.equal(
      PolicyRuleV1Schema.safeParse(ruleFor("prefer", ["prompt_guidance", "audit"])).success,
      true
    );
    for (const kind of ["recommend", "prefer"] as const) {
      for (const invalid of ["lifecycle_precondition", "capability_gate", "verifier"] as const) {
        assert.equal(
          PolicyRuleV1Schema.safeParse(ruleFor(kind, [invalid])).success,
          false,
          `${kind}/${invalid}`
        );
      }
    }
    for (const kind of ["require", "forbid", "permit", "recommend", "prefer"] as const) {
      assert.equal(PolicyRuleV1Schema.safeParse(ruleFor(kind, [])).success, false, kind);
    }
  });

  test("keeps preference order significant while normalizing only declared sets", () => {
    const parsed = PolicyRuleV1Schema.parse({
      ...ruleFor("prefer", ["audit", "prompt_guidance"]),
      orderedAlternatives: [operationRoute("route.second"), operationRoute("route.first")],
    });
    assert.equal(parsed.kind, "prefer");
    if (parsed.kind !== "prefer") assert.fail("expected prefer rule");
    assert.deepEqual(
      parsed.orderedAlternatives.map((alternative) =>
        alternative.type === "operation_route" ? alternative.route : undefined
      ),
      [
        { type: "route_class", routeClassId: "route.second" },
        { type: "route_class", routeClassId: "route.first" },
      ]
    );
    assert.deepEqual(parsed.enforcementIntents, ["prompt_guidance", "audit"]);
  });
});

describe("normative-policy v1 source evidence", () => {
  test("accepts only closed source locator variants", () => {
    assert.deepEqual(
      PolicySourceLocatorV1Schema.parse({
        type: "repository_file",
        repositoryId: REPOSITORY_ID_UPPER,
        path: "policy/declaration.json",
        revision: "commit:abc123",
      }),
      {
        type: "repository_file",
        repositoryId: REPOSITORY_ID,
        path: "policy/declaration.json",
        revision: "commit:abc123",
      }
    );
    assert.equal(
      PolicySourceLocatorV1Schema.safeParse({
        type: "repository_file",
        repositoryId: REPOSITORY_ID,
        path: "policy.json",
        revision: "commit:abc123",
        rawBytes: "not-allowed",
      }).success,
      false
    );
    assert.equal(
      PolicySourceLocatorV1Schema.safeParse({ type: "url", href: "https://example.invalid" })
        .success,
      false
    );
  });

  test("keeps source evidence separate and structurally non-authorizing", () => {
    const parsed = PolicyDeclarationSourceEvidenceV1Schema.parse({
      schemaVersion: 1,
      source: { type: "synthetic_fixture", fixtureId: "fixture.example" },
      sourceContentDigest,
      declarationDigest,
      authorizesExecution: false,
    });
    assert.equal(parsed.source.type, "synthetic_fixture");
    assert.equal(parsed.authorizesExecution, false);
    assert.equal(
      PolicyDeclarationSourceEvidenceV1Schema.safeParse({ ...parsed, verified: true }).success,
      false
    );
  });
});

describe("normative-policy v1 authority decisions", () => {
  test("normalizes a closed authorized payload without treating grants as a schema binding", () => {
    const input = authorizedDecisionPayloadInput();
    const before = structuredClone(input);
    const parsed = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse(input);

    assert.deepEqual(input, before, "parse must not mutate caller input");
    assert.equal(parsed.status, "authorized");
    assert.equal(parsed.issuerPrincipalId, PRINCIPAL_ID);
    if (parsed.status !== "authorized") assert.fail("expected authorized payload");
    assert.deepEqual(parsed.grantedAuthoringCapabilities, ["policy.author", "policy.override"]);

    const membershipDeferred = {
      ...authorizedDecisionPayloadInput(),
      grantedAuthoringCapabilities: ["unrelated.capability"],
    };
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse(membershipDeferred).success,
      true,
      "required capability membership belongs to the declaration binding check"
    );
  });

  test("sorts evidence sets and accepts unknown authority without a known version", () => {
    const unauthorized = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...authorityCommonInput(),
      status: "unauthorized",
      authorityVersion: "authority-v1",
      reason: "scope_unauthorized",
      evidenceRefs: ["evidence:z", "evidence:a"],
    });
    assert.equal(unauthorized.status, "unauthorized");
    if (unauthorized.status !== "unauthorized") assert.fail("expected unauthorized payload");
    assert.deepEqual(unauthorized.evidenceRefs, ["evidence:a", "evidence:z"]);

    const unknown = PolicyDeclarationAuthorityDecisionPayloadV1Schema.parse({
      ...authorityCommonInput(),
      status: "unknown",
      reason: "authority_unavailable",
      evidenceRefs: [],
    });
    assert.equal(unknown.status, "unknown");
    if (unknown.status !== "unknown") assert.fail("expected unknown payload");
    assert.equal("lastKnownAuthorityVersion" in unknown, false);
  });

  test("rejects duplicate authority evidence sets", () => {
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorizedDecisionPayloadInput(),
        grantedAuthoringCapabilities: ["policy.author", "policy.author"],
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorityCommonInput(),
        status: "unknown",
        reason: "verification_failed",
        evidenceRefs: ["evidence:same", "evidence:same"],
      }).success,
      false
    );
  });

  test("enforces decision cache and revocation-observation time ordering", () => {
    assert.equal(
      PolicyDeclarationAuthorityDecisionCommonV1Schema.safeParse({
        ...authorityCommonInput(),
        validUntil: "2026-09-03T12:00:00.000Z",
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorizedDecisionPayloadInput(),
        validUntil: "2026-09-03T12:00:00.000Z",
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorizedDecisionPayloadInput(),
        revocationEvidence: {
          ...authorizedDecisionPayloadInput().revocationEvidence,
          observedAt: "2026-09-03T12:00:00.001Z",
        },
      }).success,
      false
    );
  });

  test("rejects cross-branch fields and authority-shaped extensions", () => {
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorityCommonInput(),
        status: "unauthorized",
        authorityVersion: "authority-v1",
        reason: "attestation_invalid",
        evidenceRefs: [],
        sourceAttestationRef: "attestation:must-not-leak",
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorizedDecisionPayloadInput(),
        revocationEvidence: {
          ...authorizedDecisionPayloadInput().revocationEvidence,
          token: "not-allowed",
        },
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorityCommonInput(),
        status: "unknown",
        lastKnownAuthorityVersion: undefined,
        reason: "authority_unavailable",
        evidenceRefs: [],
      }).success,
      false
    );
  });

  test("requires the non-authorizing digest wrapper exactly", () => {
    const decision = PolicyDeclarationAuthorityDecisionV1Schema.parse({
      payload: authorizedDecisionPayloadInput(),
      declarationAuthorityDecisionDigest: decisionDigest,
    });
    assert.equal(decision.payload.authorizesExecution, false);
    assert.equal(decision.declarationAuthorityDecisionDigest, decisionDigest);
    assert.equal(
      PolicyDeclarationAuthorityDecisionV1Schema.safeParse({ ...decision, trusted: true }).success,
      false
    );
  });
});

describe("normative-policy v1 digest preimages", () => {
  test("normalizes semantic and declaration set members", () => {
    const semantic = PolicyRuleSemanticDigestPreimageV1Schema.parse({
      canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
      schemaVersion: 1,
      statement: { kind: "recommend", proposition: operation() },
      activationCondition: { type: "always" },
      enforcementIntents: ["audit", "prompt_guidance"],
    });
    assert.deepEqual(semantic.enforcementIntents, ["prompt_guidance", "audit"]);

    const declaration = PolicyDeclarationDigestPreimageV1Schema.parse({
      canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
      schemaVersion: 1,
      declarationId: "example.policy",
      revision: 1,
      issuer: {
        principalId: PRINCIPAL_ID_UPPER,
        authorityDomainId: "example.authority",
        requiredAuthoringCapabilityId: "policy.author",
      },
      scope: { type: "global" },
      rules: [
        { ruleId: "z.rule", semanticDigest, relations: [] },
        { ruleId: "a.rule", semanticDigest, relations: [] },
      ],
      authorizesExecution: false,
    });
    assert.deepEqual(
      declaration.rules.map(({ ruleId }) => ruleId),
      ["a.rule", "z.rule"]
    );
  });

  test("applies the modality matrix to semantic preimages", () => {
    assert.equal(
      PolicyRuleSemanticDigestPreimageV1Schema.safeParse({
        canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
        schemaVersion: 1,
        statement: { kind: "prefer", orderedAlternatives: [operation(), operation("other")] },
        activationCondition: { type: "always" },
        enforcementIntents: ["capability_gate"],
      }).success,
      false
    );
  });

  test("uses the exact authority-decision preimage and excludes the result digest", () => {
    const parsed = PolicyDeclarationAuthorityDecisionDigestPreimageV1Schema.parse({
      canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
      payload: authorizedDecisionPayloadInput(),
    });
    assert.equal(parsed.payload.status, "authorized");
    assert.equal(
      PolicyDeclarationAuthorityDecisionDigestPreimageV1Schema.safeParse({
        canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
        payload: authorizedDecisionPayloadInput(),
        declarationAuthorityDecisionDigest: decisionDigest,
      }).success,
      false
    );
  });
});
