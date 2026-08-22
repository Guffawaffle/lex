import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanReleaseOutputs } from "../../scripts/clean-release-outputs.mjs";
import { createTestSymlinkOrSkip } from "../helpers/symlink.ts";

function initRepository(root) {
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  fs.mkdirSync(path.join(root, "rules"));
}

test("release output cleaner preserves tracked inputs and removes generated files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lex-clean-release-"));
  try {
    initRepository(root);
    fs.mkdirSync(path.join(root, "schemas"));
    fs.writeFileSync(path.join(root, ".gitignore"), "schemas/generated.json\n");
    fs.writeFileSync(path.join(root, "schemas", "tracked.json"), "tracked");
    fs.writeFileSync(path.join(root, "schemas", "generated.json"), "generated");
    fs.writeFileSync(path.join(root, "rules", "tracked.json"), "tracked rule");
    execFileSync("git", ["add", ".gitignore", "schemas/tracked.json", "rules/tracked.json"], {
      cwd: root,
    });

    cleanReleaseOutputs(root);

    assert.equal(fs.readFileSync(path.join(root, "schemas", "tracked.json"), "utf8"), "tracked");
    assert.equal(fs.readFileSync(path.join(root, "rules", "tracked.json"), "utf8"), "tracked rule");
    assert.equal(fs.existsSync(path.join(root, "schemas", "generated.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("release output cleaner refuses a nested junction escape", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "lex-clean-release-nested-junction-"));
  const root = path.join(parent, "repo");
  const external = path.join(parent, "external");
  fs.mkdirSync(root);
  fs.mkdirSync(external);
  try {
    initRepository(root);
    fs.mkdirSync(path.join(root, "schemas"));
    fs.writeFileSync(path.join(external, "keep.json"), "outside");
    if (!createTestSymlinkOrSkip(t, external, path.join(root, "schemas", "generated"), "dir"))
      return;

    assert.throws(() => cleanReleaseOutputs(root), /link or junction/);
    assert.equal(fs.readFileSync(path.join(external, "keep.json"), "utf8"), "outside");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("release output cleaner refuses a mixed-root junction escape", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "lex-clean-release-junction-"));
  const root = path.join(parent, "repo");
  const external = path.join(parent, "external");
  fs.mkdirSync(root);
  fs.mkdirSync(external);
  try {
    initRepository(root);
    fs.writeFileSync(path.join(external, "keep.json"), "outside");
    if (!createTestSymlinkOrSkip(t, external, path.join(root, "schemas"), "dir")) return;

    assert.throws(() => cleanReleaseOutputs(root), /physical repository directory/);
    assert.equal(fs.readFileSync(path.join(external, "keep.json"), "utf8"), "outside");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
