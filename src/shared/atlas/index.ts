/**
 * Atlas Frame Export - Spatial neighborhood extraction from policy graph
 *
 * This module provides the core functionality for extracting policy-aware
 * spatial neighborhoods using the fold radius algorithm.
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

// Export Atlas Frame generation
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

// Export Atlas rebuild queue (LEX-108: Batch Operations)
export {
  AtlasRebuildQueue,
  createAtlasRebuildQueue,
  type AtlasRebuildCallbacks,
  type AtlasRebuildQueueConfig,
} from "./queue.js";

// Export Atlas rebuild trigger API (LEX-108: Batch Operations)
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

// Export Atlas rebuild and validation utilities
export { rebuildAtlas, type Atlas, type AtlasNode } from "./rebuild.js";
export { validateAtlas, checkReachability, type ValidationResult } from "./validate.js";

// Export Code Atlas schemas (Layer 0)
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
