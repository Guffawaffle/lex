/**
 * Policy Seed Generator - Generate seed policy from Code Atlas data
 *
 * Part of Code Atlas Epic (CA-010) - Layer 4: Policy Integration (Stretch Goal)
 *
 * This generates a **seed** for human refinement, not a final policy.
 * The algorithm groups code units by directory prefix and infers module
 * boundaries from directory depth, unit density, and naming patterns.
 */

import type { CodeUnit } from "./schemas/code-unit.js";
import type { PolicySeed, PolicySeedModule } from "./schemas/policy-seed.js";
import * as path from "path";

/**
 * Group code units by directory prefix
 */
interface DirectoryGroup {
  /** Directory prefix */
  prefix: string;
  /** Code units in this directory */
  units: CodeUnit[];
  /** Depth of directory (number of path segments) */
  depth: number;
}

/**
 * Naming patterns for detecting special module types
 */
const NAMING_PATTERNS = {
  test: /\b(test|tests|spec|specs|__tests__|__mocks__)\b/i,
  mock: /\b(mock|mocks|stub|stubs|fake|fakes)\b/i,
  fixture: /\b(fixture|fixtures)\b/i,
  example: /\b(example|examples|demo|demos|sample|samples)\b/i,
};

/**
 * Infer module notes based on naming patterns and characteristics
 */
function inferModuleNotes(prefix: string, units: CodeUnit[]): string {
  const lowerPrefix = prefix.toLowerCase();
  const notes: string[] = [];

  // Check naming patterns
  if (NAMING_PATTERNS.test.test(lowerPrefix)) {
    notes.push("Test files; safe for additions");
  } else if (NAMING_PATTERNS.mock.test(lowerPrefix)) {
    notes.push("Mock/stub files for testing");
  } else if (NAMING_PATTERNS.fixture.test(lowerPrefix)) {
    notes.push("Test fixtures and data");
  } else if (NAMING_PATTERNS.example.test(lowerPrefix)) {
    notes.push("Example/demo code");
  }

  // Infer from unit density
  const density = units.length;
  if (density >= 50) {
    notes.push("High unit density");
  } else if (density >= 20) {
    notes.push("Medium unit density");
  }

  // Infer from kinds distribution
  const kindCounts = new Map<string, number>();
  for (const unit of units) {
    kindCounts.set(unit.kind, (kindCounts.get(unit.kind) || 0) + 1);
  }

  // Describe dominant kinds
  const sortedKinds = [...kindCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedKinds.length > 0) {
    const [dominantKind, count] = sortedKinds[0];
    const percentage = Math.round((count / density) * 100);
    if (percentage >= 70) {
      notes.push(`Primarily ${dominantKind}s (${percentage}%)`);
    }
  }

  // Detect core/domain patterns
  if (/\b(core|domain|model|models|entity|entities)\b/i.test(lowerPrefix)) {
    notes.push("Core domain logic; auto-detected from naming");
  } else if (/\b(api|routes|controllers|handlers)\b/i.test(lowerPrefix)) {
    notes.push("API layer");
  } else if (/\b(util|utils|helpers|lib|common|shared)\b/i.test(lowerPrefix)) {
    notes.push("Utility/helper code");
  } else if (/\b(service|services)\b/i.test(lowerPrefix)) {
    notes.push("Service layer");
  }

  return notes.join("; ") || "Auto-detected module";
}

/**
 * Generate a module ID from a directory prefix
 *
 * Strips common source directory prefixes (src/, lib/, app/) for cleaner IDs.
 * This is a v0 simplification; future versions may make this configurable.
 *
 * @param prefix - Directory prefix (e.g., "src/core/utils")
 * @returns Module ID (e.g., "core-utils")
 */
