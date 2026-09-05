import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPolicyResolverV1,
  PolicyResolutionRequestV1Schema,
  projectPolicyV1,
  CODEX_POLICY_PROJECTION_TARGET_V1,
  COPILOT_POLICY_PROJECTION_TARGET_V1,
  computePolicyResolutionRequestDigestV1,
} from "../../src/normative-policy/index.js";
import { request, declaration, verification, digest } from "./resolver-fixture.js";
const resolver = () =>
  createPolicyResolverV1({ version: "test.verifier.v1", verify: verification });
const absent = () => ({
  ...request(),
  proposal: {
    operationPresence: "absent",
    operationId: null,
    capabilityId: null,
    implementationDigest: null,
  },
});
test("confirmed absence is dormant and projects exactly on both targets", async () => {
  const snapshot = await resolver().resolve(absent());
  assert(
    snapshot.payload.rules.every((r) => r.activation === "dormant" && r.disposition === "inactive")
  );
  assert.equal(snapshot.payload.policyAdmission, "satisfied");
  for (const targetProfile of [
    CODEX_POLICY_PROJECTION_TARGET_V1,
    COPILOT_POLICY_PROJECTION_TARGET_V1,
  ]) {
    const result = projectPolicyV1({
      schemaVersion: 1,
      snapshot,
      targetProfile,
      omitAdvisoryRules: [],
    });
    assert(result.ok);
    assert.equal(result.receipt.fidelity, "exact");
    assert.equal(result.receipt.authorizesExecution, false);
  }
});
test("legacy null remains unknown and distinct in canonical identity", async () => {
  const value = absent();
  const { operationPresence: _presence, ...proposal } = value.proposal;
  const unknown = { ...value, proposal };
  const snapshot = await resolver().resolve(unknown);
  assert.equal(snapshot.payload.rules[0].activation, "unknown");
  assert.equal(snapshot.payload.policyAdmission, "blocked");
  assert.notEqual(
    computePolicyResolutionRequestDigestV1(PolicyResolutionRequestV1Schema.parse(value)),
    computePolicyResolutionRequestDigestV1(PolicyResolutionRequestV1Schema.parse(unknown))
  );
});
test("absence cannot carry a conflicting selection", () => {
  for (const selection of [
    { operationId: "test.operation" },
    { capabilityId: "test.route" },
    { implementationDigest: digest },
    { operationPresence: "present" },
  ]) {
    const value = absent();
    assert.equal(
      PolicyResolutionRequestV1Schema.safeParse({
        ...value,
        proposal: { ...value.proposal, ...selection },
      }).success,
      false
    );
  }
});
test("absence does not deactivate unconditional requirements or invent a permission", async () => {
  const d = declaration();
  const req = request([
    { ...d, rules: [{ ...d.rules[0], activationCondition: { type: "always" } }] },
  ]);
  const snapshot = await resolver().resolve({ ...req, proposal: absent().proposal });
  assert.equal(snapshot.payload.rules[0].activation, "active");
  assert.equal(snapshot.payload.rules[0].satisfaction, "unsatisfied");
  assert.equal(snapshot.payload.policyAdmission, "blocked");
  assert.equal(snapshot.payload.authorizesExecution, false);
});
