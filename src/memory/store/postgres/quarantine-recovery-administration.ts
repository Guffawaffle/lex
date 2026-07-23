import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  type AuthorizedScopeV1,
  type ContentDigest,
} from "../../../shared/runtime-scope/index.js";
import { createPostgresSchemaTarget } from "../../../shared/runtime-scope/postgres-schema.js";
import { FRAME_STORE_CAPABILITIES } from "../scoped-frame-store.js";
import {
  QUARANTINE_RECOVERY_ERROR_CODES,
  QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION,
  QUARANTINE_RECOVERY_MAX_ROWS,
  QUARANTINE_RECOVERY_SOURCE_RELATION,
  QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION,
  QuarantineRecoveryError,
  createQuarantineInventory,
  planQuarantineRecovery,
  quarantineRecoveryDigest,
  type QuarantineDestinationCollisionV1,
  type QuarantineInventoryV1,
  type QuarantineRecoveryAuthorityV1,
  type QuarantineRecoveryManifestV1,
  type QuarantineRecoveryPlanV1,
  type QuarantinedFrameEvidenceV1,
} from "./quarantine-recovery.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEGACY_COLUMNS = Object.freeze([
  ["id", "text", "NO"],
  ["timestamp", "text", "NO"],
  ["branch", "text", "NO"],
  ["jira", "text", "YES"],
  ["module_scope", "_text", "NO"],
  ["summary_caption", "text", "NO"],
  ["reference_point", "text", "NO"],
  ["status_snapshot", "jsonb", "NO"],
  ["keywords", "_text", "YES"],
  ["atlas_frame_id", "text", "YES"],
  ["feature_flags", "_text", "YES"],
  ["permissions", "_text", "YES"],
  ["module_attribution", "jsonb", "YES"],
  ["run_id", "text", "YES"],
  ["plan_hash", "text", "YES"],
  ["spend", "jsonb", "YES"],
  ["user_id", "text", "YES"],
  ["superseded_by", "text", "YES"],
  ["merged_from", "_text", "YES"],
  ["search_vector", "tsvector", "NO"],
] as const);

interface ColumnEvidence extends QueryResultRow {
  readonly column_name: string;
  readonly udt_name: string;
  readonly is_nullable: "YES" | "NO";
}

interface LegacyRow extends QueryResultRow {
  readonly id: string;
  readonly timestamp: string;
  readonly branch: string;
  readonly jira: string | null;
  readonly module_scope: readonly string[];
  readonly summary_caption: string;
  readonly reference_point: string;
  readonly status_snapshot: unknown;
  readonly keywords: readonly string[] | null;
  readonly atlas_frame_id: string | null;
  readonly feature_flags: readonly string[] | null;
  readonly permissions: readonly string[] | null;
  readonly module_attribution: unknown | null;
  readonly run_id: string | null;
  readonly plan_hash: string | null;
  readonly spend: unknown | null;
  readonly user_id: string | null;
  readonly superseded_by: string | null;
  readonly merged_from: readonly string[] | null;
}

export interface PostgresQuarantineRecoveryAdministrationOptions {
  readonly schema: string;
}

function fail(code: keyof typeof QUARANTINE_RECOVERY_ERROR_CODES, message: string): never {
  throw new QuarantineRecoveryError(QUARANTINE_RECOVERY_ERROR_CODES[code], message);
}

function authorityFromScope(scope: AuthorizedScopeV1): QuarantineRecoveryAuthorityV1 {
  if (
    scope?.schemaVersion !== RUNTIME_SCOPE_CONTRACT_VERSION ||
    !UUID_PATTERN.test(scope.tenantId) ||
    !UUID_PATTERN.test(scope.workspaceId) ||
    !UUID_PATTERN.test(scope.principalId) ||
    !scope.capabilities.includes(FRAME_STORE_CAPABILITIES.ADMIN) ||
    typeof scope.scopeVersion !== "string" ||
    scope.scopeVersion.length === 0 ||
    typeof scope.verifiedAt !== "string" ||
    Number.isNaN(Date.parse(scope.verifiedAt)) ||
    (scope.expiresAt !== undefined &&
      (Number.isNaN(Date.parse(scope.expiresAt)) || Date.parse(scope.expiresAt) <= Date.now()))
  ) {
    fail(
      "AUTHORITY_MISSING",
      "PostgreSQL quarantine recovery requires an active frame:admin scope"
    );
  }
  return Object.freeze({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    scopeVersion: scope.scopeVersion,
    capabilities: Object.freeze([...scope.capabilities]),
  });
}

function rowEvidence(row: LegacyRow): QuarantinedFrameEvidenceV1 {
  return Object.freeze({
    frameId: row.id,
    contentDigest: quarantineRecoveryDigest({
      id: row.id,
      timestamp: row.timestamp,
      branch: row.branch,
      jira: row.jira,
      module_scope: row.module_scope,
      summary_caption: row.summary_caption,
      reference_point: row.reference_point,
      status_snapshot: row.status_snapshot,
      keywords: row.keywords,
      atlas_frame_id: row.atlas_frame_id,
      feature_flags: row.feature_flags,
      permissions: row.permissions,
      module_attribution: row.module_attribution,
      run_id: row.run_id,
      plan_hash: row.plan_hash,
      spend: row.spend,
      user_id: row.user_id,
      superseded_by: row.superseded_by,
      merged_from: row.merged_from,
    }),
  });
}

