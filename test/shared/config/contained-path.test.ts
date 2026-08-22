import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  canonicalizeContainedPath,
  readContainedFile,
} from "../../../src/shared/config/contained-path.js";
import { createTestSymlinkOrSkip } from "../../helpers/symlink.js";

describe("trusted contained paths", () => {
  test("rejects an existing symlink file outside the root", (t) => {
    const fixture = mkdtempSync(join(tmpdir(), "lex-contained-path-"));
    const projectRoot = join(fixture, "project");
    const externalRoot = join(fixture, "external");
    mkdirSync(projectRoot);
    mkdirSync(externalRoot);
    writeFileSync(join(externalRoot, "policy.json"), "{}", "utf8");
    try {
      if (
        !createTestSymlinkOrSkip(
          t,
          join(externalRoot, "policy.json"),
          join(projectRoot, "policy.json")
        )
      ) {
        return;
      }
      assert.throws(() => readContainedFile(projectRoot, join(projectRoot, "policy.json")));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects an unresolved linked ancestor outside the root", (t) => {
    const fixture = mkdtempSync(join(tmpdir(), "lex-contained-ancestor-"));
    const projectRoot = join(fixture, "project");
    const externalRoot = join(fixture, "external");
    mkdirSync(projectRoot);
    mkdirSync(externalRoot);

    try {
      if (!createTestSymlinkOrSkip(t, externalRoot, join(projectRoot, "linked"), "dir")) return;
      assert.throws(() =>
        canonicalizeContainedPath(projectRoot, join(projectRoot, "linked", "missing.json"))
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("returns the validated snapshot and rejects a later symlink replacement", (t) => {
    const fixture = mkdtempSync(join(tmpdir(), "lex-contained-snapshot-"));
    const projectRoot = join(fixture, "project");
    const externalRoot = join(fixture, "external");
    mkdirSync(projectRoot);
    mkdirSync(externalRoot);
    const trustedPath = join(projectRoot, "policy.json");
    const externalPath = join(externalRoot, "policy.json");
    writeFileSync(trustedPath, '{"source":"trusted"}', "utf8");
    writeFileSync(externalPath, '{"source":"external"}', "utf8");

    try {
      const snapshot = readContainedFile(projectRoot, trustedPath);
      unlinkSync(trustedPath);
      if (!createTestSymlinkOrSkip(t, externalPath, trustedPath)) return;
      assert.equal(snapshot.content, '{"source":"trusted"}');
      assert.throws(() => readContainedFile(projectRoot, trustedPath));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
