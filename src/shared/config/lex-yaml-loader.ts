/**
 * Lex YAML Configuration Loader
 *
 * Finds and loads lex.yaml configuration with precedence chain and auto-detection.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { LexYaml, validateLexYaml } from "./lex-yaml-schema.js";

/**
 * Result of loading lex.yaml configuration
 */
export interface LoadResult {
  /** Whether configuration was successfully loaded */
  success: boolean;
  /** The loaded and validated configuration, or null if not found/invalid */
  config: LexYaml | null;
  /** Path where the config was found, or null if auto-detected defaults used */
  path: string | null;
  /** Source of the configuration */
  source: "file" | "auto-detect";
  /** Error message if loading failed */
  error?: string;
}

/**
 * Default configuration when no lex.yaml is found
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
 * Load lex.yaml configuration from a repository
 *
 * Precedence chain:
 * 1. `lex.yaml` in repo root
 * 2. `.smartergpt/lex.yaml`
 * 3. Auto-detect defaults if neither exists
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Load result with config or error details
 *
 * @example
 * ```ts
 * const result = loadLexYaml('/path/to/repo');
 * if (result.success && result.config) {
 *   console.log("Config loaded from:", result.path ?? "auto-detect");
 *   console.log("Canonical path:", result.config.instructions?.canonical);
 * }
 * ```
 */
export function loadLexYaml(repoRoot: string): LoadResult {
  // Precedence 1: lex.yaml in repo root
  const rootPath = path.join(repoRoot, "lex.yaml");
  const rootResult = tryLoadFile(rootPath);
  if (rootResult.found) {
    if (rootResult.error) {
      return {
        success: false,
        config: null,
        path: rootPath,
        source: "file",
        error: rootResult.error,
      };
    }
    return {
      success: true,
      config: rootResult.config!,
      path: rootPath,
      source: "file",
    };
  }

  // Precedence 2: .smartergpt/lex.yaml
  const smartergptPath = path.join(repoRoot, ".smartergpt", "lex.yaml");
  const smartergptResult = tryLoadFile(smartergptPath);
  if (smartergptResult.found) {
    if (smartergptResult.error) {
      return {
        success: false,
        config: null,
        path: smartergptPath,
        source: "file",
        error: smartergptResult.error,
      };
    }
    return {
      success: true,
      config: smartergptResult.config!,
      path: smartergptPath,
      source: "file",
    };
  }

  // Precedence 3: Auto-detect defaults
  return {
    success: true,
    config: DEFAULT_CONFIG,
    path: null,
    source: "auto-detect",
  };
}

/**
 * Internal result of attempting to load a single file
 */
interface TryLoadResult {
  /** Whether the file was found */
  found: boolean;
  /** The validated config if found and valid */
  config?: LexYaml;
  /** Error message if found but invalid */
  error?: string;
}

/**
 * Try to load and validate a config file at a specific path
 */
function tryLoadFile(filePath: string): TryLoadResult {
  // Check if file exists
  if (!isFile(filePath)) {
    return { found: false };
  }

  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return {
      found: true,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Parse YAML
  let rawData: unknown;
  try {
    rawData = parseYaml(content);
  } catch (err) {
    return {
      found: true,
      error: `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Validate against schema
  const validation = validateLexYaml(rawData);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      found: true,
      error: `Schema validation failed: ${issues}`,
    };
  }

  return {
    found: true,
    config: validation.data,
  };
}

/**
 * Check if a path exists and is a file
 */
function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Get the default configuration (for testing/reference)
 */
export function getDefaultConfig(): LexYaml {
  return { ...DEFAULT_CONFIG };
}
