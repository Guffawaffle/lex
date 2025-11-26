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

export const FrameStatusSnapshot = z.object({
  next_action: z.string(),
  blockers: z.array(z.string()).optional(),
  merge_blockers: z.array(z.string()).optional(),
  tests_failing: z.array(z.string()).optional(),
});

export type FrameStatusSnapshot = z.infer<typeof FrameStatusSnapshot>;

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
});

export type Frame = z.infer<typeof Frame>;

/**
 * Frame schema version constant
 * v1: Initial schema (pre-0.4.0)
 * v2: Added runId, planHash, spend fields for execution provenance (0.4.0)
 */
export const FRAME_SCHEMA_VERSION = 2;

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
