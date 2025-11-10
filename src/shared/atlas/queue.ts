/**
 * Atlas Rebuild Queue - Async rebuild infrastructure
 *
 * Provides event-driven Atlas rebuild with debouncing to handle
 * rapid Frame ingestion without blocking operations.
 *
 * Features:
 * - Event-driven: Frame ingestion triggers rebuild via callbacks
 * - Async: Rebuilds don't block Frame storage operations
 * - Debouncing: Batches multiple rapid Frame ingestions
 * - In-memory queue: Simple, fast, no external dependencies
 */

import type { Frame } from "../types/frame.js";
import { rebuildAtlas, type Atlas } from "./rebuild.js";
import { validateAtlas } from "./validate.js";

/**
 * Callback functions for Atlas rebuild events
 */
export interface AtlasRebuildCallbacks {
  onFrameIngested?: (frame: Frame) => void;
  onRebuildStarted?: () => void;
  onRebuildCompleted?: (atlas: Atlas) => void;
  onRebuildFailed?: (error: Error) => void;
}

/**
 * Configuration for AtlasRebuildQueue
 */
export interface AtlasRebuildQueueConfig {
  /** Debounce interval in milliseconds (default: 5000 = 5s) */
  debounceMs?: number;

  /** Whether to validate Atlas after rebuild (default: true) */
  validateAfterRebuild?: boolean;

  /** Callback to fetch all frames for rebuild */
  fetchFrames: () => Promise<Frame[]> | Frame[];

  /** Event callbacks */
  callbacks?: AtlasRebuildCallbacks;
}

/**
 * Atlas Rebuild Queue
 *
 * Manages async Atlas rebuilds triggered by Frame ingestion events.
 * Implements debouncing to batch rapid Frame ingestions.
 *
 * Usage:
 * ```typescript
 * const queue = new AtlasRebuildQueue({
 *   fetchFrames: () => frameStore.getAllFrames(),
 *   debounceMs: 5000,
 *   callbacks: {
 *     onRebuildCompleted: (atlas) => {
 *       console.log('Atlas rebuilt:', atlas);
 *     },
 *   },
 * });
 *
 * // Trigger rebuild when Frame is ingested
 * await frameStore.insertFrame(newFrame);
 * queue.notifyFrameIngested(newFrame);
 * ```
 */
export class AtlasRebuildQueue {
  private config: Required<Omit<AtlasRebuildQueueConfig, "callbacks">>;
  private callbacks: AtlasRebuildCallbacks;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRebuilding = false;
  private pendingRebuild = false;

  constructor(config: AtlasRebuildQueueConfig) {
    this.config = {
      debounceMs: config.debounceMs ?? 5000,
      validateAfterRebuild: config.validateAfterRebuild ?? true,
      fetchFrames: config.fetchFrames,
    };
    this.callbacks = config.callbacks ?? {};
  }

  /**
   * Notify queue that a Frame was ingested
   *
   * This triggers a debounced rebuild - if multiple Frames are ingested
   * rapidly, only one rebuild will occur after the debounce period.
   *
   * @param frame - The Frame that was ingested
   */
  notifyFrameIngested(frame: Frame): void {
    this.callbacks.onFrameIngested?.(frame);

    // Cancel existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule rebuild after debounce period
    this.debounceTimer = setTimeout(() => {
      this.triggerRebuild();
    }, this.config.debounceMs);
  }

  /**
   * Trigger rebuild immediately (bypasses debounce)
   *
   * Useful for testing or manual rebuild triggers.
   */
  async triggerRebuild(): Promise<void> {
    // If already rebuilding, mark that another rebuild is pending
    if (this.isRebuilding) {
      this.pendingRebuild = true;
      return;
    }

    this.isRebuilding = true;
    this.callbacks.onRebuildStarted?.();

    try {
      // Fetch all frames
      const frames = await Promise.resolve(this.config.fetchFrames());

      // Rebuild Atlas
      const atlas = rebuildAtlas(frames);

      // Validate if configured
      if (this.config.validateAfterRebuild) {
        const validation = validateAtlas(atlas);

        if (!validation.valid) {
          throw new Error(`Atlas validation failed: ${validation.errors.join(", ")}`);
        }
      }

      this.callbacks.onRebuildCompleted?.(atlas);
    } catch (error) {
      this.callbacks.onRebuildFailed?.(error as Error);
    } finally {
      this.isRebuilding = false;

      // If another rebuild was requested while we were rebuilding, trigger it now
      if (this.pendingRebuild) {
        this.pendingRebuild = false;
        // Use setTimeout to avoid deep recursion
        setTimeout(() => this.triggerRebuild(), 0);
      }
    }
  }

  /**
   * Stop the queue and cancel any pending rebuilds
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingRebuild = false;
  }

  /**
   * Check if rebuild is currently in progress
   */
  isRebuildInProgress(): boolean {
    return this.isRebuilding;
  }
}

/**
 * Create a simple Atlas rebuild queue
 *
 * Convenience factory function for creating a queue with sensible defaults.
 *
 * @param fetchFrames - Function to fetch all frames
 * @param debounceMs - Debounce interval in milliseconds (default: 5000)
 * @param callbacks - Event callbacks
 * @returns Atlas rebuild queue
 */
export function createAtlasRebuildQueue(
  fetchFrames: () => Promise<Frame[]> | Frame[],
  debounceMs: number = 5000,
  callbacks?: AtlasRebuildCallbacks
): AtlasRebuildQueue {
  return new AtlasRebuildQueue({
    fetchFrames,
    debounceMs,
    validateAfterRebuild: true,
    callbacks,
  });
}
