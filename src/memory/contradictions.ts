/**
 * Contradiction Detection for Memory Frames
 *
 * Detects when a new frame contradicts an existing one based on:
 * - Opposite keywords (e.g., "always" vs "never", "enable" vs "disable")
 * - Negation patterns (e.g., "Don't use X" vs "Use X")
 * - Same module scope (contradictions only matter in the same context)
 */

import type { Frame } from "./frames/types.js";

/**
 * Types of contradiction signals
 */
export type ContradictionType = "opposite-keywords" | "negation-pattern" | "temporal-supersede";

/**
 * Signal indicating a potential contradiction between frames
 */
export interface ContradictionSignal {
  type: ContradictionType;
  confidence: number; // 0.0 - 1.0
  explanation: string;
}

/**
 * Result of checking for contradictions
 */
export interface ContradictionResult {
  frameA: string; // Frame ID
  frameB: string; // Frame ID
  signal: ContradictionSignal | null;
  moduleOverlap: string[]; // Modules that overlap between frames
}

/**
 * Pairs of opposite keywords that signal potential contradiction
 * Format: [positive, negative]
 */
export const OPPOSITE_KEYWORD_PAIRS: [string, string][] = [
  ["always", "never"],
  ["required", "optional"],
  ["include", "exclude"],
  ["async", "sync"],
  ["add", "remove"],
  ["enable", "disable"],
  ["allow", "forbid"],
  ["use", "avoid"],
  ["prefer", "discourage"],
  ["must", "avoid"],
  ["should", "shouldn't"],
  ["do", "don't"],
  ["all", "none"],
  ["every", "no"],
];

/**
 * Negation words that can signal contradiction
 */
export const NEGATION_WORDS = [
  "not",
  "no",
  "never",
  "avoid",
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "cannot",
  "can't",
  "shouldn't",
  "mustn't",
  "disable",
  "remove",
  "skip",
  "without",
];

/**
 * Check if a text contains negation patterns
 */
function containsNegation(text: string): boolean {
  const lowercaseText = text.toLowerCase();
  return NEGATION_WORDS.some((word) => {
    // Match whole words only
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(lowercaseText);
  });
}

/**
 * Minimum word length for keyword extraction
 */
const MIN_KEYWORD_LENGTH = 3;

/**
 * Minimum word length for negation contradiction detection
 * Use longer words to reduce false positives
 */
const MIN_NEGATION_WORD_LENGTH = 4;

/**
 * Extract keywords from a frame
 * Combines explicit keywords with words from summary and reference point
 */
function extractFrameKeywords(frame: Frame): Set<string> {
  const keywords = new Set<string>();

  // Add explicit keywords
  if (frame.keywords) {
    frame.keywords.forEach((k) => keywords.add(k.toLowerCase()));
  }

  // Extract words from summary and reference point (minimum 3 chars)
  const text = `${frame.summary_caption} ${frame.reference_point}`.toLowerCase();
  const words = text.match(new RegExp(`\\b\\w{${MIN_KEYWORD_LENGTH},}\\b`, "g")) || [];
  words.forEach((w) => keywords.add(w));

  return keywords;
}

/**
 * Check if two frames have opposite keywords
 * Returns the pair of opposite keywords found, if any
 */
function findOppositeKeywords(
  keywordsA: Set<string>,
  keywordsB: Set<string>
): [string, string] | null {
  for (const [positive, negative] of OPPOSITE_KEYWORD_PAIRS) {
    const aHasPositive = keywordsA.has(positive);
    const aHasNegative = keywordsA.has(negative);
    const bHasPositive = keywordsB.has(positive);
    const bHasNegative = keywordsB.has(negative);

    // Check if frames have opposite keywords
    if ((aHasPositive && bHasNegative) || (aHasNegative && bHasPositive)) {
      return [positive, negative];
    }
  }

  return null;
}

/**
 * Check if two text snippets contain contradictory guidance
 * Uses negation pattern detection
 */
function detectNegationContradiction(textA: string, textB: string): boolean {
  const textALower = textA.toLowerCase();
  const textBLower = textB.toLowerCase();

  const aHasNegation = containsNegation(textALower);
  const bHasNegation = containsNegation(textBLower);

  // If only one has negation, check if they share keywords
  if (aHasNegation !== bHasNegation) {
    // Extract words from both texts (using longer words to reduce false positives)
    const wordsA = new Set(
      textALower.match(new RegExp(`\\b\\w{${MIN_NEGATION_WORD_LENGTH},}\\b`, "g")) || []
    );
    const wordsB = new Set(
      textBLower.match(new RegExp(`\\b\\w{${MIN_NEGATION_WORD_LENGTH},}\\b`, "g")) || []
    );

    // Check for significant overlap (at least 2 words)
    const overlap = [...wordsA].filter((w) => wordsB.has(w) && !NEGATION_WORDS.includes(w));
    return overlap.length >= 2;
  }

  return false;
}

