import { createHash } from "node:crypto";

import type {
  AuthorizedScopeV1,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  RepositoryInstanceId,
  TenantId,
} from "../../shared/runtime-scope/index.js";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "../../shared/runtime-scope/index.js";

export const BEHAVIORAL_STORE_CONTRACT_VERSION = 1 as const;

export const BEHAVIORAL_STORE_CAPABILITIES = Object.freeze({
  READ: "behavior:read" as CapabilityId,
  WRITE: "behavior:write" as CapabilityId,
  PROMOTE: "behavior:promote" as CapabilityId,
  PROVENANCE: "behavior:provenance" as CapabilityId,
});

export type BehavioralStoreCapability =
  (typeof BEHAVIORAL_STORE_CAPABILITIES)[keyof typeof BEHAVIORAL_STORE_CAPABILITIES];

export const BEHAVIORAL_STORE_ERROR_CODES = Object.freeze({
  INVALID_BINDING: "LEX_BEHAVIORAL_INVALID_BINDING",
  CAPABILITY_MISSING: "LEX_BEHAVIORAL_CAPABILITY_MISSING",
  SCOPE_EXPIRED: "LEX_BEHAVIORAL_SCOPE_EXPIRED",
  STORE_CLOSED: "LEX_BEHAVIORAL_STORE_CLOSED",
  INVALID_INPUT: "LEX_BEHAVIORAL_INVALID_INPUT",
  REVISION_CONFLICT: "LEX_BEHAVIORAL_REVISION_CONFLICT",
});

export type BehavioralStoreErrorCode =
  (typeof BEHAVIORAL_STORE_ERROR_CODES)[keyof typeof BEHAVIORAL_STORE_ERROR_CODES];

export class BehavioralStoreError extends Error {
  constructor(
    public readonly code: BehavioralStoreErrorCode,
    message: string,
    public readonly requiredCapability?: BehavioralStoreCapability
  ) {
    super(message);
    this.name = "BehavioralStoreError";
  }
}

/** Trusted composition input. Normal operations never accept authority selectors. */
export interface BehavioralStoreBindingV1 {
  readonly schemaVersion: typeof BEHAVIORAL_STORE_CONTRACT_VERSION;
  readonly authorizedScope: AuthorizedScopeV1;
  readonly repositoryId: RepositoryId;
  readonly repositoryInstanceId: RepositoryInstanceId;
}

export type BehavioralRuleSeverityV1 = "must" | "should" | "style";
export type BehavioralRuleLayerV1 = "workspace" | "repository" | "module" | "task";

export interface BehavioralApplicabilityV1 {
  readonly layer: BehavioralRuleLayerV1;
  readonly moduleIds?: readonly string[];
  readonly taskTypes?: readonly string[];
  readonly contextTags?: readonly string[];
}

export interface BehavioralConfidencePriorV1 {
  readonly alpha: number;
  readonly beta: number;
}

export interface PersonaRevisionInputV1 {
  readonly personaId: string;
  readonly revision: string;
  readonly content: unknown;
  readonly sourceFrameIds?: readonly string[];
}

export interface RuleRevisionInputV1 {
  readonly ruleId: string;
  readonly revision: string;
  readonly category: string;
  readonly directive: string;
  readonly severity: BehavioralRuleSeverityV1;
  readonly applicability: BehavioralApplicabilityV1;
  readonly confidencePrior: BehavioralConfidencePriorV1;
  readonly sourceFrameIds?: readonly string[];
}

export interface BehavioralDetailedProvenanceV1 {
  readonly repositoryId: RepositoryId;
  readonly repositoryInstanceId: RepositoryInstanceId;
  readonly creatorPrincipalId: PrincipalId;
  readonly sourceFrameIds: readonly string[];
  readonly recordedAt: string;
}

export interface PersonaRevisionV1 {
  readonly personaId: string;
  readonly revision: string;
  readonly contentDigest: ContentDigest;
  readonly content: unknown;
  readonly provenance?: BehavioralDetailedProvenanceV1;
}

export interface RuleRevisionV1 {
  readonly ruleId: string;
  readonly revision: string;
  readonly contentDigest: ContentDigest;
  readonly category: string;
  readonly directive: string;
  readonly severity: BehavioralRuleSeverityV1;
  readonly applicability: BehavioralApplicabilityV1;
  readonly confidence: {
    readonly alpha: number;
    readonly beta: number;
    readonly observations: number;
    readonly counterexamples: number;
    readonly value: number;
  };
  readonly provenance?: BehavioralDetailedProvenanceV1;
}

