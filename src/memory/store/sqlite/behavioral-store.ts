import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3-multiple-ciphers";

import type { ContentDigest } from "../../../shared/runtime-scope/index.js";
import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  BEHAVIORAL_STORE_ERROR_CODES,
  BehavioralStoreError,
  assertBehavioralCapability,
  behavioralApplicabilityMatches,
  behavioralBaselinesForBinding,
  behavioralContentDigest,
  canonicalBehavioralJson,
  immutableBehavioralBaselines,
  immutableBehavioralBinding,
  type BehavioralApplicabilityV1,
  type BehavioralBaselineRevisionV1,
  type BehavioralDetailedProvenanceV1,
  type BehavioralEvidenceInputV1,
  type BehavioralPromotionInputV1,
  type BehavioralRevisionWriteV1,
  type BehavioralSnapshotQueryV1,
  type BehavioralSnapshotV1,
  type BehavioralStoreBackendOptionsV1,
  type BehavioralStoreBinder,
  type BehavioralStoreBindingV1,
  type BehavioralWriteOperationV1,
  type BehavioralWriteReceiptV1,
  type PersonaRevisionInputV1,
  type PersonaRevisionV1,
  type RuleRevisionInputV1,
  type RuleRevisionV1,
  type ScopedBehavioralReadStore,
  type ScopedBehavioralWriteStore,
} from "../behavioral-store.js";

export const SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION = 1 as const;

interface PersonaRow {
  persona_id: string;
  revision: string;
  content_digest: ContentDigest;
  content_json: string;
  source_frame_ids_json: string;
  creator_principal_id: string;
  recorded_at: string;
}

interface RuleRow {
  rule_id: string;
  revision: string;
  content_digest: ContentDigest;
  category: string;
  directive: string;
  severity: "must" | "should" | "style";
  applicability_json: string;
  confidence_alpha: number;
  confidence_beta: number;
  source_frame_ids_json: string;
  creator_principal_id: string;
  recorded_at: string;
}

interface EvidenceCountRow {
  rule_id: string;
  revision: string;
  observations: number;
  counterexamples: number;
}

interface PromotionRow {
  target_layer: "workspace" | "repository" | "module" | "task";
  module_id: string | null;
  task_type: string | null;
}

interface ReceiptRow {
  payload_digest: ContentDigest;
  receipt_json: string;
}

const SCOPE_PREDICATE = `
  tenant_id = ? AND workspace_id = ?
  AND repository_id = ? AND repository_instance_id = ?
`;

