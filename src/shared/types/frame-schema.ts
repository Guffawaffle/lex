/**
 * Frame Schema - Zod validation for Frame structures
 *
 * This module is the canonical source of truth for Frame validation.
 * Public TypeScript types are inferred from these schemas and re-exported
 * through compatibility facades where needed.
 *
 * Per AX-CONTRACT.md v0.1, §2.5: Frame Emission for Core Workflows
 *
 * @module shared/types
 */

import { z } from "zod";

function canonicalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const OptionalCanonicalString = z.preprocess(
  canonicalizeOptionalString,
  z.string().min(1).optional()
);

const OptionalCanonicalDateTimeString = z.preprocess(
  canonicalizeOptionalString,
  z.string().datetime({ offset: true }).optional()
);

/**
 * Capability tier enum - classifies task complexity
 */
export const CapabilityTierSchema = z.enum(["senior", "mid", "junior"]);

export type CapabilityTier = z.infer<typeof CapabilityTierSchema>;

/**
 * Task complexity metadata
 *
 * Note: rapidly changing model-attribution fields are intentionally excluded
 * from the public Frame contract for now. If model governance returns here,
 * it should come back with a clearer configuration story than ad hoc frame
 * payload fields.
 */
const TaskComplexityFieldsSchema = z.object({
  /** Capability tier required for this task */
  tier: CapabilityTierSchema,

  /** Model/executor assigned to the task */
  assignedModel: OptionalCanonicalString,

  /** Whether task was escalated */
  escalated: z.boolean().optional(),

  /** Reason for escalation */
  escalationReason: OptionalCanonicalString,

  /** Number of retry attempts */
  retryCount: z.number().int().nonnegative().optional(),
});

export const TaskComplexitySchema = TaskComplexityFieldsSchema.catchall(z.unknown())
  .superRefine((value, ctx) => {
    if ("actualModel" in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualModel"],
        message:
          "taskComplexity.actualModel has been deprecated; keep model governance outside the canonical Frame contract",
      });
    }

    if ("tierMismatch" in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tierMismatch"],
        message:
          "taskComplexity.tierMismatch has been deprecated; keep model governance outside the canonical Frame contract",
      });
    }
  })
  .transform((value) => {
    const { actualModel: _actualModel, tierMismatch: _tierMismatch, ...rest } = value;
    return TaskComplexityFieldsSchema.parse(rest);
  });

export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const LmvStatusSchema = z.enum([
  "observed",
  "inferred",
  "decided",
  "blocked",
  "invalidated",
  "superseded",
]);

export type LmvStatus = z.infer<typeof LmvStatusSchema>;

export const LmvConfidenceSchema = z.enum(["high", "medium", "low", "uncertain"]);

export type LmvConfidence = z.infer<typeof LmvConfidenceSchema>;

export const LmvEvidenceStatusSchema = z.enum([
  "supports",
  "contradicts",
  "contextual",
  "superseded",
]);

export type LmvEvidenceStatus = z.infer<typeof LmvEvidenceStatusSchema>;

export const LmvStopConditionSchema = z.object({
  code: z.string().min(1),
  action: z.enum(["stop", "preview", "escalate", "require_approval"]),
  message: z.string().min(1),
});

export type LmvStopCondition = z.infer<typeof LmvStopConditionSchema>;

export const LmvEvidenceRefSchema = z.object({
  kind: z.enum([
    "file",
    "command",
    "log",
    "test",
    "receipt",
    "frame",
    "commit",
    "pull_request",
    "issue",
    "runtime",
    "url",
    "manual",
  ]),
  ref: z.string().min(1),
  status: LmvEvidenceStatusSchema,
  observedAt: OptionalCanonicalDateTimeString,
  digest: OptionalCanonicalString,
  exitCode: z.number().int().optional(),
  line: z.number().int().positive().optional(),
  artifactPath: OptionalCanonicalString,
  receiptId: OptionalCanonicalString,
  note: OptionalCanonicalString,
});

export type LmvEvidenceRef = z.infer<typeof LmvEvidenceRefSchema>;

export const LmvExperimentSchema = z.object({
  hypothesis: z.string().min(1),
  bounds: z.object({
    pathScope: z.array(z.string()).optional(),
    maxAttempts: z.number().int().positive().optional(),
    timeBudgetSeconds: z.number().positive().optional(),
    allowedEffects: z.array(z.string()).optional(),
    stopConditions: z.array(LmvStopConditionSchema).optional(),
  }),
  rollbackOrContainment: OptionalCanonicalString,
  result: z.enum(["supported", "falsified", "inconclusive", "blocked"]),
  lesson: z.string().min(1),
  changedFutureAction: z.boolean(),
});

export type LmvExperiment = z.infer<typeof LmvExperimentSchema>;

