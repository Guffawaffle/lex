/**
 * Frame storage interface
 *
 * Main export for database operations with connection pooling and graceful shutdown.
 *
 * Usage:
 *   import { getDb, saveFrame, getFrameById, searchFrames } from 'lex/store';
 *
 *   const db = getDb();
 *   await saveFrame(db, myFrame);
 *   const frame = await getFrameById(db, 'frame-001');
 *   const results = await searchFrames(db, 'auth deadlock');
 */
import Database from "better-sqlite3";
export type { FrameRow } from "./db.js";
export type { Frame, FrameStatusSnapshot } from "../frames/types.js";
export {
  saveFrame,
  getFrameById,
  searchFrames,
  getFramesByBranch,
  getFramesByJira,
  getFramesByModuleScope,
  getAllFrames,
  deleteFrame,
  getFrameCount,
} from "./queries.js";
/**
 * Get or create the database instance
 * @param customPath Optional custom database path (defaults to ~/.lex/frames.db)
 */
export declare function getDb(customPath?: string): Database.Database;
/**
 * Close the database connection gracefully
 */
export declare function closeDb(): void;
export { createDatabase, getDefaultDbPath } from "./db.js";
