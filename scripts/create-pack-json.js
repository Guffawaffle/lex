#!/usr/bin/env node
/**
 * Create pack.json for pack guard validation
 * This script runs npm pack and extracts only the JSON output
 */
import fs from "fs";

import { runNpm } from "./run-npm.mjs";

try {
  // Run npm pack and capture output
  const output = runNpm(["pack", "--json"], { capture: true });

  // Find the JSON array in the output (starts with '[' and ends with ']')
  const jsonStart = output.indexOf("[");
  const jsonEnd = output.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === 0) {
    console.error("❌ Could not find JSON output in npm pack");
    process.exit(1);
  }

  const jsonStr = output.substring(jsonStart, jsonEnd);

  // Validate it's valid JSON before writing
  JSON.parse(jsonStr);

  // Write to pack.json
  fs.writeFileSync("pack.json", jsonStr, "utf8");
  console.log("✓ Created pack.json");
} catch (err) {
  console.error("❌ Failed to create pack.json:", err.message);
  process.exit(1);
}
