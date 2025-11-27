/**
 * Frame storage interface
 *
 * Main export for database operations with connection pooling and graceful shutdown.
 *
 * Usage:
 *   import { getDb, saveFrame, getFrameById, searchFrames } from '@smartergpt/lex/store';
 *
 *   const db = getDb();
 *   await saveFrame(db, myFrame);
 *   const frame = await getFrameById(db, 'frame-001');
 *   const results = await searchFrames(db, 'auth deadlock');
 */

import Database from "better-sqlite3-multiple-ciphers";
import { createDatabase, getDefaultDbPath } from "./db.js";

export type { FrameRow, CodeAtlasRunRow } from "./db.js";
export type { BehaviorRuleRow } from "./lexsona-queries.js";
export type { Frame, FrameStatusSnapshot } from "../frames/types.js";
export type { SearchResult, ExportFramesOptions } from "./queries.js";
export type {
  FrameStore,
  FrameSearchCriteria,
  FrameListOptions,
  SaveResult,
} from "./frame-store.js";
export type { CodeAtlasStore } from "./code-atlas-store.js";

// SqliteFrameStore - production-ready FrameStore implementation
export { SqliteFrameStore } from "./sqlite/index.js";

// Memory-based store implementations for testing
export { MemoryFrameStore } from "./memory/index.js";

export {
  saveFrame,
  getFrameById,
  searchFrames,
  getFramesByBranch,
  getFramesByJira,
  getFramesByModuleScope,
  getAllFrames,
  getFramesForExport,
  deleteFrame,
  getFrameCount,
} from "./queries.js";

export {
  saveCodeAtlasRun,
  getCodeAtlasRunById,
  getCodeAtlasRunsByRepo,
  getAllCodeAtlasRuns,
  deleteCodeAtlasRun,
  getCodeAtlasRunCount,
} from "./code-atlas-runs.js";

export type {
  CodeUnitRow,
  ListOptions,
  CodeUnitQueryOptions,
  PaginatedResult,
  BatchInsertResult,
  BatchDeleteResult,
} from "./code-unit-queries.js";

export {
  saveCodeUnit,
  updateCodeUnit,
  insertCodeUnitBatch,
  getCodeUnitById,
  queryCodeUnits,
  listCodeUnitsByRepo,
  listCodeUnitsByFile,
  listCodeUnitsByKind,
  searchCodeUnitsBySymbol,
  deleteCodeUnit,
  deleteCodeUnitsByRepo,
  getCodeUnitCount,
} from "./code-unit-queries.js";

// LexSona behavior rules exports
export {
  saveBehaviorRule,
  getBehaviorRuleById,
  getAllBehaviorRules,
  deleteBehaviorRule,
  getBehaviorRuleCount,
  reinforceRule,
  counterExampleRule,
  createBehaviorRule,
  getRulesByContext,
  findRuleByContext,
} from "./lexsona-queries.js";

// LexSona types
export type {
  BehaviorRule,
  BehaviorRuleWithConfidence,
  RuleScope,
  RuleSeverity,
  RuleContext,
  Correction,
  GetRulesOptions,
} from "./lexsona-types.js";
export { LEXSONA_DEFAULTS } from "./lexsona-types.js";

// Singleton database instance
let dbInstance: Database.Database | null = null;
let dbPath: string | null = null;

/**
 * Get or create the database instance
 * @param customPath Optional custom database path (defaults to ~/.lex/frames.db)
 */
export function getDb(customPath?: string): Database.Database {
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
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPath = null;
  }
}

/**
 * Handle graceful shutdown on process termination
 */
function setupGracefulShutdown(): void {
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
export {
  createDatabase,
  getDefaultDbPath,
  deriveEncryptionKey,
  getEncryptionKey,
  validatePassphraseStrength,
} from "./db.js";
export type { PassphraseValidationResult } from "./db.js";

// Export SQLite store implementations
export { SqliteCodeAtlasStore } from "./sqlite/index.js";
