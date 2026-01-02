/**
 * Similarity Scoring for Frame Deduplication
 *
 * Computes similarity scores between frames to detect potential duplicates.
 * Uses multiple dimensions: semantic (keywords), structural (modules), and temporal.
 */

import type { Frame } from "./frames/types.js";

/**
 * Breakdown of similarity score by dimension
 */
export interface SimilarityDimensions {
  /** Keyword overlap using Jaccard similarity */
  semantic: number;
  /** Module scope overlap */
  structural: number;
  /** Temporal proximity (same day/hour) */
  temporal: number;
}

/**
 * Result of comparing two frames for similarity
 */
export interface SimilarityResult {
  frameA: string; // Frame ID
  frameB: string; // Frame ID
  overall: number; // 0.0 - 1.0 weighted composite score
  dimensions: SimilarityDimensions;
}

/**
 * Weights for combining similarity dimensions
 */
export interface SimilarityWeights {
  semantic: number; // Default: 0.5
  structural: number; // Default: 0.3
  temporal: number; // Default: 0.2
}

/**
 * Default weights for similarity scoring
 */
export const DEFAULT_WEIGHTS: SimilarityWeights = {
  semantic: 0.5,
  structural: 0.3,
  temporal: 0.2,
};

/**
 * Compute Jaccard similarity between two sets
 * @param setA - First set
 * @param setB - Second set
 * @returns Jaccard index (0.0 - 1.0)
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Compute keyword similarity using Jaccard index
 * Includes keywords from summary, reference point, and explicit keywords field
 */
export function computeKeywordSimilarity(frameA: Frame, frameB: Frame): number {
  const extractKeywords = (frame: Frame): Set<string> => {
    const keywords = new Set<string>();

    // Add explicit keywords
    if (frame.keywords) {
      frame.keywords.forEach((k) => keywords.add(k.toLowerCase()));
    }

    // Extract words from summary and reference point (minimum 3 chars)
    const text = `${frame.summary_caption} ${frame.reference_point}`.toLowerCase();
    const words = text.match(/\b\w{3,}\b/g) || [];
    words.forEach((w) => keywords.add(w));

    return keywords;
  };

  const keywordsA = extractKeywords(frameA);
  const keywordsB = extractKeywords(frameB);

  return jaccardSimilarity(keywordsA, keywordsB);
}

/**
 * Compute structural similarity based on module_scope overlap
 */
export function computeStructuralSimilarity(frameA: Frame, frameB: Frame): number {
  const modulesA = new Set(frameA.module_scope);
  const modulesB = new Set(frameB.module_scope);

  return jaccardSimilarity(modulesA, modulesB);
}

/**
 * Compute temporal similarity based on timestamp proximity
 * Returns 1.0 for same hour, 0.5 for same day, 0.25 for same week, 0.0 otherwise
 */
export function computeTemporalSimilarity(frameA: Frame, frameB: Frame): number {
  const dateA = new Date(frameA.timestamp);
  const dateB = new Date(frameB.timestamp);

  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours <= 1) return 1.0;
  if (diffHours <= 24) return 0.5;
  if (diffDays <= 7) return 0.25;
  return 0.0;
}

/**
 * Compute overall similarity between two frames
 * @param frameA - First frame
 * @param frameB - Second frame
 * @param weights - Optional custom weights (defaults to DEFAULT_WEIGHTS)
 * @returns Similarity result with overall score and dimension breakdown
 */
export function computeSimilarity(
  frameA: Frame,
  frameB: Frame,
  weights: SimilarityWeights = DEFAULT_WEIGHTS
): SimilarityResult {
  const dimensions: SimilarityDimensions = {
    semantic: computeKeywordSimilarity(frameA, frameB),
    structural: computeStructuralSimilarity(frameA, frameB),
    temporal: computeTemporalSimilarity(frameA, frameB),
  };

  const overall =
    dimensions.semantic * weights.semantic +
    dimensions.structural * weights.structural +
    dimensions.temporal * weights.temporal;

  return {
    frameA: frameA.id,
    frameB: frameB.id,
    overall,
    dimensions,
  };
}

/**
 * Detect potential duplicates of a frame within a set of existing frames
 * @param newFrame - Frame to check for duplicates
 * @param existingFrames - Existing frames to compare against
 * @param threshold - Similarity threshold (0.0 - 1.0, default: 0.85)
 * @param weights - Optional custom weights for similarity scoring
 * @returns Array of similar frames sorted by similarity (highest first)
 */
export function detectDuplicates(
  newFrame: Frame,
  existingFrames: Frame[],
  threshold: number = 0.85,
  weights?: SimilarityWeights
): SimilarityResult[] {
  const candidates: SimilarityResult[] = [];

  for (const existing of existingFrames) {
    // Don't compare frame to itself
    if (existing.id === newFrame.id) continue;

    const similarity = computeSimilarity(newFrame, existing, weights);

    if (similarity.overall >= threshold) {
      candidates.push(similarity);
    }
  }

  // Sort by similarity (highest first)
  return candidates.sort((a, b) => b.overall - a.overall);
}
