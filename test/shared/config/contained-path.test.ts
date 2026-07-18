import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  canonicalizeContainedPath,
  readContainedFile,
} from "../../../src/shared/config/contained-path.js";

describe("trusted contained paths", () => {
  test("rejects an existing symlink file and unresolved symlink ancestor outside the root", () => {
    const fixture = mkdtempSync(join(tmpdir(), "lex-contained-path-"));
    const projectRoot = join(fixture, "project");
    const externalRoot = join(fixture, "external");
    mkdirSync(projectRoot);
    mkdirSync(externalRoot);
    writeFileSync(join(externalRoot, "policy.json"), "{}", "utf8");
    symlinkSync(join(externalRoot, "policy.json"), join(projectRoot, "policy.json"));
    symlinkSync(externalRoot, join(projectRoot, "linked"));

    try {
      assert.throws(() => readContainedFile(projectRoot, join(projectRoot, "policy.json")));
      assert.throws(() =>
        canonicalizeContainedPath(projectRoot, join(projectRoot, "linked", "missing.json"))
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("returns content from the validated open handle even if the path is replaced later", () => {
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
      symlinkSync(externalPath, trustedPath);
      assert.equal(snapshot.content, '{"source":"trusted"}');
      assert.throws(() => readContainedFile(projectRoot, trustedPath));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
