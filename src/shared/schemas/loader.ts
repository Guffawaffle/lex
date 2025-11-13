/**
 * Schema Loading Utility
 *
 * Loads schema files with precedence chain support:
 * 1. LEX_SCHEMAS_DIR (explicit environment override)
 * 2. .smartergpt.local/schemas/ (local overlay)
 * 3. Package canon (resolved from package installation)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

/**
 * Resolve package asset path for both dev and installed contexts
 *
 * @param type - Asset type ('prompts' or 'schemas')
 * @param name - Asset name/filename
 * @returns Resolved absolute path to the asset
 */
function resolvePackageAsset(type: "prompts" | "schemas", name: string): string {
  // When installed: node_modules/lex/prompts/ or node_modules/lex/schemas/
  // When local dev: <repo>/prompts/ or <repo>/schemas/
  const pkgRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/dist\/.*/, "");
  return join(pkgRoot, type, name);
}

/**
 * Load schema file with precedence chain
 *
 * @param schemaName - Name of the schema file (e.g., "cli-output.v1.schema.json")
 * @returns Parsed schema object
 * @throws Error if schema file cannot be found in any location
 *
 * Precedence chain:
 * 1. LEX_SCHEMAS_DIR (explicit environment override)
 * 2. .smartergpt.local/schemas/ (local overlay - untracked)
 * 3. Package canon (resolve from package installation)
 *
 * @example
 * ```typescript
 * const schema = loadSchema('cli-output.v1.schema.json');
 * console.log(schema); // Parsed JSON schema object
 * ```
 *
 * @example With environment variable override
 * ```typescript
 * process.env.LEX_SCHEMAS_DIR = '/custom/schemas';
 * const schema = loadSchema('cli-output.v1.schema.json');
 * ```
 *
 * @example Local overlay (create .smartergpt.local/schemas/my-schema.json to override)
 * ```typescript
 * // If .smartergpt.local/schemas/my-schema.json exists, it takes precedence
 * const schema = loadSchema('my-schema.json');
 * ```
 */
export function loadSchema(schemaName: string): object {
  const attemptedPaths: string[] = [];

  // Priority 1: LEX_SCHEMAS_DIR (explicit env override)
  const envDir = process.env.LEX_SCHEMAS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, schemaName);
    attemptedPaths.push(envPath);
    if (existsSync(envPath)) {
      return JSON.parse(readFileSync(envPath, "utf-8"));
    }
  }

  // Priority 2: .smartergpt.local/schemas/ (local overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "schemas", schemaName);
  attemptedPaths.push(localPath);
  if (existsSync(localPath)) {
    return JSON.parse(readFileSync(localPath, "utf-8"));
  }

  // Priority 3: Package canon (resolve from package installation)
  const canonPath = resolvePackageAsset("schemas", schemaName);
  attemptedPaths.push(canonPath);
  if (existsSync(canonPath)) {
    return JSON.parse(readFileSync(canonPath, "utf-8"));
  }

  throw new Error(
    `Schema file '${schemaName}' not found. Tried:\n` +
      attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
  );
}

/**
 * Get the path where a schema would be loaded from (without loading it)
 *
 * @param schemaName - Name of the schema file
 * @returns Resolved path or null if not found
 *
 * @example
 * ```typescript
 * const path = getSchemaPath('cli-output.v1.schema.json');
 * console.log(path); // '/repo/schemas/cli-output.v1.schema.json'
 * ```
 */
export function getSchemaPath(schemaName: string): string | null {
  // Priority 1: LEX_SCHEMAS_DIR
  const envDir = process.env.LEX_SCHEMAS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, schemaName);
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  // Priority 2: Local overlay
  const localPath = join(process.cwd(), ".smartergpt.local", "schemas", schemaName);
  if (existsSync(localPath)) {
    return localPath;
  }

  // Priority 3: Package canon
  const canonPath = resolvePackageAsset("schemas", schemaName);
  if (existsSync(canonPath)) {
    return canonPath;
  }

  return null;
}

/**
 * List all available schemas across all precedence levels
 *
 * @returns Array of unique schema names (deduplicated)
 *
 * @example
 * ```typescript
 * const schemas = listSchemas();
 * console.log(schemas); // ['cli-output.v1.schema.json', ...]
 * ```
 */
export function listSchemas(): string[] {
  const schemas = new Set<string>();

  // Collect from package canon
  try {
    const canonPath = resolvePackageAsset("schemas", "");
    if (existsSync(canonPath)) {
      const files = readdirSync(canonPath);
      files.forEach((file: string) => {
        if (file.endsWith(".json") || file.endsWith(".schema.json")) {
          schemas.add(file);
        }
      });
    }
  } catch {
    // Ignore errors when reading package canon
  }

  // Collect from local (overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "schemas");
  if (existsSync(localPath)) {
    try {
      const files = readdirSync(localPath);
      files.forEach((file: string) => {
        if (file.endsWith(".json") || file.endsWith(".schema.json")) {
          schemas.add(file);
        }
      });
    } catch {
      // Ignore errors when reading local overlay
    }
  }

  // Collect from LEX_SCHEMAS_DIR (if specified)
  const envDir = process.env.LEX_SCHEMAS_DIR;
  if (envDir && existsSync(envDir)) {
    try {
      const files = readdirSync(envDir);
      files.forEach((file: string) => {
        if (file.endsWith(".json") || file.endsWith(".schema.json")) {
          schemas.add(file);
        }
      });
    } catch {
      // Ignore errors when reading env dir
    }
  }

  return Array.from(schemas).sort();
}
