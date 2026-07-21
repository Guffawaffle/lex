#!/usr/bin/env node
/* eslint-disable no-console -- this file is a CLI validator */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv from "ajv";
import addFormats from "ajv-formats";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestPath = resolve(rootDir, "releases/ecosystem-3.1.json");
const schemaPath = resolve(rootDir, "canon/schemas/ecosystem-release-v1.schema.json");

export const expectedComponentIds = ["axf", "lex", "lex-mcp", "lexrunner", "lexsona", "stfc-mod"];

function formatSchemaError(error) {
  const location = error.instancePath || "/";
  return `${location} ${error.message}`;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function containsPlaceholder(value) {
  if (typeof value === "string") return /\b(?:TBD|TODO|PLACEHOLDER)\b/i.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (value && typeof value === "object") return Object.values(value).some(containsPlaceholder);
  return false;
}

export function semanticErrors(manifest, { requireSealed = false } = {}) {
  const errors = [];
  const components = new Map(manifest.components.map((component) => [component.id, component]));
  const componentIds = [...components.keys()].sort();

  const duplicateComponents = duplicateValues(manifest.components.map((component) => component.id));
  if (duplicateComponents.length > 0) {
    errors.push(`duplicate component ids: ${duplicateComponents.join(", ")}`);
  }

  const missingComponents = expectedComponentIds.filter((id) => !components.has(id));
  const unknownComponents = componentIds.filter((id) => !expectedComponentIds.includes(id));
  if (missingComponents.length > 0) {
    errors.push(`missing required components: ${missingComponents.join(", ")}`);
  }
  if (unknownComponents.length > 0) {
    errors.push(`unknown components: ${unknownComponents.join(", ")}`);
  }

  if (manifest.runtime.nodeMinimumMajor !== 24) {
    errors.push(`runtime.nodeMinimumMajor must be 24, got ${manifest.runtime.nodeMinimumMajor}`);
  }
  if (manifest.runtime.nodeUpperBoundExclusive !== null) {
    errors.push(
      "runtime.nodeUpperBoundExclusive must remain null unless a reviewed issue changes policy"
    );
  }

  for (const component of manifest.components) {
    const packageRequired = component.participation === "required-package";
    if (packageRequired && component.package === null) {
      errors.push(`${component.id} participates as a package but has no package record`);
    }
    if (!packageRequired && component.package !== null) {
      errors.push(`${component.id} participates as source proof and must not declare a package`);
    }
  }

  const edgeKeys = manifest.edges.map((edge) => `${edge.from}:${edge.to}:${edge.kind}`);
  const duplicateEdges = duplicateValues(edgeKeys);
  if (duplicateEdges.length > 0) {
    errors.push(`duplicate dependency edges: ${duplicateEdges.join(", ")}`);
  }

  for (const edge of manifest.edges) {
    if (!components.has(edge.from)) errors.push(`edge source does not exist: ${edge.from}`);
    if (!components.has(edge.to)) errors.push(`edge target does not exist: ${edge.to}`);
    if (edge.from === edge.to) errors.push(`self-referential edge is not allowed: ${edge.from}`);
  }

  const lex = components.get("lex");
  const lexMcp = components.get("lex-mcp");
  const exactLexEdge = manifest.edges.find(
    (edge) =>
      edge.from === "lex-mcp" &&
      edge.to === "lex" &&
      edge.kind === "runtime" &&
      edge.releaseRequired === true &&
      edge.constraint === "exact"
  );
  if (!exactLexEdge) {
    errors.push("lex-mcp must have one release-required exact runtime edge to lex");
  }
  if (lex?.package?.targetVersion !== lexMcp?.package?.targetVersion) {
    errors.push(
      `lex and lex-mcp target versions must match exactly (${lex?.package?.targetVersion ?? "null"} != ${lexMcp?.package?.targetVersion ?? "null"})`
    );
  }

  if (requireSealed && manifest.state !== "sealed") {
    errors.push(`manifest must be sealed, got ${manifest.state}`);
  }

  if (manifest.state === "sealed") {
    if (containsPlaceholder(manifest)) {
      errors.push("sealed manifest contains a TBD, TODO, or PLACEHOLDER value");
    }

    for (const component of manifest.components) {
      if (component.status !== "verified") {
        errors.push(`${component.id} must be verified before sealing`);
      }
      if (!component.source.commit) {
        errors.push(`${component.id} must identify an immutable commit before sealing`);
      }
      if (component.package && !component.source.tag) {
        errors.push(`${component.id} must identify a signed package-release tag before sealing`);
      }
      if (component.evidence.length === 0) {
        errors.push(`${component.id} must include immutable verification evidence before sealing`);
      }
      if (component.package) {
        const { targetVersion, publishedVersion, integrity } = component.package;
        if (!targetVersion || !publishedVersion || !integrity) {
          errors.push(`${component.id} package evidence is incomplete before sealing`);
        } else if (targetVersion !== publishedVersion) {
          errors.push(
            `${component.id} target version ${targetVersion} does not match published version ${publishedVersion}`
          );
        }
      }
    }

    for (const gate of manifest.gates) {
      if (gate.required && gate.status !== "passed") {
        errors.push(`required gate ${gate.id} must pass before sealing`);
      }
      if (gate.required && gate.evidence.length === 0) {
        errors.push(`required gate ${gate.id} must include immutable evidence before sealing`);
      }
    }
  }

  return errors;
}

export async function validateManifest(manifest, options = {}) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(manifest);
  const errors = valid ? [] : validate.errors.map(formatSchemaError);
  errors.push(...semanticErrors(manifest, options));
  return errors;
}

function parseArgs(argv) {
  let manifestPath = defaultManifestPath;
  let requireSealed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sealed") {
      requireSealed = true;
    } else if (arg === "--manifest") {
      const value = argv[index + 1];
      if (!value) throw new Error("--manifest requires a path");
      manifestPath = resolve(process.cwd(), value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { manifestPath, requireSealed };
}

async function main() {
  const { manifestPath, requireSealed } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = await validateManifest(manifest, { requireSealed });

  if (errors.length > 0) {
    console.error(`❌ Ecosystem release manifest is invalid (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `✅ ${manifest.displayName} manifest is valid (${manifest.state}, ${manifest.components.length} components, ${manifest.edges.length} edges)`
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`❌ Ecosystem release validation failed: ${error.message}`);
    process.exit(2);
  });
}
