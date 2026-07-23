import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  CapabilityId,
  ContentDigest,
  PrincipalId,
  TenantId,
  WorkspaceId,
} from "../../../../src/shared/runtime-scope/index.js";
import {
  QUARANTINE_RECOVERY_ADMIN_CAPABILITY,
  QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
  QUARANTINE_RECOVERY_ERROR_CODES,
  QuarantineRecoveryError,
  canonicalQuarantineRecoveryJson,
  createQuarantineInventory,
  createQuarantineRecoveryManifest,
  planQuarantineRecovery,
  quarantineRecoveryDigest,
  type QuarantineInventoryV1,
  type QuarantineRecoveryDecisionV1,
} from "../../../../src/memory/store/postgres/quarantine-recovery.js";

const IDS = {
  tenant: "10000000-0000-4000-8000-000000000001" as TenantId,
  workspace: "20000000-0000-4000-8000-000000000002" as WorkspaceId,
  principal: "30000000-0000-4000-8000-000000000003" as PrincipalId,
};

const digest = (value: string): ContentDigest => quarantineRecoveryDigest({ value });

function inventory(
  rows = [
    { frameId: "frame-b", contentDigest: digest("b") },
    { frameId: "frame-a", contentDigest: digest("a") },
  ]
): QuarantineInventoryV1 {
  return createQuarantineInventory({
    frameStoreSchemaVersion: 4,
    quarantineSchemaVersion: 1,
    schema: "lex",
    relation: "lex_frame_store_unowned_frames_v1",
    rows,
  });
}

function scopedDecision(
  frameId: string,
  sourceContentDigest: ContentDigest
): QuarantineRecoveryDecisionV1 {
  return {
    destination: "scoped",
    frameId,
    sourceContentDigest,
    tenantId: IDS.tenant,
    workspaceId: IDS.workspace,
    creatorPrincipalId: IDS.principal,
    scopeVersion: "v1",
  };
}

function compatibilityDecision(
  frameId: string,
  sourceContentDigest: ContentDigest
): QuarantineRecoveryDecisionV1 {
  return {
    destination: "compatibility",
    frameId,
    sourceContentDigest,
    acknowledgement: QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
  };
}

function manifest(source = inventory()) {
  return createQuarantineRecoveryManifest(source, {
    inventoryId: source.inventoryId,
    inventoryDigest: source.inventoryDigest,
    decisions: source.rows.map((row, index) =>
      index === 0
        ? scopedDecision(row.frameId, row.contentDigest)
        : compatibilityDecision(row.frameId, row.contentDigest)
    ),
  });
}

function expectRecoveryError(code: string, operation: () => unknown): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof QuarantineRecoveryError);
    assert.equal(error.code, code);
    return true;
  });
}

