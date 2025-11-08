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
import { createDatabase, getDefaultDbPath } from "./db.js";
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
// Singleton database instance
let dbInstance = null;
let dbPath = null;
/**
 * Get or create the database instance
 * @param customPath Optional custom database path (defaults to ~/.lex/frames.db)
 */
export function getDb(customPath) {
  const targetPath = customPath || getDefaultDbPath();
  // Create new instance if path changed or no instance exists
  if (!dbInstance || (customPath && dbPath !== customPath)) {
    // Close existing instance if path is changing
    if (dbInstance && dbPath !== targetPath) {
      dbInstance.close();
    }
    dbInstance = createDatabase(targetPath);
    dbPath = targetPath;
  }
  return dbInstance;
}
/**
 * Close the database connection gracefully
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPath = null;
  }
}
/**
 * Handle graceful shutdown on process termination
 */
function setupGracefulShutdown() {
  const shutdown = () => {
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("beforeExit", () => {
    closeDb();
  });
}
// Setup shutdown handlers when module is imported
setupGracefulShutdown();
// Export database creation for testing
export { createDatabase, getDefaultDbPath } from "./db.js";
//# sourceMappingURL=index.js.map