export const LmvEpistemicSchema = z.object({
  claim: z.string().min(1),
  evidence: z.array(LmvEvidenceRefSchema),
  status: LmvStatusSchema,
  confidence: LmvConfidenceSchema,
  uncertainty: z.array(z.string()).optional(),
  lineage: z
    .object({
      derivedFrom: z.array(z.string()).optional(),
      sourceFrames: z.array(z.string()).optional(),
      sourceReceipts: z.array(z.string()).optional(),
    })
    .optional(),
  contradictions: z.array(z.string()).optional(),
  invalidatedBy: z.array(z.string()).optional(),
  nextValidation: OptionalCanonicalString,
  boundaries: z
    .object({
      trustZone: OptionalCanonicalString,
      privilege: OptionalCanonicalString,
      dataClass: OptionalCanonicalString,
      egress: OptionalCanonicalString,
      pathScope: z.array(z.string()).optional(),
      doesNotAuthorize: z.array(z.string()).optional(),
    })
    .optional(),
  experiment: LmvExperimentSchema.optional(),
});

export type LmvEpistemic = z.infer<typeof LmvEpistemicSchema>;

/**
 * SpendMetadata schema - tracks LLM usage
 */
export const SpendMetadataSchema = z.object({
  prompts: z.number().int().nonnegative().optional(),
  tokens_estimated: z.number().int().nonnegative().optional(),
});

export type SpendMetadata = z.infer<typeof SpendMetadataSchema>;

/**
 * TurnCostComponent schema - Turn Cost components
 */
export const TurnCostComponentSchema = z.object({
  latency: z.number().describe("Response time in ms"),
  contextReset: z.number().describe("Tokens for context re-establishment"),
  renegotiation: z.number().describe("Count of clarification turns"),
  tokenBloat: z.number().describe("Excess tokens beyond minimum"),
  attentionSwitch: z.number().describe("Human intervention count"),
});

export type TurnCostComponent = z.infer<typeof TurnCostComponentSchema>;

/**
 * TurnCostWeights schema - Turn Cost weight configuration
 */
export const TurnCostWeightsSchema = z.object({
  lambda: z.number().default(0.1).describe("Latency weight"),
  gamma: z.number().default(0.2).describe("Context reset weight"),
  rho: z.number().default(0.3).describe("Renegotiation weight"),
  tau: z.number().default(0.1).describe("Token bloat weight"),
  alpha: z.number().default(0.3).describe("Attention switch weight"),
});

export type TurnCostWeights = z.infer<typeof TurnCostWeightsSchema>;

/**
 * TurnCost schema - coordination cost tracking
 */
export const TurnCostSchema = z.object({
  components: TurnCostComponentSchema,
  weights: TurnCostWeightsSchema.optional(),
  weightedScore: z.number().optional().describe("Calculated weighted Turn Cost score"),
  sessionId: OptionalCanonicalString.describe("Session identifier for Turn Cost tracking"),
  timestamp: OptionalCanonicalDateTimeString.describe("ISO 8601 timestamp of measurement"),
});

export type TurnCost = z.infer<typeof TurnCostSchema>;

/**
 * StatusSnapshot schema - current status and next action
 */
export const StatusSnapshotSchema = z.object({
  /** What should happen next - REQUIRED */
  next_action: z.string().min(1, "next_action is required"),

  /** Current blockers */
  blockers: z.array(z.string()).optional(),

  /** Merge-specific blockers */
  merge_blockers: z.array(z.string()).optional(),

  /** Failing test identifiers */
  tests_failing: z.array(z.string()).optional(),
});

export type StatusSnapshot = z.infer<typeof StatusSnapshotSchema>;

export const ContradictionResolutionSchema = z.object({
  type: z.enum(["supersede", "scope", "keep-both", "cancel"]),
  contradicts_frame_id: z.string(),
  scope: OptionalCanonicalString,
  note: OptionalCanonicalString,
});

export type ContradictionResolution = z.infer<typeof ContradictionResolutionSchema>;

/**
 * Frame schema v4 - the canonical shape for memory units
 *
 * @example
 * ```json
 * {
 *   "id": "f-550e8400-e29b-41d4-a716-446655440000",
 *   "timestamp": "2025-12-01T10:30:00Z",
 *   "branch": "main",
 *   "module_scope": ["memory/store"],
 *   "summary_caption": "Fixed recall FTS5 hyphen handling",
 *   "reference_point": "ax-002-recall-fix",
 *   "status_snapshot": {
 *     "next_action": "Test with compound queries"
 *   },
 *   "keywords": ["recall", "FTS5", "search"]
 * }
 * ```
 */
