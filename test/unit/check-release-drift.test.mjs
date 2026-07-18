import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findStaleReleaseIntentFiles,
  releaseIntentFiles,
} from "../../scripts/check-release-drift.mjs";

describe("release drift changeset guard", () => {
  it("ignores changeset metadata files", () => {
    assert.deepEqual(
      releaseIntentFiles([
        ".changeset/README.md",
        ".changeset/config.json",
        ".changeset/fresh-change.md",
      ]),
      [".changeset/fresh-change.md"]
    );
  });

  it("reports release intent carried through the current tag", () => {
    assert.deepEqual(
      findStaleReleaseIntentFiles(
        [".changeset/already-released.md", ".changeset/fresh-change.md"],
        [".changeset/README.md", ".changeset/already-released.md"]
      ),
      [".changeset/already-released.md"]
    );
  });

  it("allows changesets created after the current tag", () => {
    assert.deepEqual(
      findStaleReleaseIntentFiles([".changeset/fresh-change.md"], [".changeset/README.md"]),
      []
    );
  });
});
