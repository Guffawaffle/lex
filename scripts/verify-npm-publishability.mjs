#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candidateReceiptFilename, loadAndVerifyReleaseCandidate } from "./release-candidate.mjs";
import { resolveNpmInvocation } from "./run-npm.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function classifyPublishedIntegrity({
  status,
  stdout,
  stderr,
  expectedIntegrity,
  identity,
}) {
  if (status === 0) {
    const publishedIntegrity = JSON.parse(stdout);
    if (publishedIntegrity !== expectedIntegrity) {
      throw new Error(`${identity} exists with bytes different from the retained candidate`);
    }
    return "exact";
  }

  if (/E404|404 Not Found|is not in this registry/iu.test(`${stdout}\n${stderr}`)) {
    return "absent";
  }
  throw new Error(`Could not determine whether ${identity} is already public`);
}

async function main() {
  const receiptPath = path.join(repoRoot, candidateReceiptFilename);
  const candidate = loadAndVerifyReleaseCandidate(repoRoot, receiptPath);
  const npm = resolveNpmInvocation();
  const identity = `${candidate.receipt.package.name}@${candidate.receipt.package.version}`;
  const invokeNpm = (args) =>
    spawnSync(npm.command, [...npm.prefixArgs, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  const view = invokeNpm(["view", identity, "dist.integrity", "--json"]);
  const state = classifyPublishedIntegrity({
    status: view.status,
    stdout: view.stdout,
    stderr: view.stderr,
    expectedIntegrity: candidate.receipt.artifact.integrity,
    identity,
  });
  if (state === "exact") {
    console.log(`${identity} already exposes the exact retained candidate integrity`);
    return;
  }

  const dryRun = invokeNpm(["publish", candidate.tarballPath, "--dry-run", "--access", "public"]);
  process.stdout.write(dryRun.stdout);
  process.stderr.write(dryRun.stderr);
  if (dryRun.status !== 0) {
    process.exitCode = dryRun.status ?? 1;
    return;
  }
  console.log(`${identity} is absent and npm accepted the retained candidate in dry-run mode`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
