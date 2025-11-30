/**
 * Lex YAML Configuration Loader
 *
 * Loads lex.yaml configuration from the filesystem with precedence:
 * 1. lex.yaml in repo root
 * 2. .smartergpt/lex.yaml
 * 3. Auto-detect defaults if neither exists
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import { getLogger } from "../logger/index.js";
import { validateLexYaml, type LexYaml } from "./lex-yaml-schema.js";

const logger = getLogger("lex-yaml-loader");

/**
 * Paths to search for lex.yaml configuration file, in order of precedence.
 */
const CONFIG_PATHS = ["lex.yaml", ".smartergpt/lex.yaml"] as const;

/**
 * Default configuration when no lex.yaml file exists.
 */
const DEFAULT_CONFIG: LexYaml = {
  version: 1,
  instructions: {
    canonical: ".smartergpt/instructions/lex.md",
    projections: {
      copilot: true,
      cursor: true,
    },
  },
};

/**
 * Load the lex.yaml configuration from the repository.
 *
 * Searches for configuration in the following order:
 * 1. `lex.yaml` in the repo root
 * 2. `.smartergpt/lex.yaml`
 * 3. Returns auto-detected defaults if neither exists
 *
 * If a file exists but is invalid (malformed YAML or fails schema validation),
 * logs a warning and returns `null`.
 *
 * @param repoRoot - The root directory of the repository
 * @returns The validated LexYaml configuration, or null if the file exists but is invalid
 *
 * @example
 * ```typescript
 * const config = loadLexYaml('/path/to/repo');
 * if (config) {
 *   console.log(config.version); // 1
 *   console.log(config.instructions?.canonical);
 * }
 * ```
 */
export function loadLexYaml(repoRoot: string): LexYaml | null {
  // Search for configuration file in precedence order
  for (const relativePath of CONFIG_PATHS) {
    const fullPath = path.join(repoRoot, relativePath);

    if (fs.existsSync(fullPath)) {
      return loadAndValidateFile(fullPath, relativePath);
    }
  }

  // No config file found - return auto-detected defaults
  logger.debug("No lex.yaml found, using auto-detected defaults");
  return DEFAULT_CONFIG;
}

/**
 * Load and validate a lex.yaml file from the given path.
 *
 * @param fullPath - Absolute path to the configuration file
 * @param relativePath - Relative path (for error messages)
 * @returns Validated LexYaml or null if invalid
 */
function loadAndValidateFile(fullPath: string, relativePath: string): LexYaml | null {
  let content: string;

  try {
    content = fs.readFileSync(fullPath, "utf-8");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to read ${relativePath}: ${errorMessage}`);
    return null;
  }

  let parsed: unknown;

  try {
    parsed = yaml.load(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Invalid YAML in ${relativePath}: ${errorMessage}`);
    return null;
  }

  const result = validateLexYaml(parsed);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    logger.warn(`Invalid lex.yaml configuration in ${relativePath}:\n${errorMessages}`);
    return null;
  }

  return result.data;
}

/**
 * Check if a lex.yaml file exists in the repository.
 *
 * @param repoRoot - The root directory of the repository
 * @returns Object with exists flag and path if found
 */
export function findLexYamlPath(
  repoRoot: string
): { exists: true; path: string } | { exists: false; path: null } {
  for (const relativePath of CONFIG_PATHS) {
    const fullPath = path.join(repoRoot, relativePath);

    if (fs.existsSync(fullPath)) {
      return { exists: true, path: fullPath };
    }
  }

  return { exists: false, path: null };
}

/**
 * Get the default configuration used when no lex.yaml file exists.
 *
 * @returns The default LexYaml configuration
 */
export function getDefaultLexYaml(): LexYaml {
  return { ...DEFAULT_CONFIG };
}
