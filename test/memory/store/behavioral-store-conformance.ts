import assert from "node:assert/strict";

import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  behavioralContentDigest,
  type BehavioralStoreBinder,
  type BehavioralStoreBindingV1,
  type BehavioralEvidenceInputV1,
  type BehavioralSnapshotQueryV1,
  type ScopedBehavioralReadStore,
  type ScopedBehavioralWriteStore,
} from "@app/memory/store/index.js";
import { behavioralApplicabilityMatches } from "@app/memory/store/behavioral-store.js";
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  type AuthorityGrantId,
  type AuthorityVersion,
  type CapabilityId,
  type ContentDigest,
  type PrincipalId,
  type RepositoryId,
  type RepositoryInstanceId,
  type ScopeVersion,
  type TenantId,
  type WorkspaceId,
} from "@app/shared/runtime-scope/index.js";

type AssertNever<Value extends never> = Value;
type AuthoritySelector =
  "tenantId" | "workspaceId" | "repositoryId" | "repositoryInstanceId" | "principalId";
type BackendPrimitive = "db" | "database" | "pool" | "client" | "query" | "prepare" | "exec";
type _SnapshotHasNoAuthoritySelector = AssertNever<
  Extract<keyof BehavioralSnapshotQueryV1, AuthoritySelector>
>;
type _EvidenceHasNoAuthoritySelector = AssertNever<
  Extract<keyof BehavioralEvidenceInputV1, AuthoritySelector>
>;
type _ReadStoreHasNoBackendPrimitive = AssertNever<
  Extract<keyof ScopedBehavioralReadStore, BackendPrimitive>
>;
type _WriteStoreHasNoBackendPrimitive = AssertNever<
  Extract<keyof ScopedBehavioralWriteStore, BackendPrimitive>
>;
type _BinderHasNoBackendPrimitive = AssertNever<
  Extract<keyof BehavioralStoreBinder, BackendPrimitive>
>;

export const BEHAVIORAL_TEST_IDS = Object.freeze({
  principal: "10000000-0000-4000-8000-000000000001",
  tenantPlatform: "20000000-0000-4000-8000-000000000001",
  tenantStfc: "20000000-0000-4000-8000-000000000002",
  workspaceLex: "30000000-0000-4000-8000-000000000001",
  workspaceAxf: "30000000-0000-4000-8000-000000000002",
  workspaceMod: "30000000-0000-4000-8000-000000000003",
  workspaceCompanion: "30000000-0000-4000-8000-000000000004",
  workspaceMajel: "30000000-0000-4000-8000-000000000005",
  repositoryLex: "40000000-0000-4000-8000-000000000001",
  repositoryAxf: "40000000-0000-4000-8000-000000000002",
  repositoryMod: "40000000-0000-4000-8000-000000000003",
  repositoryCompanion: "40000000-0000-4000-8000-000000000004",
  repositoryMajel: "40000000-0000-4000-8000-000000000005",
  instanceLex: "60000000-0000-4000-8000-000000000001",
  instanceAxf: "60000000-0000-4000-8000-000000000002",
  instanceMod: "60000000-0000-4000-8000-000000000003",
  instanceCompanion: "60000000-0000-4000-8000-000000000004",
  instanceMajel: "60000000-0000-4000-8000-000000000005",
});

assert.equal(
  behavioralApplicabilityMatches({ layer: "workspace", contextTags: ["reviewed"] }, {}),
  false
);
assert.equal(
  behavioralApplicabilityMatches(
    { layer: "workspace", contextTags: ["reviewed"] },
    { contextTags: ["reviewed"] }
  ),
  true
);

export function behavioralBinding(
  tenantId = BEHAVIORAL_TEST_IDS.tenantPlatform,
  workspaceId = BEHAVIORAL_TEST_IDS.workspaceLex,
  repositoryId = BEHAVIORAL_TEST_IDS.repositoryLex,
  repositoryInstanceId = BEHAVIORAL_TEST_IDS.instanceLex,
  capabilities: readonly CapabilityId[] = Object.values(BEHAVIORAL_STORE_CAPABILITIES)
): BehavioralStoreBindingV1 {
  return {
    schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
    authorizedScope: {
      schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
      grantId: "50000000-0000-4000-8000-000000000001" as AuthorityGrantId,
      tenantId: tenantId as TenantId,
      workspaceId: workspaceId as WorkspaceId,
      principalId: BEHAVIORAL_TEST_IDS.principal as PrincipalId,
      capabilities,
      authorityVersion: "authority-v1" as AuthorityVersion,
      scopeVersion: "scope-v1" as ScopeVersion,
      authorityDigest: "sha256:authority" as ContentDigest,
      verifiedAt: "2026-07-22T00:00:00.000Z",
    },
    repositoryId: repositoryId as RepositoryId,
    repositoryInstanceId: repositoryInstanceId as RepositoryInstanceId,
  };
}

