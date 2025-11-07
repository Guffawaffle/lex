// TODO(merge): Wire this into shared/types/ once schema unification is complete
// This file originated from LexBrain packages/sdk-ts/src/index.ts (pre-merge)
import { z } from "zod";
/**
 * Frame metadata schema
 * Represents a timestamped work session snapshot with human-memorable reference points
 */
export const FrameStatusSnapshot = z.object({
    next_action: z.string(),
    blockers: z.array(z.string()).optional(),
    merge_blockers: z.array(z.string()).optional(),
    tests_failing: z.array(z.string()).optional(),
});
export const Frame = z.object({
    id: z.string(),
    timestamp: z.string(), // ISO 8601
    branch: z.string(),
    jira: z.string().optional(),
    module_scope: z.array(z.string()), // Must match lexmap.policy.json module IDs (THE CRITICAL RULE)
    summary_caption: z.string(),
    reference_point: z.string(), // Human-memorable anchor phrase
    status_snapshot: FrameStatusSnapshot,
    keywords: z.array(z.string()).optional(),
    atlas_frame_id: z.string().optional(), // Link to Atlas Frame (spatial neighborhood)
    feature_flags: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
});
//# sourceMappingURL=types.js.map