import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { Frame } from "@app/memory/frames/types.js";
import {
  FRAME_STORE_CAPABILITIES,
  POSTGRES_FRAME_STORE_SCHEMA_VERSION,
  PostgresFrameStoreAdministration,
  PostgresScopedFrameStoreBackend,
  SCOPED_FRAME_STORE_ERROR_CODES,
  ScopedFrameStoreError,
  migratePostgresFrameStore,
  planPostgresFrameStoreMigration,
  type ScopedFrameInput,
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

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

const IDS = {
  tenantA: "01900000-0000-7000-8000-000000000001",
  tenantB: "01900000-0000-7000-8000-000000000002",
  workspaceA: "01900000-0000-7000-8000-000000000101",
  workspaceB: "01900000-0000-7000-8000-000000000102",
  principalA: "01900000-0000-7000-8000-000000000201",
  principalB: "01900000-0000-7000-8000-000000000202",
} as const;

function scope(
  tenantId = IDS.tenantA,
  workspaceId = IDS.workspaceA,
  principalId = IDS.principalA,
  capabilities: readonly CapabilityId[] = [
    FRAME_STORE_CAPABILITIES.READ,
    FRAME_STORE_CAPABILITIES.WRITE,
    FRAME_STORE_CAPABILITIES.DELETE,
  ],
  overrides: Partial<AuthorizedScopeV1> = {}
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
    authorityDigest: "sha256:scope" as ContentDigest,
    verifiedAt: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

function frame(id: string, overrides: Partial<Frame> = {}): ScopedFrameInput {
  return {
    id,
    timestamp: "2026-07-18T01:30:00.000Z",
    branch: "agent/761-postgres-rls",
    module_scope: ["memory/store/postgres"],
    summary_caption: `Scoped PostgreSQL Frame ${id}`,
    reference_point: "transaction-bound RLS",
    status_snapshot: { next_action: "verify pool isolation" },
    ...overrides,
  };
}

class FakePool {
  readonly queries: RecordedQuery[] = [];
  readonly releases: Array<Error | boolean | undefined> = [];
  failWhen?: RegExp;
  runtimeBoundary = {
    schema_version: POSTGRES_FRAME_STORE_SCHEMA_VERSION,
    role_name: "lex_runtime",
    role_is_superuser: false,
    role_bypasses_rls: false,
    role_owns_frames: false,
    rls_enabled: true,
    rls_forced: true,
  };

  readonly client = {
    query: async (sql: string, values: readonly unknown[] = []) => this.query(sql, values),
    release: (error?: Error | boolean) => this.releases.push(error),
  } as unknown as PoolClient;

  async connect(): Promise<PoolClient> {
    return this.client;
  }

  async query(sql: string, values: readonly unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: normalized, values: [...values] });
    if (this.failWhen?.test(normalized)) throw new Error("injected PostgreSQL failure");
    if (normalized.includes("pg_roles AS role")) return result([this.runtimeBoundary]);
    if (/SELECT COUNT\(\*\) AS count FROM frames/.test(normalized)) return result([{ count: "0" }]);
    if (/COUNT\(\*\) AS total_frames/.test(normalized)) {
      return result([
        {
          total_frames: "1",
          this_week: "1",
          this_month: "1",
          oldest_date: null,
          newest_date: null,
        },
      ]);
    }
    if (/SELECT module_id, COUNT\(\*\) AS count/.test(normalized)) {
      return result([{ module_id: "memory/store/postgres", count: "1" }]);
    }
    if (/COUNT\(\*\) AS frame_count/.test(normalized)) {
      return result([{ frame_count: "0", estimated_tokens: "0", prompts: "0" }]);
    }
    if (
      /^(?:DELETE|UPDATE) frames/.test(normalized) ||
      /^(?:DELETE|UPDATE) FROM frames/.test(normalized)
    ) {
      return result([], 1);
    }
    return result([]);
  }
}

function result(rows: readonly Record<string, unknown>[], rowCount = rows.length): QueryResult {
  return {
    command: "SELECT",
    rowCount,
    oid: 0,
    fields: [],
    rows: [...rows],
  } as QueryResult;
}

function dataQueries(pool: FakePool): RecordedQuery[] {
  return pool.queries.filter(({ sql }) => /\b(?:FROM|INTO|UPDATE|DELETE FROM) frames\b/.test(sql));
}

