import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  createFrameStore,
  POSTGRES_FRAME_STORE_SCHEMA_VERSION,
  PostgresFrameStore,
  resolveFrameStoreBackend,
  SqliteFrameStore,
} from "@app/memory/store/index.js";
import type { Pool } from "pg";

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
      return { rows: [{ version: POSTGRES_FRAME_STORE_SCHEMA_VERSION }] };
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
