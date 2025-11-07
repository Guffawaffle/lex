/**
 * Local type definitions for renderer
 * Minimal Frame types needed for rendering (duplicated to avoid cross-package imports during build)
 */

/**
 * Status snapshot capturing the current state of work
 */
export interface StatusSnapshot {
  next_action: string;
  blockers?: string[];
  merge_blockers?: string[];
  tests_failing?: string[];
}

/**
 * Frame metadata representing a timestamped work session snapshot
 */
export interface Frame {
  id: string;
  timestamp: string;
  branch: string;
  jira?: string;
  module_scope: string[];
  summary_caption: string;
  reference_point: string;
  status_snapshot: StatusSnapshot;
  keywords?: string[];
  atlas_frame_id?: string;
  feature_flags?: string[];
  permissions?: string[];
}

