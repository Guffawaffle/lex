"use strict";
// TODO(merge): Wire this into shared/types/ once schema unification is complete
// This file originated from LexBrain packages/sdk-ts/src/index.ts (pre-merge)
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = exports.FrameStatusSnapshot = void 0;
var zod_1 = require("zod");
/**
 * Frame metadata schema
 * Represents a timestamped work session snapshot with human-memorable reference points
 */
exports.FrameStatusSnapshot = zod_1.z.object({
    next_action: zod_1.z.string(),
    blockers: zod_1.z.array(zod_1.z.string()).optional(),
    merge_blockers: zod_1.z.array(zod_1.z.string()).optional(),
    tests_failing: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.Frame = zod_1.z.object({
    id: zod_1.z.string(),
    timestamp: zod_1.z.string(), // ISO 8601
    branch: zod_1.z.string(),
    jira: zod_1.z.string().optional(),
    module_scope: zod_1.z.array(zod_1.z.string()), // Must match lexmap.policy.json module IDs (THE CRITICAL RULE)
    summary_caption: zod_1.z.string(),
    reference_point: zod_1.z.string(), // Human-memorable anchor phrase
    status_snapshot: exports.FrameStatusSnapshot,
    keywords: zod_1.z.array(zod_1.z.string()).optional(),
    atlas_frame_id: zod_1.z.string().optional(), // Link to Atlas Frame (spatial neighborhood)
    feature_flags: zod_1.z.array(zod_1.z.string()).optional(),
    permissions: zod_1.z.array(zod_1.z.string()).optional(),
});
