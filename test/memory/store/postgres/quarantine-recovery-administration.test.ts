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

function legacyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

class FakePool {
  readonly queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  readonly releases: unknown[] = [];
  connects = 0;
  collisionId: string | null = null;
  tamperDestination = false;
  tamperSource = false;
  lifecycleState: "verified" | "cleaned" | null = null;
  storedManifestDigest: string | null = null;
  storedReceipt: unknown = null;
  storedReceiptDigest: string | null = null;
  storedAssignment: {
    frame_id: string;
    row_digest: string;
    decision: unknown;
    destination_digest: string;
  } | null = null;

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
    if (normalized.includes("FROM pg_constraint AS constraint_record")) {
      return result([{ columns: ["id"] }]);
    }
    if (normalized.startsWith("SELECT manifest_digest, state, redacted_receipt")) {
      return result(
        this.lifecycleState
          ? [
              {
                manifest_digest: this.storedManifestDigest,
                state: this.lifecycleState,
                redacted_receipt: this.storedReceipt,
                receipt_digest: this.storedReceiptDigest,
              },
            ]
          : []
      );
    }
    if (normalized.startsWith("SELECT state, copied_row_count")) {
      return result(
        this.lifecycleState
          ? [{ state: this.lifecycleState, copied_row_count: this.storedAssignment ? 1 : 0 }]
          : []
      );
    }
    if (normalized.startsWith("SELECT frame_id, row_digest, decision")) {
      return result(this.storedAssignment ? [this.storedAssignment] : []);
    }
    if (normalized.startsWith("SELECT COUNT(*)::int AS count")) {
      return result([{ count: this.lifecycleState === "verified" ? 1 : 0 }]);
    }
    if (normalized.startsWith('INSERT INTO "lex_test"."lex_compat_frames"')) return result([{}]);
    if (normalized.startsWith('INSERT INTO "lex_test"."lex_frame_store_recovery_operations"')) {
      this.lifecycleState = "verified";
      this.storedManifestDigest = String(values[1]);
      this.storedReceipt = JSON.parse(String(values[5]));
      this.storedReceiptDigest = String(values[6]);
      return result([{}]);
    }
    if (normalized.startsWith('INSERT INTO "lex_test"."lex_frame_store_recovery_assignments"')) {
      this.storedAssignment = {
        frame_id: String(values[1]),
        row_digest: String(values[2]),
        decision: JSON.parse(String(values[3])),
        destination_digest: String(values[5]),
      };
      return result([{}]);
    }
    if (normalized.startsWith('DELETE FROM "lex_test"."lex_frame_store_unowned_frames_v1"')) {
      return result([{}]);
    }
    if (
      normalized.startsWith("UPDATE") &&
      normalized.includes("lex_frame_store_recovery_operations")
    ) {
      this.lifecycleState = "cleaned";
      this.storedReceipt = JSON.parse(String(values[1]));
      return result([{}]);
    }
    if (normalized.includes('FROM "lex_test"."lex_frame_store_unowned_frames_v1"')) {
      return result([legacyRow(this.tamperSource ? { summary_caption: "changed source" } : {})]);
    }
    if (
      normalized.startsWith("SELECT id,") &&
      normalized.includes('FROM "lex_test"."lex_compat_frames"')
    ) {
      if (normalized.includes("ANY(")) {
        return result(this.collisionId ? [legacyRow({ id: this.collisionId })] : []);
      }
      return result([
        legacyRow(this.tamperDestination ? { summary_caption: "changed destination" } : {}),
      ]);
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
    const collisionQuery = pool.queries.find(
      ({ sql }) => sql.includes("lex_compat_frames") && sql.includes("ANY(")
    );
    assert.ok(collisionQuery);
    assert.match(collisionQuery.sql, /summary_caption/);
    assert.match(collisionQuery.sql, /status_snapshot/);
    assert.match(collisionQuery.sql, /user_id/);
  });

  test("keeps apply dry by default and transactionally verifies an explicit copy", async () => {
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

    const dryRun = await admin.apply(manifest);
    assert.equal("persistentWriteCount" in dryRun && dryRun.persistentWriteCount, 0);
    assert.equal(
      pool.queries.some(({ sql }) => sql.startsWith("INSERT INTO")),
      false
    );

    pool.queries.length = 0;
    const receipt = await admin.apply(manifest, { write: true });
    assert.equal("state" in receipt && receipt.state, "verified");
    assert.equal("sourcePreserved" in receipt && receipt.sourcePreserved, true);
    assert.equal(pool.queries[0]?.sql, "BEGIN");
    assert.equal(pool.queries[1]?.sql, "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    assert.equal(pool.queries.at(-1)?.sql, "COMMIT");
    assert.equal(
      pool.queries.some(({ sql }) => /ON CONFLICT|UPSERT/i.test(sql)),
      false
    );
    const lockKeys = pool.queries
      .filter(({ sql }) => sql.includes("pg_advisory_xact_lock"))
      .map(({ values }) => values[0]);
    assert.deepEqual(lockKeys, [
      "lex-frame-store-migrations:lex_test",
      "lex-compat-frame-store-migrations:lex_test",
      "lex-frame-store-quarantine-recovery:lex_test",
    ]);

    pool.queries.length = 0;
    const replay = await admin.apply(manifest, { write: true });
    assert.deepEqual(replay, receipt);
    assert.equal(
      pool.queries.some(({ sql }) => sql.includes('INSERT INTO "lex_test"."lex_compat_frames"')),
      false
    );
  });

  test("rolls back copies and evidence when round-trip verification changes", async () => {
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
    pool.queries.length = 0;
    pool.tamperDestination = true;
    await assert.rejects(() => admin.apply(manifest, { write: true }), /round-trip verification/);
    assert.equal(pool.queries.at(-1)?.sql, "ROLLBACK");
    assert.equal(
      pool.queries.some(
        ({ sql }) => sql.startsWith("INSERT") && sql.includes("lex_frame_store_recovery_operations")
      ),
      false
    );
  });

  test("recovers durable state and cleans only after re-verifying source and destination", async () => {
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
    await admin.apply(manifest, { write: true });

    const recovered = await admin.recover(manifest.manifestId);
    assert.deepEqual(
      {
        state: recovered.state,
        copiedRowCount: recovered.copiedRowCount,
        sourcePreserved: recovered.sourcePreserved,
      },
      { state: "verified", copiedRowCount: 1, sourcePreserved: true }
    );
    const dryCleanup = await admin.cleanup(manifest.manifestId);
    assert.equal(dryCleanup.state, "verified");

    pool.tamperSource = true;
    await assert.rejects(
      () => admin.cleanup(manifest.manifestId, { write: true }),
      /source changed after verified apply/
    );
    assert.equal(pool.queries.at(-1)?.sql, "ROLLBACK");
    pool.tamperSource = false;

    pool.queries.length = 0;
    const cleaned = await admin.cleanup(manifest.manifestId, { write: true });
    assert.equal(cleaned.state, "cleaned");
    assert.equal("destinationVerified" in cleaned && cleaned.destinationVerified, true);
    assert.equal(
      pool.queries.some(({ sql }) =>
        sql.startsWith('DELETE FROM "lex_test"."lex_frame_store_unowned_frames_v1"')
      ),
      true
    );
    assert.equal(pool.queries.at(-1)?.sql, "COMMIT");

    const after = await admin.recover(manifest.manifestId);
    assert.equal(after.state, "cleaned");
    assert.equal(after.sourcePreserved, false);
    assert.equal(after.nextAction, "none");
  });
});
