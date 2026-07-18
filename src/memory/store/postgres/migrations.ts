import type { PoolClient } from "pg";

export const POSTGRES_FRAME_STORE_SCHEMA_VERSION = 2;

export interface PostgresFrameStoreMigrationPlan {
  readonly currentVersion: number;
  readonly targetVersion: typeof POSTGRES_FRAME_STORE_SCHEMA_VERSION;
  readonly pendingVersions: readonly number[];
  /** V1 rows have no trustworthy owner and are quarantined instead of guessed. */
  readonly unownedFrameCount: number;
  /** A pending v2 migration must create its own empty quarantine table. */
  readonly quarantineTableConflict: boolean;
}

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS frames (
        id TEXT PRIMARY KEY,
        "timestamp" TEXT NOT NULL,
        branch TEXT NOT NULL,
        jira TEXT,
        module_scope TEXT[] NOT NULL,
        summary_caption TEXT NOT NULL,
        reference_point TEXT NOT NULL,
        status_snapshot JSONB NOT NULL,
        keywords TEXT[],
        atlas_frame_id TEXT,
        feature_flags TEXT[],
        permissions TEXT[],
        module_attribution JSONB,
        run_id TEXT,
        plan_hash TEXT,
        spend JSONB,
        user_id TEXT,
        superseded_by TEXT,
        merged_from TEXT[],
        search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector
      );

      CREATE INDEX IF NOT EXISTS idx_frames_timestamp
        ON frames ("timestamp" DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames (branch);
      CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames (jira);
      CREATE INDEX IF NOT EXISTS idx_frames_atlas_frame_id ON frames (atlas_frame_id);
      CREATE INDEX IF NOT EXISTS idx_frames_user_id ON frames (user_id);
      CREATE INDEX IF NOT EXISTS idx_frames_module_scope
        ON frames USING GIN (module_scope);
      CREATE INDEX IF NOT EXISTS idx_frames_search_vector
        ON frames USING GIN (search_vector);

      CREATE OR REPLACE FUNCTION lex_update_frame_search_vector()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.search_vector := to_tsvector(
          'simple',
          coalesce(NEW.reference_point, '') || ' ' ||
          coalesce(NEW.summary_caption, '') || ' ' ||
          coalesce(array_to_string(NEW.keywords, ' '), '') || ' ' ||
          coalesce(NEW.status_snapshot ->> 'next_action', '') || ' ' ||
          coalesce(array_to_string(NEW.module_scope, ' '), '') || ' ' ||
          coalesce(NEW.jira, '') || ' ' ||
          coalesce(NEW.branch, '')
        );
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS frames_search_vector_update ON frames;
      CREATE TRIGGER frames_search_vector_update
        BEFORE INSERT OR UPDATE OF reference_point, summary_caption, keywords,
          status_snapshot, module_scope, jira, branch
        ON frames
        FOR EACH ROW
        EXECUTE FUNCTION lex_update_frame_search_vector();

      UPDATE frames
      SET search_vector = to_tsvector(
        'simple',
        coalesce(reference_point, '') || ' ' ||
        coalesce(summary_caption, '') || ' ' ||
        coalesce(array_to_string(keywords, ' '), '') || ' ' ||
        coalesce(status_snapshot ->> 'next_action', '') || ' ' ||
        coalesce(array_to_string(module_scope, ' '), '') || ' ' ||
        coalesce(jira, '') || ' ' ||
        coalesce(branch, '')
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE lex_frame_store_unowned_frames_v1
        (LIKE frames INCLUDING ALL);

      INSERT INTO lex_frame_store_unowned_frames_v1
      SELECT * FROM frames;

      DELETE FROM frames;

      ALTER TABLE frames
        ADD COLUMN tenant_id UUID,
        ADD COLUMN workspace_id UUID,
        ADD COLUMN creator_principal_id UUID,
        ADD COLUMN scope_version TEXT;

      ALTER TABLE frames DROP CONSTRAINT IF EXISTS frames_pkey;
      ALTER TABLE frames
        ALTER COLUMN tenant_id SET NOT NULL,
        ALTER COLUMN workspace_id SET NOT NULL,
        ALTER COLUMN creator_principal_id SET NOT NULL,
        ALTER COLUMN scope_version SET NOT NULL,
        ADD CONSTRAINT frames_pkey PRIMARY KEY (tenant_id, workspace_id, id),
        ADD CONSTRAINT frames_scope_version_nonempty CHECK (length(scope_version) > 0);

      DROP INDEX IF EXISTS idx_frames_timestamp;
      DROP INDEX IF EXISTS idx_frames_branch;
      DROP INDEX IF EXISTS idx_frames_jira;
      DROP INDEX IF EXISTS idx_frames_atlas_frame_id;
      DROP INDEX IF EXISTS idx_frames_user_id;
      DROP INDEX IF EXISTS idx_frames_module_scope;
      DROP INDEX IF EXISTS idx_frames_search_vector;

      CREATE INDEX idx_frames_scope_timestamp
        ON frames (tenant_id, workspace_id, "timestamp" DESC, id DESC);
      CREATE INDEX idx_frames_scope_branch
        ON frames (tenant_id, workspace_id, branch);
      CREATE INDEX idx_frames_scope_jira
        ON frames (tenant_id, workspace_id, jira);
      CREATE INDEX idx_frames_scope_atlas_frame_id
        ON frames (tenant_id, workspace_id, atlas_frame_id);
      CREATE INDEX idx_frames_scope_creator
        ON frames (tenant_id, workspace_id, creator_principal_id);
      CREATE INDEX idx_frames_scope_module
        ON frames USING GIN (module_scope);
      CREATE INDEX idx_frames_scope_search
        ON frames USING GIN (search_vector);

      CREATE OR REPLACE FUNCTION lex_runtime_scope_is_valid()
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      PARALLEL SAFE
      AS $$
        SELECT
          current_setting('lex.tenant_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND current_setting('lex.workspace_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND current_setting('lex.principal_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      $$;

      CREATE OR REPLACE FUNCTION lex_runtime_scope_matches(
        row_tenant_id UUID,
        row_workspace_id UUID
      )
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      PARALLEL SAFE
      AS $$
        SELECT
          current_setting('lex.tenant_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND current_setting('lex.workspace_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND current_setting('lex.principal_id', true)
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND row_tenant_id::text = current_setting('lex.tenant_id', true)
          AND row_workspace_id::text = current_setting('lex.workspace_id', true)
      $$;

      CREATE OR REPLACE FUNCTION lex_prevent_frame_ownership_change()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
          OR NEW.creator_principal_id IS DISTINCT FROM OLD.creator_principal_id
          OR NEW.scope_version IS DISTINCT FROM OLD.scope_version
        THEN
          RAISE EXCEPTION 'Frame ownership columns are immutable'
            USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS frames_ownership_immutable ON frames;
      CREATE TRIGGER frames_ownership_immutable
        BEFORE UPDATE OF tenant_id, workspace_id, creator_principal_id, scope_version
        ON frames
        FOR EACH ROW
        EXECUTE FUNCTION lex_prevent_frame_ownership_change();

      ALTER TABLE frames ENABLE ROW LEVEL SECURITY;
      ALTER TABLE frames FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS lex_frames_runtime_scope ON frames;
      DROP POLICY IF EXISTS lex_frames_runtime_select ON frames;
      DROP POLICY IF EXISTS lex_frames_runtime_insert ON frames;
      DROP POLICY IF EXISTS lex_frames_runtime_update ON frames;
      DROP POLICY IF EXISTS lex_frames_runtime_delete ON frames;
      CREATE POLICY lex_frames_runtime_select ON frames
        FOR SELECT
        USING (lex_runtime_scope_matches(tenant_id, workspace_id));
      CREATE POLICY lex_frames_runtime_insert ON frames
        FOR INSERT
        WITH CHECK (
          lex_runtime_scope_matches(tenant_id, workspace_id)
          AND creator_principal_id::text = current_setting('lex.principal_id', true)
        );
      CREATE POLICY lex_frames_runtime_update ON frames
        FOR UPDATE
        USING (lex_runtime_scope_matches(tenant_id, workspace_id))
        WITH CHECK (lex_runtime_scope_matches(tenant_id, workspace_id));
      CREATE POLICY lex_frames_runtime_delete ON frames
        FOR DELETE
        USING (lex_runtime_scope_matches(tenant_id, workspace_id));

      REVOKE ALL ON TABLE frames FROM PUBLIC;
      REVOKE ALL ON TABLE lex_frame_store_unowned_frames_v1 FROM PUBLIC;
      REVOKE ALL ON TABLE lex_frame_store_migrations FROM PUBLIC;
      REVOKE ALL ON FUNCTION lex_runtime_scope_is_valid() FROM PUBLIC;
      REVOKE ALL ON FUNCTION lex_runtime_scope_matches(UUID, UUID) FROM PUBLIC;
      REVOKE ALL ON FUNCTION lex_prevent_frame_ownership_change() FROM PUBLIC;
    `,
  },
];

async function currentSchemaVersion(client: PoolClient): Promise<number> {
  const table = await client.query<{ exists: string | null }>(
    "SELECT to_regclass('lex_frame_store_migrations')::text AS exists"
  );
  if (!table.rows[0]?.exists) return 0;
  const result = await client.query<{ version: number | null }>(
    "SELECT MAX(version) AS version FROM lex_frame_store_migrations"
  );
  return result.rows[0]?.version ?? 0;
}

/** Inspect pending work without mutating schema or claiming ownership of legacy rows. */
export async function planPostgresFrameStoreMigration(
  client: PoolClient
): Promise<PostgresFrameStoreMigrationPlan> {
  const currentVersion = await currentSchemaVersion(client);
  if (currentVersion > POSTGRES_FRAME_STORE_SCHEMA_VERSION) {
    throw new Error(
      `PostgreSQL FrameStore schema ${currentVersion} is newer than supported schema ${POSTGRES_FRAME_STORE_SCHEMA_VERSION}`
    );
  }
  let unownedFrameCount = 0;
  let quarantineTableConflict = false;
  if (currentVersion === 1) {
    const result = await client.query<{ count: string; quarantine_exists: string | null }>(`
      SELECT
        (SELECT COUNT(*)::text FROM frames) AS count,
        to_regclass('lex_frame_store_unowned_frames_v1')::text AS quarantine_exists
    `);
    unownedFrameCount = Number(result.rows[0]?.count ?? 0);
    quarantineTableConflict = result.rows[0]?.quarantine_exists !== null;
  }
  return Object.freeze({
    currentVersion,
    targetVersion: POSTGRES_FRAME_STORE_SCHEMA_VERSION,
    pendingVersions: Object.freeze(
      MIGRATIONS.filter(({ version }) => version > currentVersion).map(({ version }) => version)
    ),
    unownedFrameCount,
    quarantineTableConflict,
  });
}

/** Apply pending PostgreSQL FrameStore migrations under a transaction-scoped lock. */
export async function migratePostgresFrameStore(client: PoolClient): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('lex-frame-store-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS lex_frame_store_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query<{ version: number | null }>(
      "SELECT MAX(version) AS version FROM lex_frame_store_migrations"
    );
    const currentVersion = result.rows[0]?.version ?? 0;

    if (currentVersion > POSTGRES_FRAME_STORE_SCHEMA_VERSION) {
      throw new Error(
        `PostgreSQL FrameStore schema ${currentVersion} is newer than supported schema ${POSTGRES_FRAME_STORE_SCHEMA_VERSION}`
      );
    }

    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO lex_frame_store_migrations (version) VALUES ($1)", [
        migration.version,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
