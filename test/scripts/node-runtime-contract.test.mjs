import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadRuntimeSnapshot,
  runtimeContractErrors,
} from "../../scripts/check-node-runtime-contract.mjs";

test("the checked-in repository satisfies the Node 24 runtime contract", async () => {
  assert.deepEqual(runtimeContractErrors(await loadRuntimeSnapshot()), []);
});

test("the contract rejects a legacy package range and upper bound", async () => {
  const snapshot = await loadRuntimeSnapshot();
  snapshot.packageJson.engines.node = ">=20 <25";
  assert.match(runtimeContractErrors(snapshot).join("\n"), /engines\.node must be >=24/);
});

test("the contract rejects an active Node 20 workflow", async () => {
  const snapshot = await loadRuntimeSnapshot();
  snapshot.workflows[".github/workflows/example.yml"] = `
steps:
  - uses: actions/setup-node@v6
    with:
      node-version: "20"
`;
  assert.match(runtimeContractErrors(snapshot).join("\n"), /unsupported runtime selection/);
});

test("the contract rejects stale current guidance", async () => {
  const snapshot = await loadRuntimeSnapshot();
  snapshot.currentGuidance["README.md"] += "\nSupports Node.js 20 through 24.\n";
  assert.match(runtimeContractErrors(snapshot).join("\n"), /unsupported current Node/);
});

test("the contract rejects a mismatched ecosystem release policy", async () => {
  const snapshot = await loadRuntimeSnapshot();
  snapshot.ecosystemManifest.runtime.nodeUpperBoundExclusive = 25;
  assert.match(
    runtimeContractErrors(snapshot).join("\n"),
    /must not carry an unproven Node upper bound/
  );
});
