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

export interface SpendMetadata {
  prompts?: number;
  tokens_estimated?: number;
}

export type CapabilityTier = "senior" | "mid" | "junior";

export interface TaskComplexity {
  tier: CapabilityTier;
  assignedModel?: string;
  actualModel?: string; // What model actually did the work
  escalated?: boolean;
  escalationReason?: string;
  retryCount?: number;
  tierMismatch?: boolean; // Did actual tier differ from suggested?
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
  // Merge-weave metadata (v2)
  runId?: string;
  planHash?: string;
  spend?: SpendMetadata;
  // OAuth2/JWT user isolation (v3)
  userId?: string;
  // LexRunner structured metadata (v3)
  executorRole?: string;
  toolCalls?: string[];
  guardrailProfile?: string;
  // Capability tier classification (v4)
  capabilityTier?: CapabilityTier;
  taskComplexity?: TaskComplexity;
}

/**
 * Frame schema version constant
 * v1: Initial schema (pre-0.4.0)
 * v2: Added runId, planHash, spend fields for execution provenance (0.4.0)
 * v3: Added executorRole, toolCalls, guardrailProfile for LexRunner (0.5.0)
 * v4: Added capabilityTier, taskComplexity for governance model (2.0.0)
 */
export const FRAME_SCHEMA_VERSION = 4;

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
  // Validate v2 fields (optional, backward compatible)
  if (f.runId !== undefined && typeof f.runId !== "string") return false;
  if (f.planHash !== undefined && typeof f.planHash !== "string") return false;
  if (f.spend !== undefined) {
    if (typeof f.spend !== "object" || f.spend === null) return false;
    const spend = f.spend as Record<string, unknown>;
    if (spend.prompts !== undefined && typeof spend.prompts !== "number") return false;
    if (spend.tokens_estimated !== undefined && typeof spend.tokens_estimated !== "number")
      return false;
  }
  // Validate v3 fields (optional, backward compatible)
  if (f.executorRole !== undefined && typeof f.executorRole !== "string") return false;
  if (f.toolCalls !== undefined) {
    if (!Array.isArray(f.toolCalls)) return false;
    if (!f.toolCalls.every((t: unknown) => typeof t === "string")) return false;
  }
  if (f.guardrailProfile !== undefined && typeof f.guardrailProfile !== "string") return false;
  // Validate v4 fields (optional, backward compatible)
  if (f.capabilityTier !== undefined) {
    if (typeof f.capabilityTier !== "string") return false;
    if (!["senior", "mid", "junior"].includes(f.capabilityTier)) return false;
  }
  if (f.taskComplexity !== undefined) {
    if (typeof f.taskComplexity !== "object" || f.taskComplexity === null) return false;
    const tc = f.taskComplexity as Record<string, unknown>;
    if (typeof tc.tier !== "string") return false;
    if (!["senior", "mid", "junior"].includes(tc.tier)) return false;
    if (tc.assignedModel !== undefined && typeof tc.assignedModel !== "string") return false;
    if (tc.actualModel !== undefined && typeof tc.actualModel !== "string") return false;
    if (tc.escalated !== undefined && typeof tc.escalated !== "boolean") return false;
    if (tc.escalationReason !== undefined && typeof tc.escalationReason !== "string")
      return false;
    if (tc.retryCount !== undefined && typeof tc.retryCount !== "number") return false;
    if (tc.tierMismatch !== undefined && typeof tc.tierMismatch !== "boolean") return false;
  }
  return true;
}
