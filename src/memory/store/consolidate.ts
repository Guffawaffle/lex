/**
 * Storage operations for frame consolidation
 *
 * Handles database operations for marking frames as superseded
 * and updating frames with consolidation metadata.
 */

import type { Frame } from "../frames/types.js";
import type { FrameStore } from "./frame-store.js";
import type { FrameWithDeduplication } from "../deduplication.js";

/**
 * Mark a frame as superseded by another frame
 * @param store - Frame store
 * @param frameId - ID of frame being superseded
 * @param supersededById - ID of frame that supersedes this one
 */
export async function markFrameAsSuperseded(
  store: FrameStore,
  frameId: string,
  supersededById: string
): Promise<void> {
  const frame = await store.getFrameById(frameId);
  if (!frame) {
    throw new Error(`Frame ${frameId} not found`);
  }

  const updatedFrame: FrameWithDeduplication = {
    ...frame,
    superseded_by: supersededById,
  };

  await store.saveFrame(updatedFrame as Frame);
}

/**
 * Update a frame with merged_from metadata
 * @param store - Frame store
 * @param frame - Frame to update
 * @param mergedFromIds - IDs of frames that were merged into this one
 */
export async function updateFrameWithMergedFrom(
  store: FrameStore,
  frame: Frame,
  mergedFromIds: string[]
): Promise<void> {
  const updatedFrame: FrameWithDeduplication = {
    ...frame,
    merged_from: mergedFromIds,
  };

  await store.saveFrame(updatedFrame as Frame);
}

/**
 * Result of a consolidation operation
 */
export interface ConsolidationResult {
  /** Number of frames consolidated */
  framesConsolidated: number;
  /** IDs of frames that were superseded */
  supersededFrameIds: string[];
  /** IDs of frames that were updated with merged data */
  updatedFrameIds: string[];
}

/**
 * Consolidate two frames using supersede strategy
 * Marks the older frame as superseded by the newer one
 */
export async function consolidateViaSupersede(
  store: FrameStore,
  supersedingFrame: Frame,
  supersededFrame: Frame
): Promise<ConsolidationResult> {
  await markFrameAsSuperseded(store, supersededFrame.id, supersedingFrame.id);

  return {
    framesConsolidated: 2,
    supersededFrameIds: [supersededFrame.id],
    updatedFrameIds: [supersedingFrame.id],
  };
}

/**
 * Consolidate two frames using merge strategy
 * Creates/updates merged frame and marks both originals as superseded
 */
export async function consolidateViaMerge(
  store: FrameStore,
  mergedFrame: Frame,
  sourceFrameA: Frame,
  sourceFrameB: Frame
): Promise<ConsolidationResult> {
  // Update the merged frame with merged_from metadata
  await updateFrameWithMergedFrom(store, mergedFrame, [sourceFrameA.id, sourceFrameB.id]);

  // Mark both source frames as superseded by the merged frame
  await markFrameAsSuperseded(store, sourceFrameA.id, mergedFrame.id);
  await markFrameAsSuperseded(store, sourceFrameB.id, mergedFrame.id);

  return {
    framesConsolidated: 3,
    supersededFrameIds: [sourceFrameA.id, sourceFrameB.id],
    updatedFrameIds: [mergedFrame.id],
  };
}