function assertExplicitScope(query: RecordedQuery): void {
  if (query.sql.startsWith("INSERT INTO frames")) {
    assert.match(query.sql, /tenant_id, workspace_id, creator_principal_id, scope_version/);
    assert.match(query.sql, /ON CONFLICT \(tenant_id, workspace_id, id\)/);
    assert.match(query.sql, /current_setting\('lex\.principal_id', true\) = \$3/);
  } else {
    assert.match(query.sql, /tenant_id = \$1::uuid/);
    assert.match(query.sql, /workspace_id = \$2::uuid/);
    assert.match(query.sql, /current_setting\('lex\.principal_id', true\) = \$3/);
  }
  assert.deepEqual(query.values.slice(0, 3), [IDS.tenantA, IDS.workspaceA, IDS.principalA]);
}

describe("PostgresScopedFrameStoreBackend", () => {
  test("covers every normal operation with transaction-local scope and explicit predicates", async () => {
    const pool = new FakePool();
    const backend = new PostgresScopedFrameStoreBackend(pool as unknown as Pool);
    const store = backend.bind(scope());

    await store.saveFrame(frame("one"));
    assert.equal((await store.saveFrames([frame("two"), frame("three")])).length, 2);
    assert.equal(await store.getFrameById("one"), null);
    assert.deepEqual(await store.searchFrames({ query: "scope" }), []);
    assert.deepEqual((await store.listFrames({ limit: 2 })).frames, []);
    assert.equal(await store.updateFrame("one", { jira: "LEX-761" }), true);
    assert.equal(await store.deleteFrame("one"), true);
    assert.equal(await store.deleteFramesBefore(new Date("2026-07-18T00:00:00.000Z")), 1);
    assert.equal(await store.deleteFramesByBranch("agent/761-postgres-rls"), 1);
    assert.equal(await store.deleteFramesByModule("memory/store/postgres"), 1);
    assert.equal(await store.getFrameCount(), 0);
    assert.deepEqual(await store.getStats(true), {
      totalFrames: 1,
      thisWeek: 1,
      thisMonth: 1,
      oldestDate: null,
      newestDate: null,
      moduleDistribution: { "memory/store/postgres": 1 },
    });
    assert.deepEqual(await store.getTurnCostMetrics("2026-07-18T00:00:00.000Z"), {
      frameCount: 0,
      estimatedTokens: 0,
      prompts: 0,
    });
    assert.equal(await store.purgeSuperseded(), 1);

    const scopedQueries = dataQueries(pool);
    assert.ok(scopedQueries.length >= 16);
    for (const query of scopedQueries) assertExplicitScope(query);
    const settings = pool.queries.filter(({ sql }) => sql.includes("set_config('lex.tenant_id'"));
    assert.equal(settings.length, 14);
    assert.ok(
      settings.every(
        ({ values }) => values.join("/") === [IDS.tenantA, IDS.workspaceA, IDS.principalA].join("/")
      )
    );
    assert.equal(pool.queries.filter(({ sql }) => sql === "BEGIN").length, 14);
    assert.equal(pool.queries.filter(({ sql }) => sql === "COMMIT").length, 14);
    assert.equal(
      pool.queries.filter(({ sql }) => sql.startsWith("RESET lex.tenant_id")).length,
      28
    );
    assert.ok(pool.queries.some(({ sql }) => sql === "SET TRANSACTION READ ONLY"));
    assert.equal(pool.releases.filter((value) => value !== undefined).length, 0);

    await backend.close();
  });

  test("alternates scopes through one pooled client without carrying settings", async () => {
    const pool = new FakePool();
    const backend = new PostgresScopedFrameStoreBackend(pool as unknown as Pool);
    const tenantA = backend.bind(scope());
    const workspaceB = backend.bind(scope(IDS.tenantA, IDS.workspaceB, IDS.principalB));
    const tenantB = backend.bind(scope(IDS.tenantB, IDS.workspaceA, IDS.principalA));

    await tenantA.getFrameCount();
    await workspaceB.getFrameCount();
    await tenantB.getFrameCount();
    await tenantA.getFrameCount();

    const values = pool.queries
      .filter(({ sql }) => sql.includes("set_config('lex.tenant_id'"))
      .map(({ values }) => values);
    assert.deepEqual(values, [
      [IDS.tenantA, IDS.workspaceA, IDS.principalA],
      [IDS.tenantA, IDS.workspaceB, IDS.principalB],
      [IDS.tenantB, IDS.workspaceA, IDS.principalA],
      [IDS.tenantA, IDS.workspaceA, IDS.principalA],
    ]);
    assert.equal(pool.queries.filter(({ sql }) => sql.startsWith("RESET lex.tenant_id")).length, 8);
  });

  test("rolls back, clears scope, and releases safely after errors or cancellation", async () => {
    for (const failure of [/SELECT COUNT\(\*\) AS count FROM frames/, /INSERT INTO frames/]) {
      const pool = new FakePool();
      pool.failWhen = failure;
      const backend = new PostgresScopedFrameStoreBackend(pool as unknown as Pool);
      const store = backend.bind(scope());
      const operation = failure.source.includes("COUNT")
        ? () => store.getFrameCount()
        : () => store.saveFrame(frame("cancelled"));
      await assert.rejects(operation, /injected PostgreSQL failure/);
      assert.equal(pool.queries.filter(({ sql }) => sql === "ROLLBACK").length, 1);
      assert.equal(pool.queries.filter(({ sql }) => sql === "COMMIT").length, 0);
      assert.equal(
        pool.queries.filter(({ sql }) => sql.startsWith("RESET lex.tenant_id")).length,
        2
      );
      assert.equal(pool.releases.at(-1), undefined);
    }
  });

  test("rejects malformed, expired, and attenuated scope before checking out a client", async () => {
    const pool = new FakePool();
    const backend = new PostgresScopedFrameStoreBackend(pool as unknown as Pool, {
      now: () => new Date("2026-07-18T03:00:00.000Z"),
    });
    assert.throws(
      () => backend.bind(scope("not-a-uuid")),
      (error: unknown) =>
        error instanceof ScopedFrameStoreError &&
        error.code === SCOPED_FRAME_STORE_ERROR_CODES.INVALID_SCOPE
    );
    assert.throws(
      () =>
        backend.bind(
          scope(IDS.tenantA, IDS.workspaceA, IDS.principalA, [], {
            expiresAt: "2026-07-18T02:00:00.000Z",
          })
        ),
      (error: unknown) =>
        error instanceof ScopedFrameStoreError &&
        error.code === SCOPED_FRAME_STORE_ERROR_CODES.SCOPE_EXPIRED
    );
    const readOnly = backend.bind(
      scope(IDS.tenantA, IDS.workspaceA, IDS.principalA, [FRAME_STORE_CAPABILITIES.READ])
    );
    await assert.rejects(
      () => readOnly.saveFrame(frame("forbidden")),
      (error: unknown) =>
        error instanceof ScopedFrameStoreError &&
        error.code === SCOPED_FRAME_STORE_ERROR_CODES.CAPABILITY_MISSING
    );
    assert.equal(pool.queries.length, 0);
  });

  test("fails closed when the runtime role can bypass forced RLS", async () => {
    for (const unsafe of ["role_is_superuser", "role_bypasses_rls", "role_owns_frames"] as const) {
      const pool = new FakePool();
      pool.runtimeBoundary = { ...pool.runtimeBoundary, [unsafe]: true };
      const backend = new PostgresScopedFrameStoreBackend(pool as unknown as Pool);
      const store = backend.bind(scope());
      await assert.rejects(() => store.getFrameCount(), /non-owner, non-superuser/);
      assert.equal(dataQueries(pool).length, 0);
    }
  });
});

