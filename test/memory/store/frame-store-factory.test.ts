import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  createFrameStore,
  POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION,
  PostgresFrameStore,
  resolveFrameStoreBackend,
  SqliteFrameStore,
} from "@app/memory/store/index.js";
import type { Pool, PoolClient } from "pg";
import type { Frame } from "../../../src/memory/frames/types.js";
import { migratePostgresCompatibilityFrameStore } from "@app/memory/store/postgres/compatibility-migrations.js";

const originalStore = process.env.LEX_STORE;
const originalUrl = process.env.LEX_DATABASE_URL;
const originalPassword = process.env.LEX_POSTGRES_PASSWORD;

afterEach(() => {
  if (originalStore === undefined) delete process.env.LEX_STORE;
  else process.env.LEX_STORE = originalStore;
  if (originalUrl === undefined) delete process.env.LEX_DATABASE_URL;
  else process.env.LEX_DATABASE_URL = originalUrl;
  if (originalPassword === undefined) delete process.env.LEX_POSTGRES_PASSWORD;
  else process.env.LEX_POSTGRES_PASSWORD = originalPassword;
});

test("FrameStore factory defaults to SQLite", async () => {
  delete process.env.LEX_STORE;
  const store = createFrameStore(":memory:");
  assert.ok(store instanceof SqliteFrameStore);
  await store.close();
});

test("FrameStore factory selects PostgreSQL and redacts its password", async () => {
  process.env.LEX_STORE = "postgres";
  process.env.LEX_DATABASE_URL =
    "postgresql://lex:contract-secret@127.0.0.1:5433/lex?sslmode=disable";
  const store = createFrameStore();
  assert.ok(store instanceof PostgresFrameStore);
  const metadata = store.getMetadata();
  assert.equal(metadata.location, "postgresql://lex@127.0.0.1:5433/lex");
  assert.ok(!JSON.stringify(metadata).includes("contract-secret"));
  await store.close();
});

test("FrameStore factory preserves explicit PostgreSQL read-only mode", async () => {
  process.env.LEX_STORE = "postgres";
  process.env.LEX_DATABASE_URL = "postgresql://lex@127.0.0.1:5433/lex";
  const store = createFrameStore(undefined, { accessMode: "read-only" });
  assert.ok(store instanceof PostgresFrameStore);
  assert.equal(store.accessMode, "read-only");
  await store.close();
});

test("FrameStore factory forwards an explicit PostgreSQL schema into backend identity", async () => {
  process.env.LEX_STORE = "postgres";
  process.env.LEX_DATABASE_URL = "postgresql://lex@127.0.0.1:5433/lex";
  const publicStore = createFrameStore();
  const scopedStore = createFrameStore(undefined, { schema: "lex_compat" });
  assert.notEqual(publicStore.getMetadata().identity, scopedStore.getMetadata().identity);
  await publicStore.close();
  await scopedStore.close();
});

test("FrameStore factory accepts a password-free URL with a separate secret", async () => {
  process.env.LEX_STORE = "postgres";
  process.env.LEX_DATABASE_URL = "postgresql://lex@127.0.0.1:5433/lex";
  process.env.LEX_POSTGRES_PASSWORD = "separate-contract-secret";
  const store = createFrameStore();
  const metadata = store.getMetadata();
  assert.equal(metadata.location, "postgresql://lex@127.0.0.1:5433/lex");
  assert.ok(!JSON.stringify(metadata).includes("separate-contract-secret"));
  await store.close();
});

test("FrameStore factory rejects unknown backends and missing PostgreSQL URLs", () => {
  assert.throws(() => resolveFrameStoreBackend("mysql"), /Expected sqlite or postgres/);
  process.env.LEX_STORE = "postgres";
  delete process.env.LEX_DATABASE_URL;
  assert.throws(() => createFrameStore(), /LEX_DATABASE_URL is required/);
});

test("PostgresFrameStore health checks retry after transient connection failures", async () => {
  let attempts = 0;
  const pool = {
    connect: async () => {
      attempts++;
      throw new Error("connection unavailable");
    },
  } as unknown as Pool;
  const store = new PostgresFrameStore(pool);
  assert.equal((await store.getHealth()).healthy, false);
  assert.equal((await store.getHealth()).healthy, false);
  assert.equal(attempts, 2);
  await store.close();
});

test("PostgresFrameStore read-only mode validates schema without migrations and rejects writes", async () => {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [{ version: POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION }] };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [{ count: "0" }] };
    },
  } as unknown as Pool;

  const store = new PostgresFrameStore(pool, { accessMode: "read-only" });
  assert.equal(await store.getFrameCount(), 0);
  assert.ok(!queries.some((sql) => /\b(?:BEGIN|CREATE|INSERT|ALTER)\b/i.test(sql)));
  await assert.rejects(store.deleteFrame("frame-1"), /read-only/i);
  await store.close();
});

