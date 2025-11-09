/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */
import Database from "better-sqlite3";
import type { Frame } from "../frames/types.js";
/**
 * Save a Frame to the database (insert or update)
 */
export declare function saveFrame(db: Database.Database, frame: Frame): void;
/**
 * Get a Frame by ID
 */
export declare function getFrameById(db: Database.Database, id: string): Frame | null;
/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 */
export declare function searchFrames(db: Database.Database, query: string): Frame[];
/**
 * Get all Frames for a specific branch
 */
export declare function getFramesByBranch(db: Database.Database, branch: string): Frame[];
/**
 * Get all Frames for a specific Jira/ticket ID
 */
export declare function getFramesByJira(db: Database.Database, jiraId: string): Frame[];
/**
 * Get all Frames that touch a specific module
 * @param moduleId Module ID to search for in module_scope arrays
 */
export declare function getFramesByModuleScope(db: Database.Database, moduleId: string): Frame[];
/**
 * Get all Frames (with optional limit)
 */
export declare function getAllFrames(db: Database.Database, limit?: number): Frame[];
/**
 * Delete a Frame by ID
 */
export declare function deleteFrame(db: Database.Database, id: string): boolean;
/**
 * Get count of all Frames
 */
export declare function getFrameCount(db: Database.Database): number;
