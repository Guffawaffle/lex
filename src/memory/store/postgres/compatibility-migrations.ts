import type { PoolClient } from "pg";

import {
  createPostgresSchemaTarget,
  type PostgresSchemaTargetV1,
} from "../../../shared/runtime-scope/postgres-schema.js";

export const POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION = 2;

const COMPATIBILITY_OBJECTS = Object.freeze({
  frames: "lex_compat_frames",
  migrations: "lex_compat_frame_store_migrations",
  updateSearchVector: "lex_compat_update_frame_search_vector",
});

/**
 * Keep the environment-configured compatibility store physically distinct from
 * the Lex 3 scoped/RLS store. Both may live in one PostgreSQL schema, but they
 * never share relations, migration ledgers, ownership semantics, or functions.
 */
export function createPostgresCompatibilitySchemaTarget(schema: string): PostgresSchemaTargetV1 {
  const target = createPostgresSchemaTarget(schema);
  return Object.freeze({
    schema: target.schema,
    quotedSchema: target.quotedSchema,
    relation: (name: string) =>
      target.relation(
        name === "frames"
          ? COMPATIBILITY_OBJECTS.frames
          : name === "lex_frame_store_migrations"
            ? COMPATIBILITY_OBJECTS.migrations
            : name
      ),
    function: (name: string) =>
      target.function(
        name === "lex_update_frame_search_vector" ? COMPATIBILITY_OBJECTS.updateSearchVector : name
      ),
  });
}

function compatibilityMigrations(
  target: PostgresSchemaTargetV1
): ReadonlyArray<{ version: number; sql: string }> {
  const frames = target.relation("frames");
  const updateSearchVector = target.function("lex_update_frame_search_vector");
  return [
    {
      version: 1,
      sql: `
      CREATE TABLE IF NOT EXISTS ${frames} (
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

      CREATE INDEX IF NOT EXISTS lex_compat_frames_timestamp
        ON ${frames} ("timestamp" DESC, id DESC);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_branch ON ${frames} (branch);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_jira ON ${frames} (jira);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_atlas_frame_id ON ${frames} (atlas_frame_id);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_user_id ON ${frames} (user_id);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_module_scope
        ON ${frames} USING GIN (module_scope);
      CREATE INDEX IF NOT EXISTS lex_compat_frames_search_vector
        ON ${frames} USING GIN (search_vector);

      CREATE OR REPLACE FUNCTION ${updateSearchVector}()
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

      DROP TRIGGER IF EXISTS lex_compat_frames_search_vector_update ON ${frames};
      CREATE TRIGGER lex_compat_frames_search_vector_update
        BEFORE INSERT OR UPDATE OF reference_point, summary_caption, keywords,
          status_snapshot, module_scope, jira, branch
        ON ${frames}
        FOR EACH ROW
        EXECUTE FUNCTION ${updateSearchVector}();
    `,
    },
    {
      version: 2,
      sql: `
      ALTER TABLE ${frames}
        ADD COLUMN frame_metadata JSONB NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb,
        ADD CONSTRAINT lex_compat_frames_metadata_object
          CHECK (jsonb_typeof(frame_metadata) = 'object'),
        ADD CONSTRAINT lex_compat_frames_metadata_version
          CHECK (frame_metadata ->> 'schemaVersion' = '1');
    `,
    },
  ];
}

interface LegacySourceInspection {
  readonly frames_exists: string | null;
  readonly migrations_exists: string | null;
  readonly has_tenant_id: boolean;
}

async function canAdoptLegacyCompatibilityFrames(
  client: PoolClient,
  legacy: PostgresSchemaTargetV1
): Promise<boolean> {
  const inspection = await client.query<LegacySourceInspection>(
    `SELECT
      to_regclass($1)::text AS frames_exists,
      to_regclass($2)::text AS migrations_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $3 AND table_name = 'frames' AND column_name = 'tenant_id'
      ) AS has_tenant_id`,
    [legacy.relation("frames"), legacy.relation("lex_frame_store_migrations"), legacy.schema]
  );
  const row = inspection.rows[0];
  if (!row?.frames_exists || !row.migrations_exists || row.has_tenant_id) return false;
  const version = await client.query<{ version: number | null }>(
    `SELECT MAX(version) AS version FROM ${legacy.relation("lex_frame_store_migrations")}`
  );
  return version.rows[0]?.version === 1;
}

async function adoptLegacyCompatibilityFrames(
  client: PoolClient,
  legacy: PostgresSchemaTargetV1,
  compatibility: PostgresSchemaTargetV1
): Promise<void> {
  await client.query(`
    INSERT INTO ${compatibility.relation("frames")} (
      id, "timestamp", branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id, feature_flags,
      permissions, module_attribution, run_id, plan_hash, spend, user_id,
      superseded_by, merged_from, frame_metadata
    )
    SELECT
      source.id, source."timestamp", source.branch, source.jira, source.module_scope,
      source.summary_caption, source.reference_point, source.status_snapshot,
      source.keywords, source.atlas_frame_id, source.feature_flags, source.permissions,
      source.module_attribution, source.run_id, source.plan_hash, source.spend,
      source.user_id, source.superseded_by, source.merged_from,
      CASE
        WHEN jsonb_typeof(to_jsonb(source) -> 'frame_metadata') = 'object'
          THEN to_jsonb(source) -> 'frame_metadata'
        ELSE '{"schemaVersion":1}'::jsonb
      END
    FROM ${legacy.relation("frames")} AS source
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * Apply the unscoped compatibility migration line. A directly upgraded Lex
 * 2.x schema is copied without mutation into the compatibility relation. A
 * scoped/RLS schema is never adopted because doing so would invent ownership.
 */
export async function migratePostgresCompatibilityFrameStore(
  client: PoolClient,
  schema: string
): Promise<void> {
  const legacy = createPostgresSchemaTarget(schema);
  const target = createPostgresCompatibilitySchemaTarget(schema);
  const migrations = compatibilityMigrations(target);
  await client.query("BEGIN");
  try {
    // Serialize with the former/shared migration line before taking the new
    // compatibility-specific lock. This prevents a concurrent scoped migration
    // from changing the legacy source while it is inspected or copied.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `lex-frame-store-migrations:${legacy.schema}`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `lex-compat-frame-store-migrations:${target.schema}`,
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${target.relation("lex_frame_store_migrations")} (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM ${target.relation("lex_frame_store_migrations")}`
    );
    const currentVersion = result.rows[0]?.version ?? 0;
    if (currentVersion > POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION) {
      throw new Error(
        `PostgreSQL compatibility FrameStore schema ${currentVersion} is newer than supported schema ${POSTGRES_COMPATIBILITY_FRAME_STORE_SCHEMA_VERSION}`
      );
    }
    const adoptLegacy =
      currentVersion === 0 && (await canAdoptLegacyCompatibilityFrames(client, legacy));

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue;
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${target.relation("lex_frame_store_migrations")} (version) VALUES ($1)`,
        [migration.version]
      );
    }
    if (adoptLegacy) await adoptLegacyCompatibilityFrames(client, legacy, target);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
