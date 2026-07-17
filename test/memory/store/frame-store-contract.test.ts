import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { Frame } from "@app/memory/frames/types.js";
import type { FrameStore } from "@app/memory/store/frame-store.js";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";
import { PostgresFrameStore } from "@app/memory/store/postgres/index.js";

const postgresUrl = process.env.LEX_TEST_DATABASE_URL;
const postgresSchema = `lex_contract_${process.pid}_${randomBytes(4).toString("hex")}`;
let isolatedPostgresUrl: string | undefined;
let postgresAdmin: Pool | undefined;

if (postgresUrl) {
  const adminUrl = new URL(postgresUrl);
  if (!adminUrl.password && process.env.LEX_POSTGRES_PASSWORD) {
    adminUrl.password = process.env.LEX_POSTGRES_PASSWORD;
  }
  postgresAdmin = new Pool({ connectionString: adminUrl.toString() });
  const testUrl = new URL(postgresUrl);
  testUrl.searchParams.set("options", `-c search_path=${postgresSchema}`);
  isolatedPostgresUrl = testUrl.toString();
}

before(async () => {
  if (postgresAdmin) await postgresAdmin.query(`CREATE SCHEMA "${postgresSchema}"`);
});

after(async () => {
  if (!postgresAdmin) return;
  await postgresAdmin.query(`DROP SCHEMA IF EXISTS "${postgresSchema}" CASCADE`);
  await postgresAdmin.end();
});

function frame(id: string, timestamp: string, overrides: Partial<Frame> = {}): Frame {
  return {
    id,
    timestamp,
    branch: "contract-test",
    module_scope: ["services/frame-store"],
    summary_caption: `FrameStore contract ${id}`,
    reference_point: "cross-backend persistence",
    status_snapshot: { next_action: "verify searchable migration seam" },
    keywords: ["contract", "storage"],
    ...overrides,
  };
}

