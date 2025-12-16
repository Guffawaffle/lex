/**
 * Frame Schema - Zod validation for Frame structures
 *
 * This module provides Zod schemas for Frame validation.
 * The canonical TypeScript types are in ./frame.ts
 *
 * Per AX-CONTRACT.md v0.1, §2.5: Frame Emission for Core Workflows
 *
 * @module shared/types
 */

import { z } from "zod";

/**
 * Capability tier enum - classifies task complexity
 */
export const CapabilityTierSchema = z.enum(["senior", "mid", "junior"]);

export type CapabilityTier = z.infer<typeof CapabilityTierSchema>;

/**
 * Task complexity metadata
 */
export const TaskComplexitySchema = z.object({
  /** Capability tier required for this task */
  tier: CapabilityTierSchema,

  /** Model/executor assigned to the task */
  assignedModel: z.string().optional(),

  /** Whether task was escalated */
  escalated: z.boolean().optional(),

  /** Reason for escalation */
  escalationReason: z.string().optional(),

  /** Number of retry attempts */
  retryCount: z.number().int().nonnegative().optional(),
});

export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

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
  sessionId: z.string().optional().describe("Session identifier for Turn Cost tracking"),
  timestamp: z.string().optional().describe("ISO 8601 timestamp of measurement"),
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
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601 format" }),

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
  jira: z.string().optional(),

  /** Searchable keywords for recall */
  keywords: z.array(z.string()).optional(),

  /** CodeAtlas reference */
  atlas_frame_id: z.string().optional(),

  /** Active feature flags */
  feature_flags: z.array(z.string()).optional(),

  /** Required permissions */
  permissions: z.array(z.string()).optional(),

  /** Associated image references */
  image_ids: z.array(z.string()).optional(),

  // === v2 fields (Execution Provenance) ===

  /** Unique run/execution identifier */
  runId: z.string().optional(),

  /** Hash of the plan that was executed */
  planHash: z.string().optional(),

  /** Token/prompt usage tracking */
  spend: SpendMetadataSchema.optional(),

  // === v3 fields (LexRunner Integration) ===

  /** OAuth2/JWT user identifier for isolation */
  userId: z.string().optional(),

  /** Role that executed (e.g., "senior-dev", "eager-pm") */
  executorRole: z.string().optional(),

  /** MCP/CLI tools invoked during execution */
  toolCalls: z.array(z.string()).optional(),

  /** Safety profile applied */
  guardrailProfile: z.string().optional(),

  // === v4 fields (Turn Cost Measurement) ===

  /** Turn Cost coordination metrics */
  turnCost: TurnCostSchema.optional(),

  /** Capability tier classification (governance) */
  capabilityTier: CapabilityTierSchema.optional(),

  /** Task complexity metadata (governance) */
  taskComplexity: TaskComplexitySchema.optional(),
});

export type Frame = z.infer<typeof FrameSchema>;

/**
 * Frame schema version constant
 * v1: Initial schema (pre-0.4.0)
 * v2: Added runId, planHash, spend fields for execution provenance (0.4.0)
 * v3: Added executorRole, toolCalls, guardrailProfile for LexRunner (0.5.0)
 * v4: Added turnCost for governance Turn Cost measurement (2.0.0-alpha.1)
 */
export const FRAME_SCHEMA_VERSION = 4;

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