function initializeSchema(db: Database.Database): void {
  const ledger = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lex_behavioral_store_migrations'"
    )
    .get();
  if (ledger) {
    const version = (
      db.prepare("SELECT MAX(version) AS version FROM lex_behavioral_store_migrations").get() as {
        version: number | null;
      }
    ).version;
    if (version !== null && version > SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION) {
      throw new Error(`SQLite behavioral schema ${version} is newer than supported`);
    }
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS lex_behavioral_store_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lex_behavioral_persona_revisions (
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      content_json TEXT NOT NULL,
      source_frame_ids_json TEXT NOT NULL,
      creator_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, persona_id, revision
      )
    );

    CREATE TABLE IF NOT EXISTS lex_behavioral_rule_revisions (
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      category TEXT NOT NULL,
      directive TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('must', 'should', 'style')),
      applicability_json TEXT NOT NULL,
      confidence_alpha REAL NOT NULL CHECK (confidence_alpha >= 0),
      confidence_beta REAL NOT NULL CHECK (confidence_beta >= 0),
      source_frame_ids_json TEXT NOT NULL,
      creator_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      )
    );

    CREATE TABLE IF NOT EXISTS lex_behavioral_evidence (
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_revision TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('observation', 'counterexample', 'correction', 'trust-gap')),
      source_frame_ids_json TEXT NOT NULL,
      note TEXT,
      creator_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, evidence_id
      ),
      FOREIGN KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      ) REFERENCES lex_behavioral_rule_revisions (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      ) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS lex_behavioral_promotions (
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_revision TEXT NOT NULL,
      target_layer TEXT NOT NULL CHECK (target_layer IN ('workspace', 'repository', 'module', 'task')),
      module_id TEXT,
      task_type TEXT,
      creator_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, promotion_id
      ),
      FOREIGN KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      ) REFERENCES lex_behavioral_rule_revisions (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, revision
      ) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS lex_behavioral_write_receipts (
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (
        tenant_id, workspace_id, repository_id, repository_instance_id, idempotency_key
      )
    );

    CREATE INDEX IF NOT EXISTS lex_behavioral_persona_latest_idx
      ON lex_behavioral_persona_revisions (
        tenant_id, workspace_id, repository_id, repository_instance_id, persona_id, recorded_at DESC
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_rule_latest_idx
      ON lex_behavioral_rule_revisions (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, recorded_at DESC
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_evidence_rule_idx
      ON lex_behavioral_evidence (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision
      );
    CREATE INDEX IF NOT EXISTS lex_behavioral_promotion_rule_idx
      ON lex_behavioral_promotions (
        tenant_id, workspace_id, repository_id, repository_instance_id, rule_id, rule_revision,
        recorded_at DESC
      );

    INSERT OR IGNORE INTO lex_behavioral_store_migrations (version, applied_at)
    VALUES (${SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function scopeValues(binding: BehavioralStoreBindingV1): readonly string[] {
  return [
    binding.authorizedScope.tenantId,
    binding.authorizedScope.workspaceId,
    binding.repositoryId,
    binding.repositoryInstanceId,
  ];
}

function validateText(value: string, field: string): void {
  if (!value?.trim()) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
      `${field} must be non-empty`
    );
  }
}

function validateStringList(
  value: readonly string[] | undefined,
  field: string
): readonly string[] {
  const normalized = [...(value ?? [])].map((entry) => entry.trim());
  if (normalized.some((entry) => !entry)) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
      `${field} entries must be non-empty`
    );
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function validateApplicability(value: BehavioralApplicabilityV1): BehavioralApplicabilityV1 {
  if (!value || !["workspace", "repository", "module", "task"].includes(value.layer)) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
      "applicability.layer is invalid"
    );
  }
  const moduleIds = validateStringList(value.moduleIds, "moduleIds");
  const taskTypes = validateStringList(value.taskTypes, "taskTypes");
  const contextTags = validateStringList(value.contextTags, "contextTags");
  if (value.layer === "module" && moduleIds.length === 0) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
      "module applicability requires moduleIds"
    );
  }
  if (value.layer === "task" && taskTypes.length === 0) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
      "task applicability requires taskTypes"
    );
  }
  return Object.freeze({
    layer: value.layer,
    ...(moduleIds.length ? { moduleIds } : {}),
    ...(taskTypes.length ? { taskTypes } : {}),
    ...(contextTags.length ? { contextTags } : {}),
  });
}

function detailedProvenance(
  binding: BehavioralStoreBindingV1,
  row: Pick<PersonaRow, "creator_principal_id" | "source_frame_ids_json" | "recorded_at">
): BehavioralDetailedProvenanceV1 {
  return Object.freeze({
    repositoryId: binding.repositoryId,
    repositoryInstanceId: binding.repositoryInstanceId,
    creatorPrincipalId:
      row.creator_principal_id as BehavioralDetailedProvenanceV1["creatorPrincipalId"],
    sourceFrameIds: Object.freeze(JSON.parse(row.source_frame_ids_json) as string[]),
    recordedAt: row.recorded_at,
  });
}

function receipt(
  operation: BehavioralWriteOperationV1,
  status: BehavioralWriteReceiptV1["status"],
  idempotencyKey: string,
  payloadDigest: ContentDigest,
  resourceId: string,
  revision?: string,
  conflict?: BehavioralWriteReceiptV1["conflict"]
): BehavioralWriteReceiptV1 {
  const unsigned = {
    schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
    operation,
    status,
    idempotencyKey,
    payloadDigest,
    resourceId,
    ...(revision ? { revision } : {}),
    ...(conflict ? { conflict } : {}),
  } as const;
  return Object.freeze({ ...unsigned, receiptDigest: behavioralContentDigest(unsigned) });
}

abstract class SqliteBehavioralView {
  #closed = false;
  readonly #now: () => Date;
  readonly #backendClosed: () => boolean;