describe("PostgreSQL quarantine recovery read-only contract", () => {
  it("canonicalizes object keys with locale-independent code-unit ordering", () => {
    assert.equal(canonicalQuarantineRecoveryJson({ ä: 3, a: 2, Z: 1 }), '{"Z":1,"a":2,"ä":3}');
  });

  it("produces deterministic inventory, manifest, and plan IDs independent of input order", () => {
    const firstInventory = inventory();
    const secondInventory = inventory([...firstInventory.rows].reverse());
    assert.deepEqual(secondInventory, firstInventory);

    const firstManifest = manifest(firstInventory);
    const secondManifest = createQuarantineRecoveryManifest(secondInventory, {
      inventoryId: secondInventory.inventoryId,
      inventoryDigest: secondInventory.inventoryDigest,
      decisions: [...firstManifest.decisions].reverse(),
    });
    assert.deepEqual(secondManifest, firstManifest);

    const authority = {
      tenantId: IDS.tenant,
      workspaceId: IDS.workspace,
      principalId: IDS.principal,
      scopeVersion: "v1",
      capabilities: [QUARANTINE_RECOVERY_ADMIN_CAPABILITY],
    };
    const firstPlan = planQuarantineRecovery({
      currentInventory: firstInventory,
      manifest: firstManifest,
      authority,
      targetRef: digest("target"),
    });
    const secondPlan = planQuarantineRecovery({
      currentInventory: secondInventory,
      manifest: secondManifest,
      authority,
      targetRef: digest("target"),
      destinationCollisions: [],
    });
    assert.deepEqual(secondPlan, firstPlan);
    assert.equal(firstPlan.scopedAssignmentCount, 1);
    assert.equal(firstPlan.compatibilityCopyCount, 1);
    assert.equal(firstPlan.persistentWriteCount, 0);
  });

  it("fails closed for unknown schemas and duplicate source identities", () => {
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.UNSUPPORTED_SCHEMA, () =>
      createQuarantineInventory({
        frameStoreSchemaVersion: 5,
        quarantineSchemaVersion: 1,
        schema: "lex",
        relation: "lex_frame_store_unowned_frames_v1",
        rows: [],
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.DUPLICATE_SOURCE, () =>
      inventory([
        { frameId: "same-frame", contentDigest: digest("first") },
        { frameId: "same-frame", contentDigest: digest("second") },
      ])
    );
  });

  it("rejects partial, duplicate, or changed manifest selections", () => {
    const source = inventory();
    const first = source.rows[0]!;
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.PARTIAL_SELECTION, () =>
      createQuarantineRecoveryManifest(source, {
        inventoryId: source.inventoryId,
        inventoryDigest: source.inventoryDigest,
        decisions: [scopedDecision(first.frameId, first.contentDigest)],
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.DUPLICATE_SOURCE, () =>
      createQuarantineRecoveryManifest(source, {
        inventoryId: source.inventoryId,
        inventoryDigest: source.inventoryDigest,
        decisions: [
          scopedDecision(first.frameId, first.contentDigest),
          compatibilityDecision(first.frameId, first.contentDigest),
        ],
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.PARTIAL_SELECTION, () =>
      createQuarantineRecoveryManifest(source, {
        inventoryId: source.inventoryId,
        inventoryDigest: source.inventoryDigest,
        decisions: source.rows.map((row) =>
          scopedDecision(row.frameId, digest(`changed-${row.frameId}`))
        ),
      })
    );
  });

  it("requires explicit scoped ownership and the exact compatibility acknowledgement", () => {
    const source = inventory();
    const [first, second] = source.rows as [
      (typeof source.rows)[number],
      (typeof source.rows)[number],
    ];
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, () =>
      createQuarantineRecoveryManifest(source, {
        inventoryId: source.inventoryId,
        inventoryDigest: source.inventoryDigest,
        decisions: [
          {
            ...scopedDecision(first.frameId, first.contentDigest),
            tenantId: "ambient" as TenantId,
          },
          compatibilityDecision(second.frameId, second.contentDigest),
        ],
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, () =>
      createQuarantineRecoveryManifest(source, {
        inventoryId: source.inventoryId,
        inventoryDigest: source.inventoryDigest,
        decisions: [
          scopedDecision(first.frameId, first.contentDigest),
          {
            ...compatibilityDecision(second.frameId, second.contentDigest),
            acknowledgement: "yes" as typeof QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
          },
        ],
      })
    );
  });

  it("rejects stale inventories, missing authority, and destination collisions", () => {
    const original = inventory();
    const recoveryManifest = manifest(original);
    const changed = inventory([
      ...original.rows,
      { frameId: "new-frame", contentDigest: digest("new") },
    ]);
    const base = {
      currentInventory: original,
      manifest: recoveryManifest,
      authority: {
        tenantId: IDS.tenant,
        workspaceId: IDS.workspace,
        principalId: IDS.principal,
        scopeVersion: "v1",
        capabilities: [QUARANTINE_RECOVERY_ADMIN_CAPABILITY],
      },
      targetRef: digest("target"),
    };

    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.STALE_INVENTORY, () =>
      planQuarantineRecovery({ ...base, currentInventory: changed })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.STALE_INVENTORY, () =>
      planQuarantineRecovery({
        ...base,
        manifest: {
          ...recoveryManifest,
          decisions: recoveryManifest.decisions.map((decision) =>
            decision.destination === "scoped"
              ? { ...decision, workspaceId: IDS.tenant as unknown as WorkspaceId }
              : decision
          ),
        },
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.AUTHORITY_MISSING, () =>
      planQuarantineRecovery({
        ...base,
        authority: { ...base.authority, capabilities: [] },
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.AUTHORITY_MISSING, () =>
      planQuarantineRecovery({
        ...base,
        authority: { ...base.authority, workspaceId: IDS.tenant as WorkspaceId },
      })
    );
    expectRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES.DESTINATION_COLLISION, () =>
      planQuarantineRecovery({
        ...base,
        destinationCollisions: [
          {
            destination: "scoped",
            frameId: original.rows[0]!.frameId,
            existingContentDigest: digest("existing"),
          },
        ],
      })
    );
  });

  it("keeps bodies and ambient authority out of all normal artifacts", () => {
    const secret = "TOP-SECRET-FRAME-BODY";
    const source = createQuarantineInventory({
      frameStoreSchemaVersion: 4,
      quarantineSchemaVersion: 1,
      schema: "lex",
      relation: "lex_frame_store_unowned_frames_v1",
      rows: [
        {
          frameId: "frame-secret",
          contentDigest: digest(secret),
          body: secret,
          user_id: secret,
        } as unknown as { frameId: string; contentDigest: ContentDigest },
      ],
    });
    const recoveryManifest = createQuarantineRecoveryManifest(source, {
      inventoryId: source.inventoryId,
      inventoryDigest: source.inventoryDigest,
      decisions: [compatibilityDecision(source.rows[0]!.frameId, source.rows[0]!.contentDigest)],
    });
    const plan = planQuarantineRecovery({
      currentInventory: source,
      manifest: recoveryManifest,
      authority: {
        tenantId: IDS.tenant,
        workspaceId: IDS.workspace,
        principalId: IDS.principal,
        scopeVersion: "v1",
        capabilities: [QUARANTINE_RECOVERY_ADMIN_CAPABILITY, "ambient:ignored" as CapabilityId],
      },
      targetRef: digest("target"),
    });

    const artifacts = JSON.stringify({ source, recoveryManifest, plan });
    assert.equal(artifacts.includes(secret), false);
    assert.equal(artifacts.includes("body"), false);
    assert.equal(artifacts.includes("user_id"), false);
    assert.equal(artifacts.includes("ambient:ignored"), false);
    assert.equal(artifacts.includes("lex_frame_store_unowned_frames_v1"), false);
    assert.equal("targetSchema" in plan, false);
  });
});
