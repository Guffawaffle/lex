#!/usr/bin/env node
/* eslint-disable no-console -- this file is a CLI contract check */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const currentGuidancePaths = [
  "CONFLICT_RESOLUTION.md",
  "CONTRIBUTING.md",
  "QUICK_START.md",
  "README.md",
  "README.mcp.md",
  "docs/PERFORMANCE.md",
  "docs/adr/0001-ts-only-nodenext.md",
  "src/memory/renderer/graph.ts",
  "src/shared/aliases/TESTING.md",
];

const unsupportedWorkflowPatterns = [
  /\bNode(?:\.js)?(?:\s+|[-v])(?:18|20|22)(?:\+|\b)/i,
  /node-version:\s*["']?(?:18|20|22)\b/i,
  /\bnode:\s*\[[^\]]*["'](?:18|20|22)["']/i,
  /\bFROM\s+node:(?:18|20|22)\b/i,
];

const unsupportedRuntimePatterns = [...unsupportedWorkflowPatterns, /(?:>=\s*(?:18|20)|<\s*25)\b/i];

function staleClaims(text, patterns = unsupportedRuntimePatterns) {
  return patterns.filter((pattern) => pattern.test(text)).map(String);
}

export function runtimeContractErrors(snapshot) {
  const errors = [];
  const rootLock = snapshot.packageLock.packages?.[""];
  const resolvedNodeTypes = snapshot.packageLock.packages?.["node_modules/@types/node"]?.version;

  if (snapshot.packageJson.engines?.node !== ">=24") {
    errors.push(
      `package.json engines.node must be >=24, got ${snapshot.packageJson.engines?.node}`
    );
  }
  if (snapshot.packageJson.dependencies?.["@types/node"] !== "^24.0.0") {
    errors.push(
      `package.json @types/node must be ^24.0.0, got ${snapshot.packageJson.dependencies?.["@types/node"]}`
    );
  }
  if (rootLock?.engines?.node !== ">=24") {
    errors.push(`package-lock root engines.node must be >=24, got ${rootLock?.engines?.node}`);
  }
  if (rootLock?.dependencies?.["@types/node"] !== "^24.0.0") {
    errors.push(
      `package-lock root @types/node must be ^24.0.0, got ${rootLock?.dependencies?.["@types/node"]}`
    );
  }
  if (!resolvedNodeTypes || Number.parseInt(resolvedNodeTypes.split(".")[0], 10) !== 24) {
    errors.push(`resolved @types/node must be on major 24, got ${resolvedNodeTypes ?? "missing"}`);
  }
  if (snapshot.nvmrc.trim() !== "24") {
    errors.push(`.nvmrc must select 24, got ${snapshot.nvmrc.trim() || "empty"}`);
  }
  if (!/^FROM\s+node:24(?:-|\s|$)/m.test(snapshot.ciDockerfile)) {
    errors.push("ci.Dockerfile must use a Node 24 base image");
  }

  for (const [path, text] of Object.entries(snapshot.workflows)) {
    const claims = staleClaims(text, unsupportedWorkflowPatterns);
    if (claims.length > 0) errors.push(`${path} contains an unsupported runtime selection`);
    if (
      text.includes("actions/setup-node") &&
      !/node-version:\s*(?:["']24["']|\$\{\{\s*matrix\.node\s*\}\})/.test(text)
    ) {
      errors.push(`${path} uses actions/setup-node without an explicit Node 24 selection`);
    }
  }

  for (const [path, text] of Object.entries(snapshot.currentGuidance)) {
    if (staleClaims(text).length > 0) {
      errors.push(`${path} contains an unsupported current Node 18/20/22 claim or <25 ceiling`);
    }
  }

  if (snapshot.ecosystemManifest.runtime?.nodeMinimumMajor !== 24) {
    errors.push("Ecosystem 3.1 manifest must declare Node minimum major 24");
  }
  if (snapshot.ecosystemManifest.runtime?.nodeUpperBoundExclusive !== null) {
    errors.push("Ecosystem 3.1 manifest must not carry an unproven Node upper bound");
  }

  return errors;
}

export async function loadRuntimeSnapshot(baseDir = rootDir) {
  const workflowDir = join(baseDir, ".github/workflows");
  const workflowNames = (await readdir(workflowDir)).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml")
  );
  const workflows = Object.fromEntries(
    await Promise.all(
      workflowNames.map(async (name) => [
        `.github/workflows/${name}`,
        await readFile(join(workflowDir, name), "utf8"),
      ])
    )
  );
  const currentGuidance = Object.fromEntries(
    await Promise.all(
      currentGuidancePaths.map(async (path) => [path, await readFile(join(baseDir, path), "utf8")])
    )
  );

  return {
    packageJson: JSON.parse(await readFile(join(baseDir, "package.json"), "utf8")),
    packageLock: JSON.parse(await readFile(join(baseDir, "package-lock.json"), "utf8")),
    nvmrc: await readFile(join(baseDir, ".nvmrc"), "utf8"),
    ciDockerfile: await readFile(join(baseDir, "ci.Dockerfile"), "utf8"),
    workflows,
    currentGuidance,
    ecosystemManifest: JSON.parse(
      await readFile(join(baseDir, "releases/ecosystem-3.1.json"), "utf8")
    ),
  };
}

async function main() {
  const snapshot = await loadRuntimeSnapshot();
  const errors = runtimeContractErrors(snapshot);
  if (errors.length > 0) {
    console.error(`❌ Node runtime contract drifted (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `✅ Node runtime contract is aligned at >=24 (${Object.keys(snapshot.workflows).length} workflows, ${Object.keys(snapshot.currentGuidance).length} guidance files)`
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`❌ Node runtime contract check failed: ${error.message}`);
    process.exit(2);
  });
}
