/**
 * Deterministic structural policy generator.
 *
 * The generator intentionally discovers directory ownership, not symbols. It
 * gives scanners stable module IDs for mixed-language repositories while
 * leaving semantic extraction to language-specific tooling.
 */

import * as fs from "fs";
import * as path from "path";
import { AXErrorException } from "../errors/ax-error.js";
import { POLICY_ERROR_CODES } from "../errors/error-codes.js";

export interface PolicyGeneratorOptions {
  /** Repository root to scan (default: process.cwd()). */
  rootDir?: string;
  /** Optional repository-relative subtree for constrained/legacy discovery. */
  srcDir?: string;
  /** Schema version for the generated policy file. */
  schemaVersion?: string;
}

export interface DiscoveredModule {
  id: string;
  description: string;
  ownsPaths: string[];
  sourcePaths: string[];
}

export interface PolicyFile {
  schemaVersion: string;
  modules: Record<
    string,
    {
      description: string;
      owns_paths: string[];
    }
  >;
}

const CODE_EXTENSIONS = new Set([
  // TypeScript and JavaScript (legacy generator support).
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  // C, C++, Objective-C++, headers, templates, and module interfaces.
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".c++",
  ".h",
  ".hh",
  ".hpp",
  ".hxx",
  ".h++",
  ".inc",
  ".inl",
  ".ipp",
  ".tpp",
  ".m",
  ".mm",
  ".ixx",
  ".cppm",
  ".mpp",
  ".ccm",
  ".cxxm",
  // Common first-party neighbors in native repositories.
  ".proto",
  ".swift",
]);

const EXCLUDED_DIRECTORIES = new Set(
  [
    "node_modules",
    "vendor",
    "vendors",
    "deps",
    "dependencies",
    "third_party",
    "third-party",
    "external",
    "xmake-packages",
    "vcpkg_installed",
    "build",
    "builds",
    "dist",
    "out",
    "output",
    "target",
    "bin",
    "obj",
    "coverage",
    "generated",
    "cmakefiles",
    "_deps",
    "cache",
    "caches",
    "tmp",
    "temp",
    "__pycache__",
  ].map((entry) => entry.toLowerCase())
);

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(value: string): string {
  return value
    .split(path.sep)
    .join("/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
}

function isExcludedDirectory(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_DIRECTORIES.has(name.toLowerCase());
}

function isCodeFile(name: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function directCodeFiles(dirPath: string): string[] {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isCodeFile(entry.name))
      .map((entry) => entry.name)
      .sort(stableCompare);
  } catch {
    return [];
  }
}

function sanitizeModuleSegment(segment: string): string {
  const normalized = segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  let start = 0;
  let end = normalized.length;

  while (start < end && normalized[start] === "-") {
    start += 1;
  }
  while (end > start && normalized[end - 1] === "-") {
    end -= 1;
  }

  return normalized.slice(start, end);
}

/**
 * Remove structural src/include markers so equivalent public and private trees
 * resolve to one module ID.
 */
function moduleIdForDirectory(
  rootDir: string,
  scanRoot: string,
  directory: string,
  constrained: boolean
): string {
  const relativePath = normalizePath(path.relative(constrained ? scanRoot : rootDir, directory));
  const rawSegments = relativePath ? relativePath.split("/") : [];
  const structuralSegments = constrained
    ? rawSegments
    : rawSegments.filter(
        (segment) => segment.toLowerCase() !== "src" && segment.toLowerCase() !== "include"
      );
  const normalizedSegments = structuralSegments.map(sanitizeModuleSegment).filter(Boolean);
  return normalizedSegments.join("/") || "root";
}

function scanCodeDirectories(scanRoot: string): string[] {
  const directories: string[] = [];

  function visit(directory: string): void {
    if (directCodeFiles(directory).length > 0) {
      directories.push(directory);
    }

    let entries: fs.Dirent[];
    try {
      entries = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .sort((left, right) => stableCompare(left.name, right.name));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!isExcludedDirectory(entry.name)) {
        visit(path.join(directory, entry.name));
      }
    }
  }

  visit(scanRoot);
  return directories;
}

function isPathContained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function resolveScanRoot(
  rootDir: string,
  srcDir: string | undefined
): {
  scanRoot: string;
  constrained: boolean;
} {
  if (!srcDir) {
    return { scanRoot: rootDir, constrained: false };
  }

  const fail = (): never => {
    throw new AXErrorException(
      POLICY_ERROR_CODES.POLICY_SOURCE_DIR_OUTSIDE_ROOT,
      `Policy source directory must stay inside the repository: ${srcDir}`,
      ["Use a repository-relative --src-dir that does not escape the repository root."],
      { rootDir, srcDir }
    );
  };

  if (path.isAbsolute(srcDir)) {
    return fail();
  }

  const scanRoot = path.resolve(rootDir, srcDir);
  if (!isPathContained(rootDir, scanRoot)) {
    return fail();
  }

  if (fs.existsSync(rootDir) && fs.existsSync(scanRoot)) {
    const physicalRoot = fs.realpathSync(rootDir);
    const physicalScanRoot = fs.realpathSync(scanRoot);
    if (!isPathContained(physicalRoot, physicalScanRoot)) {
      return fail();
    }
  }

  return { scanRoot, constrained: true };
}

/**
 * Discover direct code-bearing directories across a repository.
 *
 * Ownership uses `directory/*`, not `directory/**`, so a parent module never
 * swallows a nested module. Equivalent `src` and `include` directories are
 * paired by normalized module ID.
 */
export function discoverModules(options: PolicyGeneratorOptions = {}): DiscoveredModule[] {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const { scanRoot, constrained } = resolveScanRoot(rootDir, options.srcDir);

  if (!fs.existsSync(scanRoot) || !fs.statSync(scanRoot).isDirectory()) {
    return [];
  }

  const grouped = new Map<string, { ownsPaths: Set<string>; sourcePaths: Set<string> }>();

  for (const directory of scanCodeDirectories(scanRoot)) {
    const id = moduleIdForDirectory(rootDir, scanRoot, directory, constrained);
    const relativeDirectory = normalizePath(path.relative(rootDir, directory));
    const ownershipPattern = relativeDirectory ? `${relativeDirectory}/*` : "*";
    const group = grouped.get(id) ?? { ownsPaths: new Set(), sourcePaths: new Set() };
    group.ownsPaths.add(ownershipPattern);
    group.sourcePaths.add(directory);
    grouped.set(id, group);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([id, group]) => {
      const ownsPaths = [...group.ownsPaths].sort(stableCompare);
      const detectedDirectories = ownsPaths.map((entry) =>
        entry === "*" ? "." : entry.replace(/\/\*$/, "")
      );
      return {
        id,
        description: `Auto-detected from ${detectedDirectories
          .map((directory) => `${directory}/`)
          .join(", ")}`,
        ownsPaths,
        sourcePaths: [...group.sourcePaths].sort(stableCompare),
      };
    });
}

/** Generate canonical, byte-stable policy data from discovered modules. */
export function generatePolicyFile(
  modules: DiscoveredModule[],
  options: PolicyGeneratorOptions = {}
): PolicyFile {
  const policy: PolicyFile = {
    schemaVersion: options.schemaVersion ?? "1.0.0",
    modules: {},
  };

  for (const module of [...modules].sort((left, right) => stableCompare(left.id, right.id))) {
    policy.modules[module.id] = {
      description: module.description,
      owns_paths: [...module.ownsPaths].sort(stableCompare),
    };
  }

  return policy;
}