/**
 * Detect if a new frame contradicts an existing frame
 *
 * Contradictions are only detected if frames share the same module scope
 * (or have overlapping modules).
 *
 * @param newFrame - New frame being added
 * @param existingFrame - Existing frame to compare against
 * @returns Contradiction signal if detected, null otherwise
 */
export function detectContradiction(
  newFrame: Frame,
  existingFrame: Frame
): ContradictionSignal | null {
  // Only check for contradictions if frames share module scope
  const newModules = new Set(newFrame.module_scope);
  const existingModules = new Set(existingFrame.module_scope);
  const sharedModules = [...newModules].filter((m) => existingModules.has(m));

  if (sharedModules.length === 0) {
    return null;
  }

  // Extract keywords from both frames
  const newKeywords = extractFrameKeywords(newFrame);
  const existingKeywords = extractFrameKeywords(existingFrame);

  // Check for opposite keywords
  const oppositeKeywords = findOppositeKeywords(newKeywords, existingKeywords);
  if (oppositeKeywords) {
    return {
      type: "opposite-keywords",
      confidence: 0.8,
      explanation: `Conflicting guidance: "${oppositeKeywords[0]}" vs "${oppositeKeywords[1]}"`,
    };
  }

  // Check for negation patterns in summaries
  if (detectNegationContradiction(newFrame.summary_caption, existingFrame.summary_caption)) {
    return {
      type: "negation-pattern",
      confidence: 0.6,
      explanation: "New frame appears to negate existing guidance",
    };
  }

  return null;
}

/**
 * Find all contradictions for a new frame among existing frames
 *
 * @param newFrame - Frame to check for contradictions
 * @param existingFrames - Existing frames to compare against
 * @returns Array of contradiction results (only frames with contradictions)
 */
export function findContradictions(
  newFrame: Frame,
  existingFrames: Frame[]
): ContradictionResult[] {
  const contradictions: ContradictionResult[] = [];

  for (const existing of existingFrames) {
    // Don't compare frame to itself
    if (existing.id === newFrame.id) continue;

    // Skip superseded frames
    if (existing.superseded_by) continue;

    const signal = detectContradiction(newFrame, existing);

    if (signal) {
      // Calculate module overlap
      const newModules = new Set(newFrame.module_scope);
      const existingModules = new Set(existing.module_scope);
      const moduleOverlap = [...newModules].filter((m) => existingModules.has(m));

      contradictions.push({
        frameA: newFrame.id,
        frameB: existing.id,
        signal,
        moduleOverlap,
      });
    }
  }

  return contradictions;
}

/**
 * Scan all frames for contradictions
 *
 * @param frames - All frames to scan
 * @param moduleFilter - Optional module ID to filter by
 * @returns Array of contradiction results
 */
export function scanForContradictions(
  frames: Frame[],
  moduleFilter?: string
): ContradictionResult[] {
  const contradictions: ContradictionResult[] = [];
  const processedPairs = new Set<string>();

  // Filter frames by module if specified
  const filteredFrames = moduleFilter
    ? frames.filter((f) => f.module_scope.includes(moduleFilter))
    : frames;

  // Compare each frame with all others
  for (let i = 0; i < filteredFrames.length; i++) {
    for (let j = i + 1; j < filteredFrames.length; j++) {
      const frameA = filteredFrames[i];
      const frameB = filteredFrames[j];

      // Skip superseded frames
      if (frameA.superseded_by || frameB.superseded_by) continue;

      // Create a unique pair identifier (sorted to avoid duplicates)
      const pairId = [frameA.id, frameB.id].sort().join(":");
      if (processedPairs.has(pairId)) continue;
      processedPairs.add(pairId);

      const signal = detectContradiction(frameA, frameB);

      if (signal) {
        // Calculate module overlap
        const modulesA = new Set(frameA.module_scope);
        const modulesB = new Set(frameB.module_scope);
        const moduleOverlap = [...modulesA].filter((m) => modulesB.has(m));

        contradictions.push({
          frameA: frameA.id,
          frameB: frameB.id,
          signal,
          moduleOverlap,
        });
      }
    }
  }

  // Sort by confidence (highest first)
  return contradictions.sort((a, b) => (b.signal?.confidence || 0) - (a.signal?.confidence || 0));
}
