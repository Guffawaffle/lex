import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Frame as PersistenceFrameSchema } from "@app/memory/frames/types.js";
import { validateFramePayload } from "@app/memory/validation/index.js";
import { FrameSchema } from "@app/shared/types/frame-schema.js";
import { validateFrameMetadata, type Frame as PublicFrame } from "@app/shared/types/frame.js";
import type { Frame as PersistenceFrame } from "@app/memory/frames/types.js";

type SameKeys<Left, Right> =
  Exclude<keyof Left, keyof Right> extends never
    ? Exclude<keyof Right, keyof Left> extends never
      ? true
      : false
    : false;

const publicAndPersistenceKeysAgree: SameKeys<PublicFrame, PersistenceFrame> = true;
void publicAndPersistenceKeysAgree;

const completeFrame = {
  id: "frame-contract-v7",
  timestamp: "2026-07-18T10:00:00Z",
  branch: "main",
  module_scope: ["memory"],
  summary_caption: "Exercise every Frame v7 field",
  reference_point: "frame contract alignment",
  status_snapshot: {
    next_action: "Keep the contract aligned",
    blockers: [],
    merge_blockers: [],
    tests_failing: [],
  },
  jira: "LEX-763",
  keywords: ["frame", "contract"],
  atlas_frame_id: "atlas-frame-v7",
  feature_flags: ["frame-v7"],
  permissions: ["frame:write"],
  module_attribution: {
    mode: "explicit" as const,
    confidence: "high" as const,
    evidence: ["caller supplied memory"],
  },
  image_ids: ["image-v7"],
  runId: "run-v7",
  planHash: "sha256:frame-v7",
  spend: { prompts: 1, tokens_estimated: 10 },
  userId: "principal-v7",
  executorRole: "agent",
  toolCalls: ["remember"],
  guardrailProfile: "default",
  turnCost: {
    components: {
      latency: 1,
      contextReset: 0,
      renegotiation: 0,
      tokenBloat: 0,
      attentionSwitch: 0,
    },
  },
  capabilityTier: "senior" as const,
  taskComplexity: {
    tier: "senior" as const,
    assignedModel: "assigned",
    actualModel: "actual",
    escalated: false,
    escalationReason: "none",
    retryCount: 0,
    tierMismatch: false,
  },
  superseded_by: "frame-v8",
  merged_from: ["frame-v5", "frame-v6"],
  contradiction_resolution: {
    type: "scope" as const,
    contradicts_frame_id: "frame-v4",
    scope: "memory",
    note: "Both statements apply in distinct scopes",
  },
};

describe("Frame v7 contract alignment", () => {
  test("public and persistence Zod schemas expose the same record fields", () => {
    assert.deepEqual(
      [...Object.keys(FrameSchema.shape)].sort(),
      [...Object.keys(PersistenceFrameSchema.shape)].sort()
    );
  });

  test("all public Frame fields pass every validation surface without unknown warnings", () => {
    assert.equal(FrameSchema.safeParse(completeFrame).success, true);
    assert.equal(PersistenceFrameSchema.safeParse(completeFrame).success, true);
    assert.equal(validateFrameMetadata(completeFrame), true);
    assert.deepEqual(validateFramePayload(completeFrame), {
      valid: true,
      errors: [],
      warnings: [],
    });
  });
});