export const FrameSchema = z.object({
  // === Required fields ===

  /** Unique identifier (UUID recommended) */
  id: z.string().min(1, "id is required"),

  /** ISO 8601 timestamp of creation */
  timestamp: z.string().datetime({ offset: true, message: "timestamp must be ISO 8601 format" }),

  /** Git branch or context identifier */
  branch: z.string().min(1, "branch is required"),

  /** Modules/areas touched */
  module_scope: z.array(z.string()).min(1, "module_scope must have at least one entry"),

  /** Human-readable summary of what was done */
  summary_caption: z.string().min(1, "summary_caption is required"),

  /** Unique reference for recall */
  reference_point: z.string().min(1, "reference_point is required"),

  /** Current status and next action */
  status_snapshot: StatusSnapshotSchema,

  // === Optional v1 fields ===

  /** External ticket reference */
  jira: OptionalCanonicalString,

  /** Searchable keywords for recall */
  keywords: z.array(z.string()).optional(),

  /** CodeAtlas reference */
  atlas_frame_id: OptionalCanonicalString,

  /** Active feature flags */
  feature_flags: z.array(z.string()).optional(),

  /** Required permissions */
  permissions: z.array(z.string()).optional(),

  /**
   * Associated image references.
   *
   * Experimental: this remains in the contract as a marker for future
   * token-cost-aware recall work. It is optional and may be populated by
   * image-capable ingestion paths.
   */
  image_ids: z.array(z.string()).optional(),

  // === v2 fields (Execution Provenance) ===

  /** Unique run/execution identifier */
  runId: OptionalCanonicalString,

  /** Hash of the plan that was executed */
  planHash: OptionalCanonicalString,

  /** Token/prompt usage tracking */
  spend: SpendMetadataSchema.optional(),

  // === v3 fields (LexRunner Integration) ===

  /** OAuth2/JWT user identifier for isolation */
  userId: OptionalCanonicalString,

  /** Role that executed (e.g., "senior-dev", "eager-pm") */
  executorRole: OptionalCanonicalString,

  /** MCP/CLI tools invoked during execution */
  toolCalls: z.array(z.string()).optional(),

  /** Safety profile applied */
  guardrailProfile: OptionalCanonicalString,

  // === v4 fields (Turn Cost Measurement) ===

  /** Turn Cost coordination metrics */
  turnCost: TurnCostSchema.optional(),

  /** Capability tier classification (governance) */
  capabilityTier: CapabilityTierSchema.optional(),

  /** Task complexity metadata (governance) */
  taskComplexity: TaskComplexitySchema.optional(),

  // === v5 fields (Deduplication) ===

  /** Frame ID that supersedes this one */
  superseded_by: OptionalCanonicalString,

  /** Frame IDs that were merged into this one */
  merged_from: z.array(z.string()).optional(),

  // === v6 fields (Contradiction resolution) ===

  contradiction_resolution: ContradictionResolutionSchema.optional(),

  // === v7 fields (LMV epistemic envelope) ===

  lmv: LmvEpistemicSchema.optional(),
});

export type Frame = z.infer<typeof FrameSchema>;

/**
 * Frame schema version constant
 * v1: Initial schema (pre-0.4.0)
 * v2: Added runId, planHash, spend fields for execution provenance (0.4.0)
 * v3: Added executorRole, toolCalls, guardrailProfile for LexRunner (0.5.0)
 * v4: Added turnCost for governance Turn Cost measurement (2.0.0-alpha.1)
 * v5: Added superseded_by, merged_from for frame deduplication (2.1.x)
 * v6: Added contradiction_resolution for contradiction detection (2.3.0)
 * v7: Added optional LMV epistemic envelope for evidence-backed recall (2.8.0)
 */
export const FRAME_SCHEMA_VERSION = 7;

/**
 * Validate a Frame using Zod schema
 *
 * @param value - Unknown value to validate
 * @returns true if valid Frame, false otherwise
 */
export function isFrame(value: unknown): value is Frame {
  return FrameSchema.safeParse(value).success;
}

/**
 * Parse and validate a Frame, throwing on error
 *
 * @param value - Unknown value to parse
 * @returns Validated Frame
 * @throws ZodError if validation fails
 */
export function parseFrame(value: unknown): Frame {
  return FrameSchema.parse(value);
}

/**
 * Parse a Frame safely, returning result object
 *
 * @param value - Unknown value to parse
 * @returns SafeParseResult with success/data or error
 */
export function safeParseFrame(value: unknown) {
  return FrameSchema.safeParse(value);
}

/**
 * Create a minimal valid Frame for runner emission
 *
 * @param params - Required frame parameters
 * @returns Validated Frame
 *
 * @example
 * ```typescript
 * const frame = createFrame({
 *   branch: 'main',
 *   module_scope: ['PR-101', 'PR-102'],
 *   summary_caption: 'Merged 2 PRs via merge-weave',
 *   reference_point: 'merge-weave-2025-12-01',
 *   next_action: 'Run e2e tests'
 * });
 * ```
 */
export function createFrame(params: {
  branch: string;
  module_scope: string[];
  summary_caption: string;
  reference_point: string;
  next_action: string;
  keywords?: string[];
  runId?: string;
  executorRole?: string;
  toolCalls?: string[];
  spend?: SpendMetadata;
}): Frame {
  return FrameSchema.parse({
    id: `f-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    branch: params.branch,
    module_scope: params.module_scope,
    summary_caption: params.summary_caption,
    reference_point: params.reference_point,
    status_snapshot: {
      next_action: params.next_action,
    },
    keywords: params.keywords,
    runId: params.runId,
    executorRole: params.executorRole,
    toolCalls: params.toolCalls,
    spend: params.spend,
  });
}
