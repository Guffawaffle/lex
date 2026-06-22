/**
 * Frame type compatibility facade.
 *
 * The canonical Frame and LMV contract lives in `frame-schema.ts`.
 * This module keeps older imports working while delegating validation
 * to the canonical shared Zod schema.
 */

import { safeParseFrame, type Frame } from "./frame-schema.js";

export type {
  StatusSnapshot,
  SpendMetadata,
  TurnCostComponent,
  TurnCostWeights,
  TurnCost,
  CapabilityTier,
  TaskComplexity,
  LmvStatus,
  LmvConfidence,
  LmvEvidenceStatus,
  LmvStopCondition,
  LmvEvidenceRef,
  LmvExperiment,
  LmvEpistemic,
  ContradictionResolution,
  Frame,
} from "./frame-schema.js";

export { FRAME_SCHEMA_VERSION } from "./frame-schema.js";

export function validateFrameMetadata(frame: unknown): frame is Frame {
  const result = safeParseFrame(frame);
  if (!result.success) {
    return false;
  }

  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
    return false;
  }

  try {
    const target = frame as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    Object.assign(target, result.data);
    return true;
  } catch {
    return false;
  }
}
