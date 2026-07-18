import assert from "node:assert/strict";

import type { ScopedFrameStore } from "@app/memory/store/index.js";

/** Backend-neutral normal-operation contract used by durable adapter suites. */
export async function exerciseScopedFrameStoreConformance(
  store: ScopedFrameStore,
  prefix: string
): Promise<void> {
  const recent = `${prefix}-recent`;
  const old = `${prefix}-old`;
  const superseded = `${prefix}-superseded`;
  const invalid = `${prefix}-invalid`;
  const now = "2026-07-18T12:00:00.000Z";

  const batch = await store.saveFrames([
    {
      id: recent,
      timestamp: now,
      branch: "feature/scoped-sqlite",
      module_scope: ["memory/store", "sqlite"],
      summary_caption: "Scoped SQLite conformance",
      reference_point: "durable ownership filter",
      status_snapshot: { next_action: "verify every normal operation" },
      spend: { prompts: 2, tokens_estimated: 120 },
    },
    {
      id: old,
      timestamp: "2025-01-01T00:00:00.000Z",
      branch: "archive",
      module_scope: ["archive"],
      summary_caption: "Old scoped frame",
      reference_point: "delete before boundary",
      status_snapshot: { next_action: "delete explicitly" },
    },
    {
      id: superseded,
      timestamp: "2026-07-18T11:00:00.000Z",
      branch: "feature/scoped-sqlite",
      module_scope: ["memory/store"],
      summary_caption: "Superseded scoped frame",
      reference_point: "purge boundary",
      status_snapshot: { next_action: "purge explicitly" },
      superseded_by: recent,
    },
  ]);
  assert.deepEqual(
    batch.map(({ success }) => success),
    [true, true, true]
  );

  const aborted = await store.saveFrames([
    {
      id: invalid,
      timestamp: now,
      branch: "main",
      module_scope: [],
      summary_caption: "",
      reference_point: "",
      status_snapshot: {},
    },
    {
      id: `${prefix}-must-not-write`,
      timestamp: now,
      branch: "main",
      module_scope: ["memory/store"],
      summary_caption: "Must roll back",
      reference_point: "batch atomicity",
      status_snapshot: { next_action: "remain absent" },
    },
  ]);
  assert.equal(
    aborted.every(({ success }) => !success),
    true
  );
  assert.equal(await store.getFrameById(`${prefix}-must-not-write`), null);

  assert.equal((await store.getFrameById(recent))?.userId, undefined);
  assert.deepEqual(
    (await store.searchFrames({ query: "durable ownership", exact: true })).map(({ id }) => id),
    [recent]
  );
  const firstPage = await store.listFrames({ limit: 1 });
  assert.equal(firstPage.frames.length, 1);
  assert.equal(firstPage.page.hasMore, true);
  assert.ok(firstPage.page.nextCursor);
  const secondPage = await store.listFrames({ limit: 1, cursor: firstPage.page.nextCursor! });
  assert.equal(secondPage.frames.length, 1);
  assert.notEqual(secondPage.frames[0].id, firstPage.frames[0].id);
  assert.equal(await store.getFrameCount(), 3);

  const stats = await store.getStats(true);
  assert.equal(stats.totalFrames, 3);
  assert.equal(stats.moduleDistribution?.["memory/store"], 2);
  assert.deepEqual(await store.getTurnCostMetrics("2026-07-18T00:00:00.000Z"), {
    frameCount: 2,
    estimatedTokens: 120,
    prompts: 2,
  });

  assert.equal(
    await store.updateFrame(recent, {
      summary_caption: "Updated within the bound scope",
      userId: "caller-controlled-identity",
    } as never),
    true
  );
  assert.equal(
    (await store.getFrameById(recent))?.summary_caption,
    "Updated within the bound scope"
  );
  assert.equal((await store.getFrameById(recent))?.userId, undefined);

  assert.equal(await store.deleteFramesBefore(new Date("2026-01-01T00:00:00.000Z")), 1);
  assert.equal(await store.deleteFramesByBranch("not-present"), 0);
  assert.equal(await store.deleteFramesByModule("not-present"), 0);
  assert.equal(await store.purgeSuperseded(), 1);
  assert.equal(await store.deleteFrame(recent), true);
  assert.equal(await store.getFrameCount(), 0);
}
