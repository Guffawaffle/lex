/**
 * Atlas Rebuild Trigger API
 *
 * Provides external API for triggering Atlas rebuilds and receiving notifications.
 * This is the public interface for LexRunner and other external callers.
 *
 * Features:
 * - triggerAtlasRebuild(): Promise-based trigger that resolves on completion
 * - Callback registration for rebuild events
 * - Rate-limiting via debounce to prevent excessive rebuilds
 *
 * @module atlas/trigger
 */

import type { Frame } from "../types/frame.js";
import { rebuildAtlas, type Atlas } from "./rebuild.js";
import { validateAtlas, type ValidationResult } from "./validate.js";

/**
 * Result of an Atlas rebuild operation
 */
export interface RebuildResult {
  /** Whether the rebuild completed successfully */
  success: boolean;
  /** The rebuilt Atlas (only present on success) */
  atlas?: Atlas;
  /** Validation result from Atlas integrity check */
  validation?: ValidationResult;
  /** Error message (only present on failure) */
  error?: string;
  /** Time taken to complete rebuild in milliseconds */
  durationMs: number;
  /** Number of frames processed */
  frameCount: number;
  /** Timestamp when rebuild completed */
  timestamp: string;
}

/**
 * Callback function type for rebuild completion events
 */
export type RebuildCallback = (result: RebuildResult) => void;

/**
 * Configuration for AtlasRebuildManager
 */
export interface AtlasRebuildManagerConfig {
  /** Debounce interval in milliseconds (default: 1000 = 1s) */
  debounceMs?: number;
  /** Whether to validate Atlas after rebuild (default: true) */
  validateAfterRebuild?: boolean;
  /** Callback to fetch all frames for rebuild */
  fetchFrames: () => Promise<Frame[]> | Frame[];
}

/**
 * Atlas Rebuild Manager
 *
 * Singleton manager for Atlas rebuilds with Promise-based trigger API,
 * callback registration, and rate-limiting via debounce.
 *
 * Usage:
 * ```typescript
 * const manager = new AtlasRebuildManager({
 *   fetchFrames: () => getAllFrames(getDb()),
 *   debounceMs: 1000,
 * });
 *
 * // Register callbacks
 * const unsubscribe = manager.onRebuildComplete((result) => {
 *   console.log('Rebuild complete:', result);
 * });
 *
 * // Trigger rebuild and wait for result
 * const result = await manager.triggerRebuild();
 *
 * // Cleanup
 * unsubscribe();
 * manager.dispose();
 * ```
 */
export class AtlasRebuildManager {
  private config: Required<AtlasRebuildManagerConfig>;
  private callbacks: Set<RebuildCallback> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRebuilding = false;
  private pendingPromises: Array<{
    resolve: (result: RebuildResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: AtlasRebuildManagerConfig) {
    this.config = {
      debounceMs: config.debounceMs ?? 1000,
      validateAfterRebuild: config.validateAfterRebuild ?? true,
      fetchFrames: config.fetchFrames,
    };
  }

  /**
   * Trigger an Atlas rebuild
   *
   * If a rebuild is already in progress or pending, this call will join
   * the existing operation and receive the same result. Multiple rapid
   * calls are debounced to prevent excessive rebuilds.
   *
   * @returns Promise that resolves with the rebuild result
   */
  triggerRebuild(): Promise<RebuildResult> {
    return new Promise((resolve, reject) => {
      // Add to pending promises - all callers will receive the same result
      this.pendingPromises.push({ resolve, reject });

      // Cancel existing debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // If already rebuilding, the pending promise will be resolved when complete
      if (this.isRebuilding) {
        return;
      }

      // Schedule rebuild after debounce period
      this.debounceTimer = setTimeout(() => {
        void this.executeRebuild();
      }, this.config.debounceMs);
    });
  }

  /**
   * Execute the actual rebuild operation
   */
  private async executeRebuild(): Promise<void> {
    if (this.isRebuilding) {
      return;
    }

    this.isRebuilding = true;
    const startTime = Date.now();
    let frameCount = 0;

    try {
      // Fetch all frames
      const frames = await Promise.resolve(this.config.fetchFrames());
      frameCount = frames.length;

      // Rebuild Atlas
      const atlas = rebuildAtlas(frames);

      // Validate if configured
      let validation: ValidationResult | undefined;
      if (this.config.validateAfterRebuild) {
        validation = validateAtlas(atlas);

        if (!validation.valid) {
          throw new Error(`Atlas validation failed: ${validation.errors.join(", ")}`);
        }
      }

      const result: RebuildResult = {
        success: true,
        atlas,
        validation,
        durationMs: Date.now() - startTime,
        frameCount,
        timestamp: new Date().toISOString(),
      };

      // Resolve all pending promises
      this.resolvePendingPromises(result);

      // Notify callbacks
      this.notifyCallbacks(result);
    } catch (error) {
      const result: RebuildResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        frameCount,
        timestamp: new Date().toISOString(),
      };

      // Resolve all pending promises (with failure result)
      this.resolvePendingPromises(result);

      // Notify callbacks
      this.notifyCallbacks(result);
    } finally {
      this.isRebuilding = false;
      this.debounceTimer = null;
    }
  }

