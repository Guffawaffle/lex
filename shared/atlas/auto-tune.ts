/**
 * Token Estimation for Atlas Frames
 * 
 * Estimates the token count of an Atlas Frame for LLM context window management.
 * Uses simple heuristics based on JSON serialization size.
 */

import type { AtlasFrame } from './types.js';

/**
 * Estimate the number of tokens in an Atlas Frame
 * 
 * Uses a simple heuristic: 1 token ≈ 4 characters in JSON
 * This is approximate but sufficient for auto-tuning decisions.
 * 
 * @param atlasFrame - The Atlas Frame to estimate
 * @returns Estimated token count
 */
export function estimateTokens(atlasFrame: AtlasFrame): number {
  const json = JSON.stringify(atlasFrame);
  // Approximate: 1 token ≈ 4 characters
  // This is conservative (slightly overestimates) which is safer
  return Math.ceil(json.length / 4);
}

/**
 * Auto-tune fold radius to fit within token limit
 * 
 * Starts with the requested radius and reduces it if the resulting
 * Atlas Frame exceeds the token limit. Stops at radius 0 (seed only).
 * 
 * @param generateFn - Function that generates an Atlas Frame for a given radius
 * @param initialRadius - Starting radius to try
 * @param maxTokens - Maximum token count allowed
 * @param onAdjustment - Optional callback when radius is adjusted
 * @returns Object with the final Atlas Frame and radius used
 */
export function autoTuneRadius(
  generateFn: (radius: number) => AtlasFrame,
  initialRadius: number,
  maxTokens: number,
  onAdjustment?: (oldRadius: number, newRadius: number, tokens: number, limit: number) => void
): { atlasFrame: AtlasFrame; radiusUsed: number; tokensUsed: number } {
  let currentRadius = initialRadius;

  while (currentRadius >= 0) {
    const atlasFrame = generateFn(currentRadius);
    const tokens = estimateTokens(atlasFrame);

    if (tokens <= maxTokens) {
      // Success - fits within limit
      return {
        atlasFrame,
        radiusUsed: currentRadius,
        tokensUsed: tokens,
      };
    }

    // Exceeds limit - reduce radius and try again
    if (currentRadius > 0) {
      const oldRadius = currentRadius;
      currentRadius--;
      
      if (onAdjustment) {
        onAdjustment(oldRadius, currentRadius, tokens, maxTokens);
      }
    } else {
      // Already at radius 0, can't reduce further
      // Return what we have even if it exceeds the limit
      return {
        atlasFrame,
        radiusUsed: currentRadius,
        tokensUsed: tokens,
      };
    }
  }

  // Shouldn't reach here, but just in case
  const atlasFrame = generateFn(0);
  return {
    atlasFrame,
    radiusUsed: 0,
    tokensUsed: estimateTokens(atlasFrame),
  };
}

/**
 * Estimate if a given radius will exceed token limit
 * 
 * Rough estimate based on:
 * - Number of seed modules
 * - Expected graph density
 * - Fold radius
 * 
 * This is used for quick checks before actually generating the frame.
 * 
 * @param seedCount - Number of seed modules
 * @param radius - Fold radius
 * @param avgDegree - Average node degree in graph (default: 3)
 * @param tokenPerModule - Average tokens per module (default: 200)
 * @returns Estimated token count
 */
export function estimateTokensBeforeGeneration(
  seedCount: number,
  radius: number,
  avgDegree: number = 3,
  tokenPerModule: number = 200
): number {
  // Estimate module count using graph expansion formula
  // For radius r: modules ≈ seed × (1 + degree + degree^2 + ... + degree^r)
  let estimatedModules = seedCount;
  
  if (radius > 0) {
    // Geometric series sum for graph expansion
    const expansionFactor = (Math.pow(avgDegree, radius + 1) - 1) / (avgDegree - 1);
    estimatedModules = seedCount * expansionFactor;
  }

  // Estimate edge count (roughly degree * modules / 2)
  const estimatedEdges = (estimatedModules * avgDegree) / 2;

  // Token breakdown:
  // - Module metadata: ~200 tokens per module
  // - Edge data: ~20 tokens per edge
  // - Overhead: ~100 tokens
  const moduleTokens = estimatedModules * tokenPerModule;
  const edgeTokens = estimatedEdges * 20;
  const overhead = 100;

  return Math.ceil(moduleTokens + edgeTokens + overhead);
}