async function writeFixture(
  backend: BehavioralStoreBinder,
  binding: BehavioralStoreBindingV1,
  prefix: string
) {
  const writer = backend.bindWrite(binding);
  const persona = await writer.putPersonaRevision({
    idempotencyKey: `${prefix}:persona:v1`,
    value: {
      personaId: "quality-engineer",
      revision: "1",
      content: { instructions: ["Prefer evidence", "Keep changes bounded"] },
      sourceFrameIds: ["frame-persona"],
    },
  });
  assert.equal(persona.status, "applied");
  assert.equal(
    (
      await writer.putPersonaRevision({
        idempotencyKey: `${prefix}:persona:v1`,
        value: {
          personaId: "quality-engineer",
          revision: "1",
          content: { instructions: ["Prefer evidence", "Keep changes bounded"] },
          sourceFrameIds: ["frame-persona"],
        },
      })
    ).status,
    "replayed"
  );

  const rule = await writer.putRuleRevision({
    idempotencyKey: `${prefix}:rule:v1`,
    value: {
      ruleId: "verify-gates",
      revision: "1",
      category: "quality",
      directive: "Run touched and adjacent gates before broad validation.",
      severity: "must",
      applicability: { layer: "module", moduleIds: ["memory/store"] },
      confidencePrior: { alpha: 2, beta: 1 },
      sourceFrameIds: ["frame-rule"],
    },
  });
  assert.equal(rule.status, "applied");
  const collision = await writer.putRuleRevision({
    idempotencyKey: `${prefix}:rule:collision`,
    value: {
      ruleId: "verify-gates",
      revision: "1",
      category: "quality",
      directive: "Conflicting immutable content.",
      severity: "must",
      applicability: { layer: "module", moduleIds: ["memory/store"] },
      confidencePrior: { alpha: 2, beta: 1 },
    },
  });
  assert.equal(collision.status, "conflict");
  assert.equal(collision.conflict, "immutable-revision-exists");
  const replayedCollision = await writer.putRuleRevision({
    idempotencyKey: `${prefix}:rule:collision`,
    value: {
      ruleId: "verify-gates",
      revision: "1",
      category: "quality",
      directive: "Conflicting immutable content.",
      severity: "must",
      applicability: { layer: "module", moduleIds: ["memory/store"] },
      confidencePrior: { alpha: 2, beta: 1 },
    },
  });
  assert.equal(replayedCollision.status, "replayed");
  assert.equal(replayedCollision.conflict, "immutable-revision-exists");

  const evidence = await Promise.all([
    writer.recordEvidence({
      idempotencyKey: `${prefix}:observation:1`,
      ruleId: "verify-gates",
      ruleRevision: "1",
      kind: "observation",
      sourceFrameIds: ["frame-observation-1"],
    }),
    writer.recordEvidence({
      idempotencyKey: `${prefix}:observation:2`,
      ruleId: "verify-gates",
      ruleRevision: "1",
      kind: "observation",
      sourceFrameIds: ["frame-observation-2"],
    }),
    writer.recordEvidence({
      idempotencyKey: `${prefix}:counterexample:1`,
      ruleId: "verify-gates",
      ruleRevision: "1",
      kind: "counterexample",
      sourceFrameIds: ["frame-counterexample-1"],
    }),
  ]);
  assert.deepEqual(
    evidence.map(({ status }) => status),
    ["applied", "applied", "applied"]
  );
  await writer.close();
}

