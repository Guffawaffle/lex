/**
 * Configuration system for Lex.
 * Provides centralized configuration loading with environment variable overrides.
 *
 * Precedence:
 * 1. Environment variables (LEX_APP_ROOT, LEX_DB_PATH, LEX_POLICY_PATH)
 * 2. .lex.config.json file
 * 3. Sensible defaults
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getLogger } from "../logger/index.js";
import { expandTokensInObject } from "../tokens/expander.js";

const logger = getLogger("config");

export type WorkspaceRootSource = "explicit" | "git" | "package" | "cwd";

export interface WorkspaceRootResolution {
  path: string;
  source: WorkspaceRootSource;
}

export interface WorkspaceRootOptions {
  startPath?: string;
  explicitRoot?: string | null;
}

export type ConfigFileSource = "caller-workspace" | "package-fallback" | "none";

export type ConfigValueSource =
  | "env:LEX_APP_ROOT"
  | "env:LEX_DB_PATH"
  | "env:LEX_POLICY_PATH"
  | "file:.lex.config.json"
  | "default";

export interface ConfigResolution {
  config: LexConfig;
  workspaceRoot: WorkspaceRootResolution;
  configFile: {
    path: string | null;
    source: ConfigFileSource;
  };
  pathSources: {
    appRoot: ConfigValueSource;
    database: ConfigValueSource;
    policy: ConfigValueSource;
  };
}

export function resolveCallerWorkspaceRoot(
  options: WorkspaceRootOptions = {}
): WorkspaceRootResolution {
  const startPath = path.resolve(options.startPath ?? process.cwd());
  const explicitRoot =
    options.explicitRoot ?? process.env.LEX_WORKSPACE_ROOT ?? process.env.LEX_APP_ROOT ?? null;

  if (explicitRoot) {
    return {
      path: path.resolve(explicitRoot),
      source: "explicit",
    };
  }

  let currentPath = startPath;
  let packageRoot: string | null = null;

  while (currentPath !== path.dirname(currentPath)) {
    if (fs.existsSync(path.join(currentPath, ".git"))) {
      return {
        path: currentPath,
        source: "git",
      };
    }

    const packageJsonPath = path.join(currentPath, "package.json");
    if (!packageRoot && fs.existsSync(packageJsonPath)) {
      try {
        JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        packageRoot = currentPath;
      } catch {
        // Ignore invalid package.json and continue walking upward.
      }
    }

    currentPath = path.dirname(currentPath);
  }

  if (packageRoot) {
    return {
      path: packageRoot,
      source: "package",
    };
  }

  return {
    path: startPath,
    source: "cwd",
  };
}

/**
 * Configuration structure for Lex application.
 */
export interface LexConfig {
  paths: {
    /** Application root directory - used for path resolution */
    appRoot: string;
    /** Database file path (relative to appRoot if not absolute) */
    database: string;
    /** Policy file path (relative to appRoot if not absolute) */
    policy: string;
  };
}

/**
 * Default configuration values.
 */
function createDefaultConfig(): LexConfig {
  return {
    paths: {
      appRoot: resolveCallerWorkspaceRoot().path,
      database: "./.smartergpt/lex/memory.db",
      policy: "./.smartergpt/lex/lexmap.policy.json",
    },
  };
}

/**
 * Find the project root by walking up from current file location.
 * Looks for package.json as indicator of project root.
 */
function findLexPackageRoot(): string {
  // Start from the directory containing this file
  const currentFile = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(currentFile);

  // Walk up until we find package.json or reach filesystem root
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to cwd if we can't find package.json
  return process.cwd();
}

function resolveConfigFilePath(): { path: string | null; source: ConfigFileSource } {
  const callerRoot = resolveCallerWorkspaceRoot();
  const callerConfigPath = path.join(callerRoot.path, ".lex.config.json");
  if (fs.existsSync(callerConfigPath)) {
    return {
      path: callerConfigPath,
      source: "caller-workspace",
    };
  }

  const packageRoot = findLexPackageRoot();
  const packageConfigPath = path.join(packageRoot, ".lex.config.json");
  if (packageRoot !== callerRoot.path && fs.existsSync(packageConfigPath)) {
    return {
      path: packageConfigPath,
      source: "package-fallback",
    };
  }

  return {
    path: null,
    source: "none",
  };
}

