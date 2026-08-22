import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveExpectedPackTarball } from "../../scripts/pack-artifact-path.mjs";

const packageJson = { name: "@smartergpt/lex", version: "4.0.1" };
const expectedEntry = {
  name: packageJson.name,
  version: packageJson.version,
  filename: "smartergpt-lex-4.0.1.tgz",
};

test("pack cleanup accepts only the exact tarball directly under the repository root", () => {
  const root = path.resolve("candidate-root");
  assert.equal(
    resolveExpectedPackTarball(root, expectedEntry, packageJson),
    path.join(root, expectedEntry.filename)
  );
});

for (const [label, entry] of [
  ["different package", { ...expectedEntry, name: "@smartergpt/other" }],
  ["different version", { ...expectedEntry, version: "4.0.0" }],
  ["path traversal", { ...expectedEntry, filename: "../victim.tgz" }],
]) {
  test(`pack cleanup rejects ${label}`, () => {
    assert.throws(() => resolveExpectedPackTarball("candidate-root", entry, packageJson));
  });
}
