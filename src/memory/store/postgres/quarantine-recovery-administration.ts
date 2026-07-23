import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  type AuthorizedScopeV1,
  type ContentDigest,
} from "../../../shared/runtime-scope/index.js";
import { createPostgresSchemaTarget } from "../../../shared/runtime-scope/postgres-schema.js";
import { Frame as FrameSchema } from "../../frames/types.js";
import { FRAME_STORE_CAPABILITIES } from "../scoped-frame-store.js";
import {
  QUARANTINE_RECOVERY_ERROR_CODES,
  QUARANTINE_RECOVERY_CONTRACT_VERSION,
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
  type QuarantineRecoveryApplyOptionsV1,
  type QuarantineRecoveryApplyReceiptV1,
  type QuarantineRecoveryCleanupOptionsV1,
  type QuarantineRecoveryCleanupReceiptV1,
  type QuarantineRecoveryDecisionV1,
  type QuarantineRecoveryManifestV1,
  type QuarantineRecoveryPlanV1,
  type QuarantineRecoveryStateV1,
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

const LEGACY_SELECT_COLUMNS = `id, "timestamp" AS timestamp, branch, jira, module_scope,
  summary_caption, reference_point, status_snapshot, keywords, atlas_frame_id,
  feature_flags, permissions, module_attribution, run_id, plan_hash, spend,
  user_id, superseded_by, merged_from`;

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

interface SourceSnapshot {
  readonly inventory: QuarantineInventoryV1;
  readonly rows: readonly LegacyRow[];
}

interface StoredRecoveryRow extends QueryResultRow {
  readonly manifest_digest: ContentDigest;
  readonly state: "verified" | "cleaned";
  readonly redacted_receipt: QuarantineRecoveryApplyReceiptV1 | string;
  readonly receipt_digest: ContentDigest;
}

interface StoredLifecycleRow extends QueryResultRow {
  readonly state: "verified" | "cleaned";
  readonly copied_row_count: number;
}

interface StoredAssignmentRow extends QueryResultRow {
  readonly frame_id: string;
  readonly row_digest: ContentDigest;
  readonly decision: QuarantineRecoveryDecisionV1 | string;
  readonly destination_digest: ContentDigest;
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

function parseJsonValue(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

function rowEvidence(row: LegacyRow): QuarantinedFrameEvidenceV1 {
  const frame = FrameSchema.parse({
    id: row.id,
    timestamp: row.timestamp,
    branch: row.branch,
    jira: row.jira ?? undefined,
    module_scope: row.module_scope,
    summary_caption: row.summary_caption,
    reference_point: row.reference_point,
    status_snapshot: parseJsonValue(row.status_snapshot),
    keywords: row.keywords ?? undefined,
    atlas_frame_id: row.atlas_frame_id ?? undefined,
    feature_flags: row.feature_flags ?? undefined,
    permissions: row.permissions ?? undefined,
    module_attribution: parseJsonValue(row.module_attribution) ?? undefined,
    runId: row.run_id ?? undefined,
    planHash: row.plan_hash ?? undefined,
    spend: parseJsonValue(row.spend) ?? undefined,
    userId: row.user_id ?? undefined,
    superseded_by: row.superseded_by ?? undefined,
    merged_from: row.merged_from ?? undefined,
  });
  return Object.freeze({
    frameId: row.id,
    contentDigest: quarantineRecoveryDigest(frame),
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

async function inSerializableWrite<T>(client: PoolClient, operation: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function parseReceipt(
  value: QuarantineRecoveryApplyReceiptV1 | string
): QuarantineRecoveryApplyReceiptV1 {
  return typeof value === "string"
    ? (JSON.parse(value) as QuarantineRecoveryApplyReceiptV1)
    : value;
}

function validateStoredApplyReceipt(
  value: QuarantineRecoveryApplyReceiptV1 | string,
  expectedDigest: ContentDigest
): QuarantineRecoveryApplyReceiptV1 {
  const receipt = parseReceipt(value);
  const { receiptDigest: _receiptDigest, ...body } = receipt;
  if (
    receipt.operation !== "postgres-quarantine-recovery-apply" ||
    receipt.state !== "verified" ||
    receipt.receiptDigest !== expectedDigest ||
    quarantineRecoveryDigest(body) !== expectedDigest
  ) {
    fail("STALE_INVENTORY", "Stored recovery receipt evidence is invalid");
  }
  return receipt;
}

function parseDecision(value: QuarantineRecoveryDecisionV1 | string): QuarantineRecoveryDecisionV1 {
  return typeof value === "string" ? (JSON.parse(value) as QuarantineRecoveryDecisionV1) : value;
}

function cleanupReceipt(recoveryId: string, removedSourceRowCount: number) {
  const body = {
    schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
    operation: "postgres-quarantine-recovery-cleanup" as const,
    state: "cleaned" as const,
    recoveryId,
    removedSourceRowCount,
    destinationVerified: true as const,
    nextAction: "none" as const,
  };
  return Object.freeze({ ...body, receiptDigest: quarantineRecoveryDigest(body) });
}

function assertRecoveryId(recoveryId: string): void {
  if (!/^quarantine-manifest:[0-9a-f]{24}$/.test(recoveryId)) {
    fail("INVALID_INPUT", "Recovery ID is invalid");
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
      return await inReadOnlySnapshot(
        client,
        async () => (await this.readSourceSnapshot(client)).inventory
      );
    } finally {
      client.release();
    }
  }

  async plan(manifest: QuarantineRecoveryManifestV1): Promise<QuarantineRecoveryPlanV1> {
    this.assertOpen();
    assertRecoveryId(manifest.manifestId);
    const client = await this.pool.connect();
    try {
      return await inReadOnlySnapshot(client, async () => {
        const currentInventory = (await this.readSourceSnapshot(client)).inventory;
        const collisions = await this.findCollisions(client, manifest);
        return planQuarantineRecovery({
          currentInventory,
          manifest,
          authority: this.authority,
          targetRef: this.targetRef(),
          destinationCollisions: collisions,
        });
      });
    } finally {
      client.release();
    }
  }

  async apply(
    manifest: QuarantineRecoveryManifestV1,
    options: QuarantineRecoveryApplyOptionsV1 = {}
  ): Promise<QuarantineRecoveryPlanV1 | QuarantineRecoveryApplyReceiptV1> {
    this.assertOpen();
    assertRecoveryId(manifest.manifestId);
    if (options.write !== true) return this.plan(manifest);
    const client = await this.pool.connect();
    try {
      return await inSerializableWrite(client, async () => {
        const target = createPostgresSchemaTarget(this.schema);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `lex-frame-store-migrations:${this.schema}`,
        ]);
        if (manifest.decisions.some(({ destination }) => destination === "compatibility")) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `lex-compat-frame-store-migrations:${this.schema}`,
          ]);
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `lex-frame-store-quarantine-recovery:${this.schema}`,
        ]);

        const existing = await client.query<StoredRecoveryRow>(
          `SELECT manifest_digest, state, redacted_receipt, receipt_digest
           FROM ${target.relation("lex_frame_store_recovery_operations")}
           WHERE recovery_id = $1`,
          [manifest.manifestId]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].manifest_digest !== manifest.manifestDigest) {
            fail("STALE_INVENTORY", "Recovery ID is already bound to a different manifest");
          }
          if (existing.rows[0].state === "cleaned") {
            fail("RECOVERY_ALREADY_CLEANED", "Recovery source was already cleaned");
          }
          return validateStoredApplyReceipt(
            existing.rows[0].redacted_receipt,
            existing.rows[0].receipt_digest
          );
        }

        await client.query(
          `LOCK TABLE ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)} IN SHARE MODE`
        );
        const snapshot = await this.readSourceSnapshot(client);
        const collisions = await this.findCollisions(client, manifest);
        const plan = planQuarantineRecovery({
          currentInventory: snapshot.inventory,
          manifest,
          authority: this.authority,
          targetRef: this.targetRef(),
          destinationCollisions: collisions,
        });
        const sourceRows = new Map(snapshot.rows.map((row) => [row.id, row]));
        const destinationDigests = new Map<string, ContentDigest>();
        for (const decision of manifest.decisions) {
          const source = sourceRows.get(decision.frameId);
          if (!source) fail("STALE_INVENTORY", "Recovery source row disappeared");
          await this.copyDecision(client, decision);
          const destination = await this.readDestinationRow(client, decision);
          const expected =
            decision.destination === "scoped" ? { ...source, user_id: null } : source;
          if (
            !destination ||
            rowEvidence(destination).contentDigest !== rowEvidence(expected).contentDigest
          ) {
            fail("STALE_INVENTORY", "Recovery destination failed exact round-trip verification");
          }
          destinationDigests.set(decision.frameId, rowEvidence(destination).contentDigest);
        }

        const receiptBody = {
          schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
          operation: "postgres-quarantine-recovery-apply" as const,
          state: "verified" as const,
          recoveryId: manifest.manifestId,
          manifestDigest: manifest.manifestDigest,
          inventoryDigest: snapshot.inventory.inventoryDigest,
          targetRef: plan.targetRef,
          copiedRowCount: manifest.decisions.length,
          scopedAssignmentCount: plan.scopedAssignmentCount,
          compatibilityCopyCount: plan.compatibilityCopyCount,
          sourcePreserved: true as const,
          nextAction: "cleanup-with-explicit-write-boundary" as const,
        };
        const receipt = Object.freeze({
          ...receiptBody,
          receiptDigest: quarantineRecoveryDigest(receiptBody),
        });
        await client.query(
          `INSERT INTO ${target.relation("lex_frame_store_recovery_operations")} (
             recovery_id, manifest_digest, inventory_digest, state, manifest,
             selected_row_count, copied_row_count, redacted_receipt, receipt_digest, verified_at
           ) VALUES ($1, $2, $3, 'verified', $4::jsonb, $5, $5, $6::jsonb, $7, now())`,
          [
            manifest.manifestId,
            manifest.manifestDigest,
            snapshot.inventory.inventoryDigest,
            JSON.stringify(manifest),
            manifest.decisions.length,
            JSON.stringify(receipt),
            receipt.receiptDigest,
          ]
        );
        for (const decision of manifest.decisions) {
          await client.query(
            `INSERT INTO ${target.relation("lex_frame_store_recovery_assignments")} (
               recovery_id, frame_id, row_digest, decision, target_ref, destination_digest,
               state, verified_at
             ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'verified', now())`,
            [
              manifest.manifestId,
              decision.frameId,
              decision.sourceContentDigest,
              JSON.stringify(decision),
              quarantineRecoveryDigest({ targetRef: plan.targetRef, decision }),
              destinationDigests.get(decision.frameId),
            ]
          );
        }
        return receipt;
      });
    } finally {
      client.release();
    }
  }

  async recover(recoveryId: string): Promise<QuarantineRecoveryStateV1> {
    this.assertOpen();
    assertRecoveryId(recoveryId);
    const client = await this.pool.connect();
    try {
      return await inReadOnlySnapshot(client, async () => {
        const target = createPostgresSchemaTarget(this.schema);
        const operation = await client.query<StoredLifecycleRow>(
          `SELECT state, copied_row_count
           FROM ${target.relation("lex_frame_store_recovery_operations")}
           WHERE recovery_id = $1`,
          [recoveryId]
        );
        const row = operation.rows[0];
        if (!row) {
          return Object.freeze({
            schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
            operation: "postgres-quarantine-recovery-state" as const,
            recoveryId,
            state: "not-found" as const,
            copiedRowCount: 0,
            sourcePreserved: false,
            nextAction: "apply" as const,
          });
        }
        const source = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM ${target.relation("lex_frame_store_recovery_assignments")} AS assignment
           JOIN ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)} AS source
             ON source.id = assignment.frame_id
           WHERE assignment.recovery_id = $1`,
          [recoveryId]
        );
        const sourceCount = source.rows[0]?.count ?? 0;
        if (
          (row.state === "verified" && sourceCount !== row.copied_row_count) ||
          (row.state === "cleaned" && sourceCount !== 0)
        ) {
          fail("STALE_INVENTORY", "Recovery ledger and preserved source disagree");
        }
        const assignments = await client.query<StoredAssignmentRow>(
          `SELECT frame_id, row_digest, decision, destination_digest
           FROM ${target.relation("lex_frame_store_recovery_assignments")}
           WHERE recovery_id = $1 ORDER BY frame_id`,
          [recoveryId]
        );
        if (assignments.rows.length !== row.copied_row_count) {
          fail("STALE_INVENTORY", "Recovery assignment evidence is incomplete");
        }
        const sources =
          row.state === "verified"
            ? new Map(
                (await this.readSourceSnapshot(client)).rows.map((source) => [source.id, source])
              )
            : null;
        for (const assignment of assignments.rows) {
          const decision = parseDecision(assignment.decision);
          const destination = await this.readDestinationRow(client, decision);
          if (
            !destination ||
            rowEvidence(destination).contentDigest !== assignment.destination_digest
          ) {
            fail("STALE_INVENTORY", "Recovery destination and durable evidence disagree");
          }
          const source = sources?.get(assignment.frame_id);
          if (sources && (!source || rowEvidence(source).contentDigest !== assignment.row_digest)) {
            fail("STALE_INVENTORY", "Recovery source and durable evidence disagree");
          }
        }
        return Object.freeze({
          schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
          operation: "postgres-quarantine-recovery-state" as const,
          recoveryId,
          state: row.state,
          copiedRowCount: row.copied_row_count,
          sourcePreserved: row.state === "verified",
          nextAction:
            row.state === "verified"
              ? ("cleanup-with-explicit-write-boundary" as const)
              : ("none" as const),
        });
      });
    } finally {
      client.release();
    }
  }

  async cleanup(
    recoveryId: string,
    options: QuarantineRecoveryCleanupOptionsV1 = {}
  ): Promise<QuarantineRecoveryStateV1 | QuarantineRecoveryCleanupReceiptV1> {
    this.assertOpen();
    assertRecoveryId(recoveryId);
    if (options.write !== true) return this.recover(recoveryId);
    const client = await this.pool.connect();
    try {
      return await inSerializableWrite(client, async () => {
        const target = createPostgresSchemaTarget(this.schema);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `lex-frame-store-migrations:${this.schema}`,
        ]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `lex-compat-frame-store-migrations:${this.schema}`,
        ]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `lex-frame-store-quarantine-recovery:${this.schema}`,
        ]);
        const operation = await client.query<StoredLifecycleRow>(
          `SELECT state, copied_row_count
           FROM ${target.relation("lex_frame_store_recovery_operations")}
           WHERE recovery_id = $1 FOR UPDATE`,
          [recoveryId]
        );
        const lifecycle = operation.rows[0];
        if (!lifecycle) fail("RECOVERY_NOT_FOUND", "Recovery operation was not found");
        if (lifecycle.state === "cleaned") {
          return cleanupReceipt(recoveryId, lifecycle.copied_row_count);
        }
        const assignments = await client.query<StoredAssignmentRow>(
          `SELECT frame_id, row_digest, decision, destination_digest
           FROM ${target.relation("lex_frame_store_recovery_assignments")}
           WHERE recovery_id = $1 ORDER BY frame_id FOR UPDATE`,
          [recoveryId]
        );
        if (assignments.rows.length !== lifecycle.copied_row_count) {
          fail("STALE_INVENTORY", "Recovery assignment evidence is incomplete");
        }
        await client.query(
          `LOCK TABLE ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)} IN SHARE ROW EXCLUSIVE MODE`
        );
        const snapshot = await this.readSourceSnapshot(client);
        const sources = new Map(snapshot.rows.map((row) => [row.id, row]));
        for (const assignment of assignments.rows) {
          const source = sources.get(assignment.frame_id);
          if (!source || rowEvidence(source).contentDigest !== assignment.row_digest) {
            fail("STALE_INVENTORY", "Recovery source changed after verified apply");
          }
          const decision = parseDecision(assignment.decision);
          const destination = await this.readDestinationRow(client, decision);
          const expected =
            decision.destination === "scoped" ? { ...source, user_id: null } : source;
          if (
            !destination ||
            rowEvidence(destination).contentDigest !== rowEvidence(expected).contentDigest ||
            rowEvidence(destination).contentDigest !== assignment.destination_digest
          ) {
            fail("STALE_INVENTORY", "Recovery destination changed before cleanup");
          }
        }
        const frameIds = assignments.rows.map(({ frame_id }) => frame_id);
        const removed = await client.query(
          `DELETE FROM ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)}
           WHERE id = ANY($1::text[])`,
          [frameIds]
        );
        if (removed.rowCount !== frameIds.length) {
          fail("STALE_INVENTORY", "Recovery cleanup source count changed");
        }
        const receipt = cleanupReceipt(recoveryId, frameIds.length);
        await client.query(
          `UPDATE ${target.relation("lex_frame_store_recovery_assignments")}
           SET state = 'cleaned', updated_at = now(), cleaned_at = now()
           WHERE recovery_id = $1 AND state = 'verified'`,
          [recoveryId]
        );
        await client.query(
          `UPDATE ${target.relation("lex_frame_store_recovery_operations")}
           SET state = 'cleaned', updated_at = now(), cleaned_at = now(),
             redacted_receipt = $2::jsonb, receipt_digest = $3
           WHERE recovery_id = $1 AND state = 'verified'`,
          [recoveryId, JSON.stringify(receipt), receipt.receiptDigest]
        );
        return receipt;
      });
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private async readSourceSnapshot(client: PoolClient): Promise<SourceSnapshot> {
    const target = createPostgresSchemaTarget(this.schema);
    const version = await client.query<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM ${target.relation("lex_frame_store_migrations")}`
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
    const primaryKey = await client.query<{ columns: string[] | string | null }>(
      `SELECT array_agg(attribute.attname ORDER BY key_column.ordinality) AS columns
       FROM pg_constraint AS constraint_record
       JOIN unnest(constraint_record.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
         ON true
       JOIN pg_attribute AS attribute
         ON attribute.attrelid = constraint_record.conrelid
        AND attribute.attnum = key_column.attnum
       WHERE constraint_record.conrelid = $1::regclass
         AND constraint_record.contype = 'p'`,
      [target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)]
    );
    const primaryKeyColumns = primaryKey.rows[0]?.columns;
    const normalizedPrimaryKey = Array.isArray(primaryKeyColumns)
      ? primaryKeyColumns.join(",")
      : primaryKeyColumns?.replace(/^\{(.*)\}$/, "$1");
    if (normalizedPrimaryKey !== "id") {
      fail("UNSUPPORTED_SCHEMA", "PostgreSQL quarantine primary key is unsupported");
    }
    const rows = await client.query<LegacyRow>(
      `SELECT ${LEGACY_SELECT_COLUMNS}
       FROM ${target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION)}
       ORDER BY id
       LIMIT $1`,
      [QUARANTINE_RECOVERY_MAX_ROWS + 1]
    );
    return Object.freeze({
      rows: Object.freeze(rows.rows),
      inventory: createQuarantineInventory({
        frameStoreSchemaVersion: QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION,
        quarantineSchemaVersion: QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION,
        schema: this.schema,
        relation: QUARANTINE_RECOVERY_SOURCE_RELATION,
        rows: rows.rows.map(rowEvidence),
      }),
    });
  }

  private targetRef(): ContentDigest {
    return quarantineRecoveryDigest({
      kind: "postgres-recovery-target-v1",
      schema: this.schema,
    });
  }

  private async copyDecision(
    client: PoolClient,
    decision: QuarantineRecoveryDecisionV1
  ): Promise<void> {
    const target = createPostgresSchemaTarget(this.schema);
    const source = target.relation(QUARANTINE_RECOVERY_SOURCE_RELATION);
    const commonColumns = `
      id, "timestamp", branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id, feature_flags,
      permissions, module_attribution, run_id, plan_hash, spend, user_id,
      superseded_by, merged_from`;
    if (decision.destination === "scoped") {
      const copied = await client.query(
        `INSERT INTO ${target.relation("frames")} (
           tenant_id, workspace_id, creator_principal_id, scope_version,
           ${commonColumns}, frame_metadata
         )
         SELECT $1::uuid, $2::uuid, $3::uuid, $4,
           source.id, source."timestamp", source.branch, source.jira, source.module_scope,
           source.summary_caption, source.reference_point, source.status_snapshot,
           source.keywords, source.atlas_frame_id, source.feature_flags, source.permissions,
           source.module_attribution, source.run_id, source.plan_hash, source.spend, NULL,
           source.superseded_by, source.merged_from, '{"schemaVersion":1}'::jsonb
         FROM ${source} AS source WHERE source.id = $5`,
        [
          decision.tenantId,
          decision.workspaceId,
          decision.creatorPrincipalId,
          decision.scopeVersion,
          decision.frameId,
        ]
      );
      if (copied.rowCount !== 1) fail("STALE_INVENTORY", "Scoped recovery copy count changed");
      return;
    }
    const copied = await client.query(
      `INSERT INTO ${target.relation("lex_compat_frames")} (${commonColumns}, frame_metadata)
       SELECT source.id, source."timestamp", source.branch, source.jira, source.module_scope,
         source.summary_caption, source.reference_point, source.status_snapshot,
         source.keywords, source.atlas_frame_id, source.feature_flags, source.permissions,
         source.module_attribution, source.run_id, source.plan_hash, source.spend, source.user_id,
         source.superseded_by, source.merged_from, '{"schemaVersion":1}'::jsonb
       FROM ${source} AS source WHERE source.id = $1`,
      [decision.frameId]
    );
    if (copied.rowCount !== 1) fail("STALE_INVENTORY", "Compatibility recovery copy count changed");
  }

  private async readDestinationRow(
    client: PoolClient,
    decision: QuarantineRecoveryDecisionV1
  ): Promise<LegacyRow | null> {
    const target = createPostgresSchemaTarget(this.schema);
    const result =
      decision.destination === "scoped"
        ? await client.query<LegacyRow>(
            `SELECT ${LEGACY_SELECT_COLUMNS} FROM ${target.relation("frames")}
             WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
               AND creator_principal_id = $3::uuid AND scope_version = $4 AND id = $5`,
            [
              decision.tenantId,
              decision.workspaceId,
              decision.creatorPrincipalId,
              decision.scopeVersion,
              decision.frameId,
            ]
          )
        : await client.query<LegacyRow>(
            `SELECT ${LEGACY_SELECT_COLUMNS}
             FROM ${target.relation("lex_compat_frames")} WHERE id = $1`,
            [decision.frameId]
          );
    return result.rows[0] ?? null;
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
      const result = await client.query<LegacyRow>(
        `SELECT ${LEGACY_SELECT_COLUMNS} FROM ${target.relation("frames")}
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid AND id = ANY($3::text[])
         ORDER BY id`,
        [this.authority.tenantId, this.authority.workspaceId, scopedIds]
      );
      collisions.push(
        ...result.rows.map((row) => ({
          destination: "scoped" as const,
          frameId: row.id,
          existingContentDigest: rowEvidence(row).contentDigest,
        }))
      );
    }
    if (compatibilityIds.length > 0) {
      const result = await client.query<LegacyRow>(
        `SELECT ${LEGACY_SELECT_COLUMNS} FROM ${target.relation("lex_compat_frames")}
         WHERE id = ANY($1::text[]) ORDER BY id`,
        [compatibilityIds]
      );
      collisions.push(
        ...result.rows.map((row) => ({
          destination: "compatibility" as const,
          frameId: row.id,
          existingContentDigest: rowEvidence(row).contentDigest,
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
