import { z } from "zod";

import { Frame } from "../frames/types.js";
import type { Frame as FrameValue } from "../frames/types.js";

/** Versioned payload for Frame fields that do not have dedicated durable columns. */
export const DURABLE_FRAME_METADATA_VERSION = 1 as const;

export const DurableFrameMetadata = Frame.pick({
  image_ids: true,
  executorRole: true,
  toolCalls: true,
  guardrailProfile: true,
  turnCost: true,
  capabilityTier: true,
  taskComplexity: true,
  contradiction_resolution: true,
})
  .extend({ schemaVersion: z.literal(DURABLE_FRAME_METADATA_VERSION) })
  .strict();

export type DurableFrameMetadata = z.infer<typeof DurableFrameMetadata>;

export function durableFrameMetadata(frame: FrameValue): DurableFrameMetadata {
  return DurableFrameMetadata.parse({
    schemaVersion: DURABLE_FRAME_METADATA_VERSION,
    image_ids: frame.image_ids,
    executorRole: frame.executorRole,
    toolCalls: frame.toolCalls,
    guardrailProfile: frame.guardrailProfile,
    turnCost: frame.turnCost,
    capabilityTier: frame.capabilityTier,
    taskComplexity: frame.taskComplexity,
    contradiction_resolution: frame.contradiction_resolution,
  });
}

export function parseDurableFrameMetadata(
  value: string | Readonly<Record<string, unknown>> | null | undefined
): Omit<DurableFrameMetadata, "schemaVersion"> {
  const parsed = DurableFrameMetadata.parse(
    value === null || value === undefined
      ? { schemaVersion: DURABLE_FRAME_METADATA_VERSION }
      : typeof value === "string"
        ? JSON.parse(value)
        : value
  );
  const { schemaVersion: _schemaVersion, ...metadata } = parsed;
  return metadata;
}
