/**
 * Frame Deduplication Logic
 *
 * Implements consolidation strategies for duplicate frames.
 * Supports merge, supersede, and keep-both modes.
 */

import type { Frame } from "./frames/types.js";
import { computeSimilarity, type SimilarityResult } from "./similarity.js";

/**
 * Consolidation mode for duplicate frames
 */
export type ConsolidationMode = "merge" | "supersede" | "keep-both";

/**
 * Strategy for consolidating duplicate frames
 */
export interface ConsolidationStrategy {
  mode: ConsolidationMode;
  mergedFrame?: Frame;
  rationale: string;
}

/**
 * Extended Frame type with deduplication metadata
 */
export interface FrameWithDeduplication extends Frame {
  /** ID of frame that supersedes this one */
  superseded_by?: string;
  /** IDs of frames that were merged into this one */
  merged_from?: string[];
}

/**
 * Check if frameA is a superset of frameB (contains all information from B)
 * Used to determine if one frame supersedes another
 */
function isSuperset(frameA: Frame, frameB: Frame): boolean {
  // Check if A is newer
  const dateA = new Date(frameA.timestamp);
  const dateB = new Date(frameB.timestamp);
  if (dateA <= dateB) return false;

  // Check if A's keywords contain all of B's keywords
  const keywordsA = new Set(frameA.keywords || []);
  const keywordsB = new Set(frameB.keywords || []);
  const hasAllKeywords = [...keywordsB].every((k) => keywordsA.has(k));

  // Check if A's modules contain all of B's modules
  const modulesA = new Set(frameA.module_scope);
  const modulesB = new Set(frameB.module_scope);
  const hasAllModules = [...modulesB].every((m) => modulesA.has(m));

  // A supersedes B if it's newer and contains all of B's information
  return hasAllKeywords && hasAllModules;
}

/**
 * Merge two frames into one, preserving unique information from both
 */
function mergeFrames(frameA: Frame, frameB: Frame): Frame {
  // Use the newer frame as base
  const dateA = new Date(frameA.timestamp);
  const dateB = new Date(frameB.timestamp);
  const newerFrame = dateA > dateB ? frameA : frameB;
  const olderFrame = dateA > dateB ? frameB : frameA;

  // Merge keywords (unique values)
  const mergedKeywords = [
    ...new Set([...(newerFrame.keywords || []), ...(olderFrame.keywords || [])]),
  ];

  // Merge module_scope (unique values)
  const mergedModules = [...new Set([...newerFrame.module_scope, ...olderFrame.module_scope])];

  // Combine reference points if different
  let referencePoint = newerFrame.reference_point;
  if (olderFrame.reference_point && olderFrame.reference_point !== newerFrame.reference_point) {
    referencePoint = `${newerFrame.reference_point} / ${olderFrame.reference_point}`;
  }

  // Combine summaries if they provide different information
  let summary = newerFrame.summary_caption;
  if (
    olderFrame.summary_caption &&
    olderFrame.summary_caption !== newerFrame.summary_caption &&
    !newerFrame.summary_caption.includes(olderFrame.summary_caption)
  ) {
    summary = `${newerFrame.summary_caption}; ${olderFrame.summary_caption}`;
  }

  // Merge status snapshots, preferring newer but preserving unique blockers
  const mergedBlockers = [
    ...new Set([
      ...(newerFrame.status_snapshot.blockers || []),
      ...(olderFrame.status_snapshot.blockers || []),
    ]),
  ];

  const mergedMergeBlockers = [
    ...new Set([
      ...(newerFrame.status_snapshot.merge_blockers || []),
      ...(olderFrame.status_snapshot.merge_blockers || []),
    ]),
  ];

  const mergedTestsFailing = [
    ...new Set([
      ...(newerFrame.status_snapshot.tests_failing || []),
      ...(olderFrame.status_snapshot.tests_failing || []),
    ]),
  ];

  return {
    ...newerFrame,
    module_scope: mergedModules,
    summary_caption: summary,
    reference_point: referencePoint,
    keywords: mergedKeywords.length > 0 ? mergedKeywords : undefined,
    status_snapshot: {
      ...newerFrame.status_snapshot,
      blockers: mergedBlockers.length > 0 ? mergedBlockers : undefined,
      merge_blockers: mergedMergeBlockers.length > 0 ? mergedMergeBlockers : undefined,
      tests_failing: mergedTestsFailing.length > 0 ? mergedTestsFailing : undefined,
    },
  };
}

