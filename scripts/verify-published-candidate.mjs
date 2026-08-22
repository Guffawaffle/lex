#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPublishedArtifact,
  candidateReceiptFilename,
  loadAndVerifyReleaseCandidate,
} from "./release-candidate.mjs";
import { runNpm } from "./run-npm.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptPath = path.join(repoRoot, candidateReceiptFilename);
const candidate = loadAndVerifyReleaseCandidate(repoRoot, receiptPath);
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

if (head !== candidate.receipt.source.commit) {
  throw new Error("Published candidate verification is running at a different commit");
}
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim()
) {
  throw new Error("Published candidate verification requires a clean worktree");
}

const spec = `${candidate.packageJson.name}@${candidate.packageJson.version}`;
const published = JSON.parse(
  runNpm(["view", spec, "version", "dist.integrity", "--json"], {
    cwd: repoRoot,
    capture: true,
  })
);
assertPublishedArtifact(candidate.receipt, published);
console.log(
  JSON.stringify(
    {
      package: spec,
      integrity: published["dist.integrity"],
      candidateCommit: candidate.receipt.source.commit,
    },
    null,
    2
  )
);
