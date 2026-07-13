#!/usr/bin/env node
/**
 * Verifies the release contract for Lex's MCP Registry entry.
 *
 * The registry manifest describes the wrapper package, not the Lex CLI package.
 * A release is therefore valid only when the core package, wrapper package, and
 * manifest all identify the same version and namespace.
 *
 * Usage:
 *   node scripts/verify-mcp-registry-contract.mjs --version 2.9.0
 *   node scripts/verify-mcp-registry-contract.mjs --version 2.9.0 \
 *     --schema /tmp/server.schema.json --core-metadata /tmp/lex.json \
 *     --wrapper-metadata /tmp/lex-mcp.json
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
  } else {
    fail(message);
  }
}

const expectedVersion = option("--version");
const schemaPath = option("--schema");
const coreMetadataPath = option("--core-metadata");
const wrapperMetadataPath = option("--wrapper-metadata");

if (!expectedVersion) {
  console.error(
    "Usage: verify-mcp-registry-contract.mjs --version <semver> [--schema <path>] [--wrapper-metadata <path>]"
  );
  process.exit(2);
}

const lexPackage = readJson(resolve(rootDir, "package.json"));
const manifest = readJson(resolve(rootDir, "server.json"));
const registryPackage = manifest.packages?.[0];

console.log(`Verifying MCP Registry release contract for v${expectedVersion}`);

assert(lexPackage.version === expectedVersion, `Lex package version is ${expectedVersion}`);
assert(manifest.version === expectedVersion, `server.json version is ${expectedVersion}`);
assert(
  registryPackage?.version === expectedVersion,
  `server.json wrapper package version is ${expectedVersion}`
);
assert(manifest.name === "dev.smartergpt/lex", "server.json uses the ADR-010 DNS namespace");
assert(
  registryPackage?.identifier === "@smartergpt/lex-mcp",
  "server.json targets the dedicated MCP wrapper"
);
assert(registryPackage?.transport?.type === "stdio", "server.json declares stdio transport");
assert(registryPackage?.runtimes?.includes("node"), "server.json declares the Node runtime");

if (schemaPath) {
  const schema = readJson(resolve(schemaPath));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(manifest);
  assert(valid, `server.json conforms to ${manifest.$schema}`);
  if (!valid) {
    for (const error of validate.errors ?? []) {
      console.error(`   ${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
    }
  }
}

if (wrapperMetadataPath) {
  const wrapper = readJson(resolve(wrapperMetadataPath));
  assert(wrapper.version === expectedVersion, `published wrapper version is ${expectedVersion}`);
  assert(wrapper.mcpName === manifest.name, "published wrapper mcpName matches server.json");
  assert(
    wrapper.dependencies?.["@smartergpt/lex"] === expectedVersion,
    "published wrapper pins the matching Lex core version"
  );
  assert(
    wrapper.engines?.node === lexPackage.engines?.node,
    "published wrapper Node engine matches Lex core"
  );
}

if (coreMetadataPath) {
  const core = readJson(resolve(coreMetadataPath));
  assert(core.version === expectedVersion, `published Lex core version is ${expectedVersion}`);
  assert(
    core.engines?.node === lexPackage.engines?.node,
    "published Lex core Node engine matches this release"
  );
}

if (process.exitCode) {
  console.error("\nMCP Registry release contract failed.");
} else {
  console.log("\nMCP Registry release contract passed.");
}
