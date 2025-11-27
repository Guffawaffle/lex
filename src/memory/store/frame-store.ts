/**
 * FrameStore — persistence contract for Frames.
 *
 * This module defines the minimal interface that any Frame persistence layer must implement.
 * Default implementation: SqliteFrameStore (OSS).
 * Other drivers (if any) live out-of-tree or in higher layers.
 */

import type { Frame } from "../frames/types.js";

/**
 * Search criteria for Frames.
 */
export interface FrameSearchCriteria {
  /**
   * Opaque search string. Semantics vary by driver but MUST include
   * at least free-text search over reference_point and summary_caption.
   * For SqliteFrameStore, this is FTS5 syntax.
   * Callers SHOULD NOT assume any specific query language.
   */
  query?: string;

  /** Filter by module IDs (any match). */
  moduleScope?: string[];

  /** Maximum results to return. */
  limit?: number;

  /**
   * Return Frames with timestamp >= since (UTC).
   * For "last N frames regardless of time," use limit/offset instead.
   */
  since?: Date;

  /**
   * Return Frames with timestamp <= until (UTC).
   */
  until?: Date;
}

/**
 * Options for listing Frames.
 */
export interface FrameListOptions {
  /** Maximum number of Frames to return. */
  limit?: number;

  /** Number of Frames to skip (for pagination). */
  offset?: number;
}

/**
 * Result of saving a single Frame in a batch operation.
 */
export interface SaveResult {
  /** The Frame ID. */
  id: string;

  /** Whether the save was successful. */
  success: boolean;

  /** Error message if save failed. */
  error?: string;
}

/**
 * FrameStore — persistence contract for Frames.
 *
 * Default implementation: SqliteFrameStore (OSS).
 * Other drivers (if any) live out-of-tree or in higher layers.
 */
export interface FrameStore {
  /**
   * Persist a Frame to storage.
   * @param frame - The Frame to save.
   */
  saveFrame(frame: Frame): Promise<void>;

  /**
   * Persist multiple Frames to storage with transactional semantics.
   * All-or-nothing: if any validation fails, no Frames are saved.
   * @param frames - Array of Frames to save.
   * @returns Array of results for each Frame (in same order as input).
   */
  saveFrames(frames: Frame[]): Promise<SaveResult[]>;

  /**
   * Retrieve a Frame by its unique identifier.
   * @param id - The Frame ID.
   * @returns The Frame if found, or null if not found.
   */
  getFrameById(id: string): Promise<Frame | null>;

  /**
   * Search for Frames matching the given criteria.
   * @param criteria - Search filters and options.
   * @returns Array of matching Frames.
   */
  searchFrames(criteria: FrameSearchCriteria): Promise<Frame[]>;

  /**
   * List Frames with optional pagination.
   * @param options - Pagination options.
   * @returns Array of Frames.
   */
  listFrames(options?: FrameListOptions): Promise<Frame[]>;

  /**
   * Close the store and release any resources.
   */
  close(): Promise<void>;
}
