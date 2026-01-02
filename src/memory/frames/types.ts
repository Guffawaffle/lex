// Note: This file provides Zod runtime validation schemas for Frame types.
// The canonical TypeScript types are in src/shared/types/frame.ts.
// Future: Consider consolidating into a single source with both Zod schemas and TS types.
// This file originated from LexBrain packages/sdk-ts/src/index.ts (pre-merge)

import { z } from "zod";

/**
 * Frame metadata schema
 * Represents a timestamped work session snapshot with human-memorable reference points
 */

export const FrameSpendMetadata = z.object({
  prompts: z.number().optional(),
  tokens_estimated: z.number().optional(),
});

export type FrameSpendMetadata = z.infer<typeof FrameSpendMetadata>;

/**
 * Turn Cost Component schema
 * Represents the five components of Turn Cost from the governance thesis
 */
export const TurnCostComponent = z.object({
  latency: z.number().describe("Response time in ms"),
  contextReset: z.number().describe("Tokens for context re-establishment"),
  renegotiation: z.number().describe("Count of clarification turns"),
  tokenBloat: z.number().describe("Excess tokens beyond minimum"),
  attentionSwitch: z.number().describe("Human intervention count"),
});

export type TurnCostComponent = z.infer<typeof TurnCostComponent>;

/**
 * Turn Cost Weights schema
 * Default weights from the governance thesis: λL + γC + ρR + τT + αA
 */
export const TurnCostWeights = z.object({
  lambda: z.number().default(0.1).describe("Latency weight"),
  gamma: z.number().default(0.2).describe("Context reset weight"),
  rho: z.number().default(0.3).describe("Renegotiation weight"),
  tau: z.number().default(0.1).describe("Token bloat weight"),
  alpha: z.number().default(0.3).describe("Attention switch weight"),
});

export type TurnCostWeights = z.infer<typeof TurnCostWeights>;

/**
 * Turn Cost schema
 * Tracks coordination cost via the Turn Cost formula from governance thesis
 * Turn Cost = λL + γC + ρR + τT + αA
 */
export const TurnCost = z.object({
  components: TurnCostComponent,
  weights: TurnCostWeights.optional(),
  weightedScore: z.number().optional().describe("Calculated weighted Turn Cost score"),
  sessionId: z.string().optional().describe("Session identifier for Turn Cost tracking"),
  timestamp: z.string().optional().describe("ISO 8601 timestamp of measurement"),
});

export type TurnCost = z.infer<typeof TurnCost>;

export const FrameStatusSnapshot = z.object({
  next_action: z.string(),
  blockers: z.array(z.string()).optional(),
  merge_blockers: z.array(z.string()).optional(),
  tests_failing: z.array(z.string()).optional(),
});

export type FrameStatusSnapshot = z.infer<typeof FrameStatusSnapshot>;

/**
 * Capability tier classification schema
 * Represents the complexity level of a task based on governance model
 */
export const CapabilityTier = z.enum(["senior", "mid", "junior"]);

export type CapabilityTier = z.infer<typeof CapabilityTier>;

/**
 * Task complexity metadata schema
 * Tracks tier assignment, model allocation, and escalation details
 */
export const TaskComplexity = z.object({
  tier: CapabilityTier,
  assignedModel: z.string().optional(),
  actualModel: z.string().optional(), // What model actually did the work
  escalated: z.boolean().optional(),
  escalationReason: z.string().optional(),
  retryCount: z.number().optional(),
  tierMismatch: z.boolean().optional(), // Did actual tier differ from suggested?
});

export type TaskComplexity = z.infer<typeof TaskComplexity>;

export const Frame = z.object({
  id: z.string(),
  timestamp: z.string(), // ISO 8601
  branch: z.string(),
  jira: z.string().optional(),
  module_scope: z.array(z.string()), // Must match lexmap.policy.json module IDs (THE CRITICAL RULE)
  summary_caption: z.string(),
  reference_point: z.string(), // Human-memorable anchor phrase
  status_snapshot: FrameStatusSnapshot,
  keywords: z.array(z.string()).optional(),
  atlas_frame_id: z.string().optional(), // Link to Atlas Frame (spatial neighborhood)
  feature_flags: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  // Merge-weave metadata (v2)
  runId: z.string().optional(),
  planHash: z.string().optional(),
  spend: FrameSpendMetadata.optional(),
  // OAuth2/JWT user isolation (v3)
  userId: z.string().optional(),
  // LexRunner structured metadata (v3)
  executorRole: z.string().optional(),
  toolCalls: z.array(z.string()).optional(),
  guardrailProfile: z.string().optional(),
  // Turn Cost metrics (v4)
  turnCost: TurnCost.optional(),
  // Capability tier classification (v4)
  capabilityTier: CapabilityTier.optional(),
  taskComplexity: TaskComplexity.optional(),
  // Deduplication metadata (v5)
  superseded_by: z.string().optional(),
  merged_from: z.array(z.string()).optional(),
});

export type Frame = z.infer<typeof Frame>;

/**
 * Frame schema version constant
 * v1: Initial schema (pre-0.4.0)
 * v2: Added runId, planHash, spend fields for execution provenance (0.4.0)
 * v3: Added executorRole, toolCalls, guardrailProfile for LexRunner (0.5.0)
 * v4: Added turnCost, capabilityTier, taskComplexity for governance model (2.0.0)
 * v5: Added superseded_by, merged_from for deduplication (2.2.0)
 */
export const FRAME_SCHEMA_VERSION = 5;

/**
 * Frame search query interface
 */
export interface FrameSearchQuery {
  reference_point?: string; // Fuzzy match on reference_point field
  jira?: string; // Exact match on jira field
  branch?: string; // Exact match on branch
  module_scope?: string[]; // Frames touching any of these modules
  since?: string; // ISO 8601 timestamp (return Frames newer than this)
  limit?: number; // Max results to return
}

/**
 * Frame search result
 */
export interface FrameSearchResult {
  frames: Frame[];
  total: number;
}
