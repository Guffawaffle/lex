#!/usr/bin/env node
/* eslint-disable no-console -- this file is a postbuild CLI check */

import { access, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRelativePath = "dist/shared/cli/lex.js";

export async function ensureCliExecutable({
  baseDir = rootDir,
  platform = process.platform,
  operations = { access, chmod },
} = {}) {
  const cliPath = resolve(baseDir, cliRelativePath);
  await operations.access(cliPath);

  if (platform !== "win32") {
    await operations.chmod(cliPath, 0o755);
  }

  return { cliPath, chmodApplied: platform !== "win32" };
}

async function main() {
  const result = await ensureCliExecutable();
  const action = result.chmodApplied ? "marked executable" : "verified for Windows packaging";
  console.log(`✓ CLI artifact ${action}: ${cliRelativePath}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`✗ CLI artifact postbuild check failed: ${error.message}`);
    process.exit(1);
  });
}
