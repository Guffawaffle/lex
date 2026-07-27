/**
 * Legacy Atlas compatibility barrel
 *
 * This module currently combines Policy Neighborhood, Frame Graph, and Code Index
 * surfaces. New code should use those conceptual names while preserving these exports.
 */

// Export types
export type {
  Policy,
  PolicyModule,
  Graph,
  AtlasFrame,
  AtlasModuleData,
  AtlasEdge,
} from "./types.js";

// Export graph utilities
export { buildPolicyGraph, getNeighbors } from "./graph.js";

// Export fold radius algorithm
export { computeFoldRadius } from "./fold-radius.js";

// Export Policy Neighborhood generation through legacy AtlasFrame names
export { generateAtlasFrame } from "./atlas-frame.js";

// Export cache utilities
export {
  AtlasFrameCache,
  getCache,
  setEnableCache,
  resetCache,
  getCacheStats,
  type CacheStats,
} from "./cache.js";

// Export auto-tuning utilities
export { estimateTokens, autoTuneRadius, estimateTokensBeforeGeneration } from "./auto-tune.js";

// Export Frame Graph rebuild queue through legacy Atlas names (LEX-108)
export {
  AtlasRebuildQueue,
  createAtlasRebuildQueue,
  type AtlasRebuildCallbacks,
  type AtlasRebuildQueueConfig,
} from "./queue.js";

// Export Frame Graph rebuild trigger API through legacy Atlas names (LEX-108)
export {
  AtlasRebuildManager,
  initAtlasRebuildManager,
  getAtlasRebuildManager,
  triggerAtlasRebuild,
  onRebuildComplete,
  removeRebuildCallback,
  resetAtlasRebuildManager,
  type RebuildResult,
  type RebuildCallback,
  type AtlasRebuildManagerConfig,
} from "./trigger.js";

// Export Frame Graph rebuild and validation utilities
export { rebuildAtlas, type Atlas, type AtlasNode } from "./rebuild.js";
export { validateAtlas, checkReachability, type ValidationResult } from "./validate.js";

// Export Code Index schemas through legacy Code Atlas names (Layer 0)
export {
  CodeUnitSchema,
  CodeUnitKindSchema,
  CodeUnitSpanSchema,
  parseCodeUnit,
  validateCodeUnit,
  type CodeUnit,
  type CodeUnitKind,
  type CodeUnitSpan,
} from "../../atlas/schemas/index.js";
