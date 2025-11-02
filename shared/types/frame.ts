/**
 * Frame Metadata Type Definitions
 * 
 * Canonical TypeScript types for work session snapshots.
 * A Frame is a timestamped record of what you were doing, stored locally with structured metadata.
 * 
 * @see FRAME.md for complete schema documentation
 */

/**
 * Status snapshot capturing the current state of work in a session.
 * 
 * @example
 * ```typescript
 * const status: StatusSnapshot = {
 *   next_action: "Reroute user-admin-panel to call user-access-api instead of auth-core",
 *   merge_blockers: ["Direct call to auth-core forbidden by policy"],
 *   blockers: [],
 *   tests_failing: ["test_add_user_button_enabled"]
 * };
 * ```
 */
export interface StatusSnapshot {
  /** What needs to happen next */
  next_action: string;
  
  /** General blockers preventing progress */
  blockers?: string[];
  
  /** Specific reasons merge is blocked */
  merge_blockers?: string[];
  
  /** Test names that were failing during this session */
  tests_failing?: string[];
}

/**
 * Frame metadata representing a timestamped work session snapshot.
 * 
 * THE CRITICAL RULE: Every string in `module_scope` MUST be a module ID 
 * that exists in `lexmap.policy.json`. This is enforced by `shared/module_ids/` validation.
 * 
 * @example
 * ```typescript
 * const frame: Frame = {
 *   id: "frame-001",
 *   timestamp: "2025-11-01T16:04:12-05:00",
 *   branch: "feature/auth-fix",
 *   jira: "TICKET-123",
 *   module_scope: ["ui/user-admin-panel", "services/auth-core"],
 *   summary_caption: "Auth handshake timeout; Add User button disabled",
 *   reference_point: "that auth deadlock",
 *   status_snapshot: {
 *     next_action: "Reroute user-admin-panel to call user-access-api instead of auth-core",
 *     merge_blockers: ["Direct call to auth-core forbidden by policy"],
 *     tests_failing: ["test_add_user_button_enabled"]
 *   },
 *   keywords: ["auth", "timeout", "policy-violation"],
 *   feature_flags: ["beta_user_admin"],
 *   permissions: ["can_manage_users"]
 * };
 * ```
 */
export interface Frame {
  /** Unique identifier for this Frame (e.g., "frame-001" or UUID) */
  id: string;
  
  /** ISO 8601 timestamp when Frame was captured (e.g., "2025-11-01T16:04:12-05:00") */
  timestamp: string;
  
  /** Git branch name where work was happening */
  branch: string;
  
  /** Module IDs from lexmap.policy.json that were touched during this work session */
  module_scope: string[];
  
  /** Human-readable one-line summary of what was happening */
  summary_caption: string;
  
  /** Human-memorable anchor phrase for fuzzy recall (e.g., "that auth deadlock") */
  reference_point: string;
  
  /** Current state of work */
  status_snapshot: StatusSnapshot;
  
  /** Ticket ID if work is tracked in Jira/Linear/etc. */
  jira?: string;
  
  /** Tags for search/filtering */
  keywords?: string[];
  
  /** Link to associated Atlas Frame (spatial neighborhood) */
  atlas_frame_id?: string;
  
  /** Flags that were active during this session */
  feature_flags?: string[];
  
  /** Permissions required for this work */
  permissions?: string[];
}

/**
 * Atlas Frame containing spatial neighborhood data for visualizing module relationships.
 * Used by shared/atlas/ to render fold-radius neighborhoods with proper positioning.
 * 
 * @example
 * ```typescript
 * const atlasFrame: AtlasFrame = {
 *   id: "atlas-001",
 *   center_module: "ui/user-admin-panel",
 *   fold_radius: 2,
 *   neighbors: [
 *     { module_id: "services/user-access-api", distance: 1, coords: [1, 2] },
 *     { module_id: "services/auth-core", distance: 2, coords: [2, 1] }
 *   ],
 *   timestamp: "2025-11-01T16:04:12-05:00"
 * };
 * ```
 */
export interface AtlasFrame {
  /** Unique identifier for this Atlas Frame */
  id: string;
  
  /** The module at the center of this spatial view */
  center_module: string;
  
  /** Maximum distance from center to include in the neighborhood */
  fold_radius: number;
  
  /** Modules within the fold radius with their spatial relationships */
  neighbors: Array<{
    /** Module ID from lexmap.policy.json */
    module_id: string;
    
    /** Distance from the center module (in graph hops or spatial units) */
    distance: number;
    
    /** Spatial coordinates for visual layout [x, y] */
    coords: [number, number];
  }>;
  
  /** ISO 8601 timestamp when this Atlas Frame was generated */
  timestamp: string;
}

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
export function validateFrameMetadata(frame: unknown): frame is Frame {
  if (typeof frame !== 'object' || frame === null) {
    return false;
  }
  
  const f = frame as Record<string, unknown>;
  
  // Check required fields
  if (typeof f.id !== 'string') return false;
  if (typeof f.timestamp !== 'string') return false;
  if (typeof f.branch !== 'string') return false;
  if (!Array.isArray(f.module_scope)) return false;
  if (!f.module_scope.every((m: unknown) => typeof m === 'string')) return false;
  if (typeof f.summary_caption !== 'string') return false;
  if (typeof f.reference_point !== 'string') return false;
  
  // Check status_snapshot
  if (typeof f.status_snapshot !== 'object' || f.status_snapshot === null) {
    return false;
  }
  const status = f.status_snapshot as Record<string, unknown>;
  if (typeof status.next_action !== 'string') return false;
  
  // Optional status fields
  if (status.blockers !== undefined && !Array.isArray(status.blockers)) return false;
  if (status.merge_blockers !== undefined && !Array.isArray(status.merge_blockers)) return false;
  if (status.tests_failing !== undefined && !Array.isArray(status.tests_failing)) return false;
  
  // Check optional Frame fields
  if (f.jira !== undefined && typeof f.jira !== 'string') return false;
  if (f.keywords !== undefined && !Array.isArray(f.keywords)) return false;
  if (f.atlas_frame_id !== undefined && typeof f.atlas_frame_id !== 'string') return false;
  if (f.feature_flags !== undefined && !Array.isArray(f.feature_flags)) return false;
  if (f.permissions !== undefined && !Array.isArray(f.permissions)) return false;
  
  return true;
}