  protected constructor(
    readonly binding: BehavioralStoreBindingV1,
    now: () => Date,
    backendClosed: () => boolean
  ) {
    this.#now = now;
    this.#backendClosed = backendClosed;
  }

  protected assertActive(
    capability: (typeof BEHAVIORAL_STORE_CAPABILITIES)[keyof typeof BEHAVIORAL_STORE_CAPABILITIES]
  ): void {
    if (this.#closed || this.#backendClosed()) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.STORE_CLOSED,
        "Scoped behavioral store is closed"
      );
    }
    assertBehavioralCapability(this.binding, capability, this.#now());
  }

  protected currentTime(): Date {
    return this.#now();
  }

  async close(): Promise<void> {
    this.#closed = true;
  }
}

class SqliteBehavioralReadView extends SqliteBehavioralView implements ScopedBehavioralReadStore {
  readonly #db: Database.Database;
  readonly #baselines: readonly BehavioralBaselineRevisionV1[];

  constructor(
    binding: BehavioralStoreBindingV1,
    db: Database.Database,
    now: () => Date,
    backendClosed: () => boolean,
    baselines: readonly BehavioralBaselineRevisionV1[]
  ) {
    super(binding, now, backendClosed);
    this.#db = db;
    this.#baselines = baselines;
  }

  private includeProvenance(mode: "compact" | "detailed" | undefined): boolean {
    if (mode !== "detailed") return false;
    this.assertActive(BEHAVIORAL_STORE_CAPABILITIES.PROVENANCE);
    return true;
  }

  private latestPersonaRows(personaId?: string): PersonaRow[] {
    const values = [...scopeValues(this.binding), ...(personaId ? [personaId] : [])];
    return this.#db
      .prepare(
        `SELECT persona_id, revision, content_digest, content_json, source_frame_ids_json,
                creator_principal_id, recorded_at
           FROM lex_behavioral_persona_revisions
          WHERE ${SCOPE_PREDICATE} ${personaId ? "AND persona_id = ?" : ""}
          ORDER BY persona_id ASC, recorded_at DESC, revision DESC`
      )
      .all(...values) as PersonaRow[];
  }

  private latestRuleRows(ruleId?: string): RuleRow[] {
    const values = [...scopeValues(this.binding), ...(ruleId ? [ruleId] : [])];
    return this.#db
      .prepare(
        `SELECT rule_id, revision, content_digest, category, directive, severity,
                applicability_json, confidence_alpha, confidence_beta,
                source_frame_ids_json, creator_principal_id, recorded_at
           FROM lex_behavioral_rule_revisions
          WHERE ${SCOPE_PREDICATE} ${ruleId ? "AND rule_id = ?" : ""}
          ORDER BY rule_id ASC, recorded_at DESC, revision DESC`
      )
      .all(...values) as RuleRow[];
  }

  private evidenceCounts(): Map<string, EvidenceCountRow> {
    const rows = this.#db
      .prepare(
        `SELECT rule_id, rule_revision AS revision,
                SUM(CASE WHEN kind IN ('observation', 'correction') THEN 1 ELSE 0 END) AS observations,
                SUM(CASE WHEN kind IN ('counterexample', 'trust-gap') THEN 1 ELSE 0 END) AS counterexamples
           FROM lex_behavioral_evidence
          WHERE ${SCOPE_PREDICATE}
          GROUP BY rule_id, rule_revision`
      )
      .all(...scopeValues(this.binding)) as EvidenceCountRow[];
    return new Map(rows.map((row) => [`${row.rule_id}\u0000${row.revision}`, row]));
  }

  private promotion(ruleId: string, revision: string): PromotionRow | undefined {
    return this.#db
      .prepare(
        `SELECT target_layer, module_id, task_type
           FROM lex_behavioral_promotions
          WHERE ${SCOPE_PREDICATE} AND rule_id = ? AND rule_revision = ?
          ORDER BY recorded_at DESC, promotion_id DESC LIMIT 1`
      )
      .get(...scopeValues(this.binding), ruleId, revision) as PromotionRow | undefined;
  }

