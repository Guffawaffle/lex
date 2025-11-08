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