interface BehavioralBaselineRevisionBaseV1 {
  readonly baselineId: string;
  readonly revision: string;
  readonly contentDigest: ContentDigest;
  readonly content: unknown;
  readonly reviewedAt: string;
}

/** Reviewed baseline input is separate from tenant-owned rows and cannot be mutated by the store. */
export type BehavioralBaselineRevisionV1 = BehavioralBaselineRevisionBaseV1 &
  (
    | { readonly source: "curated-global"; readonly tenantId?: never }
    | { readonly source: "tenant-default"; readonly tenantId: TenantId }
  );

export interface BehavioralSnapshotQueryV1 {
  readonly moduleId?: string;
  readonly taskType?: string;
  readonly contextTags?: readonly string[];
  readonly provenance?: "compact" | "detailed";
}

export interface BehavioralSnapshotV1 {
  readonly schemaVersion: typeof BEHAVIORAL_STORE_CONTRACT_VERSION;
  readonly snapshotRevision: ContentDigest;
  readonly contentDigest: ContentDigest;
  readonly personas: readonly PersonaRevisionV1[];
  readonly rules: readonly RuleRevisionV1[];
  readonly baselines: readonly BehavioralBaselineRevisionV1[];
}

export type BehavioralEvidenceKindV1 =
  "observation" | "counterexample" | "correction" | "trust-gap";

export interface BehavioralEvidenceInputV1 {
  readonly idempotencyKey: string;
  readonly ruleId: string;
  readonly ruleRevision: string;
  readonly kind: BehavioralEvidenceKindV1;
  readonly sourceFrameIds: readonly string[];
  readonly note?: string;
}

export interface BehavioralPromotionInputV1 {
  readonly idempotencyKey: string;
  readonly ruleId: string;
  readonly ruleRevision: string;
  readonly target: BehavioralRuleLayerV1;
  readonly moduleId?: string;
  readonly taskType?: string;
}

export interface BehavioralRevisionWriteV1<T> {
  readonly idempotencyKey: string;
  readonly value: T;
}

export type BehavioralWriteOperationV1 =
  "persona-revision" | "rule-revision" | "evidence" | "promotion";

export interface BehavioralWriteReceiptV1 {
  readonly schemaVersion: typeof BEHAVIORAL_STORE_CONTRACT_VERSION;
  readonly operation: BehavioralWriteOperationV1;
  readonly status: "applied" | "replayed" | "conflict";
  readonly idempotencyKey: string;
  readonly payloadDigest: ContentDigest;
  readonly receiptDigest: ContentDigest;
  readonly resourceId: string;
  readonly revision?: string;
  readonly conflict?: "idempotency-key-reused" | "immutable-revision-exists" | "missing-revision";
}

export interface ScopedBehavioralReadStore {
  readonly binding: BehavioralStoreBindingV1;
  getSnapshot(query?: BehavioralSnapshotQueryV1): Promise<BehavioralSnapshotV1>;
  getPersona(
    personaId: string,
    options?: { readonly provenance?: "compact" | "detailed" }
  ): Promise<PersonaRevisionV1 | null>;
  getRule(
    ruleId: string,
    options?: { readonly provenance?: "compact" | "detailed" }
  ): Promise<RuleRevisionV1 | null>;
  close(): Promise<void>;
}