function frameStoreContract(
  name: string,
  expectedBackend: "memory" | "sqlite" | "postgres",
  create: () => FrameStore,
  skip = false
): void {
  const suite = skip ? describe.skip : describe;
  suite(`${name} FrameStore contract`, () => {
    let store: FrameStore;

    beforeEach(() => {
      store = create();
    });

    afterEach(async () => {
      await store.deleteFramesByBranch("contract-test").catch(() => undefined);
      await store.close();
    });

    test("reports credential-free backend metadata", () => {
      const metadata = store.getMetadata();
      assert.equal(metadata.backend, expectedBackend);
      assert.ok(metadata.identity);
      assert.ok(!metadata.location.includes("contract-secret"));
    });

    test("reports live health and an explicit schema version", async () => {
      const health = await store.getHealth();
      assert.equal(health.healthy, true);
      assert.notEqual(health.schemaVersion, "unknown");
    });

    test("supports idempotent CRUD and targeted updates", async () => {
      const first = frame(`${name}-crud`, "2026-01-01T00:00:00.000Z");
      await store.saveFrame(first);
      const retrieved = await store.getFrameById(first.id);
      assert.equal(retrieved?.id, first.id);
      assert.equal(retrieved?.summary_caption, first.summary_caption);
      assert.deepEqual(retrieved?.module_scope, first.module_scope);
      assert.deepEqual(retrieved?.keywords, first.keywords);

      await store.saveFrame({ ...first, summary_caption: "upserted" });
      assert.equal((await store.getFrameById(first.id))?.summary_caption, "upserted");
      assert.equal(await store.updateFrame(first.id, { jira: "LEX-STORE" }), true);
      assert.equal((await store.getFrameById(first.id))?.jira, "LEX-STORE");
      assert.equal(await store.deleteFrame(first.id), true);
      assert.equal(await store.deleteFrame(first.id), false);
    });

    test("keeps batch validation all-or-nothing", async () => {
      const valid = frame(`${name}-batch-valid`, "2026-01-02T00:00:00.000Z");
      const invalid = {
        ...valid,
        id: `${name}-batch-invalid`,
        status_snapshot: undefined,
      } as unknown as Frame;
      const result = await store.saveFrames([valid, invalid]);
      assert.equal(
        result.every((entry) => !entry.success),
        true
      );
      assert.equal(await store.getFrameById(valid.id), null);
    });

    test("provides search and cursor-pagination parity", async () => {
      const frames = [
        frame(`${name}-one`, "2026-01-03T00:00:00.000Z", {
          summary_caption: "Credential rotation complete",
        }),
        frame(`${name}-two`, "2026-01-04T00:00:00.000Z", {
          status_snapshot: { next_action: "Check credential handoff" },
        }),
        frame(`${name}-three`, "2026-01-05T00:00:00.000Z", {
          summary_caption: "Unrelated deployment",
          status_snapshot: { next_action: "Ship release" },
        }),
      ];
      assert.equal(
        (await store.saveFrames(frames)).every((entry) => entry.success),
        true
      );

      const allTerms = await store.searchFrames({ query: "credential rotation", mode: "all" });
      assert.deepEqual(
        allTerms.map((item) => item.id),
        [`${name}-one`]
      );
      const anyTerm = await store.searchFrames({ query: "credential release", mode: "any" });
      assert.deepEqual(
        new Set(anyTerm.map((item) => item.id)),
        new Set([`${name}-one`, `${name}-two`, `${name}-three`])
      );
      const prefix = await store.searchFrames({ query: "stor" });
      assert.equal(prefix.length, 3);

      const firstPage = await store.listFrames({ limit: 2 });
      assert.equal(firstPage.frames.length, 2);
      assert.equal(firstPage.page.hasMore, true);
      assert.ok(firstPage.page.nextCursor);
      const secondPage = await store.listFrames({
        limit: 2,
        cursor: firstPage.page.nextCursor ?? undefined,
      });
      assert.equal(secondPage.frames.length, 1);
      assert.equal(
        new Set([...firstPage.frames, ...secondPage.frames].map((item) => item.id)).size,
        3
      );
    });

    test("combines module, user, and time filters", async () => {
      await store.saveFrames([
        frame(`${name}-filter-old`, "2026-02-01T00:00:00.000Z", {
          module_scope: ["services/alpha"],
          userId: "user-a",
        }),
        frame(`${name}-filter-match`, "2026-02-02T00:00:00.000Z", {
          module_scope: ["services/alpha", "services/beta"],
          userId: "user-a",
        }),
        frame(`${name}-filter-user`, "2026-02-02T00:00:00.000Z", {
          module_scope: ["services/alpha"],
          userId: "user-b",
        }),
      ]);
      const results = await store.searchFrames({
        moduleScope: ["services/beta"],
        userId: "user-a",
        since: new Date("2026-02-01T12:00:00.000Z"),
        until: new Date("2026-02-02T12:00:00.000Z"),
      });
      assert.deepEqual(
        results.map((item) => item.id),
        [`${name}-filter-match`]
      );
    });

    test("supports statistics and bulk deletion", async () => {
      const frames = [
        frame(`${name}-stats-one`, new Date().toISOString(), {
          spend: { tokens_estimated: 10, prompts: 2 },
        }),
        frame(`${name}-stats-two`, new Date().toISOString(), {
          module_scope: ["services/frame-store", "services/postgres"],
          spend: { tokens_estimated: 20, prompts: 3 },
          superseded_by: `${name}-stats-one`,
        }),
      ];
      await store.saveFrames(frames);
      const stats = await store.getStats(true);
      assert.equal(stats.totalFrames, 2);
      assert.equal(stats.moduleDistribution?.["services/frame-store"], 2);
      assert.deepEqual(await store.getTurnCostMetrics(), {
        frameCount: 2,
        estimatedTokens: 30,
        prompts: 5,
      });
      assert.equal(await store.purgeSuperseded(), 1);
      assert.equal(await store.deleteFramesByModule("services/frame-store"), 1);
      assert.equal(await store.getFrameCount(), 0);
    });
  });
}

frameStoreContract("memory", "memory", () => new MemoryFrameStore());
frameStoreContract("sqlite", "sqlite", () => new SqliteFrameStore(":memory:"));
frameStoreContract(
  "postgres",
  "postgres",
  () => new PostgresFrameStore(isolatedPostgresUrl),
  !isolatedPostgresUrl
);
