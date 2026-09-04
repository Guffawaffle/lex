import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  NORMATIVE_POLICY_CONFORMANCE_FIXTURES,
  NORMATIVE_POLICY_CONFORMANCE_VERSION,
  STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1,
  SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1,
} from "../../src/normative-policy/conformance.js";
import { PolicyDeclarationV1Schema } from "../../src/normative-policy/types.js";

function fixture(id: (typeof NORMATIVE_POLICY_CONFORMANCE_FIXTURES)[number]["id"]) {
  const match = NORMATIVE_POLICY_CONFORMANCE_FIXTURES.find((candidate) => candidate.id === id);
  assert.ok(match, `Missing normative-policy conformance fixture: ${id}`);
  return match;
}

function collectObjectKeysAndStrings(value: unknown): {
  readonly keys: readonly string[];
  readonly strings: readonly string[];
} {
  const keys: string[] = [];
  const strings: string[] = [];

  function visit(candidate: unknown): void {
    if (typeof candidate === "string") {
      strings.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    if (candidate !== null && typeof candidate === "object") {
      for (const [key, entry] of Object.entries(candidate)) {
        keys.push(key);
        visit(entry);
      }
    }
  }

  visit(value);
  return { keys, strings };
}

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) assertDeeplyFrozen(descriptor.value);
  }
}

describe("normative-policy conformance fixtures", () => {
  test("are versioned, unique, deterministic, and valid declarations", () => {
    const ids = NORMATIVE_POLICY_CONFORMANCE_FIXTURES.map(({ id }) => id);

    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, [...ids].sort());

    for (const candidate of NORMATIVE_POLICY_CONFORMANCE_FIXTURES) {
      assert.equal(candidate.schemaVersion, NORMATIVE_POLICY_CONFORMANCE_VERSION);
      assert.equal(candidate.declaration.authorizesExecution, false);
      assert.equal(candidate.expected.authorizesExecution, false);

      const parsed = PolicyDeclarationV1Schema.parse(candidate.declaration);
      assert.notStrictEqual(parsed, candidate.declaration);
      assert.deepEqual(parsed, candidate.declaration);

      const focusRule = parsed.rules.find((rule) => rule.ruleId === candidate.focusRuleId);
      assert.ok(focusRule, `${candidate.id} must name a rule in its declaration`);
      assert.equal(focusRule.kind, candidate.focusModality);
    }
  });

  test("covers each closed policy modality", () => {
    const modalities = NORMATIVE_POLICY_CONFORMANCE_FIXTURES.map(
      ({ focusModality }) => focusModality
    );

    assert.deepEqual([...new Set(modalities)].sort(), [
      "forbid",
      "permit",
      "prefer",
      "recommend",
      "require",
    ]);
  });

  test("exports immutable shared fixture graphs", () => {
    assertDeeplyFrozen(STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1);
    assertDeeplyFrozen(SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1);
    assertDeeplyFrozen(NORMATIVE_POLICY_CONFORMANCE_FIXTURES);
    assert.throws(() =>
      Object.assign(STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1, {
        authorizesExecution: true,
      })
    );
  });

  test("models the production-shaped STFC cycle policy as three request-activated rules", () => {
    const declaration = PolicyDeclarationV1Schema.parse(
      STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1
    );

    assert.equal(declaration.declarationId, "stfc.lifecycle.cycle.managed-route");
    assert.equal(declaration.scope.type, "workspace_repository");
    assert.equal(declaration.rules.length, 3);
    assert.deepEqual(
      declaration.rules.map(({ kind }) => kind),
      ["forbid", "forbid", "require"]
    );
    assert.deepEqual(
      Object.fromEntries(
        declaration.rules.map((rule) => [
          rule.ruleId,
          rule.kind === "prefer" ? rule.orderedAlternatives : rule.proposition,
        ])
      ),
      {
        "stfc.lifecycle.cycle.forbid-manual-fallback": {
          type: "operation_route",
          operationId: "stfc.runtime.cycle",
          route: { type: "route_class", routeClassId: "stfc.lifecycle.route.manual" },
        },
        "stfc.lifecycle.cycle.forbid-private-fallback": {
          type: "operation_route",
          operationId: "stfc.runtime.cycle",
          route: { type: "route_class", routeClassId: "stfc.lifecycle.route.private" },
        },
        "stfc.lifecycle.cycle.require-public-managed-route": {
          type: "operation_route",
          operationId: "stfc.runtime.cycle",
          route: { type: "capability", capabilityId: "stfc.public.lifecycle.cycle.managed" },
        },
      }
    );

    for (const rule of declaration.rules) {
      assert.deepEqual(rule.activationCondition, {
        type: "operation_requested",
        operationId: "stfc.runtime.cycle",
      });
      assert.equal(rule.relations.length, 0);
    }

    assert.strictEqual(
      fixture("forbid-manual-route").declaration,
      STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1
    );
    assert.strictEqual(
      fixture("require-public-managed-route").declaration,
      STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1
    );
    assert.match(
      fixture("require-public-managed-route").requirement,
      /named public managed capability route; implementation qualification is an independent admission condition/
    );
    assert.equal(declaration.authorizesExecution, false);
  });

  test("keeps synthetic permit evidence policy-only and non-authorizing", () => {
    const candidate = fixture("permit-cycle-policy-only");
    const declaration = PolicyDeclarationV1Schema.parse(
      SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1
    );
    const [rule] = declaration.rules;

    assert.equal(rule.kind, "permit");
    assert.deepEqual(rule.activationCondition, {
      type: "operation_requested",
      operationId: "stfc.runtime.cycle",
    });
    assert.deepEqual(rule.enforcementIntents, [
      "lifecycle_precondition",
      "capability_gate",
      "audit",
    ]);
    assert.deepEqual(candidate.expected, {
      authorizesExecution: false,
      createsEffectGrant: false,
      requestsOperation: false,
      bindsLiveCapability: false,
      implicitlyOverridesForbid: false,
      enablesAdmissionWhenApplicabilityUnknown: false,
      policyEffect: "affirmative_allowance_only",
    });
    assert.equal(rule.relations.length, 0);
    assert.match(candidate.requirement, /its absence is not a global prohibition/);
  });

  test("contains no credential fields or bearer/secret-looking fixture values", () => {
    const { keys, strings } = collectObjectKeysAndStrings(NORMATIVE_POLICY_CONFORMANCE_FIXTURES);
    const forbiddenFieldNames = new Set([
      "accessToken",
      "apiKey",
      "authorization",
      "bearerToken",
      "credential",
      "grant",
      "lease",
      "password",
      "privateKey",
      "secret",
      "secretHandle",
      "token",
    ]);
    const secretLikePatterns = [
      /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
      /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
      /\bAKIA[A-Z0-9]{12,}\b/,
      /\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{8,}\b/,
    ];

    assert.deepEqual(
      keys.filter((key) => forbiddenFieldNames.has(key)),
      []
    );
    for (const value of strings) {
      for (const pattern of secretLikePatterns) {
        assert.doesNotMatch(value, pattern);
      }
    }
  });
});