export interface ScopedBehavioralWriteStore {
  readonly binding: BehavioralStoreBindingV1;
  putPersonaRevision(
    input: BehavioralRevisionWriteV1<PersonaRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1>;
  putRuleRevision(
    input: BehavioralRevisionWriteV1<RuleRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1>;
  recordEvidence(input: BehavioralEvidenceInputV1): Promise<BehavioralWriteReceiptV1>;
  promoteRule(input: BehavioralPromotionInputV1): Promise<BehavioralWriteReceiptV1>;
  close(): Promise<void>;
}

/** Public integration socket: it carries scoped data operations, never driver handles. */
export interface BehavioralStoreBinder {
  bindRead(binding: BehavioralStoreBindingV1): ScopedBehavioralReadStore;
  bindWrite(binding: BehavioralStoreBindingV1): ScopedBehavioralWriteStore;
  close(): Promise<void>;
}

export interface BehavioralStoreBackendOptionsV1 {
  readonly baselines?: readonly BehavioralBaselineRevisionV1[];
  readonly now?: () => Date;
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

export function canonicalBehavioralJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function behavioralContentDigest(value: unknown): ContentDigest {
  return `sha256:${createHash("sha256").update(canonicalBehavioralJson(value)).digest("hex")}` as ContentDigest;
}

function isCanonicalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function immutableBehavioralBaselines(
  baselines: readonly BehavioralBaselineRevisionV1[] = []
): readonly BehavioralBaselineRevisionV1[] {
  return Object.freeze(
    [...baselines]
      .map((baseline) => {
        if (
          !nonEmpty(baseline.baselineId) ||
          !nonEmpty(baseline.revision) ||
          Number.isNaN(Date.parse(baseline.reviewedAt)) ||
          behavioralContentDigest(baseline.content) !== baseline.contentDigest ||
          (baseline.source === "tenant-default" && !isCanonicalId(baseline.tenantId)) ||
          (baseline.source === "curated-global" && baseline.tenantId !== undefined)
        ) {
          throw new BehavioralStoreError(
            BEHAVIORAL_STORE_ERROR_CODES.INVALID_INPUT,
            `Baseline ${baseline.baselineId || "unknown"} is invalid or has mismatched ownership/content digest`
          );
        }
        return Object.freeze(structuredClone(baseline));
      })
      .sort((left, right) =>
        `${left.source}\u0000${left.tenantId ?? ""}\u0000${left.baselineId}`.localeCompare(
          `${right.source}\u0000${right.tenantId ?? ""}\u0000${right.baselineId}`
        )
      )
  );
}

export function behavioralBaselinesForBinding(
  baselines: readonly BehavioralBaselineRevisionV1[],
  binding: BehavioralStoreBindingV1
): readonly BehavioralBaselineRevisionV1[] {
  return Object.freeze(
    baselines.filter(
      (baseline) =>
        baseline.source === "curated-global" ||
        baseline.tenantId === binding.authorizedScope.tenantId
    )
  );
}

export function behavioralApplicabilityMatches(
  applicability: BehavioralApplicabilityV1,
  query: BehavioralSnapshotQueryV1
): boolean {
  if (
    applicability.moduleIds?.length &&
    (!query.moduleId || !applicability.moduleIds.includes(query.moduleId))
  ) {
    return false;
  }
  if (
    applicability.taskTypes?.length &&
    (!query.taskType || !applicability.taskTypes.includes(query.taskType))
  ) {
    return false;
  }
  if (
    applicability.contextTags?.length &&
    (!query.contextTags?.length ||
      !query.contextTags.some((tag) => applicability.contextTags?.includes(tag)))
  ) {
    return false;
  }
  return true;
}

export function immutableBehavioralBinding(
  binding: BehavioralStoreBindingV1
): BehavioralStoreBindingV1 {
  const scope = binding?.authorizedScope;
  if (
    binding?.schemaVersion !== BEHAVIORAL_STORE_CONTRACT_VERSION ||
    scope?.schemaVersion !== RUNTIME_SCOPE_CONTRACT_VERSION ||
    !isCanonicalId(scope.tenantId) ||
    !isCanonicalId(scope.workspaceId) ||
    !isCanonicalId(scope.principalId) ||
    !isCanonicalId(binding.repositoryId) ||
    !isCanonicalId(binding.repositoryInstanceId) ||
    !Array.isArray(scope.capabilities) ||
    !nonEmpty(scope.grantId) ||
    !nonEmpty(scope.authorityVersion) ||
    !nonEmpty(scope.scopeVersion) ||
    !nonEmpty(scope.authorityDigest) ||
    !nonEmpty(scope.verifiedAt) ||
    Number.isNaN(Date.parse(scope.verifiedAt)) ||
    (scope.expiresAt !== undefined && Number.isNaN(Date.parse(scope.expiresAt)))
  ) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.INVALID_BINDING,
      "BehavioralStore requires canonical tenant, workspace, repository-instance, and principal binding"
    );
  }
  const capabilities: readonly CapabilityId[] = scope.capabilities;
  return Object.freeze({
    schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
    authorizedScope: Object.freeze({
      ...scope,
      capabilities: Object.freeze([...capabilities]),
    }),
    repositoryId: binding.repositoryId,
    repositoryInstanceId: binding.repositoryInstanceId,
  });
}

export function assertBehavioralCapability(
  binding: BehavioralStoreBindingV1,
  capability: BehavioralStoreCapability,
  now: Date
): void {
  if (
    binding.authorizedScope.expiresAt &&
    Date.parse(binding.authorizedScope.expiresAt) <= now.getTime()
  ) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.SCOPE_EXPIRED,
      "Authorized behavioral scope has expired"
    );
  }
  if (!binding.authorizedScope.capabilities.includes(capability)) {
    throw new BehavioralStoreError(
      BEHAVIORAL_STORE_ERROR_CODES.CAPABILITY_MISSING,
      `BehavioralStore operation requires ${capability}`,
      capability
    );
  }
}
