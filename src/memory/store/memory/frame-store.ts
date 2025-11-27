/**
 * MemoryFrameStore — In-memory FrameStore implementation for tests.
 *
 * Provides a fast, deterministic test double that doesn't require SQLite setup.
 * Uses Map<string, Frame> for storage with simple in-memory filtering.
 */

import type { FrameStore, FrameSearchCriteria, FrameListOptions } from "../frame-store.js";
import type { Frame } from "../../frames/types.js";

/**
 * In-memory implementation of FrameStore for unit tests.
 *
 * Features:
 * - No SQLite dependency
 * - Simple substring matching for search
 * - Pre-population via constructor
 * - Synchronous operations wrapped in Promise for interface compliance
 */
export class MemoryFrameStore implements FrameStore {
  private frames = new Map<string, Frame>();

  /**
   * Create a new MemoryFrameStore.
   * @param initialFrames - Optional array of Frames to pre-populate the store.
   */
  constructor(initialFrames?: Frame[]) {
    initialFrames?.forEach((f) => this.frames.set(f.id, f));
  }

  /**
   * Persist a Frame to storage (upsert).
   */
  async saveFrame(frame: Frame): Promise<void> {
    this.frames.set(frame.id, frame);
  }

  /**
   * Retrieve a Frame by its unique identifier.
   */
  async getFrameById(id: string): Promise<Frame | null> {
    return this.frames.get(id) ?? null;
  }

  /**
   * Search for Frames matching the given criteria.
   * Performs simple in-memory filtering:
   * - query: substring match on reference_point + summary_caption
   * - moduleScope: array intersection
   * - since/until: timestamp comparison
   * - limit: maximum results
   */
  async searchFrames(criteria: FrameSearchCriteria): Promise<Frame[]> {
    let results = Array.from(this.frames.values());

    // Filter by query (substring match on reference_point + summary_caption)
    if (criteria.query) {
      const queryLower = criteria.query.toLowerCase();
      results = results.filter((f) => {
        const searchText = `${f.reference_point} ${f.summary_caption}`.toLowerCase();
        return searchText.includes(queryLower);
      });
    }

    // Filter by moduleScope (any match)
    if (criteria.moduleScope && criteria.moduleScope.length > 0) {
      const moduleScope = criteria.moduleScope;
      results = results.filter((f) =>
        f.module_scope.some((m) => moduleScope.includes(m))
      );
    }

    // Filter by since (timestamp >= since)
    if (criteria.since) {
      const sinceTime = criteria.since.getTime();
      results = results.filter((f) => new Date(f.timestamp).getTime() >= sinceTime);
    }

    // Filter by until (timestamp <= until)
    if (criteria.until) {
      const untilTime = criteria.until.getTime();
      results = results.filter((f) => new Date(f.timestamp).getTime() <= untilTime);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (criteria.limit !== undefined && criteria.limit > 0) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  /**
   * List Frames with optional pagination.
   * Frames are returned in descending timestamp order (newest first).
   */
  async listFrames(options?: FrameListOptions): Promise<Frame[]> {
    let results = Array.from(this.frames.values());

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply offset
    const offset = options?.offset ?? 0;
    if (offset > 0) {
      results = results.slice(offset);
    }

    // Apply limit
    if (options?.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Close the store and release resources.
   * No-op for memory store.
   */
  async close(): Promise<void> {
    // No-op for memory store
  }

  /**
   * Clear all frames from the store.
   * Test helper method.
   */
  clear(): void {
    this.frames.clear();
  }

  /**
   * Get the number of frames in the store.
   * Test helper method.
   */
  size(): number {
    return this.frames.size;
  }
}
