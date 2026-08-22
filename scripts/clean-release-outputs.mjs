#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function assertPhysicallyContained(canonicalRoot, candidate, label) {
  const physical = fs.realpathSync(candidate);
  const relative = path.relative(canonicalRoot, physical);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the physical repository root`);
  }
}

function assertSafeTree(canonicalRoot, target, label) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not contain links or junctions`);
  assertPhysicallyContained(canonicalRoot, target, label);
  if (!stat.isDirectory()) return;
  for (const name of fs.readdirSync(target)) {
    assertSafeTree(canonicalRoot, path.join(target, name), label);
  }
}

function listUntracked(repoRoot, args) {
  return execFileSync("git", ["ls-files", "-z", "--others", ...args, "--", "schemas", "rules"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function assertSafeFilePath(repoRoot, canonicalRoot, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!/^(schemas|rules)\//.test(normalized)) {
    throw new Error(`Refusing to clean unexpected package path: ${relativePath}`);
  }
  const absolute = path.resolve(repoRoot, relativePath);
  const lexical = path.relative(repoRoot, absolute);
  if (lexical.startsWith("..") || path.isAbsolute(lexical)) {
    throw new Error(`Refusing to clean path outside the repository: ${relativePath}`);
  }

  const segments = lexical.split(path.sep);
  let current = repoRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to clean through a link or junction: ${relativePath}`);
    }
    assertPhysicallyContained(canonicalRoot, current, relativePath);
  }
  if (!fs.lstatSync(absolute).isFile()) {
    throw new Error(`Generated package output is not a regular file: ${relativePath}`);
  }
  return absolute;
}

export function cleanReleaseOutputs(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const canonicalRoot = fs.realpathSync(resolvedRoot);

  const dist = path.join(resolvedRoot, "dist");
  if (fs.existsSync(dist)) {
    assertSafeTree(canonicalRoot, dist, "dist");
    fs.rmSync(dist, { recursive: true, force: true });
  }

  const buildInfo = path.join(resolvedRoot, "tsconfig.tsbuildinfo");
  if (fs.existsSync(buildInfo)) {
    assertSafeTree(canonicalRoot, buildInfo, "tsconfig.tsbuildinfo");
    if (!fs.lstatSync(buildInfo).isFile()) {
      throw new Error("tsconfig.tsbuildinfo must be a regular file");
    }
    fs.unlinkSync(buildInfo);
  }

  for (const mixedRoot of ["schemas", "rules"]) {
    const absoluteRoot = path.join(resolvedRoot, mixedRoot);
    if (fs.existsSync(absoluteRoot)) {
      const stat = fs.lstatSync(absoluteRoot);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`${mixedRoot} must be a physical repository directory`);
      }
      assertPhysicallyContained(canonicalRoot, absoluteRoot, mixedRoot);
    }
  }

  const untracked = new Set([
    ...listUntracked(resolvedRoot, ["--exclude-standard"]),
    ...listUntracked(resolvedRoot, ["--ignored", "--exclude-standard"]),
  ]);
  for (const relativePath of untracked) {
    fs.unlinkSync(assertSafeFilePath(resolvedRoot, canonicalRoot, relativePath));
  }
}

const scriptPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (scriptPath === import.meta.url) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  cleanReleaseOutputs(repoRoot);
  console.log("Cleaned generated release outputs while preserving tracked package inputs");
}
