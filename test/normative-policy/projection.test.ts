import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createPolicyResolverV1,
  projectPolicyV1,
  verifyPolicyProjectionV1,
  CODEX_POLICY_PROJECTION_TARGET_V1,
  COPILOT_POLICY_PROJECTION_TARGET_V1,
  parsePolicyDeclarationJsonV1,
  PolicyProjectionReceiptV1Schema,
  type EffectivePolicySnapshotV1,
} from "../../src/normative-policy/index.js";
import { declaration, request, verification, target } from "./resolver-fixture.js";

async function snapshot(values = [declaration()]) {
  return createPolicyResolverV1({ version: "test.verifier.v1", verify: verification }).resolve(
    request(values)
  );
}
function input(
  value: EffectivePolicySnapshotV1,
  targetProfile = CODEX_POLICY_PROJECTION_TARGET_V1
) {
  return { schemaVersion: 1, snapshot: value, targetProfile, omitAdvisoryRules: [] };
}
for (const profile of [CODEX_POLICY_PROJECTION_TARGET_V1, COPILOT_POLICY_PROJECTION_TARGET_V1]) {
  test(`${profile.target} shadow golden preserves exact semantics without enforcement`, async () => {
    const data = input(await snapshot(), profile);
    const result = projectPolicyV1(data);
    assert(result.ok);
    assert.equal(
      result.artifact,
      readFileSync(new URL(`./goldens/${profile.target}-projection.md`, import.meta.url), "utf8")
    );
    assert.equal(result.receipt.fidelity, "exact");
    assert.equal(result.receipt.enforcementRealization, "unenforced");
    assert.equal(result.receipt.authorizesExecution, false);
    assert(Object.isFrozen(result.receipt));
    assert.deepEqual(verifyPolicyProjectionV1(data, result.artifact, result.receipt), { ok: true });
    assert.equal(
      parsePolicyDeclarationJsonV1(Buffer.from(result.artifact), {
        type: "synthetic_fixture",
        fixtureId: "projection",
      }).ok,
      false
    );
  });
}
test("mandatory omission rejects, advisory omission is visible and lossy", async () => {
  const required = declaration();
  const advisory = declaration("test.advisory", "recommend");
  const data = input(await snapshot([required, advisory]));
  assert.deepEqual(projectPolicyV1({ ...data, omitAdvisoryRules: [target(required)] }), {
    ok: false,
    fidelity: "unsupported",
    diagnostics: [{ code: "mandatory_omission", rule: target(required) }],
    authorizesExecution: false,
  });
  const result = projectPolicyV1({ ...data, omitAdvisoryRules: [target(advisory)] });
  assert(result.ok);
  assert.equal(result.receipt.fidelity, "lossy_advisory");
  assert.match(result.artifact, /Advisory material omitted/);
  assert.match(result.artifact, /lossy_advisory/);
});
test("advisory cannot become a completion gate", async () => {
  const data = input(await snapshot([declaration("test.advisory", "recommend")]));
  const result = projectPolicyV1({
    ...data,
    targetProfile: { ...data.targetProfile, advisoryTreatment: "completion_gate" },
  });
  assert(!result.ok);
  assert.equal(result.diagnostics[0].code, "semantic_strengthening");
  const valid = projectPolicyV1(data);
  assert(valid.ok);
  assert.match(valid.artifact, /RECOMMENDED \(advisory, not a completion gate\)/);
});
test("both targets reject unknown mandatory conditions", async () => {
  const req = request();
  const unresolved = { ...req, proposal: { ...req.proposal, operationId: null } };
  const value = await createPolicyResolverV1({
    version: "test.verifier.v1",
    verify: verification,
  }).resolve(unresolved);
  assert.equal(value.payload.policyAdmission, "blocked");
  for (const profile of [CODEX_POLICY_PROJECTION_TARGET_V1, COPILOT_POLICY_PROJECTION_TARGET_V1]) {
    const result = projectPolicyV1(input(value, profile));
    assert(!result.ok);
    assert.equal(result.diagnostics[0].code, "unknown_mandatory");
  }
});
test("tampered text, receipts, stale snapshots and profiles fail verification", async () => {
  const data = input(await snapshot());
  const result = projectPolicyV1(data);
  assert(result.ok);
  assert.equal(verifyPolicyProjectionV1(data, result.artifact + "edit", result.receipt).ok, false);
  assert.equal(
    verifyPolicyProjectionV1(data, result.artifact, {
      ...result.receipt,
      enforcementRealization: "enforced",
    }).ok,
    false
  );
  assert.equal(
    verifyPolicyProjectionV1(
      input(await snapshot([declaration("test.changed")])),
      result.artifact,
      result.receipt
    ).ok,
    false
  );
  assert.equal(
    verifyPolicyProjectionV1(
      { ...data, targetProfile: { ...data.targetProfile, revision: 2 } },
      result.artifact,
      result.receipt
    ).ok,
    false
  );
});
test("closed inert inputs reject getters, unknown members and malformed snapshots", async () => {
  let calls = 0;
  const bad = {
    get snapshot() {
      calls++;
      throw new Error("must not execute");
    },
  };
  assert.equal(projectPolicyV1(bad).ok, false);
  assert.equal(calls, 0);
  const data = input(await snapshot());
  assert.equal(projectPolicyV1({ ...data, authority: { grant: "forged" } }).ok, false);
  assert.equal(
    projectPolicyV1({
      ...data,
      snapshot: { ...data.snapshot, snapshotDigest: "sha256:" + "0".repeat(64) },
    }).ok,
    false
  );
});
test("cross-process output and receipts are byte-identical", async () => {
  const data = input(await snapshot());
  const program = `import {projectPolicyV1} from './src/normative-policy/index.ts'; let s=''; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.stringify(projectPolicyV1(JSON.parse(s))));`;
  const run = () =>
    spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], {
      input: JSON.stringify(data),
      encoding: "utf8",
    });
  const a = run();
  const b = run();
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(a.stdout, b.stdout);
  assert.deepEqual(JSON.parse(a.stdout), projectPolicyV1(data));
});

test("target capability loss rejects instead of silently dropping mandatory semantics", async () => {
  const data = input(await snapshot());
  for (const change of [
    { modalities: ["recommend"] },
    { conditions: ["always"] },
    { exceptions: "none" },
  ]) {
    const result = projectPolicyV1({
      ...data,
      targetProfile: { ...data.targetProfile, ...change },
    });
    assert(!result.ok);
    assert.equal(result.diagnostics[0].code, "unsupported_target");
  }
});
test("inactive rules stay resolution records and do not become active instructions", async () => {
  const original = request();
  const req = {
    ...original,
    proposal: { ...original.proposal, operationId: "different.operation" },
  };
  const value = await createPolicyResolverV1({
    version: "test.verifier.v1",
    verify: verification,
  }).resolve(req);
  const result = projectPolicyV1(input(value));
  assert(result.ok);
  assert.match(result.artifact, /RESOLUTION RECORD ONLY/);
  assert.doesNotMatch(result.artifact, /\nREQUIRED\n/);
});
test("receipt schema rejects authority claims, free-form additions and hidden advisory loss", async () => {
  const result = projectPolicyV1(input(await snapshot()));
  assert(result.ok);
  assert(PolicyProjectionReceiptV1Schema.safeParse(result.receipt).success);
  for (const change of [
    { authorizesExecution: true },
    { grant: "forged" },
    { fidelity: "lossy_advisory" },
  ])
    assert.equal(
      PolicyProjectionReceiptV1Schema.safeParse({ ...result.receipt, ...change }).success,
      false
    );
});