test("PostgreSQL compatibility migration uses distinct objects and safely adopts a v1 source", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (
        normalized.includes("SELECT MAX(version)") &&
        normalized.includes('"lex_compat"."lex_compat_frame_store_migrations"')
      ) {
        return { rows: [{ version: 0 }], rowCount: 1 };
      }
      if (normalized.startsWith("SELECT to_regclass")) {
        return {
          rows: [
            {
              frames_exists: "lex_compat.frames",
              migrations_exists: "lex_compat.lex_frame_store_migrations",
              has_tenant_id: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        normalized.includes("SELECT MAX(version)") &&
        normalized.includes('"lex_compat"."lex_frame_store_migrations"')
      ) {
        return { rows: [{ version: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;

  await migratePostgresCompatibilityFrameStore(client, "lex_compat");

  const sql = queries.map(({ sql }) => sql).join("\n");
  assert.match(sql, /"lex_compat"\."lex_compat_frame_store_migrations"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "lex_compat"\."lex_compat_frames"/);
  assert.match(sql, /PRIMARY KEY/);
  assert.match(sql, /FROM "lex_compat"\."frames" AS source/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(sql, /ALTER TABLE "lex_compat"\."frames"/);
  assert.equal(queries[0]?.sql, "BEGIN");
  assert.equal(queries.at(-1)?.sql, "COMMIT");
});

test("PostgreSQL compatibility migration never adopts a scoped ownership table", async () => {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);
      if (
        normalized.includes("SELECT MAX(version)") &&
        normalized.includes("lex_compat_frame_store_migrations")
      ) {
        return { rows: [{ version: 0 }], rowCount: 1 };
      }
      if (normalized.startsWith("SELECT to_regclass")) {
        return {
          rows: [
            {
              frames_exists: "lex_compat.frames",
              migrations_exists: "lex_compat.lex_frame_store_migrations",
              has_tenant_id: true,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;

  await migratePostgresCompatibilityFrameStore(client, "lex_compat");

  assert.equal(
    queries.some((sql) => sql.includes('"frames" AS source')),
    false
  );
  assert.equal(queries.at(-1), "COMMIT");
});

test("PostgresFrameStore pins compatibility CRUD and durable Frame metadata to its schema", async () => {
  const frame: Frame = {
    id: "frame-complete",
    timestamp: "2026-07-18T12:00:00.000Z",
    branch: "main",
    jira: "LEX-768",
    module_scope: ["memory/store"],
    summary_caption: "Complete durable frame",
    reference_point: "compatibility schema boundary",
    status_snapshot: { next_action: "ship", blockers: [] },
    keywords: ["postgres"],
    atlas_frame_id: "atlas-1",
    feature_flags: ["lex3"],
    permissions: ["frame:read"],
    module_attribution: { mode: "explicit", confidence: "high", evidence: ["test"] },
    image_ids: ["image-1"],
    runId: "run-1",
    planHash: "sha256:plan",
    spend: { prompts: 2, tokens_estimated: 50 },
    userId: "user-1",
    executorRole: "reviewer",
    toolCalls: ["read", "write"],
    guardrailProfile: "strict",
    turnCost: {
      components: {
        latency: 1,
        contextReset: 2,
        renegotiation: 3,
        tokenBloat: 4,
        attentionSwitch: 5,
      },
      weights: { lambda: 0.1, gamma: 0.2, rho: 0.3, tau: 0.1, alpha: 0.3 },
      weightedScore: 3,
      sessionId: "session-1",
      timestamp: "2026-07-18T12:00:00.000Z",
    },
    capabilityTier: "senior",
    taskComplexity: { tier: "senior", assignedModel: "test-model", retryCount: 0 },
    superseded_by: "frame-next",
    merged_from: ["frame-old"],
    contradiction_resolution: {
      type: "scope",
      contradicts_frame_id: "frame-prior",
      scope: "workspace",
      note: "intentional",
    },
  };
  const row = {
    id: frame.id,
    timestamp: frame.timestamp,
    branch: frame.branch,
    jira: frame.jira ?? null,
    module_scope: frame.module_scope,
    summary_caption: frame.summary_caption,
    reference_point: frame.reference_point,
    status_snapshot: frame.status_snapshot,
    keywords: frame.keywords ?? null,
    atlas_frame_id: frame.atlas_frame_id ?? null,
    feature_flags: frame.feature_flags ?? null,
    permissions: frame.permissions ?? null,
    module_attribution: frame.module_attribution ?? null,
    run_id: frame.runId ?? null,
    plan_hash: frame.planHash ?? null,
    spend: frame.spend ?? null,
    user_id: frame.userId ?? null,
    superseded_by: frame.superseded_by ?? null,
    merged_from: frame.merged_from ?? null,
    frame_metadata: {
      schemaVersion: 1,
      image_ids: frame.image_ids,
      executorRole: frame.executorRole,
      toolCalls: frame.toolCalls,
      guardrailProfile: frame.guardrailProfile,
      turnCost: frame.turnCost,
      capabilityTier: frame.capabilityTier,
      taskComplexity: frame.taskComplexity,
      contradiction_resolution: frame.contradiction_resolution,
    },
  };
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const record = (sql: string, params: readonly unknown[] = []) => {
    queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
  };
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      record(sql, params);
      if (sql.includes("SELECT MAX(version)")) {
        return {
          rows: [{ version: POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION }],
          rowCount: 1,
        };
      }
      if (sql.includes("FOR UPDATE")) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async (sql: string, params: readonly unknown[] = []) => {
      record(sql, params);
      if (sql.includes("SELECT") && sql.includes('"lex_compat"."lex_compat_frames"')) {
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pool;

  const store = new PostgresFrameStore(pool, { schema: "lex_compat" });
  await store.saveFrame(frame);
  assert.deepEqual(await store.getFrameById(frame.id), frame);
  assert.equal(await store.updateFrame(frame.id, { guardrailProfile: "updated" }), true);

  const frameSql = queries.filter(({ sql }) => sql.includes('"lex_compat"."lex_compat_frames"'));
  assert.ok(frameSql.length > 0);
  assert.ok(frameSql.every(({ sql }) => sql.includes('"lex_compat"."lex_compat_frames"')));
  const writes = queries.filter(({ sql }) => sql.startsWith("INSERT INTO"));
  assert.deepEqual(
    (writes[0]?.params[19] as { guardrailProfile?: string }).guardrailProfile,
    "strict"
  );
  assert.deepEqual(
    (writes.at(-1)?.params[19] as { guardrailProfile?: string }).guardrailProfile,
    "updated"
  );
  await store.close();
});
