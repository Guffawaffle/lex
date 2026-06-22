import { test, describe } from "node:test";
import assert from "node:assert";
import { summarizeLmvForRecall } from "@app/shared/types/lmv.js";
import type { Frame } from "@app/shared/types/frame.js";

function frameWithLmv(lmv: NonNullable<Frame["lmv"]>): Pick<Frame, "lmv"> {
  return { lmv };
}

describe("LMV recall summary", () => {
  test("labels frames without LMV metadata as unsupported memory", () => {
    const summary = summarizeLmvForRecall({});

    assert.strictEqual(summary.state, "unsupported_memory");
    assert.strictEqual(summary.label, "Unsupported memory: no LMV evidence");
    assert.strictEqual(summary.evidenceCount, 0);
  });

  test("labels frames with supporting evidence as evidence-backed claims", () => {
    const summary = summarizeLmvForRecall(
      frameWithLmv({
        claim: "Recall output distinguishes evidence-backed claims.",
        evidence: [
          {
            kind: "test",
            ref: "test/shared/types/lmv.test.ts",
            status: "supports",
            exitCode: 0,
          },
        ],
        status: "observed",
        confidence: "high",
      })
    );

    assert.strictEqual(summary.state, "evidence_backed_claim");
    assert.strictEqual(summary.label, "Evidence-backed claim");
    assert.strictEqual(summary.supportingEvidence, 1);
  });

  test("labels frames with contradiction evidence as contradicted claims", () => {
    const summary = summarizeLmvForRecall(
      frameWithLmv({
        claim: "A previous assumption was contradicted.",
        evidence: [
          {
            kind: "test",
            ref: "test/shared/types/lmv.test.ts",
            status: "contradicts",
          },
        ],
        status: "inferred",
        confidence: "low",
      })
    );

    assert.strictEqual(summary.state, "contradicted_claim");
    assert.strictEqual(summary.label, "Contradicted claim");
    assert.strictEqual(summary.contradictingEvidence, 1);
  });

  test("labels evidence-free claims with next validation as awaiting validation", () => {
    const summary = summarizeLmvForRecall(
      frameWithLmv({
        claim: "This claim needs a visible validation step.",
        evidence: [],
        status: "inferred",
        confidence: "uncertain",
        nextValidation: "Run the recall rendering path.",
      })
    );

    assert.strictEqual(summary.state, "awaiting_validation");
    assert.strictEqual(summary.label, "Awaiting validation: no LMV evidence");
    assert.strictEqual(summary.nextValidation, "Run the recall rendering path.");
  });
});