/** Shared observable contract for every durable adapter. */
export async function exerciseBehavioralStoreConformance(
  backend: BehavioralStoreBinder,
  prefix: string
): Promise<void> {
  for (const primitive of ["db", "database", "pool", "client", "query", "prepare", "exec"]) {
    assert.equal(primitive in backend, false);
  }
  const binding = behavioralBinding();
  await writeFixture(backend, binding, prefix);
  const reader = backend.bindRead(binding);
  for (const primitive of ["db", "database", "pool", "client", "query", "prepare", "exec"]) {
    assert.equal(primitive in reader, false);
  }

  const compact = await reader.getSnapshot({ moduleId: "memory/store" });
  assert.equal(compact.personas.length, 1);
  assert.equal(compact.rules.length, 1);
  assert.equal(compact.rules[0].confidence.observations, 2);
  assert.equal(compact.rules[0].confidence.counterexamples, 1);
  assert.equal(compact.rules[0].confidence.alpha, 4);
  assert.equal(compact.rules[0].confidence.beta, 2);
  assert.equal(compact.rules[0].provenance, undefined);
  assert.equal(compact.personas[0].provenance, undefined);
  assert.equal((await reader.getSnapshot({ moduleId: "other" })).rules.length, 0);
  assert.deepEqual(await reader.getSnapshot({ moduleId: "memory/store" }), compact);
  assert.match(compact.snapshotRevision, /^sha256:[0-9a-f]{64}$/);
  assert.match(compact.contentDigest, /^sha256:[0-9a-f]{64}$/);

  const detailed = await reader.getRule("verify-gates", { provenance: "detailed" });
  assert.equal(detailed?.provenance?.repositoryId, binding.repositoryId);
  assert.equal(detailed?.provenance?.repositoryInstanceId, binding.repositoryInstanceId);
  assert.deepEqual(detailed?.provenance?.sourceFrameIds, ["frame-rule"]);
  await reader.close();

  const readOnly = behavioralBinding(undefined, undefined, undefined, undefined, [
    BEHAVIORAL_STORE_CAPABILITIES.READ,
  ]);
  assert.throws(() => backend.bindWrite(readOnly));
  const noProvenance = backend.bindRead(readOnly);
  await assert.rejects(() => noProvenance.getRule("verify-gates", { provenance: "detailed" }));
  await noProvenance.close();

  const reused = backend.bindWrite(binding);
  const idempotencyConflict = await reused.recordEvidence({
    idempotencyKey: `${prefix}:observation:1`,
    ruleId: "verify-gates",
    ruleRevision: "1",
    kind: "counterexample",
    sourceFrameIds: ["changed"],
  });
  assert.equal(idempotencyConflict.status, "conflict");
  assert.equal(idempotencyConflict.conflict, "idempotency-key-reused");
  assert.equal(
    idempotencyConflict.receiptDigest,
    behavioralContentDigest({
      schemaVersion: idempotencyConflict.schemaVersion,
      operation: idempotencyConflict.operation,
      status: idempotencyConflict.status,
      idempotencyKey: idempotencyConflict.idempotencyKey,
      payloadDigest: idempotencyConflict.payloadDigest,
      resourceId: idempotencyConflict.resourceId,
      revision: idempotencyConflict.revision,
      conflict: idempotencyConflict.conflict,
    })
  );
  await reused.close();
}

export async function exerciseBehavioralStoreTopology(
  backend: BehavioralStoreBinder,
  prefix: string
): Promise<void> {
  const topology = [
    [
      BEHAVIORAL_TEST_IDS.tenantPlatform,
      BEHAVIORAL_TEST_IDS.workspaceLex,
      BEHAVIORAL_TEST_IDS.repositoryLex,
      BEHAVIORAL_TEST_IDS.instanceLex,
    ],
    [
      BEHAVIORAL_TEST_IDS.tenantPlatform,
      BEHAVIORAL_TEST_IDS.workspaceAxf,
      BEHAVIORAL_TEST_IDS.repositoryAxf,
      BEHAVIORAL_TEST_IDS.instanceAxf,
    ],
    [
      BEHAVIORAL_TEST_IDS.tenantStfc,
      BEHAVIORAL_TEST_IDS.workspaceMod,
      BEHAVIORAL_TEST_IDS.repositoryMod,
      BEHAVIORAL_TEST_IDS.instanceMod,
    ],
    [
      BEHAVIORAL_TEST_IDS.tenantStfc,
      BEHAVIORAL_TEST_IDS.workspaceCompanion,
      BEHAVIORAL_TEST_IDS.repositoryCompanion,
      BEHAVIORAL_TEST_IDS.instanceCompanion,
    ],
    [
      BEHAVIORAL_TEST_IDS.tenantStfc,
      BEHAVIORAL_TEST_IDS.workspaceMajel,
      BEHAVIORAL_TEST_IDS.repositoryMajel,
      BEHAVIORAL_TEST_IDS.instanceMajel,
    ],
  ] as const;

  for (const [index, [tenant, workspace, repository, instance]] of topology.entries()) {
    const binding = behavioralBinding(tenant, workspace, repository, instance);
    const writer = backend.bindWrite(binding);
    const receipt = await writer.putRuleRevision({
      idempotencyKey: `${prefix}:topology:${index}`,
      value: {
        ruleId: "colliding-rule-id",
        revision: "1",
        category: "isolation",
        directive: `Owned by topology workspace ${index}`,
        severity: "must",
        applicability: { layer: "workspace" },
        confidencePrior: { alpha: 1, beta: 1 },
      },
    });
    assert.equal(receipt.status, "applied");
    await writer.close();
  }

  for (const [index, [tenant, workspace, repository, instance]] of topology.entries()) {
    const reader = backend.bindRead(behavioralBinding(tenant, workspace, repository, instance));
    const rule = await reader.getRule("colliding-rule-id");
    assert.equal(rule?.directive, `Owned by topology workspace ${index}`);
    assert.equal(
      (await reader.getSnapshot()).rules.filter(({ ruleId }) => ruleId === "colliding-rule-id")
        .length,
      1
    );
    await reader.close();
  }
}
