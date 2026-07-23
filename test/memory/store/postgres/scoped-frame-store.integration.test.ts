import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import {
  FRAME_STORE_CAPABILITIES,
  POSTGRES_FRAME_STORE_SCHEMA_VERSION,
  PostgresFrameStore,
  PostgresFrameStoreAdministration,
  PostgresQuarantineRecoveryAdministration,
  PostgresScopedFrameStoreBackend,
  QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
  createQuarantineRecoveryManifest,
} from "@app/memory/store/index.js";
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  type AuthorityGrantId,
  type AuthorityVersion,
  type AuthorizedScopeV1,
  type CapabilityId,
  type ContentDigest,
  type PrincipalId,
  type ScopeVersion,
  type TenantId,
  type WorkspaceId,
} from "@app/shared/runtime-scope/index.js";
import { exerciseScopedFrameStoreConformance } from "../scoped-frame-store-conformance.js";

const adminUrl = process.env.LEX_TEST_POSTGRES_ADMIN_URL;
const runtimeUrl = process.env.LEX_TEST_POSTGRES_RUNTIME_URL;
const integration = adminUrl && runtimeUrl ? describe : describe.skip;
const schema = `lex_scope_${process.pid}_${randomBytes(4).toString("hex")}`;
const shadowSchema = `${schema}_shadow`;
let adminPool: Pool;
let scopedAdminPool: Pool;
let runtimePool: Pool;
let administration: PostgresFrameStoreAdministration;
let backend: PostgresScopedFrameStoreBackend;
let compatibilityStore: PostgresFrameStore;

function scopedUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${shadowSchema},${schema}`);
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function scope(
  tenantId: string,
  workspaceId: string,
  principalId: string,
  capabilities: readonly CapabilityId[] = [
    FRAME_STORE_CAPABILITIES.READ,
    FRAME_STORE_CAPABILITIES.WRITE,
    FRAME_STORE_CAPABILITIES.DELETE,
  ]
): AuthorizedScopeV1 {
  return {
    schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
    grantId: "01900000-0000-7000-8000-000000000301" as AuthorityGrantId,
    tenantId: tenantId as TenantId,
    workspaceId: workspaceId as WorkspaceId,
    principalId: principalId as PrincipalId,
    capabilities,
    authorityVersion: "authority-v1" as AuthorityVersion,
    scopeVersion: "scope-v1" as ScopeVersion,
    authorityDigest: "sha256:postgres-integration" as ContentDigest,
    verifiedAt: new Date().toISOString(),
  };
}

function frame(summary: string) {
  return {
    id: "shared-frame-id",
    timestamp: "2026-07-18T04:00:00.000Z",
    branch: "agent/761-postgres-rls",
    module_scope: ["memory/store/postgres"],
    summary_caption: summary,
    reference_point: "live PostgreSQL RLS",
    status_snapshot: { next_action: "alternate pooled scopes" },
  };
}

integration("PostgreSQL scoped FrameStore live RLS", () => {
  before(async () => {
    adminPool = new Pool({ connectionString: adminUrl as string, allowExitOnIdle: true });
    await adminPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await adminPool.query(`
      CREATE SCHEMA ${quoteIdentifier(shadowSchema)};
      CREATE TABLE ${quoteIdentifier(shadowSchema)}.lex_frame_store_migrations
        (version INTEGER PRIMARY KEY);
      INSERT INTO ${quoteIdentifier(shadowSchema)}.lex_frame_store_migrations VALUES (999);
      CREATE TABLE ${quoteIdentifier(shadowSchema)}.frames (marker TEXT NOT NULL);
      INSERT INTO ${quoteIdentifier(shadowSchema)}.frames VALUES ('poison-shadow');
    `);
    scopedAdminPool = new Pool({
      connectionString: scopedUrl(adminUrl as string),
      allowExitOnIdle: true,
    });
    administration = new PostgresFrameStoreAdministration(scopedAdminPool, { schema });
    await administration.migrate();
    compatibilityStore = new PostgresFrameStore(scopedAdminPool, { schema });
    await compatibilityStore.getFrameCount();

    runtimePool = new Pool({
      connectionString: scopedUrl(runtimeUrl as string),
      max: 1,
      allowExitOnIdle: true,
    });
    const role = (
      await runtimePool.query<{ role_name: string }>("SELECT current_user AS role_name")
    ).rows[0]?.role_name;
    assert.ok(role);
    const runtimeRole = quoteIdentifier(role);
    await adminPool.query(`
      GRANT USAGE ON SCHEMA ${quoteIdentifier(schema)} TO ${runtimeRole};
      GRANT USAGE, CREATE ON SCHEMA ${quoteIdentifier(shadowSchema)} TO ${runtimeRole};
      GRANT SELECT ON ${quoteIdentifier(schema)}.lex_frame_store_migrations TO ${runtimeRole};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdentifier(schema)}.frames TO ${runtimeRole};
      GRANT EXECUTE ON FUNCTION ${quoteIdentifier(schema)}.lex_runtime_scope_is_valid() TO ${runtimeRole};
      GRANT EXECUTE ON FUNCTION ${quoteIdentifier(schema)}.lex_runtime_scope_matches(uuid, uuid) TO ${runtimeRole};
    `);
    backend = new PostgresScopedFrameStoreBackend(runtimePool, { schema });
  });

  after(async () => {
    await backend?.close();
    await compatibilityStore?.close();
    await administration?.close();
    await runtimePool?.end();
    await scopedAdminPool?.end();
    await adminPool?.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(shadowSchema)} CASCADE`);
    await adminPool?.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await adminPool?.end();
  });

  test("keeps compatibility writes separate from the scoped/RLS ownership domain", async () => {
    const compatibilityFrame = {
      id: "compatibility-frame",
      timestamp: "2026-07-18T03:30:00.000Z",
      branch: "main",
      module_scope: ["memory/store/postgres"],
      summary_caption: "Compatibility PostgreSQL Frame",
      reference_point: "separate persistence domains",
      status_snapshot: { next_action: "verify scoped isolation" },
    };
    await compatibilityStore.saveFrame(compatibilityFrame);
    const storedCompatibility = await compatibilityStore.getFrameById(compatibilityFrame.id);
    assert.equal(storedCompatibility?.id, compatibilityFrame.id);
    assert.equal(storedCompatibility?.summary_caption, compatibilityFrame.summary_caption);
    assert.deepEqual(storedCompatibility?.status_snapshot, compatibilityFrame.status_snapshot);

    const scoped = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000001",
        "01900000-0000-7000-8000-000000000101",
        "01900000-0000-7000-8000-000000000201"
      )
    );
    assert.equal(await scoped.getFrameById(compatibilityFrame.id), null);
    const relations = await adminPool.query<{
      scoped: string | null;
      compatibility: string | null;
    }>(
      `SELECT
        to_regclass($1)::text AS scoped,
        to_regclass($2)::text AS compatibility`,
      [`${schema}.frames`, `${schema}.lex_compat_frames`]
    );
    assert.ok(relations.rows[0]?.scoped);
    assert.ok(relations.rows[0]?.compatibility);
  });

  test("recovers quarantined rows explicitly and preserves source until verified cleanup", async () => {
    const quarantine = `${quoteIdentifier(schema)}.lex_frame_store_unowned_frames_v1`;
    const insertLegacy = async (id: string, userId: string) =>
      adminPool.query(
        `INSERT INTO ${quarantine} (
           id, "timestamp", branch, module_scope, summary_caption, reference_point,
           status_snapshot, user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          id,
          "2026-07-18T03:00:00.000Z",
          "legacy-main",
          ["memory/store/postgres"],
          `Recovered ${id}`,
          "explicit quarantine recovery",
          JSON.stringify({ next_action: "verify recovery" }),
          userId,
        ]
      );
    await insertLegacy("recovery-scoped", "legacy-user-scoped");
    await insertLegacy("recovery-compatibility", "legacy-user-compatibility");

    const adminScope = scope(
      "01900000-0000-7000-8000-000000000001",
      "01900000-0000-7000-8000-000000000101",
      "01900000-0000-7000-8000-000000000201",
      [FRAME_STORE_CAPABILITIES.ADMIN]
    );
    const recoveryBackend = new PostgresQuarantineRecoveryAdministration(scopedAdminPool, {
      schema,
    });
    const recovery = recoveryBackend.bind(adminScope);
    const inventory = await recovery.inventory();
    const rows = new Map(inventory.rows.map((row) => [row.frameId, row]));
    const scopedRow = rows.get("recovery-scoped");
    const compatibilityRow = rows.get("recovery-compatibility");
    assert.ok(scopedRow);
    assert.ok(compatibilityRow);
    const manifest = createQuarantineRecoveryManifest(inventory, {
      inventoryId: inventory.inventoryId,
      inventoryDigest: inventory.inventoryDigest,
      decisions: [
        {
          destination: "scoped",
          frameId: scopedRow.frameId,
          sourceContentDigest: scopedRow.contentDigest,
          tenantId: adminScope.tenantId,
          workspaceId: adminScope.workspaceId,
          creatorPrincipalId: adminScope.principalId,
          scopeVersion: adminScope.scopeVersion,
        },
        {
          destination: "compatibility",
          frameId: compatibilityRow.frameId,
          sourceContentDigest: compatibilityRow.contentDigest,
          acknowledgement: QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
        },
      ],
    });

    const dryRun = await recovery.apply(manifest);
    assert.equal("persistentWriteCount" in dryRun && dryRun.persistentWriteCount, 0);
    const receipt = await recovery.apply(manifest, { write: true });
    assert.equal(receipt.state, "verified");
    assert.equal("sourcePreserved" in receipt && receipt.sourcePreserved, true);
    assert.equal((await recovery.inventory()).rowCount, 2);

    const scoped = backend.bind(
      scope(adminScope.tenantId, adminScope.workspaceId, adminScope.principalId)
    );
    const recoveredScoped = await scoped.getFrameById("recovery-scoped");
    assert.equal(recoveredScoped?.summary_caption, "Recovered recovery-scoped");
    assert.equal("userId" in (recoveredScoped ?? {}), false);
    assert.equal((await scoped.searchFrames({ query: "explicit quarantine" })).length, 1);
    const recoveredCompatibility = await compatibilityStore.getFrameById("recovery-compatibility");
    assert.equal(recoveredCompatibility?.userId, "legacy-user-compatibility");

    const cleanup = await recovery.cleanup(manifest.manifestId, { write: true });
    assert.equal(cleanup.state, "cleaned");
    assert.equal((await recovery.inventory()).rowCount, 0);
    assert.equal((await recovery.recover(manifest.manifestId)).state, "cleaned");
    await recovery.close();
    await recoveryBackend.close();
  });

  test("isolates collisions while rapidly alternating tenants and workspaces on one client", async () => {
    const tenantAWorkspaceA = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000001",
        "01900000-0000-7000-8000-000000000101",
        "01900000-0000-7000-8000-000000000201"
      )
    );
    const tenantAWorkspaceB = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000001",
        "01900000-0000-7000-8000-000000000102",
        "01900000-0000-7000-8000-000000000202"
      )
    );
    const tenantBWorkspaceA = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000002",
        "01900000-0000-7000-8000-000000000101",
        "01900000-0000-7000-8000-000000000201"
      )
    );

    await tenantAWorkspaceA.saveFrame(frame("tenant A / workspace A"));
    await tenantAWorkspaceB.saveFrame(frame("tenant A / workspace B"));
    await tenantBWorkspaceA.saveFrame(frame("tenant B / workspace A"));
    for (let index = 0; index < 20; index++) {
      assert.equal(
        (await tenantAWorkspaceA.getFrameById("shared-frame-id"))?.summary_caption,
        "tenant A / workspace A"
      );
      assert.equal(
        (await tenantAWorkspaceB.getFrameById("shared-frame-id"))?.summary_caption,
        "tenant A / workspace B"
      );
      assert.equal(
        (await tenantBWorkspaceA.getFrameById("shared-frame-id"))?.summary_caption,
        "tenant B / workspace A"
      );
    }
  });

  test("satisfies the shared normal-operation and exact Frame round-trip contract", async () => {
    const store = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000011",
        "01900000-0000-7000-8000-000000000111",
        "01900000-0000-7000-8000-000000000211"
      )
    );
    await exerciseScopedFrameStoreConformance(store, "postgres");
  });

  test("missing or malformed session scope sees no rows", async () => {
    const client = await runtimePool.connect();
    try {
      assert.equal(
        (
          await client.query<{ count: string }>(
            `SELECT COUNT(*) AS count FROM ${quoteIdentifier(schema)}.frames`
          )
        ).rows[0]?.count,
        "0"
      );
      await client.query("BEGIN");
      await client.query("SELECT set_config('lex.tenant_id', 'malformed', true)");
      assert.equal(
        (
          await client.query<{ count: string }>(
            `SELECT COUNT(*) AS count FROM ${quoteIdentifier(schema)}.frames`
          )
        ).rows[0]?.count,
        "0"
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const afterRollback = backend.bind(
      scope(
        "01900000-0000-7000-8000-000000000001",
        "01900000-0000-7000-8000-000000000101",
        "01900000-0000-7000-8000-000000000201"
      )
    );
    assert.equal(
      (await afterRollback.getFrameById("shared-frame-id"))?.summary_caption,
      "tenant A / workspace A"
    );
  });

  test("database rejects forged creator provenance and ownership mutation", async () => {
    const client = await runtimePool.connect();
    const tenantId = "01900000-0000-7000-8000-000000000001";
    const workspaceId = "01900000-0000-7000-8000-000000000101";
    const principalId = "01900000-0000-7000-8000-000000000201";
    const otherPrincipalId = "01900000-0000-7000-8000-000000000202";
    const beginScope = async () => {
      await client.query("BEGIN");
      await client.query(
        `SELECT
          set_config('lex.tenant_id', $1, true),
          set_config('lex.workspace_id', $2, true),
          set_config('lex.principal_id', $3, true)`,
        [tenantId, workspaceId, principalId]
      );
    };
    try {
      await beginScope();
      await assert.rejects(
        client.query(
          `INSERT INTO ${quoteIdentifier(schema)}.frames (
            tenant_id, workspace_id, creator_principal_id, scope_version,
            id, "timestamp", branch, module_scope, summary_caption,
            reference_point, status_snapshot
          ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'scope-v1',
            'forged-owner', '2026-07-18T04:00:00.000Z', 'test', ARRAY['test'],
            'forged', 'forged', '{"next_action":"reject"}'::jsonb)`,
          [tenantId, workspaceId, otherPrincipalId]
        ),
        /row-level security policy/i
      );
      await client.query("ROLLBACK");

      for (const assignment of [
        ["creator_principal_id", otherPrincipalId],
        ["workspace_id", "01900000-0000-7000-8000-000000000102"],
        ["scope_version", "forged-scope"],
      ] as const) {
        await beginScope();
        await assert.rejects(
          client.query(
            `UPDATE ${quoteIdentifier(schema)}.frames SET ${assignment[0]} = $4
             WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
               AND current_setting('lex.principal_id', true) = $3
               AND id = 'shared-frame-id'`,
            [tenantId, workspaceId, principalId, assignment[1]]
          ),
          /ownership columns are immutable/i
        );
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  test("runtime boundary refuses to rely on explicit predicates without forced RLS", async () => {
    await scopedAdminPool.query(
      `ALTER TABLE ${quoteIdentifier(schema)}.frames NO FORCE ROW LEVEL SECURITY`
    );
    await scopedAdminPool.query(
      `ALTER TABLE ${quoteIdentifier(schema)}.frames DISABLE ROW LEVEL SECURITY`
    );
    try {
      const workspaceA = backend.bind(
        scope(
          "01900000-0000-7000-8000-000000000001",
          "01900000-0000-7000-8000-000000000101",
          "01900000-0000-7000-8000-000000000201"
        )
      );
      await assert.rejects(
        () => workspaceA.getFrameById("shared-frame-id"),
        /enabled and forced row-level security/
      );
    } finally {
      await scopedAdminPool.query(
        `ALTER TABLE ${quoteIdentifier(schema)}.frames ENABLE ROW LEVEL SECURITY`
      );
      await scopedAdminPool.query(
        `ALTER TABLE ${quoteIdentifier(schema)}.frames FORCE ROW LEVEL SECURITY`
      );
    }
  });

  test("runtime role cannot disable RLS or alter the protected policy", async () => {
    await assert.rejects(
      runtimePool.query(`ALTER TABLE ${quoteIdentifier(schema)}.frames DISABLE ROW LEVEL SECURITY`)
    );
    await assert.rejects(
      runtimePool.query(
        `DROP POLICY lex_frames_runtime_select ON ${quoteIdentifier(schema)}.frames`
      )
    );
  });

  test("ignores same-named objects in an earlier runtime-writable schema", async () => {
    const poison = await adminPool.query<{ version: number; marker: string }>(`
      SELECT
        (SELECT MAX(version) FROM ${quoteIdentifier(shadowSchema)}.lex_frame_store_migrations)
          AS version,
        (SELECT marker FROM ${quoteIdentifier(shadowSchema)}.frames LIMIT 1) AS marker
    `);
    assert.deepEqual(poison.rows[0], { version: 999, marker: "poison-shadow" });
    const canonical = await adminPool.query<{ version: number }>(
      `SELECT MAX(version) AS version
         FROM ${quoteIdentifier(schema)}.lex_frame_store_migrations`
    );
    assert.equal(canonical.rows[0]?.version, POSTGRES_FRAME_STORE_SCHEMA_VERSION);
  });
});
