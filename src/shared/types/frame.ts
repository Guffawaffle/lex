/**
 * Frame Metadata Type Definitions
 *
 * Canonical TypeScript types for work session snapshots.
 */
export interface StatusSnapshot {
  next_action: string;
  blockers?: string[];
  merge_blockers?: string[];
  tests_failing?: string[];
}

export interface Frame {
  id: string;
  timestamp: string;
  branch: string;
  module_scope: string[];
  summary_caption: string;
  reference_point: string;
  status_snapshot: StatusSnapshot;
  jira?: string;
  keywords?: string[];
  atlas_frame_id?: string;
  feature_flags?: string[];
  permissions?: string[];
  image_ids?: string[];
}

export function validateFrameMetadata(frame: unknown): frame is Frame {
  if (typeof frame !== "object" || frame === null) return false;
  const f = frame as Record<string, unknown>;
  if (typeof f.id !== "string") return false;
  if (typeof f.timestamp !== "string") return false;
  if (typeof f.branch !== "string") return false;
  if (!Array.isArray(f.module_scope)) return false;
  if (!f.module_scope.every((m: unknown) => typeof m === "string")) return false;
  if (typeof f.summary_caption !== "string") return false;
  if (typeof f.reference_point !== "string") return false;
  if (typeof f.status_snapshot !== "object" || f.status_snapshot === null) return false;
  const status = f.status_snapshot as Record<string, unknown>;
  if (typeof status.next_action !== "string") return false;
  if (status.blockers !== undefined) {
    if (!Array.isArray(status.blockers)) return false;
    if (!status.blockers.every((b: unknown) => typeof b === "string")) return false;
  }
  if (status.merge_blockers !== undefined) {
    if (!Array.isArray(status.merge_blockers)) return false;
    if (!status.merge_blockers.every((b: unknown) => typeof b === "string")) return false;
  }
  if (status.tests_failing !== undefined) {
    if (!Array.isArray(status.tests_failing)) return false;
    if (!status.tests_failing.every((t: unknown) => typeof t === "string")) return false;
  }
  if (f.jira !== undefined && typeof f.jira !== "string") return false;
  if (f.keywords !== undefined) {
    if (!Array.isArray(f.keywords)) return false;
    if (!f.keywords.every((k: unknown) => typeof k === "string")) return false;
  }
  if (f.atlas_frame_id !== undefined && typeof f.atlas_frame_id !== "string") return false;
  if (f.feature_flags !== undefined) {
    if (!Array.isArray(f.feature_flags)) return false;
    if (!f.feature_flags.every((flag: unknown) => typeof flag === "string")) return false;
  }
  if (f.permissions !== undefined) {
    if (!Array.isArray(f.permissions)) return false;
    if (!f.permissions.every((p: unknown) => typeof p === "string")) return false;
  }
  return true;
}
