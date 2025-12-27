/**
 * MemoryFrameStore — In-memory FrameStore implementation for tests.
 *
 * Provides a fast, deterministic test double that doesn't require SQLite setup.
 * Uses Map<string, Frame> for storage with simple in-memory filtering.
 */

import type { FrameStore, FrameSearchCriteria, FrameListOptions, FrameListResult, SaveResult } from "../frame-store.js";
import type { Frame } from "../../frames/types.js";
import { Frame as FrameSchema } from "../../frames/types.js";

/**
 * Cursor for stable pagination.
 */
interface PaginationCursor {
  timestamp: string;
  frame_id: string;
}

/**
 * Encode a pagination cursor to an opaque base64 string.
 */
function encodeCursor(timestamp: string, frameId: string): string {
  const cursor: PaginationCursor = { timestamp, frame_id: frameId };
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

/**
 * Decode a pagination cursor from a base64 string.
 * Returns null if the cursor is invalid.
 */
function decodeCursor(cursor: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as PaginationCursor;
    if (typeof parsed.timestamp === "string" && typeof parsed.frame_id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

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
   * Persist multiple Frames to storage with transactional semantics.
   * All-or-nothing: if any validation fails, no Frames are saved.
   */
  async saveFrames(frames: Frame[]): Promise<SaveResult[]> {
    // Validate all frames first (all-or-nothing on validation failure)
    for (const frame of frames) {
      const parseResult = FrameSchema.safeParse(frame);
      if (!parseResult.success) {
        // Validation failed - return error results for all frames
        return frames.map((f, i) => ({
          id: f.id ?? `frame-${i}`,
          success: false,
          error:
            f === frame
              ? `Validation failed: ${parseResult.error.message}`
              : "Transaction aborted due to validation failure in another frame",
        }));
      }
    }

    // All validations passed - insert all frames
    const results: SaveResult[] = [];
    for (const frame of frames) {
      this.frames.set(frame.id, frame);
      results.push({ id: frame.id, success: true });
    }
    return results;
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
   * Supports both cursor-based and offset-based pagination.
   * Frames are returned in stable order: (timestamp DESC, id DESC).
   */
  async listFrames(options?: FrameListOptions): Promise<FrameListResult> {
    let results = Array.from(this.frames.values());

    // Sort by timestamp descending, then by ID descending for stable ordering
    results.sort((a, b) => {
      const timestampCompare = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timestampCompare !== 0) {
        return timestampCompare;
      }
      // Tie-break on ID (descending)
      return b.id.localeCompare(a.id);
    });

    // Handle cursor-based pagination (takes precedence over offset)
    if (options?.cursor) {
      const cursorData = decodeCursor(options.cursor);
      if (cursorData) {
        // Filter out frames that are >= cursor position
        results = results.filter((frame) => {
          const frameTime = new Date(frame.timestamp).getTime();
          const cursorTime = new Date(cursorData.timestamp).getTime();
          
          // If timestamps are different, compare them
          if (frameTime !== cursorTime) {
            return frameTime < cursorTime;
          }
          // If timestamps are the same, compare IDs
          return frame.id < cursorData.frame_id;
        });
      }
    } else if (options?.offset !== undefined && options.offset > 0) {
      // Apply offset only if no cursor
      results = results.slice(options.offset);
    }

    // Determine limit
    const limit = options?.limit ?? 10;

    // Fetch limit + 1 to check if there are more results
    const fetchLimit = limit + 1;
    const sliced = results.slice(0, fetchLimit);

    // Determine if there are more results
    const hasMore = sliced.length > limit;
    const frames = sliced.slice(0, limit);

    // Generate next cursor from the last frame
    let nextCursor: string | null = null;
    if (hasMore && frames.length > 0) {
      const lastFrame = frames[frames.length - 1];
      nextCursor = encodeCursor(lastFrame.timestamp, lastFrame.id);
    }

    return {
      frames,
      page: {
        limit,
        nextCursor,
        hasMore,
      },
      order: {
        by: "timestamp",
        direction: "desc",
      },
    };
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
