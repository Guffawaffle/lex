import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createProgram } from "../../../dist/shared/cli/index.js";
import { recall } from "../../../dist/shared/cli/recall.js";

test("recall public dispatch preserves zero and rejects invalid radii before store access", async (t) => {
  const parent = resolve(tmpdir());
  const directory = mkdtempSync(join(parent, "lex-radius-"));
  const policyPath = join(directory, "policy.json");
  writeFileSync(
    policyPath,
    JSON.stringify({
      modules: {
        seed: { owns_paths: ["seed/**"] },
        neighbor: { allowed_callers: ["seed"] },
        outer: { allowed_callers: ["neighbor"] },
      },
    })
  );
  const previousPolicy = process.env.LEX_POLICY_PATH;
  const previousExit = process.exitCode;
  process.env.LEX_POLICY_PATH = policyPath;
  t.after(() => {
    if (previousPolicy === undefined) delete process.env.LEX_POLICY_PATH;
    else process.env.LEX_POLICY_PATH = previousPolicy;
    process.exitCode = previousExit;
    // Only remove this test's unique child of the resolved temporary directory.
    assert.equal(
      resolve(directory).startsWith(parent + "/") || resolve(directory).startsWith(parent + "\\"),
      true
    );
    rmSync(directory, { recursive: true, force: true });
  });
  let reads = 0;
  const frame = {
    id: "seed-frame",
    timestamp: "2026-09-10T00:00:00Z",
    module_scope: ["seed"],
    summary_caption: "Seed context",
    reference_point: "seed",
    keywords: [],
    status_snapshot: { next_action: "Check the seed" },
  };
  const store = {
    async getFrameById() {
      reads++;
      return frame;
    },
  };
  const log = t.mock.method(console, "log", () => {});
  for (const [value, expected] of [
    [undefined, 1],
    ["0", 0],
    ["1", 1],
    ["2", 2],
  ]) {
    const program = createProgram({ frameStore: store });
    program.exitOverride();
    log.mock.resetCalls();
    await program.parseAsync(
      ["--json", "recall", "seed-frame", ...(value === undefined ? [] : ["--fold-radius", value])],
      { from: "user" }
    );
    const result = log.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call.arguments[0]);
        } catch {
          return null;
        }
      })
      .find(Array.isArray);
    assert.equal(result[0].foldRadius, expected);
    assert.deepEqual(
      result[0].atlasFrame.modules.map((module) => module.id),
      ["seed", "neighbor", "outer"].slice(0, expected + 1)
    );
  }
  const beforeInvalid = reads;
  for (const value of ["-1", "0.5", "1tail", "NaN", "Infinity", "9007199254740992", ""]) {
    const program = createProgram({ frameStore: store });
    program.exitOverride().configureOutput({ writeErr: () => {} });
    program.commands
      .find((command) => command.name() === "recall")
      .exitOverride()
      .configureOutput({ writeErr: () => {} });
    await assert.rejects(
      program.parseAsync(["recall", "seed-frame", "--fold-radius", value], { from: "user" }),
      /non-negative safe integer/
    );
  }
  assert.equal(reads, beforeInvalid);
  t.mock.method(console, "error", () => {});
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await recall("seed-frame", { foldRadius: value }, store);
    assert.equal(process.exitCode, 2);
  }
  assert.equal(reads, beforeInvalid);
});
