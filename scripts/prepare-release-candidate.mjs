#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveExpectedPackTarball } from "./pack-artifact-path.mjs";
import {
  calculateArtifactEvidence,
  candidateReceiptFilename,
  loadAndVerifyReleaseCandidate,
  writeCandidateReceipt,
} from "./release-candidate.mjs";
import { executeReleaseGate } from "./release-gate-runner.mjs";
import { resolveNpmInvocation } from "./run-npm.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const packJsonPath = path.join(repoRoot, "pack.json");
const receiptPath = path.join(repoRoot, candidateReceiptFilename);
const attestationBundlePath = path.join(repoRoot, "release-candidate.attestation.jsonl");

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function assertSourceIdentity(commit) {
  if (git(["rev-parse", "HEAD"]) !== commit) {
    throw new Error("Repository HEAD changed while preparing the release candidate");
  }
  if (git(["status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("Release candidates must be created from a clean worktree");
  }
}

function parsePackResult(output) {
  const jsonStart = output.indexOf("[");
  const jsonEnd = output.lastIndexOf("]") + 1;
  if (jsonStart === -1 || jsonEnd === 0)
    throw new Error("Could not find JSON output from npm pack");
  return JSON.parse(output.slice(jsonStart, jsonEnd));
}

const commit = git(["rev-parse", "HEAD"]);
assertSourceIdentity(commit);

const expectedTarballPath = resolveExpectedPackTarball(
  repoRoot,
  {
    name: packageJson.name,
    version: packageJson.version,
    filename: `${packageJson.name.replace(/^@/, "").replaceAll("/", "-")}-${packageJson.version}.tgz`,
  },
  packageJson
);
for (const generatedPath of [
  packJsonPath,
  receiptPath,
  attestationBundlePath,
  expectedTarballPath,
]) {
  fs.rmSync(generatedPath, { force: true });
}

const npm = resolveNpmInvocation();
const gateDefinitions = [
  {
    name: "clean-release-outputs",
    command: process.execPath,
    args: [path.join(repoRoot, "scripts", "clean-release-outputs.mjs")],
    evidence: "All ignored packaged build roots were removed before compilation",
  },
  {
    name: "build",
    command: npm.command,
    args: [...npm.prefixArgs, "run", "build"],
    evidence: "Generated package outputs were rebuilt from the exact clean commit",
  },
  {
    name: "npm-pack",
    command: npm.command,
    args: [...npm.prefixArgs, "pack", "--ignore-scripts", "--json"],
    evidence: "npm created one retained tarball without lifecycle-script repacking",
  },
];

const gates = [];
let packOutput = "";
for (const definition of gateDefinitions) {
  const execution = executeReleaseGate({ ...definition, cwd: repoRoot, commit });
  gates.push(execution.result);
  if (execution.result.status !== "passed") {
    throw new Error(`Release candidate preparation gate failed: ${definition.name}`);
  }
  if (definition.name === "npm-pack") packOutput = execution.stdout;
  assertSourceIdentity(commit);
}

const packData = parsePackResult(packOutput);
const packEntry = packData[0];
const tarballPath = resolveExpectedPackTarball(repoRoot, packEntry, packageJson);
const evidence = calculateArtifactEvidence(tarballPath);
if (
  evidence.size !== packEntry.size ||
  evidence.shasum !== packEntry.shasum ||
  evidence.integrity !== packEntry.integrity
) {
  throw new Error("npm pack metadata does not match the generated tarball bytes");
}

const receipt = {
  schemaVersion: "lex-release-candidate-v1",
  artifactStatus: "prepared",
  acceptanceStatus: "external-required",
  package: { name: packageJson.name, version: packageJson.version },
  source: { commit, worktreeClean: true },
  artifact: {
    name: packEntry.name,
    version: packEntry.version,
    filename: packEntry.filename,
    ...evidence,
  },
  createdAt: new Date().toISOString(),
  gates,
};

fs.writeFileSync(packJsonPath, `${JSON.stringify(packData, null, 2)}\n`, "utf8");
writeCandidateReceipt(repoRoot, receiptPath, receipt);
const preparedCandidate = loadAndVerifyReleaseCandidate(repoRoot, receiptPath);
assertSourceIdentity(preparedCandidate.receipt.source.commit);
console.log(JSON.stringify(preparedCandidate.receipt, null, 2));
