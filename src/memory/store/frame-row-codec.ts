import type { FrameRow } from "./db.js";
import {
  parseFrame,
  type ContradictionResolution,
  type Frame,
  type LmvEpistemic,
  type SpendMetadata,
  type StatusSnapshot,
  type TaskComplexity,
  type TurnCost,
} from "../../shared/types/frame-schema.js";

function parseJsonField<T>(value: string | null): T | undefined {
  return value ? (JSON.parse(value) as T) : undefined;
}

function stringifyJsonField(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function frameToRow(frameInput: Frame): FrameRow {
  const frame = parseFrame(frameInput);

  return {
    id: frame.id,
    timestamp: frame.timestamp,
    branch: frame.branch,
    jira: frame.jira ?? null,
    module_scope: JSON.stringify(frame.module_scope),
    summary_caption: frame.summary_caption,
    reference_point: frame.reference_point,
    status_snapshot: JSON.stringify(frame.status_snapshot),
    keywords: stringifyJsonField(frame.keywords),
    atlas_frame_id: frame.atlas_frame_id ?? null,
    feature_flags: stringifyJsonField(frame.feature_flags),
    permissions: stringifyJsonField(frame.permissions),
    image_ids: stringifyJsonField(frame.image_ids),
    run_id: frame.runId ?? null,
    plan_hash: frame.planHash ?? null,
    spend: stringifyJsonField(frame.spend),
    user_id: frame.userId ?? null,
    executor_role: frame.executorRole ?? null,
    tool_calls: stringifyJsonField(frame.toolCalls),
    guardrail_profile: frame.guardrailProfile ?? null,
    turn_cost: stringifyJsonField(frame.turnCost),
    capability_tier: frame.capabilityTier ?? null,
    task_complexity: stringifyJsonField(frame.taskComplexity),
    superseded_by: frame.superseded_by ?? null,
    merged_from: stringifyJsonField(frame.merged_from),
    contradiction_resolution: stringifyJsonField(frame.contradiction_resolution),
    lmv: stringifyJsonField(frame.lmv),
  };
}

export function rowToFrame(row: FrameRow): Frame {
  return parseFrame({
    id: row.id,
    timestamp: row.timestamp,
    branch: row.branch,
    jira: row.jira ?? undefined,
    module_scope: JSON.parse(row.module_scope) as string[],
    summary_caption: row.summary_caption,
    reference_point: row.reference_point,
    status_snapshot: JSON.parse(row.status_snapshot) as StatusSnapshot,
    keywords: parseJsonField<string[]>(row.keywords),
    atlas_frame_id: row.atlas_frame_id ?? undefined,
    feature_flags: parseJsonField<string[]>(row.feature_flags),
    permissions: parseJsonField<string[]>(row.permissions),
    image_ids: parseJsonField<string[]>(row.image_ids),
    runId: row.run_id ?? undefined,
    planHash: row.plan_hash ?? undefined,
    spend: parseJsonField<SpendMetadata>(row.spend),
    userId: row.user_id ?? undefined,
    executorRole: row.executor_role ?? undefined,
    toolCalls: parseJsonField<string[]>(row.tool_calls),
    guardrailProfile: row.guardrail_profile ?? undefined,
    turnCost: parseJsonField<TurnCost>(row.turn_cost),
    capabilityTier: row.capability_tier ?? undefined,
    taskComplexity: parseJsonField<TaskComplexity>(row.task_complexity),
    superseded_by: row.superseded_by ?? undefined,
    merged_from: parseJsonField<string[]>(row.merged_from),
    contradiction_resolution: parseJsonField<ContradictionResolution>(row.contradiction_resolution),
    lmv: parseJsonField<LmvEpistemic>(row.lmv),
  });
}