/**
 * Load configuration from .lex.config.json file if it exists.
 */
function loadConfigFile(): Partial<LexConfig> | null {
  const configPath = resolveConfigFilePath().path;

  if (!configPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<LexConfig>;

    // Expand tokens in the configuration
    const expanded = expandTokensInObject(parsed);

    return expanded;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to parse .lex.config.json: ${errorMessage}`);
    return null;
  }
}

/**
 * Load configuration from environment variables.
 */
function loadEnvConfig(): Partial<LexConfig> {
  const paths: Record<string, string> = {};

  if (process.env.LEX_APP_ROOT) {
    paths.appRoot = process.env.LEX_APP_ROOT;
  }

  if (process.env.LEX_DB_PATH) {
    paths.database = process.env.LEX_DB_PATH;
  }

  if (process.env.LEX_POLICY_PATH) {
    paths.policy = process.env.LEX_POLICY_PATH;
  }

  if (Object.keys(paths).length === 0) {
    return {};
  }

  return { paths } as Partial<LexConfig>;
}

/**
 * Deep merge configuration objects.
 */
function mergeConfig(base: LexConfig, ...overrides: Array<Partial<LexConfig> | null>): LexConfig {
  const result = { ...base };

  for (const override of overrides) {
    if (!override) continue;

    if (override.paths) {
      result.paths = {
        ...result.paths,
        ...override.paths,
      };
    }
  }

  return result;
}

/**
 * Resolve relative paths against the app root.
 */
function resolveConfigPaths(config: LexConfig, baseDir: string): LexConfig {
  const appRoot = path.isAbsolute(config.paths.appRoot)
    ? config.paths.appRoot
    : path.resolve(baseDir, config.paths.appRoot);

  return {
    paths: {
      appRoot,
      database: path.isAbsolute(config.paths.database)
        ? config.paths.database
        : path.join(appRoot, config.paths.database),
      policy: path.isAbsolute(config.paths.policy)
        ? config.paths.policy
        : path.join(appRoot, config.paths.policy),
    },
  };
}

let cachedConfigResolution: ConfigResolution | null = null;

/**
 * Load and return the application configuration.
 * Configuration is loaded once and cached for subsequent calls.
 *
 * Priority order:
 * 1. Environment variables (LEX_APP_ROOT, LEX_DB_PATH, LEX_POLICY_PATH)
 * 2. .lex.config.json file in project root
 * 3. Default values
 *
 * @returns The resolved configuration
 */
export function loadConfigResolution(): ConfigResolution {
  if (cachedConfigResolution) {
    return cachedConfigResolution;
  }

  const workspaceRoot = resolveCallerWorkspaceRoot();
  const defaultConfig = createDefaultConfig();
  const configFile = resolveConfigFilePath();
  const fileConfig = loadConfigFile();
  const envConfig = loadEnvConfig();

  // Merge: defaults < file < env vars
  const mergedConfig = mergeConfig(defaultConfig, fileConfig, envConfig);
  const configBaseDir = configFile.path ? path.dirname(configFile.path) : workspaceRoot.path;
  const config = resolveConfigPaths(mergedConfig, configBaseDir);

  cachedConfigResolution = {
    config,
    workspaceRoot,
    configFile,
    pathSources: {
      appRoot: process.env.LEX_APP_ROOT
        ? "env:LEX_APP_ROOT"
        : fileConfig?.paths?.appRoot
          ? "file:.lex.config.json"
          : "default",
      database: process.env.LEX_DB_PATH
        ? "env:LEX_DB_PATH"
        : fileConfig?.paths?.database
          ? "file:.lex.config.json"
          : "default",
      policy: process.env.LEX_POLICY_PATH
        ? "env:LEX_POLICY_PATH"
        : fileConfig?.paths?.policy
          ? "file:.lex.config.json"
          : "default",
    },
  };

  return cachedConfigResolution;
}

export function loadConfig(): LexConfig {
  return loadConfigResolution().config;
}

/**
 * Reset the cached configuration (useful for testing).
 * @internal
 */
export function resetConfig(): void {
  cachedConfigResolution = null;
}

/**
 * Get the application root directory.
 * Convenience function for accessing the most commonly used config value.
 */
export function getAppRoot(): string {
  return loadConfig().paths.appRoot;
}
