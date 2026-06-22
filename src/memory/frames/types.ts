/**
 * Legacy memory-frame schema facade.
 *
 * The canonical Frame contract now lives in `src/shared/types/frame-schema.ts`.
 * This module preserves older memory-layer imports while pointing them at the
 * canonical shared schema.
 */

import {
  CapabilityTierSchema,
  ContradictionResolutionSchema,
  FrameSchema,
  LmvConfidenceSchema,
  LmvEpistemicSchema,
  LmvEvidenceRefSchema,
  LmvEvidenceStatusSchema,
  LmvExperimentSchema,
  LmvStatusSchema,
  LmvStopConditionSchema,
  SpendMetadataSchema,
  StatusSnapshotSchema,
  TaskComplexitySchema,
  TurnCostComponentSchema,
  TurnCostSchema,
  TurnCostWeightsSchema,
  FRAME_SCHEMA_VERSION,
  createFrame,
  isFrame,
  parseFrame,
  safeParseFrame,
} from "../../shared/types/frame-schema.js";

export const CapabilityTier = CapabilityTierSchema;
export const ContradictionResolution = ContradictionResolutionSchema;
export const Frame = FrameSchema;
export const LmvConfidence = LmvConfidenceSchema;
export const LmvEpistemic = LmvEpistemicSchema;
export const LmvEvidenceRef = LmvEvidenceRefSchema;
export const LmvEvidenceStatus = LmvEvidenceStatusSchema;
export const LmvExperiment = LmvExperimentSchema;
export const LmvStatus = LmvStatusSchema;
export const LmvStopCondition = LmvStopConditionSchema;
export const FrameSpendMetadata = SpendMetadataSchema;
export const FrameStatusSnapshot = StatusSnapshotSchema;
export const TaskComplexity = TaskComplexitySchema;
export const TurnCostComponent = TurnCostComponentSchema;
export const TurnCost = TurnCostSchema;
export const TurnCostWeights = TurnCostWeightsSchema;

export { FRAME_SCHEMA_VERSION, createFrame, isFrame, parseFrame, safeParseFrame };

export type CapabilityTier = import("../../shared/types/frame-schema.js").CapabilityTier;
export type ContradictionResolution =
  import("../../shared/types/frame-schema.js").ContradictionResolution;
export type Frame = import("../../shared/types/frame-schema.js").Frame;
export type LmvConfidence = import("../../shared/types/frame-schema.js").LmvConfidence;
export type LmvEpistemic = import("../../shared/types/frame-schema.js").LmvEpistemic;
export type LmvEvidenceRef = import("../../shared/types/frame-schema.js").LmvEvidenceRef;
export type LmvEvidenceStatus = import("../../shared/types/frame-schema.js").LmvEvidenceStatus;
export type LmvExperiment = import("../../shared/types/frame-schema.js").LmvExperiment;
export type LmvStatus = import("../../shared/types/frame-schema.js").LmvStatus;
export type LmvStopCondition = import("../../shared/types/frame-schema.js").LmvStopCondition;
export type FrameSpendMetadata = import("../../shared/types/frame-schema.js").SpendMetadata;
export type FrameStatusSnapshot = import("../../shared/types/frame-schema.js").StatusSnapshot;
export type TaskComplexity = import("../../shared/types/frame-schema.js").TaskComplexity;
export type TurnCost = import("../../shared/types/frame-schema.js").TurnCost;
export type TurnCostComponent = import("../../shared/types/frame-schema.js").TurnCostComponent;
export type TurnCostWeights = import("../../shared/types/frame-schema.js").TurnCostWeights;

export interface FrameSearchQuery {
  reference_point?: string;
  jira?: string;
  branch?: string;
  module_scope?: string[];
  since?: string;
  limit?: number;
}

export interface FrameSearchResult {
  frames: import("../../shared/types/frame-schema.js").Frame[];
  total: number;
}
