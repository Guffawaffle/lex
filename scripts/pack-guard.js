#!/usr/bin/env node
/**
 * Pack guard script - validates tarball structure
 * Ensures:
 * - Only declared package defaults from canon/ are included
 * - Only expected directories and files are included
 */
import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Validate pack.json exists and is readable
let packData;
try {
  const packContent = fs.readFileSync("pack.json", "utf8");
  packData = JSON.parse(packContent);
} catch (err) {
  if (err.code === "ENOENT") {
    console.error('❌ pack.json not found. Run "npm pack --json > pack.json" first.');
  } else if (err instanceof SyntaxError) {
    console.error("❌ pack.json contains invalid JSON:", err.message);
  } else {
    console.error("❌ Failed to read pack.json:", err.message);
  }
  process.exit(1);
}

// Validate expected structure
if (!Array.isArray(packData) || packData.length === 0) {
  console.error("❌ pack.json does not contain expected array structure");
  process.exit(1);
}

if (!packData[0].files || !Array.isArray(packData[0].files)) {
  console.error('❌ pack.json[0] does not contain expected "files" array');
  process.exit(1);
}

const files = packData[0].files.map((x) => x?.path).filter((p) => p != null);
const allowed = ["README.md", "README.mcp.md", "LICENSE", "package.json", "CHANGELOG.md"];

function exportTargets(entry) {
  if (typeof entry === "string") return [entry];
  if (entry && typeof entry === "object") return Object.values(entry).flatMap(exportTargets);
  return [];
}

const requiredArtifacts = [
  ...Object.values(packageJson.exports ?? {}).flatMap(exportTargets),
  ...Object.values(packageJson.bin ?? {}),
].map((target) => target.replace(/^\.\//, ""));

const missingArtifacts = requiredArtifacts.filter((target) => !files.includes(target));
if (missingArtifacts.length) {
  console.error("❌ Public export or binary artifacts missing from tarball:", missingArtifacts);
  process.exit(1);
}

const buildMetadata = files.filter((path) => path.endsWith(".tsbuildinfo"));
if (buildMetadata.length) {
  console.error("❌ TypeScript build metadata must not be published:", buildMetadata);
  process.exit(1);
}

// Check for unexpected files
const bad = files.filter((p) => {
  if (/^dist\//.test(p)) return false;
  if (/^prompts\//.test(p)) return false;
  if (/^schemas\//.test(p)) return false;
  if (/^rules\//.test(p)) return false;
  if (p === "canon/README.md") return false;
  if (/^canon\/prompts\//.test(p)) return false;
  if (/^canon\/schemas\//.test(p)) return false;
  if (/^canon\/rules\//.test(p)) return false;
  if (/^examples\//.test(p)) return false;
  if (/^src\/policy\//.test(p)) return false;
  if (allowed.includes(p)) return false;
  return true;
});

if (bad.length) {
  console.error("❌ Unexpected files in tarball:", bad);
  process.exit(1);
}

// Verify no undeclared canon/ source directories are in the tarball.
const canonFiles = files.filter(
  (p) =>
    /^canon\//.test(p) && p !== "canon/README.md" && !/^canon\/(prompts|schemas|rules)\//.test(p)
);
if (canonFiles.length) {
  console.error("❌ Undeclared canon source directories should not be in tarball:", canonFiles);
  process.exit(1);
}

console.log("✅ Pack guard passed: valid package structure");
console.log("");
console.log("Tarball summary:");
console.log("  Total files:", files.length);
console.log("  dist/ files:", files.filter((p) => /^dist\//.test(p)).length);
console.log("  prompts/ files:", files.filter((p) => /^prompts\//.test(p)).length);
console.log("  schemas/ files:", files.filter((p) => /^schemas\//.test(p)).length);
console.log("  rules/ files:", files.filter((p) => /^rules\//.test(p)).length);
console.log("  canon/ package-default files:", files.filter((p) => /^canon\//.test(p)).length);
console.log("  examples/ files:", files.filter((p) => /^examples\//.test(p)).length);
console.log("  src/policy/ files:", files.filter((p) => /^src\/policy\//.test(p)).length);
console.log("  metadata files:", files.filter((p) => allowed.includes(p)).length);
console.log("  required export/bin artifacts:", new Set(requiredArtifacts).size);
