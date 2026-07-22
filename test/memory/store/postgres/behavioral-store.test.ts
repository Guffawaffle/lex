import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import {
  POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION,
  type BehavioralStoreBinder,
} from "@app/memory/store/index.js";
import { PostgresBehavioralStoreBackend } from "@app/memory/store/postgres/behavioral-store.js";
import {
  planPostgresBehavioralStoreMigration,
  postgresBehavioralMigrationSql,
  postgresBehavioralRollbackSql,
} from "@app/memory/store/postgres/behavioral-migrations.js";
import { behavioralBinding, BEHAVIORAL_TEST_IDS } from "../behavioral-store-conformance.js";

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

function result<T extends QueryResultRow>(
  rows: readonly T[],
  rowCount = rows.length
): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount,
    oid: 0,
    fields: [],
    rows: [...rows],
  };
}

class FakePool {
  readonly queries: RecordedQuery[] = [];
  readonly releases: Array<Error | boolean | undefined> = [];
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
    if (normalized.includes("protected_count")) {
      return result([
        {
          schema_version: POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION,
          role_is_superuser: false,
          role_bypasses_rls: false,
          role_can_create_in_schema: false,
          protected_count: "5",
          rls_count: "5",
          forced_count: "5",
          owned_count: "0",
        },
      ]);
    }
    return result([]);
  }
}

function scopedDataQueries(pool: FakePool): readonly RecordedQuery[] {
  return pool.queries.filter(
    ({ sql }) => sql.includes('"lex_behavior_test"."lex_behavioral_') && !sql.includes("pg_catalog")
  );
}

describe("PostgresBehavioralStoreBackend", () => {
  test("uses transaction-local canonical repository scope and explicit predicates", async () => {
    const pool = new FakePool();
    const backend: BehavioralStoreBinder = new PostgresBehavioralStoreBackend(
      pool as unknown as Pool,
      { schema: "lex_behavior_test" }
    );
    const reader = backend.bindRead(behavioralBinding());
    const snapshot = await reader.getSnapshot();
    assert.equal(snapshot.schemaVersion, 1);
    assert.deepEqual(snapshot.personas, []);
    assert.deepEqual(snapshot.rules, []);
    assert.deepEqual(snapshot.baselines, []);
    assert.match(snapshot.snapshotRevision, /^sha256:[0-9a-f]{64}$/);
    assert.match(snapshot.contentDigest, /^sha256:[0-9a-f]{64}$/);
    const writer = backend.bindWrite(behavioralBinding());
    const missing = await writer.recordEvidence({
      idempotencyKey: "missing-rule",
      ruleId: "not-present",
      ruleRevision: "1",
      kind: "trust-gap",
      sourceFrameIds: [],
    });
    assert.equal(missing.status, "conflict");
    assert.equal(missing.conflict, "missing-revision");

    const settings = pool.queries.filter(({ sql }) => sql.includes("set_config('lex.tenant_id'"));
    assert.equal(settings.length, 2);
    assert.ok(
      settings.every(({ values }) =>
        values
          .join("/")
          .includes(
            [
              BEHAVIORAL_TEST_IDS.tenantPlatform,
              BEHAVIORAL_TEST_IDS.workspaceLex,
              BEHAVIORAL_TEST_IDS.repositoryLex,
              BEHAVIORAL_TEST_IDS.instanceLex,
              BEHAVIORAL_TEST_IDS.principal,
            ].join("/")
          )
      )
    );
    assert.equal(pool.queries.filter(({ sql }) => sql === "BEGIN").length, 2);
    assert.equal(pool.queries.filter(({ sql }) => sql === "COMMIT").length, 2);
    assert.ok(pool.queries.some(({ sql }) => sql === "SET TRANSACTION READ ONLY"));
    assert.equal(pool.queries.filter(({ sql }) => sql.startsWith("RESET lex.tenant_id")).length, 4);
    for (const query of scopedDataQueries(pool)) {
      if (query.sql.startsWith("INSERT INTO")) {
        assert.match(query.sql, /tenant_id, workspace_id, repository_id, repository_instance_id/);
        assert.match(query.sql, /\$1::uuid, \$2::uuid, \$3::uuid, \$4::uuid/);
      } else {
        assert.match(query.sql, /tenant_id = \$1::uuid AND workspace_id = \$2::uuid/);
        assert.match(query.sql, /repository_id = \$3::uuid AND repository_instance_id = \$4::uuid/);
        assert.match(query.sql, /current_setting\('lex\.principal_id', true\) = \$5/);
      }
    }
    await backend.close();
  });

  test("migration SQL protects every relation with forced RLS and never adopts legacy tables", () => {
    const sql = postgresBehavioralMigrationSql("lex_behavior_test");
    for (const table of [
      "lex_behavioral_persona_revisions",
      "lex_behavioral_rule_revisions",
      "lex_behavioral_evidence",
      "lex_behavioral_promotions",
      "lex_behavioral_write_receipts",
    ]) {
      assert.match(
        sql,
        new RegExp(`ALTER TABLE \\"lex_behavior_test\\"\\.\\"${table}\\" ENABLE ROW LEVEL SECURITY`)
      );
      assert.match(
        sql,
        new RegExp(`ALTER TABLE \\"lex_behavior_test\\"\\.\\"${table}\\" FORCE ROW LEVEL SECURITY`)
      );
    }
    assert.match(sql, /current_setting\('lex\.repository_instance_id', true\)/);
    assert.match(sql, /creator_principal_id::text = current_setting\('lex\.principal_id', true\)/);
    assert.doesNotMatch(sql, /INSERT INTO .*lexsona_behavior_rules/);
    assert.doesNotMatch(sql, /INSERT INTO .*personas/);

    const rollback = postgresBehavioralRollbackSql("lex_behavior_test");
    assert.match(rollback, /DROP TABLE IF EXISTS .*lex_behavioral_rule_revisions/);
    assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS .*lexsona_behavior_rules/);
    assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS .*\."personas"/);
  });

  test("migration inventory reports legacy tables without assigning ownership", async () => {
    const queries: RecordedQuery[] = [];
    const client = {
      query: async (sql: string, values: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        queries.push({ sql: normalized, values: [...values] });
        if (normalized.includes("AS behavior")) {
          return result([{ behavior: "lex_behavior_test.lexsona_behavior_rules", persona: null }]);
        }
        return result([{ exists: null }]);
      },
    } as unknown as PoolClient;
    const plan = await planPostgresBehavioralStoreMigration(client, "lex_behavior_test");
    assert.equal(plan.currentVersion, 0);
    assert.deepEqual(plan.pendingVersions, [1]);
    assert.equal(plan.legacyBehaviorRuleTablePresent, true);
    assert.equal(plan.legacyPersonaTablePresent, false);
    assert.equal(plan.legacyRowsAdopted, 0);
    assert.equal(
      queries.some(({ sql }) => /^INSERT|^UPDATE|^DELETE/.test(sql)),
      false
    );
  });
});
