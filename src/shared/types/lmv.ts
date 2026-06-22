import type { Frame } from "./frame-schema.js";

export type LmvRecallState =
  | "unsupported_memory"
  | "evidence_backed_claim"
  | "contradicted_claim"
  | "superseded_claim"
  | "invalidated_claim"
  | "contextual_memory"
  | "awaiting_validation";

export interface LmvRecallSummary {
  state: LmvRecallState;
  label: string;
  claim?: string;
  status?: string;
  confidence?: string;
  evidenceCount: number;
  supportingEvidence: number;
  contradictingEvidence: number;
  nextValidation?: string;
}

export function summarizeLmvForRecall(frame: Pick<Frame, "lmv">): LmvRecallSummary {
  const lmv = frame.lmv;
  if (!lmv) {
    return {
      state: "unsupported_memory",
      label: "Unsupported memory: no LMV evidence",
      evidenceCount: 0,
      supportingEvidence: 0,
      contradictingEvidence: 0,
    };
  }

  const evidence = lmv.evidence || [];
  const supportingEvidence = evidence.filter((ref) => ref.status === "supports").length;
  const contradictingEvidence = evidence.filter((ref) => ref.status === "contradicts").length;
  const supersededEvidence = evidence.filter((ref) => ref.status === "superseded").length;

  let state: LmvRecallState;
  let label: string;

  if (lmv.status === "invalidated") {
    state = "invalidated_claim";
    label = "Invalidated claim";
  } else if (
    lmv.status === "superseded" ||
    (evidence.length > 0 && supersededEvidence === evidence.length)
  ) {
    state = "superseded_claim";
    label = "Superseded claim";
  } else if (contradictingEvidence > 0) {
    state = "contradicted_claim";
    label = "Contradicted claim";
  } else if (supportingEvidence > 0) {
    state = "evidence_backed_claim";
    label = "Evidence-backed claim";
  } else if (evidence.length > 0) {
    state = "contextual_memory";
    label = "Contextual memory: no supporting evidence";
  } else if (lmv.nextValidation) {
    state = "awaiting_validation";
    label = "Awaiting validation: no LMV evidence";
  } else {
    state = "unsupported_memory";
    label = "Unsupported memory: no LMV evidence";
  }

  return {
    state,
    label,
    claim: lmv.claim,
    status: lmv.status,
    confidence: lmv.confidence,
    evidenceCount: evidence.length,
    supportingEvidence,
    contradictingEvidence,
    nextValidation: lmv.nextValidation,
  };
}
