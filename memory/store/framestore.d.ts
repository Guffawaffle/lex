export interface FrameRow {
    id: string;
    timestamp: string;
    branch: string;
    jira: string | null;
    module_scope: string;
    summary_caption: string;
    reference_point: string;
    status_snapshot: string;
    keywords: string | null;
    atlas_frame_id: string | null;
}
/**
 * Frame storage manager using SQLite
 *
 * Frames are stored locally with full-text search on reference_point for fuzzy recall.
 * No telemetry. No cloud sync.
 */
export declare class FrameStore {
    private db;
    constructor(dbPath: string);
    private initialize;
    /**
     * Insert or update a Frame
     */
    insertFrame(frame: any): boolean;
    /**
     * Retrieve Frame by ID
     */
    getFrameById(id: string): any | null;
    /**
     * Search Frames with FTS and optional filters
     */
    searchFrames(query: {
        reference_point?: string;
        jira?: string;
        branch?: string;
        limit?: number;
    }): any[];
    /**
     * Close database connection
     */
    close(): void;
}
//# sourceMappingURL=framestore.d.ts.map