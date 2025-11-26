/**
 * Policy Generator - Scan directory structure and generate seed policy
 */

import * as fs from "fs";
import * as path from "path";

export interface PolicyGeneratorOptions {
  /**
   * Root directory to scan (default: process.cwd())
   */
  rootDir?: string;

  /**
   * Source directory to scan for modules (default: "src")
   */
  srcDir?: string;

  /**
   * Schema version for the policy file
   */
  schemaVersion?: string;
}

export interface DiscoveredModule {
  id: string;
  description: string;
  match: string[];
  sourcePath: string;
}

export interface PolicyFile {
  schemaVersion: string;
  modules: Record<string, {
    description: string;
    match: string[];
  }>;
}

/**
 * Directories to exclude from module scanning
 */
const EXCLUDED_DIRECTORIES = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'vendor',
];

/**
 * Check if a directory should be excluded from scanning
 */
function isExcludedDirectory(name: string): boolean {
  return EXCLUDED_DIRECTORIES.includes(name) || name.startsWith('.');
}

/**
 * Check if a directory contains TypeScript or JavaScript files
 */
function hasCodeFiles(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.some((entry) => {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        return ext === ".ts" || ext === ".js" || ext === ".tsx" || ext === ".jsx";
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Recursively scan directory for modules
 */
function scanDirectory(
  dirPath: string,
  srcDir: string,
  rootDir: string,
  modules: DiscoveredModule[]
): void {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      // Skip excluded directories
      if (isExcludedDirectory(entry.name)) {
        continue;
      }

      // Check if this directory or its subdirectories contain code files
      if (hasCodeFiles(fullPath)) {
        // Generate module ID from path
        const relativePath = path.relative(srcDir, fullPath);
        const moduleId = relativePath.split(path.sep).join("/");

        modules.push({
          id: moduleId,
          description: `Auto-detected from ${path.relative(rootDir, fullPath)}/`,
          match: [`${path.relative(rootDir, fullPath)}/**`],
          sourcePath: fullPath,
        });
      }

      // Recursively scan subdirectories
      scanDirectory(fullPath, srcDir, rootDir, modules);
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * Discover modules from directory structure
 */
export function discoverModules(options: PolicyGeneratorOptions = {}): DiscoveredModule[] {
  const rootDir = options.rootDir || process.cwd();
  const srcDirName = options.srcDir || "src";
  const srcDir = path.join(rootDir, srcDirName);

  if (!fs.existsSync(srcDir)) {
    return [];
  }

  const modules: DiscoveredModule[] = [];
  scanDirectory(srcDir, srcDir, rootDir, modules);

  // Sort modules by ID for consistent output
  modules.sort((a, b) => a.id.localeCompare(b.id));

  return modules;
}

/**
 * Generate policy file content from discovered modules
 */
export function generatePolicyFile(
  modules: DiscoveredModule[],
  options: PolicyGeneratorOptions = {}
): PolicyFile {
  const schemaVersion = options.schemaVersion || "1.0.0";

  const policy: PolicyFile = {
    schemaVersion,
    modules: {},
  };

  for (const module of modules) {
    policy.modules[module.id] = {
      description: module.description,
      match: module.match,
    };
  }

  return policy;
}
