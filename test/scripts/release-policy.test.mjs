import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatGitHubSignerOutputs,
  parseAuthorizedFingerprints,
  parseValidSignatures,
  requireAuthorizedSignature,
  writeGitHubSignerOutputs,
} from "../../scripts/verify-release-signatures.mjs";

const verifier = path.resolve("scripts/verify-release-tag.mjs");
const workflowPath = path.resolve(".github/workflows/release.yml");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test("release workflow separates npm publication from signed-tag release creation", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const publishStart = workflow.indexOf("  publish-npm:");
  const releaseStart = workflow.indexOf("  create-github-release:");
  assert.ok(publishStart > 0, "publish-npm job is missing");
  assert.ok(releaseStart > publishStart, "create-github-release job is missing");

  const publishJob = workflow.slice(publishStart, releaseStart);
  const releaseJob = workflow.slice(releaseStart);

  assert.match(
    workflow,
    /publish:\n\s+description:.*\n\s+required: true\n\s+default: false\n\s+type: boolean/
  );
  assert.match(
    publishJob,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.publish == true/
  );
  assert.match(publishJob, /environment: npm-release/);
  assert.match(publishJob, /npm publish "\$TARBALL" --access public --provenance/);
  assert.match(publishJob, /RECEIPT_RELEASE_IDENTITY.*!= "null"/s);

  assert.match(releaseJob, /if: github\.event_name == 'push'/);
  assert.match(releaseJob, /Verify immutable public npm integrity/);
  assert.match(releaseJob, /softprops\/action-gh-release@[0-9a-f]{40}/);
  assert.doesNotMatch(releaseJob, /npm publish/);
});

test("release tag policy rejects an annotated tag object aliased under another ref", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lex-release-tag-"));
  try {
    git(root, ["init"]);
    await writeFile(path.join(root, "fixture.txt"), "release fixture\n");
    git(root, ["add", "fixture.txt"]);
    git(root, [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Lex Test",
      "-c",
      "user.email=lex-test@example.invalid",
      "commit",
      "-m",
      "release fixture",
    ]);
    git(root, [
      "-c",
      "tag.gpgSign=false",
      "-c",
      "user.name=Lex Test",
      "-c",
      "user.email=lex-test@example.invalid",
      "tag",
      "-a",
      "v4.0.1",
      "-m",
      "annotated fixture",
    ]);
    const target = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const tagObject = git(root, ["rev-parse", "refs/tags/v4.0.1"]).stdout.trim();
    git(root, ["update-ref", "refs/tags/v4.0.2", tagObject]);

    const accepted = spawnSync(process.execPath, [verifier, "v4.0.1", target], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    const aliased = spawnSync(process.execPath, [verifier, "v4.0.2", target], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(aliased.status, 0);
    assert.match(aliased.stderr, /embeds "v4\.0\.1", expected "v4\.0\.2"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release signature policy binds exact object-specific signers", async () => {
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  const tagLine = `[GNUPG:] VALIDSIG ${tagFingerprint} 2026-08-24 0 4 0 1 8 00 ${tagFingerprint}`;
  const commitLine = `[GNUPG:] VALIDSIG ${commitFingerprint} 2026-08-24 0 4 0 1 8 00 ${commitFingerprint}`;
  assert.equal(
    requireAuthorizedSignature({
      kind: "Release tag",
      output: tagLine,
      status: 0,
      authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
    }),
    tagFingerprint
  );
  assert.throws(
    () =>
      requireAuthorizedSignature({
        kind: "Release commit",
        output: commitLine,
        status: 0,
        authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
      }),
    /signer fingerprint is not authorized/
  );
  assert.deepEqual(parseValidSignatures(`${tagLine}\n${tagLine}`), [
    tagFingerprint,
    tagFingerprint,
  ]);

  const root = await mkdtemp(path.join(os.tmpdir(), "lex-release-output-"));
  try {
    const output = path.join(root, "github-output.txt");
    writeGitHubSignerOutputs(output, tagFingerprint, commitFingerprint);
    assert.equal(
      await readFile(output, "utf8"),
      formatGitHubSignerOutputs(tagFingerprint, commitFingerprint)
    );
    assert.throws(
      () => formatGitHubSignerOutputs("", commitFingerprint),
      /exact uppercase 40-hex fingerprints/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
