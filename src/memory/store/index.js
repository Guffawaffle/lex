"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultDbPath = exports.createDatabase = exports.getFrameCount = exports.deleteFrame = exports.getAllFrames = exports.getFramesByModuleScope = exports.getFramesByJira = exports.getFramesByBranch = exports.searchFrames = exports.getFrameById = exports.saveFrame = void 0;
exports.getDb = getDb;
exports.closeDb = closeDb;
var db_js_1 = require("./db.js");
var queries_js_1 = require("./queries.js");
Object.defineProperty(exports, "saveFrame", { enumerable: true, get: function () { return queries_js_1.saveFrame; } });
Object.defineProperty(exports, "getFrameById", { enumerable: true, get: function () { return queries_js_1.getFrameById; } });
Object.defineProperty(exports, "searchFrames", { enumerable: true, get: function () { return queries_js_1.searchFrames; } });
Object.defineProperty(exports, "getFramesByBranch", { enumerable: true, get: function () { return queries_js_1.getFramesByBranch; } });
Object.defineProperty(exports, "getFramesByJira", { enumerable: true, get: function () { return queries_js_1.getFramesByJira; } });
Object.defineProperty(exports, "getFramesByModuleScope", { enumerable: true, get: function () { return queries_js_1.getFramesByModuleScope; } });
Object.defineProperty(exports, "getAllFrames", { enumerable: true, get: function () { return queries_js_1.getAllFrames; } });
Object.defineProperty(exports, "deleteFrame", { enumerable: true, get: function () { return queries_js_1.deleteFrame; } });
Object.defineProperty(exports, "getFrameCount", { enumerable: true, get: function () { return queries_js_1.getFrameCount; } });
// Singleton database instance
var dbInstance = null;
var dbPath = null;
/**
 * Get or create the database instance
 * @param customPath Optional custom database path (defaults to ~/.lex/frames.db)
 */
function getDb(customPath) {
    var targetPath = customPath || (0, db_js_1.getDefaultDbPath)();
    // Create new instance if path changed or no instance exists
    if (!dbInstance || (customPath && dbPath !== customPath)) {
        // Close existing instance if path is changing
        if (dbInstance && dbPath !== targetPath) {
            dbInstance.close();
        }
        dbInstance = (0, db_js_1.createDatabase)(targetPath);
        dbPath = targetPath;
    }
    return dbInstance;
}
/**
 * Close the database connection gracefully
 */
function closeDb() {
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
    var shutdown = function () {
        closeDb();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("beforeExit", function () {
        closeDb();
    });
}
// Setup shutdown handlers when module is imported
setupGracefulShutdown();
// Export database creation for testing
var db_js_2 = require("./db.js");
Object.defineProperty(exports, "createDatabase", { enumerable: true, get: function () { return db_js_2.createDatabase; } });
Object.defineProperty(exports, "getDefaultDbPath", { enumerable: true, get: function () { return db_js_2.getDefaultDbPath; } });
