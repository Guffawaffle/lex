#!/usr/bin/env node

import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_EXPORT_CONTRACT,
  packageSpecifier,
} from "./public-api-contract.mjs";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let packageRoot = scriptRoot;
let skipDocs = false;
let consumerTypesPath = null;

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--package-root") {
    const candidate = args[index + 1];
    if (!candidate) throw new Error("--package-root requires a path");
    packageRoot = resolve(candidate);
    index += 1;
  } else if (args[index] === "--skip-docs") {
    skipDocs = true;
  } else if (args[index] === "--write-consumer-types") {
    const candidate = args[index + 1];
    if (!candidate) throw new Error("--write-consumer-types requires a path");
    consumerTypesPath = resolve(candidate);
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${args[index]}`);
  }
}

const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const declaredSubpaths = Object.keys(packageJson.exports ?? {});
const contractedSubpaths = PUBLIC_EXPORT_CONTRACT.map(({ subpath }) => subpath);

if (JSON.stringify(declaredSubpaths) !== JSON.stringify(contractedSubpaths)) {
  throw new Error(
    `Public export contract differs from package.json\ncontract: ${contractedSubpaths.join(", ")}\npackage: ${declaredSubpaths.join(", ")}`
  );
}

function exportTargets(entry) {
  if (typeof entry === "string") return [entry];
  if (entry && typeof entry === "object") return Object.values(entry).flatMap(exportTargets);
  return [];
}

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return declarationFiles(path);
      return path.endsWith(".d.ts") ? [path] : [];
    })
  );
  return nested.flat();
}

async function assertDeclarationClosure() {
  const declarations = await declarationFiles(join(packageRoot, "dist"));
  const relativeImportPattern = /(?:from\s+|import\s*\()["'](\.[^"']+)["']/g;

  for (const declaration of declarations) {
    const source = await readFile(declaration, "utf8");
    for (const match of source.matchAll(relativeImportPattern)) {
      const specifier = match[1];
      const resolved = resolve(dirname(declaration), specifier);
      const candidates = specifier.endsWith(".js")
        ? [resolved.replace(/\.js$/, ".d.ts")]
        : [resolved, `${resolved}.d.ts`, join(resolved, "index.d.ts")];
      let found = false;
      for (const candidate of candidates) {
        try {
          await access(candidate);
          found = true;
          break;
        } catch {
          // Try the next declaration-resolution form.
        }
      }
      if (!found) {
        throw new Error(
          `Declaration import does not resolve inside the package: ${declaration} -> ${specifier}`
        );
      }
    }
  }
}

for (const { subpath, anchors } of PUBLIC_EXPORT_CONTRACT) {
  if (subpath.includes("*")) throw new Error(`Wildcard public export is not permitted: ${subpath}`);

  const declaration = packageJson.exports[subpath];
  const targets = exportTargets(declaration);
  if (targets.length === 0) throw new Error(`Public export has no artifact target: ${subpath}`);

  for (const target of targets) {
    if (!target.startsWith("./")) {
      throw new Error(`Public export target must be package-relative: ${subpath} -> ${target}`);
    }
    await access(join(packageRoot, target.slice(2)));
  }

  if (!subpath.endsWith(".json")) {
    if (typeof declaration !== "object" || !declaration.types || !declaration.import) {
      throw new Error(
        `JavaScript public export requires explicit types and import targets: ${subpath}`
      );
    }
  }

  const specifier = packageSpecifier(packageJson.name, subpath);
  const imported = subpath.endsWith(".json")
    ? await import(specifier, { with: { type: "json" } })
    : await import(specifier);

  if (subpath.endsWith(".json") && !imported.default) {
    throw new Error(`JSON Schema export has no default document: ${subpath}`);
  }

  for (const anchor of anchors) {
    if (!(anchor in imported)) {
      throw new Error(`Public export ${subpath} is missing contract anchor ${anchor}`);
    }
  }
}

for (const target of Object.values(packageJson.bin ?? {})) {
  await access(join(packageRoot, target));
}

await assertDeclarationClosure();

if (!skipDocs) {
  const publicApiDoc = await readFile(join(packageRoot, "docs/PUBLIC_API.md"), "utf8");
  if (!publicApiDoc.includes(`public-api-contract:v${PUBLIC_API_CONTRACT_VERSION}`)) {
    throw new Error("docs/PUBLIC_API.md does not identify the current public API contract");
  }
  for (const { subpath, purpose } of PUBLIC_EXPORT_CONTRACT) {
    const specifier = packageSpecifier(packageJson.name, subpath);
    const expectedRow = `| \`${specifier}\` | ${purpose} |`;
    if (!publicApiDoc.includes(expectedRow)) {
      throw new Error(`docs/PUBLIC_API.md is missing the canonical row for ${specifier}`);
    }
  }
}

try {
  await import(`${packageJson.name}/internal/non-exported.js`);
  throw new Error("An undeclared internal package path was importable");
} catch (error) {
  if (
    error instanceof Error &&
    error.message === "An undeclared internal package path was importable"
  ) {
    throw error;
  }
  if (
    !(error instanceof Error) ||
    !["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_MODULE_NOT_FOUND"].includes(error.code)
  ) {
    throw error;
  }
}

if (consumerTypesPath) {
  const aliases = PUBLIC_EXPORT_CONTRACT.map(
    ({ subpath }, index) =>
      `type PublicApi${index + 1} = typeof import(${JSON.stringify(packageSpecifier(packageJson.name, subpath))});`
  );
  const tuple = PUBLIC_EXPORT_CONTRACT.map((_, index) => `  PublicApi${index + 1},`).join("\n");
  const consumerSource = `${aliases.join("\n")}\n\nexport type PackedPublicApi = [\n${tuple}\n];\n\nimport type { AuthorizedScope } from "@smartergpt/lex/runtime-scope";\nimport type { FrameStoreAdmin, ScopedFrameStore, ScopedFrameStoreBinder } from "@smartergpt/lex/store";\n\nexport type Lex3PublicTypes = {\n  scope: AuthorizedScope;\n  store: ScopedFrameStore;\n  binder: ScopedFrameStoreBinder;\n  admin: FrameStoreAdmin;\n};\n`;
  await writeFile(consumerTypesPath, consumerSource, "utf8");
}

console.log(
  `Public API contract v${PUBLIC_API_CONTRACT_VERSION} passed for ${PUBLIC_EXPORT_CONTRACT.length} exports`
);