function exactLegacyShape(columns: readonly ColumnEvidence[]): boolean {
  return (
    columns.length === LEGACY_COLUMNS.length &&
    columns.every((column, index) => {
      const expected = LEGACY_COLUMNS[index];
      return (
        expected !== undefined &&
        column.column_name === expected[0] &&
        column.udt_name === expected[1] &&
        column.is_nullable === expected[2]
      );
    })
  );
}

async function inReadOnlySnapshot<T>(client: PoolClient, operation: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Privileged, scope-bound PostgreSQL quarantine recovery view. */
export class BoundPostgresQuarantineRecoveryAdministration {
  private closed = false;

  constructor(
    private readonly pool: Pool,
    private readonly schema: string,
    private readonly authority: QuarantineRecoveryAuthorityV1,
    private readonly backendIsClosed: () => boolean
  ) {}

  async inventory(): Promise<QuarantineInventoryV1> {
    this.assertOpen();
    const client = await this.pool.connect();
    try {
      return await inReadOnlySnapshot(client, async () => {
        const version = await client.query<{ version: number | null }>(
          `SELECT MAX(version) AS version FROM ${createPostgresSchemaTarget(this.schema).relation("lex_frame_store_migrations")}`
        );
        if (version.rows[0]?.version !== QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION) {
          fail("UNSUPPORTED_SCHEMA", "PostgreSQL FrameStore recovery schema is unsupported");
        }
        const columns = await client.query<ColumnEvidence>(
          `SELECT column_name, udt_name, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [this.schema, QUARANTINE_RECOVERY_SOURCE_RELATION]
        );
        if (!exactLegacyShape(columns.rows)) {
          fail("UNSUPPORTED_SCHEMA", "PostgreSQL quarantine relation shape is unsupported");
        }
        const target = createPostgresSchemaTarget(this.schema);
        const rows = await client.query<LegacyRow>(
          `SELECT id, "timestamp" AS timestamp, branch, jira, module_scope,
             summary_caption, reference_point, status_snapshot, keywords, atlas_frame_id,
             feature_flags, permissions, module_attribution, run_id, plan_hash, spend,
             user_id, superseded_by, merged_from
           FROM ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)}
           ORDER BY id
           LIMIT $1`,
          [QUARANTINE_RECOVERY_MAX_ROWS + 1]
        );
        return createQuarantineInventory({
          frameStoreSchemaVersion: QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION,
          quarantineSchemaVersion: QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION,
          schema: this.schema,
          relation: QUARANTINE_RECOVERY_SOURCE_RELATION,
          rows: rows.rows.map(rowEvidence),
        });
      });
    } finally {
      client.release();
    }
  }

  async plan(manifest: QuarantineRecoveryManifestV1): Promise<QuarantineRecoveryPlanV1> {
    this.assertOpen();
    const currentInventory = await this.inventory();
    const client = await this.pool.connect();
    try {
      const collisions = await inReadOnlySnapshot(client, async () =>
        this.findCollisions(client, manifest)
      );
      return planQuarantineRecovery({
        currentInventory,
        manifest,
        authority: this.authority,
        targetSchema: this.schema,
        destinationCollisions: collisions,
      });
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private async findCollisions(
    client: PoolClient,
    manifest: QuarantineRecoveryManifestV1
  ): Promise<readonly QuarantineDestinationCollisionV1[]> {
    const target = createPostgresSchemaTarget(this.schema);
    const scopedIds = manifest.decisions
      .filter(({ destination }) => destination === "scoped")
      .map(({ frameId }) => frameId);
    const compatibilityIds = manifest.decisions
      .filter(({ destination }) => destination === "compatibility")
      .map(({ frameId }) => frameId);
    const collisions: QuarantineDestinationCollisionV1[] = [];
    if (scopedIds.length > 0) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM ${target.relation("frames")}
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid AND id = ANY($3::text[])
         ORDER BY id`,
        [this.authority.tenantId, this.authority.workspaceId, scopedIds]
      );
      collisions.push(
        ...result.rows.map(({ id }) => ({
          destination: "scoped" as const,
          frameId: id,
          existingContentDigest: quarantineRecoveryDigest({ destination: "scoped", id }),
        }))
      );
    }
    if (compatibilityIds.length > 0) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM ${target.relation("lex_compat_frames")}
         WHERE id = ANY($1::text[]) ORDER BY id`,
        [compatibilityIds]
      );
      collisions.push(
        ...result.rows.map(({ id }) => ({
          destination: "compatibility" as const,
          frameId: id,
          existingContentDigest: quarantineRecoveryDigest({ destination: "compatibility", id }),
        }))
      );
    }
    return Object.freeze(collisions);
  }

  private assertOpen(): void {
    if (this.closed || this.backendIsClosed()) {
      fail("ADMINISTRATION_CLOSED", "PostgreSQL quarantine recovery administration is closed");
    }
  }
}

/** Separately constructed privileged boundary; it owns no runtime store capabilities. */
export class PostgresQuarantineRecoveryAdministration {
  private closed = false;

  constructor(
    private readonly pool: Pool,
    private readonly options: PostgresQuarantineRecoveryAdministrationOptions
  ) {
    createPostgresSchemaTarget(options.schema);
  }

  bind(scope: AuthorizedScopeV1): BoundPostgresQuarantineRecoveryAdministration {
    if (this.closed) fail("ADMINISTRATION_CLOSED", "PostgreSQL quarantine recovery is closed");
    const authority = authorityFromScope(scope);
    return new BoundPostgresQuarantineRecoveryAdministration(
      this.pool,
      this.options.schema,
      authority,
      () => this.closed
    );
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