function generateModuleId(prefix: string): string {
  // Remove common prefixes like src/, lib/, app/
  // NOTE: These are hardcoded for v0. Consider making configurable in future.
  const cleaned = prefix.replace(/^(src|lib|app)\//i, "");

  // Convert path to module ID format (replace slashes with dashes, lowercase)
  return cleaned.replace(/\//g, "-").toLowerCase() || "root";
}

/**
 * Group code units by their directory prefixes
 */
function groupByDirectory(units: CodeUnit[]): DirectoryGroup[] {
  const groups = new Map<string, CodeUnit[]>();

  for (const unit of units) {
    // Get the directory of the file
    const dir = path.dirname(unit.filePath);
    const prefix = dir === "." ? "" : dir;

    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(unit);
  }

  return [...groups.entries()].map(([prefix, dirUnits]) => ({
    prefix,
    units: dirUnits,
    depth: prefix ? prefix.split("/").length : 0,
  }));
}

/**
 * Merge child directories into parent when appropriate
 *
 * Merges directories that have fewer units than `minUnits` (default: 3)
 * into their parent directories to reduce noise in the output.
 *
 * @param groups - Directory groups to consolidate
 * @param minUnits - Minimum units required for a directory to remain standalone (default: 3)
 */
function consolidateDirectories(groups: DirectoryGroup[], minUnits: number = 3): DirectoryGroup[] {
  // Sort by depth (deepest first) for bottom-up merging
  const sorted = [...groups].sort((a, b) => b.depth - a.depth);
  const merged = new Map<string, DirectoryGroup>();

  for (const group of sorted) {
    const parentPrefix = path.dirname(group.prefix);

    // If this group has too few units, try to merge into parent
    // The parentPrefix !== "." check handles root-level directories
    if (group.units.length < minUnits && parentPrefix !== ".") {
      const parent = merged.get(parentPrefix);
      if (parent) {
        // Merge into existing parent
        parent.units.push(...group.units);
        continue;
      }
    }

    // Otherwise, add as its own group
    merged.set(group.prefix, { ...group });
  }

  return [...merged.values()];
}

/**
 * Convert directory groups to policy seed modules
 */
function groupsToModules(groups: DirectoryGroup[]): PolicySeedModule[] {
  return groups.map((group) => {
    // Collect unique kinds
    const kinds = [...new Set(group.units.map((u) => u.kind))].sort();

    // Generate match pattern
    const matchPattern = group.prefix ? `${group.prefix}/**` : "**";

    return {
      id: generateModuleId(group.prefix),
      match: [matchPattern],
      unitCount: group.units.length,
      kinds,
      notes: inferModuleNotes(group.prefix, group.units),
    };
  });
}

/**
 * Sort modules by unit count (descending) and then by id (alphabetically)
 */
function sortModules(modules: PolicySeedModule[]): PolicySeedModule[] {
  return [...modules].sort((a, b) => {
    // Sort by unit count descending first
    if (b.unitCount !== a.unitCount) {
      return b.unitCount - a.unitCount;
    }
    // Then alphabetically by id
    return a.id.localeCompare(b.id);
  });
}

/**
 * Options for policy seed generation
 */
export interface GeneratePolicySeedOptions {
  /** Minimum units per module (default: 3) */
  minUnitsPerModule?: number;
}

/**
 * Generate a policy seed from a list of code units
 *
 * Algorithm (v0, simple):
 * 1. Group code units by directory prefix
 * 2. Consolidate small directories into parents
 * 3. Count units per directory
 * 4. Infer module boundaries from:
 *    - Directory depth
 *    - Unit density
 *    - Naming patterns (test, spec, mock)
 * 5. Emit YAML-compatible seed with notes
 *
 * @param units - Array of discovered code units
 * @param repoId - Repository identifier
 * @param options - Generation options
 * @returns PolicySeed object
 */
export function generatePolicySeed(
  units: CodeUnit[],
  repoId: string,
  options: GeneratePolicySeedOptions = {}
): PolicySeed {
  const { minUnitsPerModule = 3 } = options;

  // Step 1: Group by directory
  const groups = groupByDirectory(units);

  // Step 2: Consolidate small directories
  const consolidated = consolidateDirectories(groups, minUnitsPerModule);

  // Step 3-4: Convert to modules with inferred notes
  const modules = groupsToModules(consolidated);

  // Step 5: Sort and emit
  const sortedModules = sortModules(modules);

  return {
    version: 0,
    generatedBy: "code-atlas-v0",
    repoId,
    generatedAt: new Date().toISOString(),
    modules: sortedModules,
  };
}