  private persona(row: PersonaRow, provenance: boolean): PersonaRevisionV1 {
    return Object.freeze({
      personaId: row.persona_id,
      revision: row.revision,
      contentDigest: row.content_digest,
      content: JSON.parse(row.content_json) as unknown,
      ...(provenance ? { provenance: detailedProvenance(this.binding, row) } : {}),
    });
  }

  private rule(
    row: RuleRow,
    counts: ReadonlyMap<string, EvidenceCountRow>,
    provenance: boolean
  ): RuleRevisionV1 {
    const evidence = counts.get(`${row.rule_id}\u0000${row.revision}`);
    const observations = Number(evidence?.observations ?? 0);
    const counterexamples = Number(evidence?.counterexamples ?? 0);
    const alpha = row.confidence_alpha + observations;
    const beta = row.confidence_beta + counterexamples;
    const promotion = this.promotion(row.rule_id, row.revision);
    const original = JSON.parse(row.applicability_json) as BehavioralApplicabilityV1;
    const applicability: BehavioralApplicabilityV1 = promotion
      ? {
          layer: promotion.target_layer,
          ...(promotion.module_id ? { moduleIds: [promotion.module_id] } : {}),
          ...(promotion.task_type ? { taskTypes: [promotion.task_type] } : {}),
          ...(original.contextTags ? { contextTags: original.contextTags } : {}),
        }
      : original;
    return Object.freeze({
      ruleId: row.rule_id,
      revision: row.revision,
      contentDigest: row.content_digest,
      category: row.category,
      directive: row.directive,
      severity: row.severity,
      applicability: Object.freeze(applicability),
      confidence: Object.freeze({
        alpha,
        beta,
        observations,
        counterexamples,
        value: alpha + beta === 0 ? 0.5 : alpha / (alpha + beta),
      }),
      ...(provenance ? { provenance: detailedProvenance(this.binding, row) } : {}),
    });
  }

  async getPersona(
    personaId: string,
    options: { readonly provenance?: "compact" | "detailed" } = {}
  ): Promise<PersonaRevisionV1 | null> {
    this.assertActive(BEHAVIORAL_STORE_CAPABILITIES.READ);
    validateText(personaId, "personaId");
    const row = this.latestPersonaRows(personaId)[0];
    return row ? this.persona(row, this.includeProvenance(options.provenance)) : null;
  }

  async getRule(
    ruleId: string,
    options: { readonly provenance?: "compact" | "detailed" } = {}
  ): Promise<RuleRevisionV1 | null> {
    this.assertActive(BEHAVIORAL_STORE_CAPABILITIES.READ);
    validateText(ruleId, "ruleId");
    const row = this.latestRuleRows(ruleId)[0];
    return row
      ? this.rule(row, this.evidenceCounts(), this.includeProvenance(options.provenance))
      : null;
  }

  async getSnapshot(query: BehavioralSnapshotQueryV1 = {}): Promise<BehavioralSnapshotV1> {
    this.assertActive(BEHAVIORAL_STORE_CAPABILITIES.READ);
    const provenance = this.includeProvenance(query.provenance);
    const personas = [
      ...new Map(this.latestPersonaRows().map((row) => [row.persona_id, row])).values(),
    ].map((row) => this.persona(row, provenance));
    const counts = this.evidenceCounts();
    const rules = [...new Map(this.latestRuleRows().map((row) => [row.rule_id, row])).values()]
      .map((row) => this.rule(row, counts, provenance))
      .filter((rule) => behavioralApplicabilityMatches(rule.applicability, query));
    const baselines = behavioralBaselinesForBinding(this.#baselines, this.binding);
    const revisionInput = {
      personas: personas.map(({ personaId, revision, contentDigest }) => ({
        personaId,
        revision,
        contentDigest,
      })),
      rules: rules.map(({ ruleId, revision, contentDigest, confidence, applicability }) => ({
        ruleId,
        revision,
        contentDigest,
        confidence,
        applicability,
      })),
      baselines: baselines.map(({ source, tenantId, baselineId, revision, contentDigest }) => ({
        source,
        ...(tenantId ? { tenantId } : {}),
        baselineId,
        revision,
        contentDigest,
      })),
    };
    const contentInput = {
      personas: personas.map(({ provenance: _provenance, ...value }) => value),
      rules: rules.map(({ provenance: _provenance, ...value }) => value),
      baselines,
    };
    return Object.freeze({
      schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
      snapshotRevision: behavioralContentDigest(revisionInput),
      contentDigest: behavioralContentDigest(contentInput),
      personas: Object.freeze(personas),
      rules: Object.freeze(rules),
      baselines,
    });
  }
}

class SqliteBehavioralWriteView extends SqliteBehavioralView implements ScopedBehavioralWriteStore {
  readonly #db: Database.Database;

