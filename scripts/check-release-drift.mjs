#!/usr/bin/env node
/**
 * Release Drift Check
 *
 * Detects misalignment between package.json version and Git tags.
 *
 * Usage:
 *   npm run check:release-drift
 *   node scripts/check-release-drift.mjs
 *
 * Exit codes:
 *   0 - No drift (tag exists for current version)
 *   1 - Drift detected (tag missing for current version)
 *   2 - Script error
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function getPackageVersion() {
  const pkgPath = join(rootDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function getGitTags() {
  try {
    const output = execFileSync("git", ["tag", "-l", "v*"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function releaseIntentFiles(paths) {
  return paths
    .filter(
      (path) =>
        path.startsWith(".changeset/") && path.endsWith(".md") && path !== ".changeset/README.md"
    )
    .sort();
}

export function findStaleReleaseIntentFiles(currentPaths, taggedPaths) {
  const tagged = new Set(releaseIntentFiles(taggedPaths));
  return releaseIntentFiles(currentPaths).filter((path) => tagged.has(path));
}

function getCurrentChangesetPaths() {
  return readdirSync(join(rootDir, ".changeset"), { withFileTypes: true }).map(
    (entry) => `.changeset/${entry.name}`
  );
}

function getTaggedChangesetPaths(tag) {
  try {
    const output = execFileSync("git", ["ls-tree", "-r", "--name-only", tag, "--", ".changeset"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const version = getPackageVersion();
  const expectedTag = `v${version}`;
  const tags = getGitTags();

  console.log(`📦 package.json version: ${version}`);
  console.log(`🏷️  Expected tag: ${expectedTag}`);

  if (tags.includes(expectedTag)) {
    const currentChangesets = getCurrentChangesetPaths();
    const taggedChangesets = getTaggedChangesetPaths(expectedTag);
    const staleChangesets = findStaleReleaseIntentFiles(currentChangesets, taggedChangesets);

    if (staleChangesets.length > 0) {
      console.log(`\n❌ STALE RELEASE INTENT: ${expectedTag} exists, but these`);
      console.log("changesets were already present in that release tag:");
      staleChangesets.forEach((path) => console.log(`  - ${path}`));
      console.log(
        "\nRemove them only after verifying their changes are already represented " +
          "in the tagged changelog. Changesets added after the tag remain valid."
      );
      process.exit(1);
    }

    const newChangesets = releaseIntentFiles(currentChangesets).filter(
      (path) => !taggedChangesets.includes(path)
    );
    console.log(`✅ Tag ${expectedTag} exists. No release drift detected.`);
    if (newChangesets.length > 0) {
      console.log(`✅ ${newChangesets.length} post-${expectedTag} changeset(s) remain queued.`);
    }
    process.exit(0);
  } else {
    console.log(`\n❌ DRIFT DETECTED: Tag ${expectedTag} does not exist.`);
    console.log(`\nExisting tags:`);
    const semverTags = tags.filter((t) => /^v\d+\.\d+\.\d+/.test(t));
    if (semverTags.length > 0) {
      semverTags.slice(-5).forEach((t) => console.log(`  - ${t}`));
      if (semverTags.length > 5) {
        console.log(`  ... and ${semverTags.length - 5} more`);
      }
    } else {
      console.log("  (none matching vX.Y.Z pattern)");
    }

    console.log(`\nTo fix, create the missing tag:`);
    console.log(`  git tag -s "${expectedTag}" -m "Release ${expectedTag}"`);
    console.log(`  git push origin "${expectedTag}"`);

    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (err) {
    console.error("❌ Script error:", err.message);
    process.exit(2);
  }
}
