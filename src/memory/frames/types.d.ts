import { z } from "zod";
/**
 * Frame metadata schema
 * Represents a timestamped work session snapshot with human-memorable reference points
 */
export declare const FrameStatusSnapshot: z.ZodObject<
  {
    next_action: z.ZodString;
    blockers: z.ZodOptional<z.ZodArray<z.ZodString>>;
    merge_blockers: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tests_failing: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export type FrameStatusSnapshot = z.infer<typeof FrameStatusSnapshot>;
export declare const Frame: z.ZodObject<
  {
    id: z.ZodString;
    timestamp: z.ZodString;
    branch: z.ZodString;
    jira: z.ZodOptional<z.ZodString>;
    module_scope: z.ZodArray<z.ZodString>;
    summary_caption: z.ZodString;
    reference_point: z.ZodString;
    status_snapshot: z.ZodObject<
      {
        next_action: z.ZodString;
        blockers: z.ZodOptional<z.ZodArray<z.ZodString>>;
        merge_blockers: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tests_failing: z.ZodOptional<z.ZodArray<z.ZodString>>;
      },
      z.core.$strip
    >;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
    atlas_frame_id: z.ZodOptional<z.ZodString>;
    feature_flags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export type Frame = z.infer<typeof Frame>;
/**
 * Frame search query interface
 */
export interface FrameSearchQuery {
  reference_point?: string;
  jira?: string;
  branch?: string;
  module_scope?: string[];
  since?: string;
  limit?: number;
}
/**
 * Frame search result
 */
export interface FrameSearchResult {
  frames: Frame[];
  total: number;
}