/**
 * Determine consolidation strategy for two similar frames
 * @param frameA - First frame (typically newer)
 * @param frameB - Second frame (typically older)
 * @returns Consolidation strategy with merged frame if applicable
 */
export function determineConsolidationStrategy(
  frameA: Frame,
  frameB: Frame
): ConsolidationStrategy {
  // If frames are on different branches, keep both
  if (frameA.branch !== frameB.branch) {
    return {
      mode: "keep-both",
      rationale: "Frames are on different branches - keeping both for branch-specific context",
    };
  }

  // If frames have different Jira tickets, keep both
  if (frameA.jira && frameB.jira && frameA.jira !== frameB.jira) {
    return {
      mode: "keep-both",
      rationale: "Frames reference different Jira tickets - keeping both",
    };
  }

  // If one frame is strictly a superset of the other, supersede
  if (isSuperset(frameA, frameB)) {
    return {
      mode: "supersede",
      mergedFrame: frameA,
      rationale: "Newer frame contains all information from older frame",
    };
  }

  if (isSuperset(frameB, frameA)) {
    return {
      mode: "supersede",
      mergedFrame: frameB,
      rationale: "Older frame contains all information from newer frame",
    };
  }

  // Otherwise, merge frames to preserve unique information from both
  const merged = mergeFrames(frameA, frameB);
  return {
    mode: "merge",
    mergedFrame: merged,
    rationale: "Combined unique information from both frames",
  };
}

/**
 * Options for deduplication operation
 */
export interface DeduplicationOptions {
  /** Similarity threshold (0.0 - 1.0, default: 0.85) */
  threshold?: number;
  /** If true, only detect duplicates without consolidating */
  dryRun?: boolean;
  /** If true, automatically consolidate without prompting */
  auto?: boolean;
}

/**
 * Result of deduplication operation
 */
export interface DeduplicationResult {
  /** Total frames analyzed */
  totalFrames: number;
  /** Number of duplicate groups found */
  duplicateGroups: number;
  /** Similarity results for detected duplicates */
  duplicates: SimilarityResult[];
  /** Consolidation strategies for each duplicate pair */
  strategies: ConsolidationStrategy[];
  /** Frames that were consolidated (if not dry-run) */
  consolidated?: Frame[];
}

/**
 * Detect duplicate frames in a collection
 * @param frames - Frames to analyze for duplicates
 * @param options - Deduplication options
 * @returns Deduplication result with detected duplicates and strategies
 */
export function detectDuplicateFrames(
  frames: Frame[],
  options: DeduplicationOptions = {}
): DeduplicationResult {
  const threshold = options.threshold ?? 0.85;
  const duplicates: SimilarityResult[] = [];
  const strategies: ConsolidationStrategy[] = [];
  const processedPairs = new Set<string>();

  // Compare each frame with all others
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const frameA = frames[i];
      const frameB = frames[j];

      // Create a unique pair identifier (sorted to avoid duplicates)
      const pairId = [frameA.id, frameB.id].sort().join(":");
      if (processedPairs.has(pairId)) continue;
      processedPairs.add(pairId);

      const similarity = computeSimilarity(frameA, frameB);

      if (similarity.overall >= threshold) {
        duplicates.push(similarity);

        // Determine consolidation strategy
        const strategy = determineConsolidationStrategy(frameA, frameB);
        strategies.push(strategy);
      }
    }
  }

  return {
    totalFrames: frames.length,
    duplicateGroups: duplicates.length,
    duplicates,
    strategies,
  };
}
