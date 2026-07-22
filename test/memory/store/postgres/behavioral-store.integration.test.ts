import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { Pool } from "pg";

import { PostgresBehavioralStoreBackend } from "@app/memory/store/postgres/behavioral-store.js";
import { migratePostgresBehavioralStore } from "@app/memory/store/postgres/behavioral-migrations.js";
import {
  BEHAVIORAL_TEST_IDS,
  behavioralBinding,
  exerciseBehavioralStoreConformance,
  exerciseBehavioralStoreTopology,
} from "../behavioral-store-conformance.js";

const adminUrl = process.env.LEX_TEST_POSTGRES_ADMIN_URL;
const runtimeUrl = process.env.LEX_TEST_POSTGRES_RUNTIME_URL;
const integration = adminUrl && runtimeUrl ? describe : describe.skip;
const schema = `lex_behavior_${process.pid}_${randomBytes(4).toString("hex")}`;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

integration("PostgreSQL behavioral store live shared conformance and RLS", () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let backend: PostgresBehavioralStoreBackend;

  before(async () => {
    adminPool = new Pool({ connectionString: adminUrl as string, allowExitOnIdle: true });
    await adminPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const adminClient = await adminPool.connect();
    try {
      await migratePostgresBehavioralStore(adminClient, schema);
    } finally {
      adminClient.release();
    }

    runtimePool = new Pool({
      connectionString: runtimeUrl as string,
      max: 2,
      allowExitOnIdle: true,
    });
    const role = (await runtimePool.query<{ role: string }>("SELECT current_user AS role")).rows[0]
      ?.role;
    assert.ok(role);
    const runtimeRole = quoteIdentifier(role);
    const target = quoteIdentifier(schema);
    await adminPool.query(`
      REVOKE CREATE ON SCHEMA ${target} FROM PUBLIC;
      REVOKE CREATE ON SCHEMA ${target} FROM ${runtimeRole};
      GRANT USAGE ON SCHEMA ${target} TO ${runtimeRole};
      GRANT SELECT ON ${target}.lex_behavioral_store_migrations TO ${runtimeRole};
      GRANT SELECT, INSERT ON
        ${target}.lex_behavioral_persona_revisions,
        ${target}.lex_behavioral_rule_revisions,
        ${target}.lex_behavioral_evidence,
        ${target}.lex_behavioral_promotions,
        ${target}.lex_behavioral_write_receipts
      TO ${runtimeRole};
      GRANT EXECUTE ON FUNCTION ${target}.lex_behavioral_runtime_scope_matches(UUID, UUID, UUID, UUID)
      TO ${runtimeRole};
    `);
    backend = new PostgresBehavioralStoreBackend(runtimePool, { schema });
  });

  after(async () => {
    await backend?.close();
    await runtimePool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
      await adminPool.end();
    }
  });

  test("passes the same behavioral revision and five-workspace topology contract", async () => {
    await exerciseBehavioralStoreConformance(backend, "postgres-live");
    await exerciseBehavioralStoreTopology(backend, "postgres-live");
  });

  test("RLS ignores a caller's missing filter and rejects a wrong-scope write", async () => {
    const binding = behavioralBinding();
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT
           set_config('lex.tenant_id', $1, true),
           set_config('lex.workspace_id', $2, true),
           set_config('lex.repository_id', $3, true),
           set_config('lex.repository_instance_id', $4, true),
           set_config('lex.principal_id', $5, true)`,
        [
          binding.authorizedScope.tenantId,
          binding.authorizedScope.workspaceId,
          binding.repositoryId,
          binding.repositoryInstanceId,
          binding.authorizedScope.principalId,
        ]
      );
      const visible = await client.query<{ workspace_id: string }>(
        `SELECT workspace_id::text FROM ${quoteIdentifier(schema)}.lex_behavioral_rule_revisions`
      );
      assert.ok(visible.rows.length > 0);
      assert.ok(
        visible.rows.every(
          ({ workspace_id }) => workspace_id === binding.authorizedScope.workspaceId
        )
      );

      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO ${quoteIdentifier(schema)}.lex_behavioral_rule_revisions (
               tenant_id, workspace_id, repository_id, repository_instance_id,
               rule_id, revision, content_digest, category, directive, severity,
               applicability_json, confidence_alpha, confidence_beta, source_frame_ids,
               creator_principal_id, recorded_at
             ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'rls-bypass', '1',
                       'sha256:forbidden', 'security', 'must be rejected', 'must',
                       '{"layer":"workspace"}'::jsonb, 1, 1, ARRAY[]::text[], $5::uuid, now())`,
            [
              BEHAVIORAL_TEST_IDS.tenantStfc,
              BEHAVIORAL_TEST_IDS.workspaceMod,
              BEHAVIORAL_TEST_IDS.repositoryMod,
              BEHAVIORAL_TEST_IDS.instanceMod,
              binding.authorizedScope.principalId,
            ]
          ),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          (error as Error & { code: string }).code === "42501"
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
