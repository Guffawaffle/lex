import type { PoolClient } from "pg";

import {
  createPostgresSchemaTarget,
  type PostgresSchemaTargetV1,
} from "../../../shared/runtime-scope/postgres-schema.js";

export const POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION = 1 as const;

export interface PostgresBehavioralStoreMigrationPlanV1 {
  readonly currentVersion: number;
  readonly targetVersion: typeof POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION;
  readonly pendingVersions: readonly number[];
  readonly legacyBehaviorRuleTablePresent: boolean;
  readonly legacyPersonaTablePresent: boolean;
  /** Legacy rows are inventoried only; migration never assigns ownership. */
  readonly legacyRowsAdopted: 0;
}

function migrationSql(target: PostgresSchemaTargetV1): string {
  const migrations = target.relation("lex_behavioral_store_migrations");
  const personas = target.relation("lex_behavioral_persona_revisions");
  const rules = target.relation("lex_behavioral_rule_revisions");
  const evidence = target.relation("lex_behavioral_evidence");
  const promotions = target.relation("lex_behavioral_promotions");
  const receipts = target.relation("lex_behavioral_write_receipts");
  const scopeMatches = target.function("lex_behavioral_runtime_scope_matches");
  return `
    CREATE TABLE IF NOT EXISTS ${personas} (
      tenant_id UUID NOT NULL,
      workspace_id UUID NOT NULL,
      repository_id UUID NOT NULL,
      repository_instance_id UUID NOT NULL,
      persona_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      content_json JSONB NOT NULL,
      source_frame_ids TEXT[] NOT NULL,
      creator_principal_id UUID NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, persona_id, revision
      )
    );

    CREATE TABLE IF NOT EXISTS ${rules} (
      tenant_id UUID NOT NULL,
      workspace_id UUID NOT NULL,
      repository_id UUID NOT NULL,
      repository_instance_id UUID NOT NULL,
      rule_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      category TEXT NOT NULL,
      directive TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('must', 'should', 'style')),
      applicability_json JSONB NOT NULL,
      confidence_alpha DOUBLE PRECISION NOT NULL CHECK (confidence_alpha >= 0),
      confidence_beta DOUBLE PRECISION NOT NULL CHECK (confidence_beta >= 0),
      source_frame_ids TEXT[] NOT NULL,
      creator_principal_id UUID NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      )
    );

    CREATE TABLE IF NOT EXISTS ${evidence} (
      tenant_id UUID NOT NULL,
      workspace_id UUID NOT NULL,
      repository_id UUID NOT NULL,
      repository_instance_id UUID NOT NULL,
      evidence_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_revision TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('observation', 'counterexample', 'correction', 'trust-gap')),
      source_frame_ids TEXT[] NOT NULL,
      note TEXT,
      creator_principal_id UUID NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, evidence_id
      ),
      FOREIGN KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      ) REFERENCES ${rules} (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      ) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS ${promotions} (
      tenant_id UUID NOT NULL,
      workspace_id UUID NOT NULL,
      repository_id UUID NOT NULL,
      repository_instance_id UUID NOT NULL,
      promotion_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_revision TEXT NOT NULL,
      target_layer TEXT NOT NULL CHECK (target_layer IN ('workspace', 'repository', 'module', 'task')),
      module_id TEXT,
      task_type TEXT,
      creator_principal_id UUID NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, promotion_id
      ),
      FOREIGN KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      ) REFERENCES ${rules} (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      ) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS ${receipts} (
      tenant_id UUID NOT NULL,
      workspace_id UUID NOT NULL,
      repository_id UUID NOT NULL,
      repository_instance_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      receipt_json JSONB NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, idempotency_key
      )
    );

    CREATE INDEX IF NOT EXISTS lex_behavioral_persona_latest_idx
      ON ${personas} (
        tenant_id, workspace_id, repository_id, repository_instance_id, persona_id, recorded_at DESC
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_rule_latest_idx
      ON ${rules} (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, recorded_at DESC
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_evidence_rule_idx
      ON ${evidence} (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_promotion_rule_idx
      ON ${promotions} (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision,
        recorded_at DESC
      );

    CREATE OR REPLACE FUNCTION ${scopeMatches}(
      row_tenant_id UUID,
      row_workspace_id UUID,
      row_repository_id UUID,
      row_repository_instance_id UUID
    ) RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    PARALLEL SAFE
    AS $$
      SELECT
        current_setting('lex.tenant_id', true)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND current_setting('lex.workspace_id', true)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND current_setting('lex.repository_id', true)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND current_setting('lex.repository_instance_id', true)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND current_setting('lex.principal_id', true)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND row_tenant_id::text = current_setting('lex.tenant_id', true)
        AND row_workspace_id::text = current_setting('lex.workspace_id', true)
        AND row_repository_id::text = current_setting('lex.repository_id', true)
        AND row_repository_instance_id::text = current_setting('lex.repository_instance_id', true)
    $$;

    ${[personas, rules, evidence, promotions]
      .map(
        (relation) => `
      ALTER TABLE ${relation} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${relation} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS lex_behavioral_runtime_scope ON ${relation};
      CREATE POLICY lex_behavioral_runtime_scope ON ${relation}
        USING (${scopeMatches}(tenant_id, workspace_id, repository_id, repository_instance_id))
        WITH CHECK (
          ${scopeMatches}(tenant_id, workspace_id, repository_id, repository_instance_id)
          AND creator_principal_id::text = current_setting('lex.principal_id', true)
        );`
      )
      .join("\n")}

    ALTER TABLE ${receipts} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${receipts} FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS lex_behavioral_runtime_scope ON ${receipts};
    CREATE POLICY lex_behavioral_runtime_scope ON ${receipts}
      USING (${scopeMatches}(tenant_id, workspace_id, repository_id, repository_instance_id))
      WITH CHECK (${scopeMatches}(tenant_id, workspace_id, repository_id, repository_instance_id));

    REVOKE ALL ON TABLE ${personas}, ${rules}, ${evidence}, ${promotions}, ${receipts} FROM PUBLIC;
    REVOKE ALL ON TABLE ${migrations} FROM PUBLIC;
    REVOKE ALL ON FUNCTION ${scopeMatches}(UUID, UUID, UUID, UUID) FROM PUBLIC;
  `;
}

