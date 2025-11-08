"use strict";
// Legacy class-based API for Frame storage
// Wraps the new modular implementation (db.ts, queries.ts, index.ts)
// This provides backward compatibility while using the new modular code internally
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrameStore = void 0;
var db_js_1 = require("./db.js");
var queries_js_1 = require("./queries.js");
/**
 * Frame storage manager using SQLite
 *
 * @deprecated Use the modular API from index.ts instead
 * @example
 * ```typescript
 * // Old API (still works)
 * const store = new FrameStore('/path/to/db');
 * store.insertFrame(frame);
 *
 * // New API (recommended)
 * import { getDb, saveFrame } from 'lex/store';
 * const db = getDb('/path/to/db');
 * saveFrame(db, frame);
 * ```
 *
 * Frames are stored locally with full-text search on reference_point for fuzzy recall.
 * No telemetry. No cloud sync.
 */
var FrameStore = /** @class */ (function () {
    function FrameStore(dbPath) {
        this.db = (0, db_js_1.createDatabase)(dbPath);
    }
    /**
     * Insert or update a Frame
     * @deprecated Use saveFrame from the modular API
     */
    FrameStore.prototype.insertFrame = function (frame) {
        try {
            (0, queries_js_1.saveFrame)(this.db, frame);
            return true;
        }
        catch (error) {
            console.error("Failed to insert frame:", error);
            return false;
        }
    };
    /**
     * Retrieve Frame by ID
     * @deprecated Use getFrameById from the modular API
     */
    FrameStore.prototype.getFrameById = function (id) {
        return (0, queries_js_1.getFrameById)(this.db, id);
    };
    /**
     * Search Frames with FTS and optional filters
     * @deprecated Use searchFrames, getFramesByBranch, or getFramesByJira from the modular API
     */
    FrameStore.prototype.searchFrames = function (query) {
        if (query.reference_point) {
            return (0, queries_js_1.searchFrames)(this.db, query.reference_point);
        }
        if (query.jira) {
            return (0, queries_js_1.getFramesByJira)(this.db, query.jira);
        }
        if (query.branch) {
            return (0, queries_js_1.getFramesByBranch)(this.db, query.branch);
        }
        return (0, queries_js_1.getAllFrames)(this.db, query.limit);
    };
    /**
     * Delete Frame by ID
     * @deprecated Use deleteFrame from the modular API
     */
    FrameStore.prototype.deleteFrame = function (id) {
        return (0, queries_js_1.deleteFrame)(this.db, id);
    };
    /**
     * Close database connection
     */
    FrameStore.prototype.close = function () {
        this.db.close();
    };
    /**
     * Get the underlying database instance (for testing/internal use)
     * @internal
     */
    FrameStore.prototype.getDatabase = function () {
        return this.db;
    };
    return FrameStore;
}());
exports.FrameStore = FrameStore;
