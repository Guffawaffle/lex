import type { PoolClient } from "pg";

export const POSTGRES_FRAME_STORE_SCHEMA_VERSION = 1;

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
];

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
