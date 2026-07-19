#!/usr/bin/env node
/**
 * Verifies that a just-published Lex entry is the live MCP Registry latest
 * version. Intended for the protected post-publication workflow step.
 *
 * Usage: node scripts/verify-mcp-registry-publication.mjs --version 3.0.0
 */

const versionIndex = process.argv.indexOf("--version");
const expectedVersion = versionIndex === -1 ? undefined : process.argv[versionIndex + 1];

if (!expectedVersion) {
  console.error("Usage: verify-mcp-registry-publication.mjs --version <semver>");
  process.exit(2);
}

const response = await fetch(
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=dev.smartergpt%2Flex"
);

if (!response.ok) {
  console.error(`Registry lookup failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const result = await response.json();
const entry = result.servers?.find(
  ({ server, _meta }) =>
    server?.name === "dev.smartergpt/lex" &&
    server?.version === expectedVersion &&
    server?.packages?.[0]?.identifier === "@smartergpt/lex-mcp" &&
    server?.packages?.[0]?.version === expectedVersion &&
    _meta?.["io.modelcontextprotocol.registry/official"]?.isLatest === true
);

if (!entry) {
  console.error(`Registry does not yet report dev.smartergpt/lex v${expectedVersion} as latest.`);
  process.exit(1);
}

console.log(`✅ MCP Registry reports dev.smartergpt/lex v${expectedVersion} as latest.`);
