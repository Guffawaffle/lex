import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3-multiple-ciphers";

import {
  SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION,
  SqliteBehavioralStoreBackend,
  behavioralContentDigest,
} from "@app/memory/store/index.js";
import {
  behavioralBinding,
  BEHAVIORAL_TEST_IDS,
  exerciseBehavioralStoreConformance,
  exerciseBehavioralStoreTopology,
} from "../behavioral-store-conformance.js";
import {
  inventorySqliteBehavioralStore,
  sqliteBehavioralRollbackSql,
} from "@app/memory/store/sqlite/behavioral-migration.js";
import type { TenantId } from "@app/shared/runtime-scope/index.js";

const paths: string[] = [];

function databasePath(label: string): string {
  const path = join(
    tmpdir(),
    `lex-behavior-${label}-${process.pid}-${Date.now()}-${paths.length}.db`
  );
  paths.push(path);
  return path;
}

afterEach(() => {
  for (const path of paths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  }
});

describe("SqliteBehavioralStoreBackend", () => {
  test("passes shared behavioral revision, receipt, and attenuation conformance", async () => {
    const backend = new SqliteBehavioralStoreBackend(databasePath("conformance"), {
      now: () => new Date("2026-07-22T01:00:00.000Z"),
      baselines: [
        {
          source: "curated-global",
          baselineId: "lexsona-reviewed",
          revision: "1",
          contentDigest: behavioralContentDigest({ rules: ["never leak authority"] }),
          content: { rules: ["never leak authority"] },
          reviewedAt: "2026-07-21T00:00:00.000Z",
        },
        {
          source: "tenant-default",
          tenantId: BEHAVIORAL_TEST_IDS.tenantPlatform as TenantId,
          baselineId: "platform-default",
          revision: "1",
          contentDigest: behavioralContentDigest({ rules: ["platform-only"] }),
          content: { rules: ["platform-only"] },
          reviewedAt: "2026-07-21T00:00:00.000Z",
        },
        {
          source: "tenant-default",
          tenantId: BEHAVIORAL_TEST_IDS.tenantStfc as TenantId,
          baselineId: "stfc-default",
          revision: "1",
          contentDigest: behavioralContentDigest({ rules: ["stfc-only"] }),
          content: { rules: ["stfc-only"] },
          reviewedAt: "2026-07-21T00:00:00.000Z",
        },
      ],
    });
    await exerciseBehavioralStoreConformance(backend, "sqlite");
    assert.deepEqual(
      (await backend.bindRead(behavioralBinding()).getSnapshot()).baselines.map(
        ({ baselineId }) => baselineId
      ),
      ["lexsona-reviewed", "platform-default"]
    );
    assert.deepEqual(
      (
        await backend
          .bindRead(
            behavioralBinding(
              BEHAVIORAL_TEST_IDS.tenantStfc,
              BEHAVIORAL_TEST_IDS.workspaceMod,
              BEHAVIORAL_TEST_IDS.repositoryMod,
              BEHAVIORAL_TEST_IDS.instanceMod
            )
          )
          .getSnapshot()
      ).baselines.map(({ baselineId }) => baselineId),
      ["lexsona-reviewed", "stfc-default"]
    );
    await backend.close();
  });

  test("proves the canonical two-tenant/five-workspace topology with colliding IDs", async () => {
    const backend = new SqliteBehavioralStoreBackend(databasePath("topology"));
    await exerciseBehavioralStoreTopology(backend, "sqlite");
    await backend.close();
  });

  test("keeps legacy unowned LexSona rows non-authoritative and untouched", async () => {
    const path = databasePath("legacy");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE lexsona_behavior_rules (
        rule_id TEXT PRIMARY KEY,
        text TEXT NOT NULL
      );
      INSERT INTO lexsona_behavior_rules VALUES ('legacy-global', 'must not be adopted');
    `);
    legacy.close();

    const backend = new SqliteBehavioralStoreBackend(path);
    assert.equal(await backend.bindRead(behavioralBinding()).getRule("legacy-global"), null);
    await backend.close();

    const inspected = new Database(path, { readonly: true });
    assert.deepEqual(inspected.prepare("SELECT rule_id, text FROM lexsona_behavior_rules").all(), [
      { rule_id: "legacy-global", text: "must not be adopted" },
    ]);
    const version = inspected
      .prepare("SELECT MAX(version) AS version FROM lex_behavioral_store_migrations")
      .get() as { version: number };
    assert.equal(version.version, SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION);
    inspected.close();

    assert.deepEqual(inventorySqliteBehavioralStore(path), {
      schemaVersion: SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION,
      personaRevisionCount: 0,
      ruleRevisionCount: 0,
      evidenceCount: 0,
      promotionCount: 0,
      legacyBehaviorRuleTablePresent: true,
      legacyPersonaTablePresent: false,
      legacyRowsAdopted: 0,
    });

    const rollback = new Database(path);
    rollback.exec(sqliteBehavioralRollbackSql());
    assert.deepEqual(rollback.prepare("SELECT rule_id, text FROM lexsona_behavior_rules").all(), [
      { rule_id: "legacy-global", text: "must not be adopted" },
    ]);
    assert.equal(
      rollback
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'lex_behavioral_%'"
        )
        .get().count,
      0
    );
    rollback.close();
  });

  test("rejects invalid baseline digests before opening service", () => {
    assert.throws(
      () =>
        new SqliteBehavioralStoreBackend(databasePath("baseline"), {
          baselines: [
            {
              source: "tenant-default",
              tenantId: BEHAVIORAL_TEST_IDS.tenantPlatform as TenantId,
              baselineId: "tenant-default",
              revision: "1",
              contentDigest: behavioralContentDigest("different"),
              content: { actual: true },
              reviewedAt: "2026-07-21T00:00:00.000Z",
            },
          ],
        }),
      /content digest/
    );
  });

  test("fails closed on a future behavioral schema without rewriting the ledger", () => {
    const path = databasePath("future");
    const future = new Database(path);
    future.exec(`
      CREATE TABLE lex_behavioral_store_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      INSERT INTO lex_behavioral_store_migrations VALUES (2, '2026-07-22T00:00:00.000Z');
    `);
    future.close();
    assert.throws(() => new SqliteBehavioralStoreBackend(path), /newer than supported/);
    const inspected = new Database(path, { readonly: true });
    assert.deepEqual(
      inspected.prepare("SELECT version FROM lex_behavioral_store_migrations").all(),
      [{ version: 2 }]
    );
    inspected.close();
  });
});
