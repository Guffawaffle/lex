// TODO(merge): Adapt this to use shared/types/FRAME.md schema
// This file originated from LexBrain packages/server/src/db.ts (pre-merge)
import Database from "better-sqlite3";
/**
 * Frame storage manager using SQLite
 *
 * Frames are stored locally with full-text search on reference_point for fuzzy recall.
 * No telemetry. No cloud sync.
 */
export class FrameStore {
    db;
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.initialize();
    }
    initialize() {
        // Set SQLite pragmas for performance
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("busy_timeout = 5000");
        this.db.pragma("synchronous = NORMAL");
        this.db.pragma("cache_size = 10000");
        // Create frames table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS frames (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        branch TEXT NOT NULL,
        jira TEXT,
        module_scope TEXT NOT NULL,
        summary_caption TEXT NOT NULL,
        reference_point TEXT NOT NULL,
        status_snapshot TEXT NOT NULL,
        keywords TEXT,
        atlas_frame_id TEXT
      );
    `);
        // Create FTS5 virtual table for fuzzy search on reference_point
        this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
        reference_point,
        summary_caption,
        keywords,
        content='frames',
        content_rowid='rowid'
      );
    `);
        // Create triggers to keep FTS index in sync
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
        INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords)
        VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords);
      END;
    `);
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
        DELETE FROM frames_fts WHERE rowid = old.rowid;
      END;
    `);
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN
        UPDATE frames_fts
        SET reference_point = new.reference_point,
            summary_caption = new.summary_caption,
            keywords = new.keywords
        WHERE rowid = new.rowid;
      END;
    `);
        // Create indexes
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp DESC);
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames(branch);
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames(jira);
    `);
    }
    /**
     * Insert or update a Frame
     */
    insertFrame(frame) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO frames (
        id, timestamp, branch, jira, module_scope, summary_caption,
        reference_point, status_snapshot, keywords, atlas_frame_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(frame.id, frame.timestamp, frame.branch, frame.jira || null, JSON.stringify(frame.module_scope), frame.summary_caption, frame.reference_point, JSON.stringify(frame.status_snapshot), frame.keywords ? JSON.stringify(frame.keywords) : null, frame.atlas_frame_id || null);
        return result.changes > 0;
    }
    /**
     * Retrieve Frame by ID
     */
    getFrameById(id) {
        const stmt = this.db.prepare("SELECT * FROM frames WHERE id = ?");
        const row = stmt.get(id);
        if (!row)
            return null;
        return {
            id: row.id,
            timestamp: row.timestamp,
            branch: row.branch,
            jira: row.jira,
            module_scope: JSON.parse(row.module_scope),
            summary_caption: row.summary_caption,
            reference_point: row.reference_point,
            status_snapshot: JSON.parse(row.status_snapshot),
            keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
            atlas_frame_id: row.atlas_frame_id,
        };
    }
    /**
     * Search Frames with FTS and optional filters
     */
    searchFrames(query) {
        let sql;
        const params = [];
        if (query.reference_point) {
            // FTS fuzzy search on reference_point
            sql = `
        SELECT f.*
        FROM frames f
        JOIN frames_fts fts ON f.rowid = fts.rowid
        WHERE frames_fts MATCH ?
      `;
            params.push(query.reference_point);
            if (query.jira) {
                sql += " AND f.jira = ?";
                params.push(query.jira);
            }
            if (query.branch) {
                sql += " AND f.branch = ?";
                params.push(query.branch);
            }
            sql += " ORDER BY f.timestamp DESC";
        }
        else {
            // Non-FTS query
            sql = "SELECT * FROM frames WHERE 1=1";
            if (query.jira) {
                sql += " AND jira = ?";
                params.push(query.jira);
            }
            if (query.branch) {
                sql += " AND branch = ?";
                params.push(query.branch);
            }
            sql += " ORDER BY timestamp DESC";
        }
        if (query.limit) {
            sql += " LIMIT ?";
            params.push(query.limit);
        }
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map((row) => ({
            id: row.id,
            timestamp: row.timestamp,
            branch: row.branch,
            jira: row.jira,
            module_scope: JSON.parse(row.module_scope),
            summary_caption: row.summary_caption,
            reference_point: row.reference_point,
            status_snapshot: JSON.parse(row.status_snapshot),
            keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
            atlas_frame_id: row.atlas_frame_id,
        }));
    }
    /**
     * Close database connection
     */
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=framestore.js.map