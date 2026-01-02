/**
 * Contradiction Resolution Strategies
 *
 * Provides different ways to resolve contradictions between frames:
 * - Supersede: Mark old frame as outdated
 * - Scope: Add scope clarification to both frames
 * - Keep both: Acknowledge contradiction but keep both
 * - Cancel: Don't store the new frame
 */

import type { Frame } from "./frames/types.js";
import type { ContradictionResult } from "./contradictions.js";

/**
 * Resolution strategy types
 */
export type ResolutionType = "supersede" | "scope" | "keep-both" | "cancel";

/**
 * Metadata about how a contradiction was resolved
 */
export interface ContradictionResolution {
  /** Type of resolution applied */
  type: ResolutionType;
  /** ID of the contradicting frame */
  contradictsFrameId: string;
  /** Optional note about the resolution */
  note?: string;
  /** Scope clarification (for scope resolution) */
  scope?: string;
}

/**
 * Extended Frame type with contradiction metadata
 */
export interface FrameWithContradiction extends Frame {
  /** Contradiction resolution metadata */
  contradictionResolution?: ContradictionResolution;
}

/**
 * Apply supersede resolution
 * Marks the existing frame as superseded by the new frame
 *
 * @param newFrame - New frame that supersedes the old one
 * @param existingFrame - Existing frame to be marked as superseded
 * @returns Tuple of [newFrame, updatedExistingFrame]
 */
export function applySupersede(
  newFrame: Frame,
  existingFrame: Frame
): [FrameWithContradiction, FrameWithContradiction] {
  const updatedExistingFrame: FrameWithContradiction = {
    ...existingFrame,
    superseded_by: newFrame.id,
  };

  const updatedNewFrame: FrameWithContradiction = {
    ...newFrame,
    contradictionResolution: {
      type: "supersede",
      contradictsFrameId: existingFrame.id,
      note: "Supersedes older contradicting frame",
    },
  };

  return [updatedNewFrame, updatedExistingFrame];
}

/**
 * Apply scope resolution
 * Adds scope clarification to both frames
 *
 * @param newFrame - New frame with scope clarification
 * @param existingFrame - Existing frame with scope clarification
 * @param newScope - Scope for new frame (e.g., "database/hot-paths")
 * @param existingScope - Scope for existing frame (e.g., "database/queries")
 * @returns Tuple of [newFrame, updatedExistingFrame]
 */
export function applyScope(
  newFrame: Frame,
  existingFrame: Frame,
  newScope: string,
  existingScope: string
): [FrameWithContradiction, FrameWithContradiction] {
  const updatedNewFrame: FrameWithContradiction = {
    ...newFrame,
    contradictionResolution: {
      type: "scope",
      contradictsFrameId: existingFrame.id,
      scope: newScope,
      note: `Valid in context: ${newScope}`,
    },
  };

  const updatedExistingFrame: FrameWithContradiction = {
    ...existingFrame,
    contradictionResolution: {
      type: "scope",
      contradictsFrameId: newFrame.id,
      scope: existingScope,
      note: `Valid in context: ${existingScope}`,
    },
  };

  return [updatedNewFrame, updatedExistingFrame];
}

/**
 * Apply keep-both resolution
 * Acknowledges contradiction but keeps both frames
 *
 * @param newFrame - New frame
 * @param existingFrame - Existing frame
 * @returns Tuple of [newFrame, updatedExistingFrame]
 */
export function applyKeepBoth(
  newFrame: Frame,
  existingFrame: Frame
): [FrameWithContradiction, FrameWithContradiction] {
  const updatedNewFrame: FrameWithContradiction = {
    ...newFrame,
    contradictionResolution: {
      type: "keep-both",
      contradictsFrameId: existingFrame.id,
      note: "Acknowledged contradiction - both frames kept",
    },
  };

  const updatedExistingFrame: FrameWithContradiction = {
    ...existingFrame,
    contradictionResolution: {
      type: "keep-both",
      contradictsFrameId: newFrame.id,
      note: "Acknowledged contradiction - both frames kept",
    },
  };

  return [updatedNewFrame, updatedExistingFrame];
}

/**
 * Format contradiction for display
 */
export function formatContradiction(
  contradiction: ContradictionResult,
  frameA: Frame,
  frameB: Frame
): string {
  const lines: string[] = [];

  lines.push(
    `Contradiction detected (confidence: ${(contradiction.signal!.confidence * 100).toFixed(0)}%)`
  );
  lines.push("");
  lines.push(`Frame A (${frameA.timestamp}):`);
  lines.push(`  "${frameA.summary_caption}"`);
  lines.push(`  Module: ${contradiction.moduleOverlap.join(", ")}`);
  if (frameA.keywords?.length) {
    lines.push(`  Keywords: [${frameA.keywords.join(", ")}]`);
  }
  lines.push("");
  lines.push(`Frame B (${frameB.timestamp}):`);
  lines.push(`  "${frameB.summary_caption}"`);
  lines.push(`  Module: ${contradiction.moduleOverlap.join(", ")}`);
  if (frameB.keywords?.length) {
    lines.push(`  Keywords: [${frameB.keywords.join(", ")}]`);
  }
  lines.push("");
  lines.push(`Conflict: ${contradiction.signal!.explanation}`);

  return lines.join("\n");
}
