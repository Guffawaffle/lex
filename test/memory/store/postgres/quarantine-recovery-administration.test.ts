import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Pool, PoolClient, QueryResult } from "pg";

import { FRAME_STORE_CAPABILITIES } from "../../../../src/memory/store/scoped-frame-store.js";
import { PostgresQuarantineRecoveryAdministration } from "../../../../src/memory/store/postgres/quarantine-recovery-administration.js";
import {
  QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
  createQuarantineRecoveryManifest,
} from "../../../../src/memory/store/postgres/quarantine-recovery.js";
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

const IDS = {
  tenant: "01900000-0000-7000-8000-000000000001",
  workspace: "01900000-0000-7000-8000-000000000101",
  principal: "01900000-0000-7000-8000-000000000201",
} as const;

const COLUMNS = [
  ["id", "text", "NO"],
  ["timestamp", "text", "NO"],
  ["branch", "text", "NO"],
  ["jira", "text", "YES"],
  ["module_scope", "_text", "NO"],
  ["summary_caption", "text", "NO"],
  ["reference_point", "text", "NO"],
  ["status_snapshot", "jsonb", "NO"],
  ["keywords", "_text", "YES"],
  ["atlas_frame_id", "text", "YES"],
  ["feature_flags", "_text", "YES"],
  ["permissions", "_text", "YES"],
  ["module_attribution", "jsonb", "YES"],
  ["run_id", "text", "YES"],
  ["plan_hash", "text", "YES"],
  ["spend", "jsonb", "YES"],
  ["user_id", "text", "YES"],
  ["superseded_by", "text", "YES"],
  ["merged_from", "_text", "YES"],
  ["search_vector", "tsvector", "NO"],
].map(([column_name, udt_name, is_nullable]) => ({ column_name, udt_name, is_nullable }));

function result(rows: readonly Record<string, unknown>[]): QueryResult {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: [...rows] };
}

class FakePool {
  readonly queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  readonly releases: unknown[] = [];
  connects = 0;
  collisionId: string | null = null;

  readonly client = {
    query: async (sql: string, values: readonly unknown[] = []) => this.query(sql, values),
    release: (error?: unknown) => this.releases.push(error),
  } as unknown as PoolClient;

  async connect(): Promise<PoolClient> {
    this.connects += 1;
    return this.client;
  }

  async query(sql: string, values: readonly unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: normalized, values: [...values] });
    if (normalized.includes("MAX(version)")) return result([{ version: 4 }]);
    if (normalized.includes("information_schema.columns")) return result(COLUMNS);
    if (normalized.includes('FROM "lex_test"."lex_frame_store_unowned_frames_v1"')) {
      return result([
        {
          id: "legacy-frame",
          timestamp: "2026-07-01T00:00:00.000Z",
          branch: "legacy",
          jira: null,
          module_scope: ["memory/store"],
          summary_caption: "secret body",
          reference_point: "legacy recovery",
          status_snapshot: { next_action: "assign explicitly" },
          keywords: null,
          atlas_frame_id: null,
          feature_flags: null,
          permissions: null,
          module_attribution: null,
          run_id: null,
          plan_hash: null,
          spend: null,
          user_id: "not-authority",
          superseded_by: null,
          merged_from: null,
        },
      ]);
    }
    if (normalized.startsWith("SELECT id FROM")) {
      return result(this.collisionId ? [{ id: this.collisionId }] : []);
    }
    return result([]);
  }
}

function scope(capabilities: readonly CapabilityId[]): AuthorizedScopeV1 {
  return {
    schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
    grantId: "01900000-0000-7000-8000-000000000301" as AuthorityGrantId,
    tenantId: IDS.tenant as TenantId,
    workspaceId: IDS.workspace as WorkspaceId,
    principalId: IDS.principal as PrincipalId,
    capabilities,
    authorityVersion: "authority-v1" as AuthorityVersion,
    scopeVersion: "scope-v1" as ScopeVersion,
    authorityDigest: "sha256:test" as ContentDigest,
    verifiedAt: "2026-07-22T00:00:00.000Z",
  };
}

describe("PostgreSQL quarantine recovery administration", () => {
  test("rejects missing admin authority before checking out a database client", () => {
    const pool = new FakePool();
    const backend = new PostgresQuarantineRecoveryAdministration(pool as unknown as Pool, {
      schema: "lex_test",
    });
    assert.throws(() => backend.bind(scope([])), /active frame:admin scope/);
    assert.equal(pool.connects, 0);
  });

  test("inventories a repeatable read snapshot without exposing Frame bodies", async () => {
    const pool = new FakePool();
    const backend = new PostgresQuarantineRecoveryAdministration(pool as unknown as Pool, {
      schema: "lex_test",
    });
    const admin = backend.bind(scope([FRAME_STORE_CAPABILITIES.ADMIN]));
    const inventory = await admin.inventory();
    assert.equal(inventory.rowCount, 1);
    assert.equal(inventory.rows[0]?.frameId, "legacy-frame");
    assert.equal(JSON.stringify(inventory).includes("secret body"), false);
    assert.equal(JSON.stringify(inventory).includes("not-authority"), false);
    assert.equal(pool.queries[0]?.sql, "BEGIN");
    assert.equal(pool.queries[1]?.sql, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(pool.queries.at(-1)?.sql, "COMMIT");
  });

  test("plans against a fresh inventory and rejects compatibility collisions", async () => {
    const pool = new FakePool();
    const backend = new PostgresQuarantineRecoveryAdministration(pool as unknown as Pool, {
      schema: "lex_test",
    });
    const admin = backend.bind(scope([FRAME_STORE_CAPABILITIES.ADMIN]));
    const inventory = await admin.inventory();
    const row = inventory.rows[0]!;
    const manifest = createQuarantineRecoveryManifest(inventory, {
      inventoryId: inventory.inventoryId,
      inventoryDigest: inventory.inventoryDigest,
      decisions: [
        {
          destination: "compatibility",
          frameId: row.frameId,
          sourceContentDigest: row.contentDigest,
          acknowledgement: QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
        },
      ],
    });
    const plan = await admin.plan(manifest);
    assert.equal(plan.compatibilityCopyCount, 1);
    assert.equal(plan.persistentWriteCount, 0);

    pool.collisionId = row.frameId;
    await assert.rejects(() => admin.plan(manifest), /destination contains one or more/);
  });
});