  /**
   * Resolve all pending promises with the given result
   */
  private resolvePendingPromises(result: RebuildResult): void {
    const promises = this.pendingPromises;
    this.pendingPromises = [];

    for (const { resolve } of promises) {
      resolve(result);
    }
  }

  /**
   * Notify all registered callbacks with the rebuild result
   */
  private notifyCallbacks(result: RebuildResult): void {
    for (const callback of this.callbacks) {
      try {
        callback(result);
      } catch {
        // Ignore callback errors to prevent cascading failures
      }
    }
  }

  /**
   * Register a callback for rebuild completion events
   *
   * @param callback - Function to call when rebuild completes
   * @returns Unsubscribe function to remove the callback
   */
  onRebuildComplete(callback: RebuildCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Remove a rebuild completion callback
   *
   * @param callback - The callback to remove
   * @returns true if callback was found and removed, false otherwise
   */
  removeRebuildCallback(callback: RebuildCallback): boolean {
    return this.callbacks.delete(callback);
  }

  /**
   * Check if a rebuild is currently in progress
   */
  isRebuildInProgress(): boolean {
    return this.isRebuilding;
  }

  /**
   * Get the number of registered callbacks
   */
  getCallbackCount(): number {
    return this.callbacks.size;
  }

  /**
   * Dispose the manager and cancel any pending rebuilds
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Reject any pending promises
    const promises = this.pendingPromises;
    this.pendingPromises = [];

    for (const { reject } of promises) {
      reject(new Error("AtlasRebuildManager disposed"));
    }

    // Clear callbacks
    this.callbacks.clear();
  }
}

// =============================================================================
// Singleton Manager API
// =============================================================================

let globalManager: AtlasRebuildManager | null = null;

/**
 * Initialize the global Atlas rebuild manager
 *
 * Must be called before using triggerAtlasRebuild() or onRebuildComplete().
 *
 * @param config - Manager configuration
 * @returns The initialized manager
 */
export function initAtlasRebuildManager(config: AtlasRebuildManagerConfig): AtlasRebuildManager {
  if (globalManager) {
    globalManager.dispose();
  }
  globalManager = new AtlasRebuildManager(config);
  return globalManager;
}

/**
 * Get the global Atlas rebuild manager
 *
 * @throws Error if manager has not been initialized
 */
export function getAtlasRebuildManager(): AtlasRebuildManager {
  if (!globalManager) {
    throw new Error("AtlasRebuildManager not initialized. Call initAtlasRebuildManager() first.");
  }
  return globalManager;
}

/**
 * Trigger an Atlas rebuild using the global manager
 *
 * Convenience function that delegates to the global manager.
 *
 * @returns Promise that resolves with the rebuild result
 * @throws Error if manager has not been initialized
 */
export function triggerAtlasRebuild(): Promise<RebuildResult> {
  return getAtlasRebuildManager().triggerRebuild();
}

/**
 * Register a callback for rebuild completion events on the global manager
 *
 * @param callback - Function to call when rebuild completes
 * @returns Unsubscribe function to remove the callback
 * @throws Error if manager has not been initialized
 */
export function onRebuildComplete(callback: RebuildCallback): () => void {
  return getAtlasRebuildManager().onRebuildComplete(callback);
}

/**
 * Remove a rebuild completion callback from the global manager
 *
 * @param callback - The callback to remove
 * @returns true if callback was found and removed, false otherwise
 * @throws Error if manager has not been initialized
 */
export function removeRebuildCallback(callback: RebuildCallback): boolean {
  return getAtlasRebuildManager().removeRebuildCallback(callback);
}

/**
 * Reset the global manager (for testing)
 */
export function resetAtlasRebuildManager(): void {
  if (globalManager) {
    globalManager.dispose();
    globalManager = null;
  }
}
