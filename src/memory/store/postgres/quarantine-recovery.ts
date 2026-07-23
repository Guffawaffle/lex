import { createHash } from "node:crypto";

import type {
  CapabilityId,
  ContentDigest,
  PrincipalId,
  TenantId,
  WorkspaceId,
} from "../../../shared/runtime-scope/index.js";

export const QUARANTINE_RECOVERY_CONTRACT_VERSION = 1 as const;
export const QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION = 1 as const;
export const QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION = 3 as const;
export const QUARANTINE_RECOVERY_SOURCE_RELATION = "lex_frame_store_unowned_frames_v1" as const;
export const QUARANTINE_RECOVERY_MAX_ROWS = 10_000;
export const QUARANTINE_RECOVERY_MAX_WARNINGS = 32;
/** Recovery is part of the existing, separately bound FrameStore admin surface. */
export const QUARANTINE_RECOVERY_ADMIN_CAPABILITY = "frame:admin" as CapabilityId;
export const QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT =
  "unscoped-compatibility-is-not-a-tenant-boundary-v1" as const;

export const QUARANTINE_RECOVERY_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "LEX_QUARANTINE_RECOVERY_INVALID_INPUT",
  UNSUPPORTED_SCHEMA: "LEX_QUARANTINE_RECOVERY_UNSUPPORTED_SCHEMA",
  DUPLICATE_SOURCE: "LEX_QUARANTINE_RECOVERY_DUPLICATE_SOURCE",
  PARTIAL_SELECTION: "LEX_QUARANTINE_RECOVERY_PARTIAL_SELECTION",
  STALE_INVENTORY: "LEX_QUARANTINE_RECOVERY_STALE_INVENTORY",
  AUTHORITY_MISSING: "LEX_QUARANTINE_RECOVERY_AUTHORITY_MISSING",
  DESTINATION_COLLISION: "LEX_QUARANTINE_RECOVERY_DESTINATION_COLLISION",
});

export type QuarantineRecoveryErrorCode =
  (typeof QUARANTINE_RECOVERY_ERROR_CODES)[keyof typeof QUARANTINE_RECOVERY_ERROR_CODES];

export class QuarantineRecoveryError extends Error {
  constructor(
    public readonly code: QuarantineRecoveryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "QuarantineRecoveryError";
  }
}

/**
 * Evidence produced by a trusted reader. Frame bodies are deliberately absent:
 * recovery contracts operate on stable identifiers and independently computed
 * row digests only.
 */
export interface QuarantinedFrameEvidenceV1 {
  readonly frameId: string;
  readonly contentDigest: ContentDigest;
}

export interface QuarantineSourceEvidenceV1 {
  readonly frameStoreSchemaVersion: number;
  readonly quarantineSchemaVersion: number;
  readonly schema: string;
  readonly relation: string;
  readonly rows: readonly QuarantinedFrameEvidenceV1[];
}

export interface QuarantineInventoryWarningV1 {
  readonly code: "shared-content-digest";
  readonly contentDigest: ContentDigest;
  readonly affectedRowCount: number;
}

export interface QuarantineInventoryV1 {
  readonly schemaVersion: typeof QUARANTINE_RECOVERY_CONTRACT_VERSION;
  readonly inventoryId: string;
  readonly inventoryDigest: ContentDigest;
  readonly source: {
    readonly frameStoreSchemaVersion: typeof QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION;
    readonly quarantineSchemaVersion: typeof QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION;
    /** Stable, redacted reference; the raw schema and relation remain diagnostic-only inputs. */
    readonly storeRef: ContentDigest;
  };
  readonly rowCount: number;
  readonly rows: readonly QuarantinedFrameEvidenceV1[];
  readonly warningCount: number;
  readonly warnings: readonly QuarantineInventoryWarningV1[];
  readonly omittedWarningCount: number;
}

export interface ScopedQuarantineRecoveryDecisionV1 {
  readonly destination: "scoped";
  readonly frameId: string;
  readonly sourceContentDigest: ContentDigest;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly creatorPrincipalId: PrincipalId;
  readonly scopeVersion: string;
}

export interface CompatibilityQuarantineRecoveryDecisionV1 {
  readonly destination: "compatibility";
  readonly frameId: string;
  readonly sourceContentDigest: ContentDigest;
  readonly acknowledgement: typeof QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT;
}

export type QuarantineRecoveryDecisionV1 =
  ScopedQuarantineRecoveryDecisionV1 | CompatibilityQuarantineRecoveryDecisionV1;

export interface QuarantineRecoveryManifestInputV1 {
  readonly inventoryId: string;
  readonly inventoryDigest: ContentDigest;
  readonly decisions: readonly QuarantineRecoveryDecisionV1[];
}

