#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveExpectedPackTarball } from "./pack-artifact-path.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packJsonPath = path.join(repoRoot, "pack.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

try {
  const packData = JSON.parse(fs.readFileSync(packJsonPath, "utf8"));
  const tarballPath = resolveExpectedPackTarball(repoRoot, packData[0], packageJson);
  fs.rmSync(tarballPath, { force: true });
} finally {
  fs.rmSync(packJsonPath, { force: true });
}
