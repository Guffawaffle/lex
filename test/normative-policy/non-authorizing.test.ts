import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  PolicyDeclarationAuthorityDecisionBindingResultV1Schema,
  PolicyDeclarationAuthorityDecisionPayloadV1Schema,
  PolicyDeclarationDigestPreimageV1Schema,
  PolicyDeclarationSourceEvidenceBindingResultV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyDeclarationV1Schema,
  PolicyRuleV1Schema,
} from "../../src/normative-policy/types.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

function declarationInput() {
  return {
    schemaVersion: 1,
    declarationId: "example.policy",
    revision: 1,
    issuer: {
      principalId: "00000000-0000-4000-8000-000000000001",
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
    },
    scope: { type: "global" },
    rules: [
      {
        ruleId: "example.rule",
        kind: "require",
        proposition: { type: "operation", operationId: "example.operation" },
        activationCondition: { type: "always" },
        relations: [],
        enforcementIntents: ["audit"],
      },
    ],
    authorizesExecution: false,
  };
}

describe("normative-policy structural authority boundary", () => {
  test("rejects inherited, active, hidden, symbolic, and custom-array input data", () => {
    const declaration = declarationInput();
    assert.equal(
      PolicyDeclarationV1Schema.safeParse(Object.create(declaration)).success,
      false,
      "inherited declarations are not JSON objects"
    );

    let getterReads = 0;
    const getterBacked = { ...declaration };
    Object.defineProperty(getterBacked, "declarationId", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return "example.policy";
      },
    });
    assert.equal(PolicyDeclarationV1Schema.safeParse(getterBacked).success, false);
    assert.equal(getterReads, 0, "validation must not execute caller-defined getters");

    const hidden = { ...declaration };
    Object.defineProperty(hidden, "effectGrantRef", {
      enumerable: false,
      value: "grant:hidden",
    });
    assert.equal(PolicyDeclarationV1Schema.safeParse(hidden).success, false);

    const symbolic = { ...declaration, [Symbol("effectGrant")]: "grant:symbol" };
    assert.equal(PolicyDeclarationV1Schema.safeParse(symbolic).success, false);

    const customRules = [...declaration.rules] as typeof declaration.rules & { grant?: string };
    customRules.grant = "grant:array-property";
    assert.equal(
      PolicyDeclarationV1Schema.safeParse({ ...declaration, rules: customRules }).success,
      false
    );

    const protoMember = structuredClone(declaration);
    Object.defineProperty(protoMember, "__proto__", {
      enumerable: true,
      value: { effectGrantRef: "grant:prototype-member" },
    });
    assert.equal(PolicyDeclarationV1Schema.safeParse(protoMember).success, false);

    const nestedProtoMember = structuredClone(declaration);
    Object.defineProperty(nestedProtoMember.issuer, "__proto__", {
      enumerable: true,
      value: { effectGrantRef: "grant:nested-prototype-member" },
    });
    assert.equal(PolicyDeclarationV1Schema.safeParse(nestedProtoMember).success, false);

    class ActiveDeclaration {
      constructor(source: ReturnType<typeof declarationInput>) {
        Object.assign(this, source);
      }
    }
    assert.equal(
      PolicyDeclarationV1Schema.safeParse(new ActiveDeclaration(declaration)).success,
      false
    );

    let proxyReads = 0;
    const proxy = new Proxy(declaration, {
      get(target, property, receiver) {
        proxyReads += 1;
        return property === "declarationId"
          ? "proxy.policy"
          : Reflect.get(target, property, receiver);
      },
    });
    assert.equal(PolicyDeclarationV1Schema.safeParse(proxy).success, false);
    assert.equal(proxyReads, 0, "validation must reject proxies without executing get traps");
  });

  test("rejects true or authority-shaped extensions across every non-authorizing aggregate", () => {
    assert.equal(
      PolicyDeclarationV1Schema.safeParse({
        ...declarationInput(),
        authorizesExecution: true,
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationV1Schema.safeParse({
        ...declarationInput(),
        sourceContentDigest: DIGEST,
      }).success,
      false,
      "source evidence must remain outside declaration bytes"
    );
    assert.equal(
      PolicyRuleV1Schema.safeParse({
        ...declarationInput().rules[0],
        authorizesExecution: false,
      }).success,
      false,
      "rules have no authority-shaped extension fields"
    );

    const sourceEvidence = {
      schemaVersion: 1,
      source: { type: "synthetic_fixture", fixtureId: "example.source" },
      sourceContentDigest: DIGEST,
      declarationDigest: DIGEST,
      authorizesExecution: false,
    };
    assert.equal(
      PolicyDeclarationSourceEvidenceV1Schema.safeParse({
        ...sourceEvidence,
        authorizesExecution: true,
      }).success,
      false
    );

    const authorityPayload = {
      schemaVersion: 1,
      declarationDigest: DIGEST,
      issuerPrincipalId: "00000000-0000-4000-8000-000000000001",
      authorityDomainId: "example.domain",
      requiredAuthoringCapabilityId: "policy.author",
      evaluatedAt: "2026-09-03T12:00:00.000Z",
      validUntil: "2026-09-03T12:05:00.000Z",
      authorizesExecution: false,
      status: "unknown",
      reason: "authority_unavailable",
      evidenceRefs: [],
    };
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorityPayload,
        authorizesExecution: true,
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionPayloadV1Schema.safeParse({
        ...authorityPayload,
        effectGrantRef: "grant:forbidden",
      }).success,
      false
    );

    assert.equal(
      PolicyDeclarationSourceEvidenceBindingResultV1Schema.safeParse({
        matches: false,
        reason: "declaration_digest_mismatch",
        authorizesExecution: true,
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionBindingResultV1Schema.safeParse({
        bindingMatches: false,
        reason: "decision_digest_mismatch",
        authorizesExecution: true,
      }).success,
      false
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionBindingResultV1Schema.safeParse({
        matches: false,
        reason: "decision_digest_mismatch",
        authorizesExecution: false,
      }).success,
      false,
      "the ambiguous pre-freeze discriminator must not remain accepted"
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionBindingResultV1Schema.safeParse({
        bindingMatches: true,
        declarationDigest: DIGEST,
        declarationAuthorityDecisionDigest: DIGEST,
        authorizesExecution: false,
      }).success,
      false,
      "a matching binding must expose the bound decision status"
    );
    assert.equal(
      PolicyDeclarationAuthorityDecisionBindingResultV1Schema.safeParse({
        bindingMatches: false,
        reason: "decision_digest_mismatch",
        decisionStatus: "authorized",
        authorizesExecution: false,
      }).success,
      false,
      "a mismatching binding must not expose an unbound decision status"
    );

    const declaration = PolicyDeclarationV1Schema.parse(declarationInput());
    assert.equal(
      PolicyDeclarationDigestPreimageV1Schema.safeParse({
        canonicalizationVersion: "lex:normative-policy:jcs:v1",
        schemaVersion: 1,
        declarationId: declaration.declarationId,
        revision: declaration.revision,
        issuer: declaration.issuer,
        scope: declaration.scope,
        rules: [{ ruleId: "example.rule", semanticDigest: DIGEST, relations: [] }],
        authorizesExecution: true,
      }).success,
      false
    );
  });

  test("requires fully pinned relation targets without floating references", () => {
    const rule = declarationInput().rules[0];
    const target = {
      declarationId: "base.policy",
      declarationRevision: 1,
      ruleId: "base.rule",
      expectedSemanticDigest: DIGEST,
    };

    assert.equal(
      PolicyRuleV1Schema.safeParse({
        ...rule,
        relations: [{ type: "depends_on", target }],
      }).success,
      true
    );
    const { declarationRevision: _revision, ...withoutRevision } = target;
    const { expectedSemanticDigest: _digest, ...withoutDigest } = target;
    assert.equal(
      PolicyRuleV1Schema.safeParse({
        ...rule,
        relations: [{ type: "depends_on", target: withoutRevision }],
      }).success,
      false
    );
    assert.equal(
      PolicyRuleV1Schema.safeParse({
        ...rule,
        relations: [{ type: "depends_on", target: withoutDigest }],
      }).success,
      false
    );
  });

  test("rejects compound modality shapes", () => {
    assert.equal(
      PolicyRuleV1Schema.safeParse({
        ...declarationInput().rules[0],
        kind: "prefer",
        orderedAlternatives: [
          { type: "operation", operationId: "example.first" },
          { type: "operation", operationId: "example.second" },
        ],
      }).success,
      false,
      "a prefer rule cannot retain a proposition from another modality"
    );
  });
});
