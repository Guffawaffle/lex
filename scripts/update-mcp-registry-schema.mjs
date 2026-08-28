#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const schemaUrl = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const expectedSha256 = "3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(
  repoRoot,
  "scripts",
  "schemas",
  "mcp-registry-server-2025-12-11.schema.json"
);

const response = await fetch(schemaUrl);
if (!response.ok) {
  throw new Error(`Could not download pinned MCP Registry schema: HTTP ${response.status}`);
}
const bytes = Buffer.from(await response.arrayBuffer());
const observedSha256 = createHash("sha256").update(bytes).digest("hex");
if (observedSha256 !== expectedSha256) {
  throw new Error(
    `MCP Registry schema digest changed: expected ${expectedSha256}, observed ${observedSha256}`
  );
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes, { flag: "w" });
console.log(`Pinned ${schemaUrl} at ${outputPath} (${observedSha256})`);