  constructor(
    binding: BehavioralStoreBindingV1,
    db: Database.Database,
    now: () => Date,
    backendClosed: () => boolean
  ) {
    super(binding, now, backendClosed);
    this.#db = db;
  }

  private idempotent(
    operation: BehavioralWriteOperationV1,
    idempotencyKey: string,
    resourceId: string,
    revision: string | undefined,
    payload: unknown,
    apply: () => BehavioralWriteReceiptV1["conflict"] | undefined
  ): BehavioralWriteReceiptV1 {
    this.assertActive(
      operation === "promotion"
        ? BEHAVIORAL_STORE_CAPABILITIES.PROMOTE
        : BEHAVIORAL_STORE_CAPABILITIES.WRITE
    );
    validateText(idempotencyKey, "idempotencyKey");
    const payloadDigest = behavioralContentDigest({ operation, payload });
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.#db
        .prepare(
          `SELECT payload_digest, receipt_json FROM lex_behavioral_write_receipts
            WHERE ${SCOPE_PREDICATE} AND idempotency_key = ?`
        )
        .get(...scopeValues(this.binding), idempotencyKey) as ReceiptRow | undefined;
      if (previous) {
        this.#db.exec("COMMIT");
        if (previous.payload_digest === payloadDigest) {
          const original = JSON.parse(previous.receipt_json) as BehavioralWriteReceiptV1;
          return receipt(
            operation,
            "replayed",
            idempotencyKey,
            payloadDigest,
            original.resourceId,
            original.revision,
            original.conflict
          );
        }
        return receipt(
          operation,
          "conflict",
          idempotencyKey,
          payloadDigest,
          resourceId,
          revision,
          "idempotency-key-reused"
        );
      }

      const conflict = apply();
      const result = receipt(
        operation,
        conflict ? "conflict" : "applied",
        idempotencyKey,
        payloadDigest,
        resourceId,
        revision,
        conflict
      );
      this.#db
        .prepare(
          `INSERT INTO lex_behavioral_write_receipts (
             tenant_id, workspace_id, repository_id, repository_instance_id,
             idempotency_key, payload_digest, receipt_json, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ...scopeValues(this.binding),
          idempotencyKey,
          payloadDigest,
          canonicalBehavioralJson(result),
          this.currentTime().toISOString()
        );
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async putPersonaRevision(
    input: BehavioralRevisionWriteV1<PersonaRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1> {
    validateText(input.value.personaId, "personaId");
    validateText(input.value.revision, "revision");
    const sourceFrameIds = validateStringList(input.value.sourceFrameIds, "sourceFrameIds");
    const stored = {
      personaId: input.value.personaId,
      revision: input.value.revision,
      content: input.value.content,
      sourceFrameIds,
    };
    const contentDigest = behavioralContentDigest(stored.content);
    return this.idempotent(
      "persona-revision",
      input.idempotencyKey,
      stored.personaId,
      stored.revision,
      stored,
      () => {
        const existing = this.#db
          .prepare(
            `SELECT content_digest FROM lex_behavioral_persona_revisions
              WHERE ${SCOPE_PREDICATE} AND persona_id = ? AND revision = ?`
          )
          .get(...scopeValues(this.binding), stored.personaId, stored.revision) as
          { content_digest: ContentDigest } | undefined;
        if (existing)
          return existing.content_digest === contentDigest
            ? undefined
            : "immutable-revision-exists";
        this.#db
          .prepare(
            `INSERT INTO lex_behavioral_persona_revisions (
               tenant_id, workspace_id, repository_id, repository_instance_id,
               persona_id, revision, content_digest, content_json, source_frame_ids_json,
               creator_principal_id, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            ...scopeValues(this.binding),
            stored.personaId,
            stored.revision,
            contentDigest,
            canonicalBehavioralJson(stored.content),
            canonicalBehavioralJson(sourceFrameIds),
            this.binding.authorizedScope.principalId,
            this.currentTime().toISOString()
          );
        return undefined;
      }
    );
  }

