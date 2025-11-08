"use strict";
/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFrame = saveFrame;
exports.getFrameById = getFrameById;
exports.searchFrames = searchFrames;
exports.getFramesByBranch = getFramesByBranch;
exports.getFramesByJira = getFramesByJira;
exports.getFramesByModuleScope = getFramesByModuleScope;
exports.getAllFrames = getAllFrames;
exports.deleteFrame = deleteFrame;
exports.getFrameCount = getFrameCount;
/**
 * Convert Frame object to database row
 */
function frameToRow(frame) {
    return {
        id: frame.id,
        timestamp: frame.timestamp,
        branch: frame.branch,
        jira: frame.jira || null,
        module_scope: JSON.stringify(frame.module_scope),
        summary_caption: frame.summary_caption,
        reference_point: frame.reference_point,
        status_snapshot: JSON.stringify(frame.status_snapshot),
        keywords: frame.keywords ? JSON.stringify(frame.keywords) : null,
        atlas_frame_id: frame.atlas_frame_id || null,
        feature_flags: frame.feature_flags ? JSON.stringify(frame.feature_flags) : null,
        permissions: frame.permissions ? JSON.stringify(frame.permissions) : null,
    };
}
/**
 * Convert database row to Frame object
 */
function rowToFrame(row) {
    return {
        id: row.id,
        timestamp: row.timestamp,
        branch: row.branch,
        jira: row.jira || undefined,
        module_scope: JSON.parse(row.module_scope),
        summary_caption: row.summary_caption,
        reference_point: row.reference_point,
        status_snapshot: JSON.parse(row.status_snapshot),
        keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
        atlas_frame_id: row.atlas_frame_id || undefined,
        feature_flags: row.feature_flags ? JSON.parse(row.feature_flags) : undefined,
        permissions: row.permissions ? JSON.parse(row.permissions) : undefined,
    };
}
/**
 * Save a Frame to the database (insert or update)
 */
function saveFrame(db, frame) {
    var row = frameToRow(frame);
    var stmt = db.prepare("\n    INSERT OR REPLACE INTO frames (\n      id, timestamp, branch, jira, module_scope, summary_caption,\n      reference_point, status_snapshot, keywords, atlas_frame_id,\n      feature_flags, permissions\n    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  ");
    stmt.run(row.id, row.timestamp, row.branch, row.jira, row.module_scope, row.summary_caption, row.reference_point, row.status_snapshot, row.keywords, row.atlas_frame_id, row.feature_flags, row.permissions);
}
/**
 * Get a Frame by ID
 */
function getFrameById(db, id) {
    var stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
    var row = stmt.get(id);
    if (!row)
        return null;
    return rowToFrame(row);
}
/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 */
function searchFrames(db, query) {
    var stmt = db.prepare("\n    SELECT f.*\n    FROM frames f\n    JOIN frames_fts fts ON f.rowid = fts.rowid\n    WHERE frames_fts MATCH ?\n    ORDER BY f.timestamp DESC\n  ");
    var rows = stmt.all(query);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames for a specific branch
 */
function getFramesByBranch(db, branch) {
    var stmt = db.prepare("\n    SELECT * FROM frames\n    WHERE branch = ?\n    ORDER BY timestamp DESC\n  ");
    var rows = stmt.all(branch);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames for a specific Jira/ticket ID
 */
function getFramesByJira(db, jiraId) {
    var stmt = db.prepare("\n    SELECT * FROM frames\n    WHERE jira = ?\n    ORDER BY timestamp DESC\n  ");
    var rows = stmt.all(jiraId);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames that touch a specific module
 * @param moduleId Module ID to search for in module_scope arrays
 */
function getFramesByModuleScope(db, moduleId) {
    // Get all frames and filter in JavaScript to avoid SQL injection
    // This is safe because module_scope is stored as JSON array
    var stmt = db.prepare("\n    SELECT * FROM frames\n    ORDER BY timestamp DESC\n  ");
    var rows = stmt.all();
    // Filter frames that contain the moduleId in their module_scope array
    return rows.map(rowToFrame).filter(function (frame) { return frame.module_scope.includes(moduleId); });
}
/**
 * Get all Frames (with optional limit)
 */
function getAllFrames(db, limit) {
    var stmt = db.prepare("\n    SELECT * FROM frames\n    ORDER BY timestamp DESC\n    ".concat(limit ? "LIMIT ?" : "", "\n  "));
    var rows = limit ? stmt.all(limit) : stmt.all();
    return rows.map(rowToFrame);
}
/**
 * Delete a Frame by ID
 */
function deleteFrame(db, id) {
    var stmt = db.prepare("DELETE FROM frames WHERE id = ?");
    var result = stmt.run(id);
    return result.changes > 0;
}
/**
 * Get count of all Frames
 */
function getFrameCount(db) {
    var stmt = db.prepare("SELECT COUNT(*) as count FROM frames");
    var result = stmt.get();
    return result.count;
}
