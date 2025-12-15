/**
 * Batch Frame Ingestion API
 *
 * Provides a high-level API for external orchestrators to submit multiple
 * Frames in one call with transactional guarantees.
 *
 * This is the recommended entrypoint for external callers who need to ingest
 * batches of Frames atomically (all-or-nothing).
 *
 * @module memory/batch
 */

import type { Frame } from "./frames/types.js";
import type { FrameStore, SaveResult } from "./store/frame-store.js";
import { validateFramePayload, type FrameValidationResult } from "./validation/index.js";

/**
 * Input for a single Frame in a batch operation.
 * Must be a complete Frame object with all required fields.
 */
export type FrameInput = Frame;

/**
 * Options for batch Frame ingestion.
 */
export interface BatchOptions {
  /**
   * If true (default), stop validation on the first error.
   * If false, collect all validation errors before rejecting.
   */
  failFast?: boolean;

  /**
   * If true (default), use pre-validation before submitting to the store.
   * Pre-validation catches common errors early and provides better error messages.
   * Set to false only if you've already validated the Frames externally.
   */
  preValidate?: boolean;
}

/**
 * Result of batch Frame ingestion validation.
 */
export interface BatchValidationError {
  /** Index of the Frame in the input array */
  index: number;
  /** Frame ID if available */
  frameId: string;
  /** Validation result with errors and warnings */
  validation: FrameValidationResult;
}

/**
 * Result of batch Frame ingestion.
 */
export interface BatchIngestionResult {
  /** Whether the batch was successfully ingested */
  success: boolean;
  /** Number of Frames successfully ingested */
  count: number;
  /** Validation errors (if any) */
  validationErrors: BatchValidationError[];
  /** Store-level errors (if any) */
  storeError?: string;
  /** Individual Frame results from the store */
  results: SaveResult[];
}

/**
 * Insert a batch of Frames with transactional guarantees.
 *
 * This is the recommended API for external orchestrators. It provides:
 * - Pre-validation with detailed error messages (optional)
 * - Transactional semantics (all-or-nothing)
 * - Configurable error collection (fail-fast or collect-all)
 *
 * @param store - The FrameStore to use for persistence
 * @param frames - Array of Frames to insert
 * @param options - Batch operation options
 * @returns BatchIngestionResult with success status and details
 *
 * @example
 * ```typescript
 * import { insertFramesBatch } from '@smartergpt/lex/memory';
 * import { createFrameStore } from '@smartergpt/lex/store';
 *
 * const store = createFrameStore();
 * const frames = [
 *   {
 *     id: 'frame-001',
 *     timestamp: new Date().toISOString(),
 *     branch: 'feature/my-feature',
 *     module_scope: ['core'],
 *     summary_caption: 'Implemented feature X',
 *     reference_point: 'feature x complete',
 *     status_snapshot: { next_action: 'PR review' }
 *   },
 *   // ... more frames
 * ];
 *
 * const result = await insertFramesBatch(store, frames);
 * if (result.success) {
 *   console.log(`Successfully ingested ${result.count} frames`);
 * } else {
 *   console.error('Batch ingestion failed:', result.validationErrors);
 * }
 * ```
 */
export async function insertFramesBatch(
  store: FrameStore,
  frames: FrameInput[],
  options?: BatchOptions
): Promise<BatchIngestionResult> {
  const opts: Required<BatchOptions> = {
    failFast: options?.failFast ?? true,
    preValidate: options?.preValidate ?? true,
  };

  const validationErrors: BatchValidationError[] = [];

  // Pre-validate all frames if enabled
  if (opts.preValidate) {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const validation = validateFramePayload(frame);

      if (!validation.valid) {
        validationErrors.push({
          index: i,
          frameId: frame.id ?? `(frame at index ${i})`,
          validation,
        });

        // Stop early if fail-fast is enabled
        if (opts.failFast) {
          return {
            success: false,
            count: 0,
            validationErrors,
            results: [],
          };
        }
      }
    }

    // If we collected any validation errors, fail the batch
    if (validationErrors.length > 0) {
      return {
        success: false,
        count: 0,
        validationErrors,
        results: [],
      };
    }
  }

  // All validations passed (or pre-validation disabled) - submit to store
  try {
    const results = await store.saveFrames(frames);

    // Check if all frames were successfully saved
    const allSuccess = results.every((r) => r.success);

    if (allSuccess) {
      return {
        success: true,
        count: results.length,
        validationErrors: [],
        results,
      };
    } else {
      // Some frames failed at the store level
      return {
        success: false,
        count: 0,
        validationErrors: [],
        storeError: "One or more frames failed to save (transaction rolled back)",
        results,
      };
    }
  } catch (error) {
    // Unexpected error during store operation
    return {
      success: false,
      count: 0,
      validationErrors: [],
      storeError: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}