/** Inspect without adopting legacy unowned records. */
export async function planPostgresBehavioralStoreMigration(
  client: PoolClient,
  schema: string
): Promise<PostgresBehavioralStoreMigrationPlanV1> {
  const target = createPostgresSchemaTarget(schema);
  const ledger = target.relation("lex_behavioral_store_migrations");
  const ledgerExists = await client.query<{ exists: string | null }>(
    "SELECT to_regclass($1)::text AS exists",
    [ledger]
  );
  let currentVersion = 0;
  if (ledgerExists.rows[0]?.exists) {
    const version = await client.query<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM ${ledger}`
    );
    currentVersion = version.rows[0]?.version ?? 0;
  }
  if (currentVersion > POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION) {
    throw new Error(`PostgreSQL behavioral schema ${currentVersion} is newer than supported`);
  }
  const legacy = await client.query<{ behavior: string | null; persona: string | null }>(
    "SELECT to_regclass($1)::text AS behavior, to_regclass($2)::text AS persona",
    [target.relation("lexsona_behavior_rules"), target.relation("personas")]
  );
  return Object.freeze({
    currentVersion,
    targetVersion: POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION,
    pendingVersions: Object.freeze(currentVersion < 1 ? [1] : []),
    legacyBehaviorRuleTablePresent: Boolean(legacy.rows[0]?.behavior),
    legacyPersonaTablePresent: Boolean(legacy.rows[0]?.persona),
    legacyRowsAdopted: 0,
  });
}

export async function migratePostgresBehavioralStore(
  client: PoolClient,
  schema: string
): Promise<void> {
  const target = createPostgresSchemaTarget(schema);
  const ledger = target.relation("lex_behavioral_store_migrations");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `lex-behavioral-store-migrations:${target.schema}`,
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ledger} (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const current = await client.query<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM ${ledger}`
    );
    const version = current.rows[0]?.version ?? 0;
    if (version > POSTGRES_BEHAVIORAL_STORE_SCHEMA_VERSION) {
      throw new Error(`PostgreSQL behavioral schema ${version} is newer than supported`);
    }
    if (version < 1) {
      await client.query(migrationSql(target));
      await client.query(`INSERT INTO ${ledger} (version) VALUES ($1)`, [1]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function postgresBehavioralMigrationSql(schema: string): string {
  return migrationSql(createPostgresSchemaTarget(schema));
}

/** Operator-only committed-migration rollback. Legacy/unowned relations are intentionally absent. */
export function postgresBehavioralRollbackSql(schema: string): string {
  const target = createPostgresSchemaTarget(schema);
  return `
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_write_receipts")};
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_promotions")};
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_evidence")};
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_rule_revisions")};
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_persona_revisions")};
    DROP FUNCTION IF EXISTS ${target.function("lex_behavioral_runtime_scope_matches")}(UUID, UUID, UUID, UUID);
    DROP TABLE IF EXISTS ${target.relation("lex_behavioral_store_migrations")};
  `;
}
