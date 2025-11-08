/**
 * Frame Metadata Type Definitions
 *
 * Canonical TypeScript types for work session snapshots.
 * A Frame is a timestamped record of what you were doing, stored locally with structured metadata.
 *
 * @see FRAME.md for complete schema documentation
 */
/**
 * Validates that an unknown value conforms to the Frame interface.
 *
 * @param frame - The value to validate
 * @returns True if the value is a valid Frame, false otherwise
 *
 * @example
 * ```typescript
 * const data: unknown = JSON.parse(frameJson);
 * if (validateFrameMetadata(data)) {
 *   // data is now typed as Frame
 *   console.log(data.id);
 * }
 * ```
 */
export function validateFrameMetadata(frame) {
  if (typeof frame !== "object" || frame === null) {
    return false;
  }
  const f = frame;
  // Check required fields
  if (typeof f.id !== "string") return false;
  if (typeof f.timestamp !== "string") return false;
  if (typeof f.branch !== "string") return false;
  if (!Array.isArray(f.module_scope)) return false;
  if (!f.module_scope.every((m) => typeof m === "string")) return false;
  if (typeof f.summary_caption !== "string") return false;
  if (typeof f.reference_point !== "string") return false;
  // Check status_snapshot
  if (typeof f.status_snapshot !== "object" || f.status_snapshot === null) {
    return false;
  }
  const status = f.status_snapshot;
  if (typeof status.next_action !== "string") return false;
  // Optional status fields
  if (status.blockers !== undefined) {
    if (!Array.isArray(status.blockers)) return false;
    if (!status.blockers.every((b) => typeof b === "string")) return false;
  }
  if (status.merge_blockers !== undefined) {
    if (!Array.isArray(status.merge_blockers)) return false;
    if (!status.merge_blockers.every((b) => typeof b === "string")) return false;
  }
  if (status.tests_failing !== undefined) {
    if (!Array.isArray(status.tests_failing)) return false;
    if (!status.tests_failing.every((t) => typeof t === "string")) return false;
  }
  // Check optional Frame fields
  if (f.jira !== undefined && typeof f.jira !== "string") return false;
  if (f.keywords !== undefined) {
    if (!Array.isArray(f.keywords)) return false;
    if (!f.keywords.every((k) => typeof k === "string")) return false;
  }
  if (f.atlas_frame_id !== undefined && typeof f.atlas_frame_id !== "string") return false;
  if (f.feature_flags !== undefined) {
    if (!Array.isArray(f.feature_flags)) return false;
    if (!f.feature_flags.every((flag) => typeof flag === "string")) return false;
  }
  if (f.permissions !== undefined) {
    if (!Array.isArray(f.permissions)) return false;
    if (!f.permissions.every((p) => typeof p === "string")) return false;
  }
  return true;
}