  async putRuleRevision(
    input: BehavioralRevisionWriteV1<RuleRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1> {
    const value = input.value;
    for (const [field, text] of [
      ["ruleId", value.ruleId],
      ["revision", value.revision],
      ["category", value.category],
      ["directive", value.directive],
    ] as const) {
      validateText(text, field);
    }
    if (!["must", "should", "style"].includes(value.severity)) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
        "severity is invalid"
      );
    }
    if (
      !Number.isFinite(value.confidencePrior.alpha) ||
      value.confidencePrior.alpha < 0 ||
      !Number.isFinite(value.confidencePrior.beta) ||
      value.confidencePrior.beta < 0
    ) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
        "confidence prior must be finite and non-negative"
      );
    }
    const stored = {
      ...value,
      applicability: validateApplicability(value.applicability),
      sourceFrameIds: validateStringList(value.sourceFrameIds, "sourceFrameIds"),
    };
    const contentDigest = behavioralContentDigest(stored);
    return this.idempotent(
      "rule-revision",
      input.idempotencyKey,
      stored.ruleId,
      stored.revision,
      stored,
      () => {
        const existing = this.#db
          .prepare(
            `SELECT content_digest FROM lex_behavioral_rule_revisions
            WHERE ${SCOPE_PREDICATE} AND rule_id = ? AND revision = ?`
          )
          .get(...scopeValues(this.binding), stored.ruleId, stored.revision) as
          { content_digest: ContentDigest } | undefined;
        if (existing)
          return existing.content_digest === contentDigest
            ? undefined
            : "immutable-revision-exists";
        this.#db
          .prepare(
            `INSERT INTO lex_behavioral_rule_revisions (
             tenant_id, workspace_id, repository_id, repository_instance_id,
             rule_id, revision, content_digest, category, directive, severity,
             applicability_json, confidence_alpha, confidence_beta, source_frame_ids_json,
             creator_principal_id, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            ...scopeValues(this.binding),
            stored.ruleId,
            stored.revision,
            contentDigest,
            stored.category,
            stored.directive,
            stored.severity,
            canonicalBehavioralJson(stored.applicability),
            stored.confidencePrior.alpha,
            stored.confidencePrior.beta,
            canonicalBehavioralJson(stored.sourceFrameIds),
            this.binding.authorizedScope.principalId,
            this.currentTime().toISOString()
          );
        return undefined;
      }
    );
  }

  async recordEvidence(input: BehavioralEvidenceInputV1): Promise<BehavioralWriteReceiptV1> {
    validateText(input.ruleId, "ruleId");
    validateText(input.ruleRevision, "ruleRevision");
    if (!["observation", "counterexample", "correction", "trust-gap"].includes(input.kind)) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
        "evidence kind is invalid"
      );
    }
    const stored = {
      ...input,
      sourceFrameIds: validateStringList(input.sourceFrameIds, "sourceFrameIds"),
      note: input.note?.trim() || undefined,
    };
    const evidenceId = behavioralContentDigest({
      scope: scopeValues(this.binding),
      idempotencyKey: input.idempotencyKey,
    });
    return this.idempotent(
      "evidence",
      input.idempotencyKey,
      evidenceId,
      input.ruleRevision,
      stored,
      () => {
        const exists = this.#db
          .prepare(
            `SELECT 1 AS found FROM lex_behavioral_rule_revisions
            WHERE ${SCOPE_PREDICATE} AND rule_id = ? AND revision = ?`
          )
          .get(...scopeValues(this.binding), input.ruleId, input.ruleRevision);
        if (!exists) return "missing-revision";
        this.#db
          .prepare(
            `INSERT INTO lex_behavioral_evidence (
             tenant_id, workspace_id, repository_id, repository_instance_id,
             evidence_id, rule_id, rule_revision, kind, source_frame_ids_json, note,
             creator_principal_id, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            ...scopeValues(this.binding),
            evidenceId,
            input.ruleId,
            input.ruleRevision,
            input.kind,
            canonicalBehavioralJson(stored.sourceFrameIds),
            stored.note ?? null,
            this.binding.authorizedScope.principalId,
            this.currentTime().toISOString()
          );
        return undefined;
      }
    );
  }

  async promoteRule(input: BehavioralPromotionInputV1): Promise<BehavioralWriteReceiptV1> {
    validateText(input.ruleId, "ruleId");
    validateText(input.ruleRevision, "ruleRevision");
    if (input.target === "module" && !input.moduleId?.trim()) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
        "module promotion requires moduleId"
      );
    }
    if (input.target === "task" && !input.taskType?.trim()) {
      throw new BehavioralStoreError(
        BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
        "task promotion requires taskType"
      );
    }
    const stored = {
      ...input,
      moduleId: input.moduleId?.trim() || undefined,
      taskType: input.taskType?.trim() || undefined,
    };
    const promotionId = behavioralContentDigest({
      scope: scopeValues(this.binding),
      idempotencyKey: input.idempotencyKey,
    });
    return this.idempotent(
      "promotion",
      input.idempotencyKey,
      promotionId,
      input.ruleRevision,
      stored,
      () => {
        const exists = this.#db
          .prepare(
            `SELECT 1 AS found FROM lex_behavioral_rule_revisions
            WHERE ${SCOPE_PREDICATE} AND rule_id = ? AND revision = ?`
          )
          .get(...scopeValues(this.binding), input.ruleId, input.ruleRevision);
        if (!exists) return "missing-revision";
        this.#db
          .prepare(
            `INSERT INTO lex_behavioral_promotions (
             tenant_id, workspace_id, repository_id, repository_instance_id,
             promotion_id, rule_id, rule_revision, target_layer, module_id, task_type,
             creator_principal_id, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            ...scopeValues(this.binding),
            promotionId,
            input.ruleId,
            input.ruleRevision,
            input.target,
            stored.moduleId ?? null,
            stored.taskType ?? null,
            this.binding.authorizedScope.principalId,
            this.currentTime().toISOString()
          );
        return undefined;
      }
    );
  }
}

/** Dedicated scoped SQLite backend. It never opens or adopts legacy LexSona tables. */
export class SqliteBehavioralStoreBackend implements BehavioralStoreBinder {
  readonly #db: Database.Database;
  readonly #now: () => Date;
  readonly #baselines: readonly BehavioralBaselineRevisionV1[];
  #closed = false;

  constructor(databasePath: string, options: BehavioralStoreBackendOptionsV1 = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#baselines = immutableBehavioralBaselines(options.baselines);
    const path = resolve(databasePath);
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new Database(path);
    try {
      this.#db.pragma("foreign_keys = ON");
      this.#db.pragma("journal_mode = WAL");
      initializeSchema(this.#db);
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  bindRead(binding: BehavioralStoreBindingV1): ScopedBehavioralReadStore {
    const immutable = immutableBehavioralBinding(binding);
    assertBehavioralCapability(immutable, BEHAVIORAL_STORE_CAPABILITIES.READ, this.#now());
    return new SqliteBehavioralReadView(
      immutable,
      this.#db,
      this.#now,
      () => this.#closed,
      this.#baselines
    );
  }

  bindWrite(binding: BehavioralStoreBindingV1): ScopedBehavioralWriteStore {
    const immutable = immutableBehavioralBinding(binding);
    if (
      !immutable.authorizedScope.capabilities.includes(BEHAVIORAL_STORE_CAPABILITIES.WRITE) &&
      !immutable.authorizedScope.capabilities.includes(BEHAVIORAL_STORE_CAPABILITIES.PROMOTE)
    ) {
      assertBehavioralCapability(immutable, BEHAVIORAL_STORE_CAPABILITIES.WRITE, this.#now());
    }
    return new SqliteBehavioralWriteView(immutable, this.#db, this.#now, () => this.#closed);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#db.close();
  }
}
