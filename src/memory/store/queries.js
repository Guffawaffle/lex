/**
 * Frame storage queries
 *
 * CRUD operations and search functions for Frames.
 */
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
export function saveFrame(db, frame) {
    const row = frameToRow(frame);
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO frames (
      id, timestamp, branch, jira, module_scope, summary_caption,
      reference_point, status_snapshot, keywords, atlas_frame_id,
      feature_flags, permissions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(row.id, row.timestamp, row.branch, row.jira, row.module_scope, row.summary_caption, row.reference_point, row.status_snapshot, row.keywords, row.atlas_frame_id, row.feature_flags, row.permissions);
}
/**
 * Get a Frame by ID
 */
export function getFrameById(db, id) {
    const stmt = db.prepare("SELECT * FROM frames WHERE id = ?");
    const row = stmt.get(id);
    if (!row)
        return null;
    return rowToFrame(row);
}
/**
 * Search Frames using FTS5 full-text search
 * @param query Natural language query string (searches reference_point, summary_caption, keywords)
 */
export function searchFrames(db, query) {
    const stmt = db.prepare(`
    SELECT f.*
    FROM frames f
    JOIN frames_fts fts ON f.rowid = fts.rowid
    WHERE frames_fts MATCH ?
    ORDER BY f.timestamp DESC
  `);
    const rows = stmt.all(query);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames for a specific branch
 */
export function getFramesByBranch(db, branch) {
    const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE branch = ?
    ORDER BY timestamp DESC
  `);
    const rows = stmt.all(branch);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames for a specific Jira/ticket ID
 */
export function getFramesByJira(db, jiraId) {
    const stmt = db.prepare(`
    SELECT * FROM frames
    WHERE jira = ?
    ORDER BY timestamp DESC
  `);
    const rows = stmt.all(jiraId);
    return rows.map(rowToFrame);
}
/**
 * Get all Frames that touch a specific module
 * @param moduleId Module ID to search for in module_scope arrays
 */
export function getFramesByModuleScope(db, moduleId) {
    // Get all frames and filter in JavaScript to avoid SQL injection
    // This is safe because module_scope is stored as JSON array
    const stmt = db.prepare(`
    SELECT * FROM frames
    ORDER BY timestamp DESC
  `);
    const rows = stmt.all();
    // Filter frames that contain the moduleId in their module_scope array
    return rows
        .map(rowToFrame)
        .filter(frame => frame.module_scope.includes(moduleId));
}
/**
 * Get all Frames (with optional limit)
 */
export function getAllFrames(db, limit) {
    const stmt = db.prepare(`
    SELECT * FROM frames
    ORDER BY timestamp DESC
    ${limit ? 'LIMIT ?' : ''}
  `);
    const rows = limit ? stmt.all(limit) : stmt.all();
    return rows.map(rowToFrame);
}
/**
 * Delete a Frame by ID
 */
export function deleteFrame(db, id) {
    const stmt = db.prepare("DELETE FROM frames WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
}
/**
 * Get count of all Frames
 */
export function getFrameCount(db) {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM frames");
    const result = stmt.get();
    return result.count;
}
//# sourceMappingURL=queries.js.map