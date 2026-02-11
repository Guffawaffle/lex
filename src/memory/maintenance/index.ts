/**
 * Maintenance utilities for FrameStore consumers.
 *
 * Re-exports deduplication, similarity, consolidation, and contradiction
 * detection utilities as a single convenience entry point.
 *
 * Import individual modules for finer-grained imports:
 *   import { detectDuplicateFrames } from "@smartergpt/lex/dedup";
 *   import { computeSimilarity } from "@smartergpt/lex/similarity";
 *   import { consolidateViaSupersede } from "@smartergpt/lex/consolidation";
 *   import { detectContradiction } from "@smartergpt/lex/contradictions";
 *
 * Or import everything from this barrel:
 *   import { detectDuplicateFrames, computeSimilarity } from "@smartergpt/lex/maintenance";
 */

export {
  type ConsolidationMode,
  type ConsolidationStrategy,
  type FrameWithDeduplication,
  type DeduplicationOptions,
  type DeduplicationResult,
  determineConsolidationStrategy,
  detectDuplicateFrames,
} from "../deduplication.js";

export {
  type SimilarityDimensions,
  type SimilarityResult,
  type SimilarityWeights,
  DEFAULT_WEIGHTS,
  computeKeywordSimilarity,
  computeStructuralSimilarity,
  computeTemporalSimilarity,
  computeSimilarity,
  detectDuplicates,
} from "../similarity.js";

export {
  type ConsolidationResult,
  markFrameAsSuperseded,
  updateFrameWithMergedFrom,
  consolidateViaSupersede,
  consolidateViaMerge,
} from "../store/consolidate.js";

export {
  type ContradictionType,
  type ContradictionSignal,
  type ContradictionResult,
  OPPOSITE_KEYWORD_PAIRS,
  NEGATION_WORDS,
  detectContradiction,
  findContradictions,
  scanForContradictions,
} from "../contradictions.js";