describe("PostgreSQL FrameStore administration", () => {
  test("keeps migration and admin APIs off the runtime binder", () => {
    const pool = new FakePool();
    const runtime = new PostgresScopedFrameStoreBackend(pool as unknown as Pool);
    const admin = new PostgresFrameStoreAdministration(pool as unknown as Pool);
    assert.equal("migrate" in runtime, false);
    assert.equal("bindAdmin" in runtime, false);
    assert.equal("bind" in admin, false);
    assert.equal("migrate" in admin, true);
  });

  test("requires frame:admin and keeps ownership inspection explicitly scoped", async () => {
    const pool = new FakePool();
    const adminBackend = new PostgresFrameStoreAdministration(pool as unknown as Pool);
    assert.throws(
      () => adminBackend.bindAdmin(scope()),
      (error: unknown) =>
        error instanceof ScopedFrameStoreError &&
        error.code === SCOPED_FRAME_STORE_ERROR_CODES.CAPABILITY_MISSING
    );
    const admin = adminBackend.bindAdmin(
      scope(IDS.tenantA, IDS.workspaceA, IDS.principalA, [FRAME_STORE_CAPABILITIES.ADMIN])
    );
    assert.equal(await admin.getFrameOwnership("unknown"), null);
    const query = dataQueries(pool).at(-1);
    assert.ok(query);
    assertExplicitScope(query);
  });

  test("dry-run reports quarantined v1 rows without starting a transaction", async () => {
    const queries: RecordedQuery[] = [];
    const client = {
      query: async (sql: string) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        queries.push({ sql: normalized, values: [] });
        if (normalized.includes("to_regclass('lex_frame_store_migrations')"))
          return result([{ exists: "lex_frame_store_migrations" }]);
        if (normalized.includes("MAX(version)")) return result([{ version: 1 }]);
        if (normalized.includes("COUNT(*)")) {
          return result([{ count: "7", quarantine_exists: null }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;
    const plan = await planPostgresFrameStoreMigration(client);
    assert.deepEqual(plan, {
      currentVersion: 1,
      targetVersion: 2,
      pendingVersions: [2],
      unownedFrameCount: 7,
      quarantineTableConflict: false,
    });
    assert.equal(
      queries.some(({ sql }) => /^(?:BEGIN|CREATE|ALTER|INSERT|DELETE)/.test(sql)),
      false
    );
  });

  test("migration is transactional, quarantines unowned rows, and installs forced RLS", async () => {
    const queries: RecordedQuery[] = [];
    const client = {
      query: async (sql: string, values: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        queries.push({ sql: normalized, values: [...values] });
        if (normalized.includes("MAX(version)")) return result([{ version: 0 }]);
        return result([]);
      },
    } as unknown as PoolClient;
    await migratePostgresFrameStore(client);
    assert.equal(queries[0]?.sql, "BEGIN");
    assert.equal(queries.at(-1)?.sql, "COMMIT");
    const migrationSql = queries.map(({ sql }) => sql).join("\n");
    assert.match(migrationSql, /lex_frame_store_unowned_frames_v1/);
    assert.doesNotMatch(
      migrationSql,
      /CREATE TABLE IF NOT EXISTS lex_frame_store_unowned_frames_v1/
    );
    assert.match(migrationSql, /PRIMARY KEY \(tenant_id, workspace_id, id\)/);
    assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/);
    assert.match(migrationSql, /current_setting\('lex\.principal_id', true\)/);
    assert.match(migrationSql, /CREATE POLICY lex_frames_runtime_select/);
    assert.match(migrationSql, /CREATE POLICY lex_frames_runtime_insert/);
    assert.match(migrationSql, /creator_principal_id::text = current_setting/);
    assert.match(migrationSql, /CREATE TRIGGER frames_ownership_immutable/);
    assert.match(migrationSql, /REVOKE ALL ON TABLE frames FROM PUBLIC/);
  });

  test("dry-run reports a conflicting pre-existing quarantine table", async () => {
    const client = {
      query: async (sql: string) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        if (normalized.includes("to_regclass('lex_frame_store_migrations')")) {
          return result([{ exists: "lex_frame_store_migrations" }]);
        }
        if (normalized.includes("MAX(version)")) return result([{ version: 1 }]);
        if (normalized.includes("COUNT(*)")) {
          return result([{ count: "7", quarantine_exists: "lex_frame_store_unowned_frames_v1" }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const plan = await planPostgresFrameStoreMigration(client);
    assert.equal(plan.quarantineTableConflict, true);
  });

  test("migration failure rolls back the complete schema change", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        queries.push(normalized);
        if (normalized.includes("MAX(version)")) return result([{ version: 1 }]);
        if (normalized.includes("lex_frame_store_unowned_frames_v1")) {
          throw new Error("injected migration failure");
        }
        return result([]);
      },
    } as unknown as PoolClient;
    await assert.rejects(() => migratePostgresFrameStore(client), /injected migration failure/);
    assert.equal(queries[0], "BEGIN");
    assert.equal(queries.at(-1), "ROLLBACK");
    assert.equal(queries.includes("COMMIT"), false);
  });
});