export interface QuarantineRecoveryManifestV1 {
  readonly schemaVersion: typeof QUARANTINE_RECOVERY_CONTRACT_VERSION;
  readonly manifestId: string;
  readonly manifestDigest: ContentDigest;
  readonly inventoryId: string;
  readonly inventoryDigest: ContentDigest;
  readonly expectedSourceRowCount: number;
  readonly decisions: readonly QuarantineRecoveryDecisionV1[];
}

export interface QuarantineRecoveryAuthorityV1 {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly scopeVersion: string;
  readonly capabilities: readonly CapabilityId[];
}

export interface QuarantineDestinationCollisionV1 {
  readonly destination: "scoped" | "compatibility";
  readonly frameId: string;
  readonly existingContentDigest: ContentDigest;
}

export interface QuarantineRecoveryPlanInputV1 {
  /** A freshly read inventory, not the copy used to author the manifest. */
  readonly currentInventory: QuarantineInventoryV1;
  readonly manifest: QuarantineRecoveryManifestV1;
  readonly authority: QuarantineRecoveryAuthorityV1;
  readonly targetRef: ContentDigest;
  readonly destinationCollisions?: readonly QuarantineDestinationCollisionV1[];
}

export interface QuarantineRecoveryPlanV1 {
  readonly schemaVersion: typeof QUARANTINE_RECOVERY_CONTRACT_VERSION;
  readonly planId: string;
  readonly planDigest: ContentDigest;
  readonly state: "ready";
  readonly manifestId: string;
  readonly manifestDigest: ContentDigest;
  readonly inventoryDigest: ContentDigest;
  readonly targetSchema: string;
  readonly sourceRowCount: number;
  readonly scopedAssignmentCount: number;
  readonly compatibilityCopyCount: number;
  /** This helper is validation only and has no database handle or mutation path. */
  readonly persistentWriteCount: 0;
  readonly nextAction: "apply-with-explicit-write-boundary";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function canonicalQuarantineRecoveryJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function quarantineRecoveryDigest(value: unknown): ContentDigest {
  return `sha256:${createHash("sha256")
    .update(canonicalQuarantineRecoveryJson(value))
    .digest("hex")}` as ContentDigest;
}

function deterministicId(kind: "inventory" | "manifest" | "plan", digest: ContentDigest): string {
  return `quarantine-${kind}:${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function fail(code: QuarantineRecoveryErrorCode, message: string): never {
  throw new QuarantineRecoveryError(code, message);
}

function isDigest(value: unknown): value is ContentDigest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isCanonicalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}

function isBoundedIdentifier(value: unknown, maximum = 256): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f]/.test(value)
  );
}

function isPostgresSchema(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z_][a-z0-9_]{0,62}$/.test(value) &&
    value !== "information_schema" &&
    !value.startsWith("pg_")
  );
}

function freezeRow(row: QuarantinedFrameEvidenceV1): QuarantinedFrameEvidenceV1 {
  if (!isBoundedIdentifier(row.frameId)) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, "Quarantine frame ID is invalid");
  }
  if (!isDigest(row.contentDigest)) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, "Quarantine content digest is invalid");
  }
  return Object.freeze({ frameId: row.frameId, contentDigest: row.contentDigest });
}

function compareRows(left: QuarantinedFrameEvidenceV1, right: QuarantinedFrameEvidenceV1): number {
  return (
    left.frameId.localeCompare(right.frameId) ||
    left.contentDigest.localeCompare(right.contentDigest)
  );
}

/** Create a bounded, deterministic, body-free view of the quarantine source. */
export function createQuarantineInventory(
  evidence: QuarantineSourceEvidenceV1
): QuarantineInventoryV1 {
  if (
    evidence.frameStoreSchemaVersion !== QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION ||
    evidence.quarantineSchemaVersion !== QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION
  ) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.UNSUPPORTED_SCHEMA,
      "Quarantine recovery source schema is unsupported"
    );
  }
  if (
    !isPostgresSchema(evidence.schema) ||
    evidence.relation !== QUARANTINE_RECOVERY_SOURCE_RELATION
  ) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, "Quarantine source location is invalid");
  }
  if (!Array.isArray(evidence.rows) || evidence.rows.length > QUARANTINE_RECOVERY_MAX_ROWS) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT,
      `Quarantine inventory exceeds its ${QUARANTINE_RECOVERY_MAX_ROWS}-row bound`
    );
  }

  const rows = evidence.rows.map(freezeRow).sort(compareRows);
  const frameIds = new Set<string>();
  const digestCounts = new Map<ContentDigest, number>();
  for (const row of rows) {
    if (frameIds.has(row.frameId)) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.DUPLICATE_SOURCE,
        "Quarantine source contains a duplicate frame ID"
      );
    }
    frameIds.add(row.frameId);
    digestCounts.set(row.contentDigest, (digestCounts.get(row.contentDigest) ?? 0) + 1);
  }

  const allWarnings = [...digestCounts]
    .filter(([, count]) => count > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([contentDigest, affectedRowCount]) =>
      Object.freeze({
        code: "shared-content-digest" as const,
        contentDigest,
        affectedRowCount,
      })
    );
  const warnings = Object.freeze(allWarnings.slice(0, QUARANTINE_RECOVERY_MAX_WARNINGS));
  const source = Object.freeze({
    frameStoreSchemaVersion: QUARANTINE_RECOVERY_FRAME_STORE_SCHEMA_VERSION,
    quarantineSchemaVersion: QUARANTINE_RECOVERY_SOURCE_SCHEMA_VERSION,
    storeRef: quarantineRecoveryDigest({
      kind: "postgres-quarantine-v1",
      schema: evidence.schema,
      relation: evidence.relation,
    }),
  });
  const digestInput = { schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION, source, rows };
  const inventoryDigest = quarantineRecoveryDigest(digestInput);
  return Object.freeze({
    ...digestInput,
    inventoryId: deterministicId("inventory", inventoryDigest),
    inventoryDigest,
    rowCount: rows.length,
    rows: Object.freeze(rows),
    warningCount: allWarnings.length,
    warnings,
    omittedWarningCount: allWarnings.length - warnings.length,
  });
}

function freezeDecision(decision: QuarantineRecoveryDecisionV1): QuarantineRecoveryDecisionV1 {
  if (!isBoundedIdentifier(decision.frameId) || !isDigest(decision.sourceContentDigest)) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, "Recovery decision source is invalid");
  }
  if (decision.destination === "scoped") {
    if (
      !isCanonicalId(decision.tenantId) ||
      !isCanonicalId(decision.workspaceId) ||
      !isCanonicalId(decision.creatorPrincipalId) ||
      !isBoundedIdentifier(decision.scopeVersion, 64)
    ) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT,
        "Scoped recovery requires canonical ownership identifiers"
      );
    }
    return Object.freeze({
      destination: "scoped",
      frameId: decision.frameId,
      sourceContentDigest: decision.sourceContentDigest,
      tenantId: decision.tenantId,
      workspaceId: decision.workspaceId,
      creatorPrincipalId: decision.creatorPrincipalId,
      scopeVersion: decision.scopeVersion,
    });
  }
  if (
    decision.destination !== "compatibility" ||
    decision.acknowledgement !== QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT
  ) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT,
      "Compatibility recovery requires the unscoped destination acknowledgement"
    );
  }
  return Object.freeze({
    destination: "compatibility",
    frameId: decision.frameId,
    sourceContentDigest: decision.sourceContentDigest,
    acknowledgement: QUARANTINE_RECOVERY_COMPATIBILITY_ACKNOWLEDGEMENT,
  });
}

/** Bind one explicit destination decision to every row in an exact inventory. */
export function createQuarantineRecoveryManifest(
  inventory: QuarantineInventoryV1,
  input: QuarantineRecoveryManifestInputV1
): QuarantineRecoveryManifestV1 {
  if (
    input.inventoryId !== inventory.inventoryId ||
    input.inventoryDigest !== inventory.inventoryDigest
  ) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.STALE_INVENTORY, "Manifest inventory is stale");
  }
  if (!Array.isArray(input.decisions) || input.decisions.length !== inventory.rowCount) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.PARTIAL_SELECTION,
      "Manifest must decide every inventoried row exactly once"
    );
  }

  const rowsById = new Map(inventory.rows.map((row) => [row.frameId, row]));
  const decisionsById = new Map<string, QuarantineRecoveryDecisionV1>();
  for (const rawDecision of input.decisions) {
    const decision = freezeDecision(rawDecision);
    if (decisionsById.has(decision.frameId)) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.DUPLICATE_SOURCE,
        "Manifest contains a duplicate frame decision"
      );
    }
    const source = rowsById.get(decision.frameId);
    if (!source || source.contentDigest !== decision.sourceContentDigest) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.PARTIAL_SELECTION,
        "Manifest decision does not match the exact inventory"
      );
    }
    decisionsById.set(decision.frameId, decision);
  }

  const decisions = Object.freeze(
    [...decisionsById.values()].sort((left, right) => left.frameId.localeCompare(right.frameId))
  );
  const manifestBody = {
    schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
    inventoryId: inventory.inventoryId,
    inventoryDigest: inventory.inventoryDigest,
    expectedSourceRowCount: inventory.rowCount,
    decisions,
  };
  const manifestDigest = quarantineRecoveryDigest(manifestBody);
  return Object.freeze({
    ...manifestBody,
    manifestId: deterministicId("manifest", manifestDigest),
    manifestDigest,
  });
}

function assertCurrentInventory(
  inventory: QuarantineInventoryV1,
  manifest: QuarantineRecoveryManifestV1
): void {
  const rebuiltDigest = quarantineRecoveryDigest({
    schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
    source: inventory.source,
    rows: inventory.rows,
  });
  const rebuiltInventory = Object.freeze({
    ...inventory,
    inventoryId: deterministicId("inventory", rebuiltDigest),
    inventoryDigest: rebuiltDigest,
  });
  const rebuiltManifest = createQuarantineRecoveryManifest(rebuiltInventory, {
    inventoryId: manifest.inventoryId,
    inventoryDigest: manifest.inventoryDigest,
    decisions: manifest.decisions,
  });
  if (
    rebuiltInventory.inventoryId !== inventory.inventoryId ||
    rebuiltInventory.inventoryDigest !== inventory.inventoryDigest ||
    inventory.inventoryId !== manifest.inventoryId ||
    inventory.inventoryDigest !== manifest.inventoryDigest ||
    inventory.rowCount !== manifest.expectedSourceRowCount ||
    manifest.schemaVersion !== QUARANTINE_RECOVERY_CONTRACT_VERSION ||
    rebuiltManifest.manifestId !== manifest.manifestId ||
    rebuiltManifest.manifestDigest !== manifest.manifestDigest
  ) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.STALE_INVENTORY,
      "Quarantine source changed after manifest creation"
    );
  }
}

/**
 * Validate recovery authority and collision evidence without owning a database
 * handle. This function cannot apply or persist a recovery operation.
 */
export function planQuarantineRecovery(
  input: QuarantineRecoveryPlanInputV1
): QuarantineRecoveryPlanV1 {
  assertCurrentInventory(input.currentInventory, input.manifest);
  if (
    !isCanonicalId(input.authority.tenantId) ||
    !isCanonicalId(input.authority.workspaceId) ||
    !isCanonicalId(input.authority.principalId) ||
    !isBoundedIdentifier(input.authority.scopeVersion, 64) ||
    !input.authority.capabilities.includes(QUARANTINE_RECOVERY_ADMIN_CAPABILITY)
  ) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.AUTHORITY_MISSING,
      "Quarantine recovery administration authority is required"
    );
  }
  for (const decision of input.manifest.decisions) {
    if (
      decision.destination === "scoped" &&
      (decision.tenantId !== input.authority.tenantId ||
        decision.workspaceId !== input.authority.workspaceId ||
        decision.creatorPrincipalId !== input.authority.principalId ||
        decision.scopeVersion !== input.authority.scopeVersion)
    ) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.AUTHORITY_MISSING,
        "Scoped recovery destination must exactly match the authorized administration scope"
      );
    }
  }
  if (!isPostgresSchema(input.targetSchema)) {
    fail(QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT, "Recovery target schema is invalid");
  }
  const collisions = input.destinationCollisions ?? [];
  const collisionKeys = new Set<string>();
  for (const collision of collisions) {
    if (
      (collision.destination !== "scoped" && collision.destination !== "compatibility") ||
      !isBoundedIdentifier(collision.frameId) ||
      !isDigest(collision.existingContentDigest)
    ) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.INVALID_INPUT,
        "Destination collision evidence is invalid"
      );
    }
    const key = `${collision.destination}:${collision.frameId}`;
    if (collisionKeys.has(key)) {
      fail(
        QUARANTINE_RECOVERY_ERROR_CODES.DUPLICATE_SOURCE,
        "Destination collision evidence contains a duplicate key"
      );
    }
    collisionKeys.add(key);
  }
  if (collisions.length > 0) {
    fail(
      QUARANTINE_RECOVERY_ERROR_CODES.DESTINATION_COLLISION,
      "Recovery destination contains one or more frame collisions"
    );
  }

  const scopedAssignmentCount = input.manifest.decisions.filter(
    ({ destination }) => destination === "scoped"
  ).length;
  const compatibilityCopyCount = input.manifest.decisions.length - scopedAssignmentCount;
  const targetRef = quarantineRecoveryDigest({
    kind: "postgres-recovery-target-v1",
    schema: input.targetSchema,
  });
  const planBody = {
    schemaVersion: QUARANTINE_RECOVERY_CONTRACT_VERSION,
    state: "ready" as const,
    manifestId: input.manifest.manifestId,
    manifestDigest: input.manifest.manifestDigest,
    inventoryDigest: input.currentInventory.inventoryDigest,
    targetRef,
    sourceRowCount: input.currentInventory.rowCount,
    scopedAssignmentCount,
    compatibilityCopyCount,
    persistentWriteCount: 0 as const,
    nextAction: "apply-with-explicit-write-boundary" as const,
  };
  const planDigest = quarantineRecoveryDigest(planBody);
  return Object.freeze({
    ...planBody,
    planId: deterministicId("plan", planDigest),
    planDigest,
  });
}
