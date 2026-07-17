import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";
import { exportFrames } from "@app/shared/cli/export.js";

const outputRoot = join(tmpdir(), `lex-export-pagination-${process.pid}`);

afterEach(() => rmSync(outputRoot, { recursive: true, force: true }));

test("frames export without --since follows every cursor page", async () => {
  const store = new MemoryFrameStore();
  for (let index = 0; index < 25; index++) {
    await store.saveFrame({
      id: `export-${String(index).padStart(2, "0")}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      branch: "export-pagination",
      module_scope: ["workspace/unscoped"],
      summary_caption: `Export frame ${index}`,
      reference_point: `export page ${index}`,
      status_snapshot: { next_action: "verify complete export" },
    });
  }

  await exportFrames({ out: outputRoot, format: "ndjson", json: true }, store);
  const file = join(outputRoot, new Date().toISOString().slice(0, 10), "frames.ndjson");
  assert.equal(existsSync(file), true);
  const rows = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 25);
  assert.equal(new Set(rows.map((row) => row.id)).size, 25);
});

test("frames export preserves optional persisted metadata", async () => {
  const store = new MemoryFrameStore();
  await store.saveFrame({
    id: "export-fidelity",
    timestamp: "2026-07-16T12:00:00.000Z",
    branch: "export-fidelity",
    jira: "LEX-EXPORT",
    module_scope: ["workspace/unscoped"],
    summary_caption: "Export recovery metadata",
    reference_point: "export fidelity",
    status_snapshot: { next_action: "verify the recovery artifact" },
    module_attribution: {
      mode: "inferred",
      confidence: "high",
      evidence: ["test fixture"],
    },
    runId: "run-export",
    planHash: "plan-export",
    spend: { prompts: 2, tokens_estimated: 30 },
    userId: "user-export",
    superseded_by: "export-newer",
    merged_from: ["export-older-a", "export-older-b"],
  });

  await exportFrames({ out: outputRoot, format: "ndjson", json: true }, store);
  const file = join(outputRoot, new Date().toISOString().slice(0, 10), "frames.ndjson");
  const exported = JSON.parse(readFileSync(file, "utf8").trim());

  assert.deepEqual(exported.module_attribution, {
    mode: "inferred",
    confidence: "high",
    evidence: ["test fixture"],
  });
  assert.equal(exported.runId, "run-export");
  assert.equal(exported.planHash, "plan-export");
  assert.deepEqual(exported.spend, { prompts: 2, tokens_estimated: 30 });
  assert.equal(exported.userId, "user-export");
  assert.equal(exported.superseded_by, "export-newer");
  assert.deepEqual(exported.merged_from, ["export-older-a", "export-older-b"]);
});
