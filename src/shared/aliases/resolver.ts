/**
 * Module ID Alias Resolver
 *
 * Provides alias resolution for module IDs with explicit alias table support.
 * This allows humans to use shorthand names during /remember while maintaining
 * vocabulary alignment with lexmap.policy.json.
 */

export { AmbiguousSubstringError, NoMatchFoundError } from "./types.js";
// @ts-ignore - cross-package import from compiled dist
import type { Policy } from "../types/policy.js";
import type { AliasTable, AliasResolution, ResolverOptions } from "./types.js";
import { AmbiguousSubstringError, NoMatchFoundError } from "./types.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Cache for loaded alias table
let aliasTableCache: AliasTable | null = null;

/**
 * Load alias table from aliases.json with caching
 *
 * @param aliasTablePath - Optional path to alias table JSON file
 * @returns Loaded and cached alias table
 */
export function loadAliasTable(aliasTablePath?: string): AliasTable {
  // Return cached table if available
  if (aliasTableCache) {
    return aliasTableCache;
  }

  try {
    // Default to aliases.json in the same directory as this module
    const defaultPath =
      aliasTablePath || join(dirname(fileURLToPath(import.meta.url)), "aliases.json");

    const content = readFileSync(defaultPath, "utf-8");
    aliasTableCache = JSON.parse(content) as AliasTable;

    return aliasTableCache;
  } catch (error: any) {
    // If alias table doesn't exist or can't be loaded, return empty table
    // This is expected for new installations
    if (process.env.LEX_DEBUG) {
      console.error(`[LEX] Could not load alias table: ${error.message}`);
      console.error(`[LEX] Using empty alias table`);
    }

    aliasTableCache = { aliases: {} };
    return aliasTableCache;
  }
}

/**
 * Clear the alias table cache (useful for testing)
 */
export function clearAliasTableCache(): void {
  aliasTableCache = null;
}

/**
 * Find all module IDs that contain the given substring
 *
 * @param substring - The substring to search for
 * @param availableModules - Set of available module IDs
 * @param minLength - Minimum substring length (default: 3)
 * @returns Array of matching module IDs
 */
export function findSubstringMatches(
  substring: string,
  availableModules: Set<string>,
  minLength: number = 3
): string[] {
  // Enforce minimum length
  if (substring.length < minLength) {
    return [];
  }

  const matches: string[] = [];
  const lowerSubstring = substring.toLowerCase();

  for (const moduleId of availableModules) {
    if (moduleId.toLowerCase().includes(lowerSubstring)) {
      matches.push(moduleId);
    }
  }

  return matches;
}

/**
 * Resolve a module ID through the alias system
 *
 * Resolution order:
 * 1. Exact match (confidence 1.0)
 * 2. Alias table (confidence 1.0) [Phase 1]
 * 3. Fuzzy typo correction (handled by module_ids/validator) [Phase 2]
 * 4. Unique substring match (confidence 0.9) [Phase 3]
 * 5. Return unknown with confidence 0
 *
 * @param input - The module ID string to resolve (may be an alias or substring)
 * @param policy - The policy containing canonical module IDs
 * @param aliasTable - Optional pre-loaded alias table (will load default if not provided)
 * @param options - Optional resolver options
 * @returns AliasResolution with canonical ID, confidence, and source
 *
 * @example
 * ```typescript
 * // Exact match (fast path)
 * const result1 = await resolveModuleId('services/auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 1.0, original: 'services/auth-core', source: 'exact' }
 *
 * // Alias lookup
 * const result2 = await resolveModuleId('auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 1.0, original: 'auth-core', source: 'alias' }
 *
 * // Unique substring
 * const result3 = await resolveModuleId('user-access', policy);
 * // { canonical: 'services/user-access-api', confidence: 0.9, original: 'user-access', source: 'substring' }
 *
 * // Unknown
 * const result4 = await resolveModuleId('unknown-module', policy);
 * // { canonical: 'unknown-module', confidence: 0, original: 'unknown-module', source: 'fuzzy' }
 * ```
 */
export async function resolveModuleId(
  input: string,
  policy: Policy,
  aliasTable?: AliasTable,
  options?: ResolverOptions
): Promise<AliasResolution> {
  const policyModuleIds = new Set(Object.keys(policy.modules));

  // Default options
  const opts: Required<ResolverOptions> = {
    noSubstring: options?.noSubstring ?? false,
    minSubstringLength: options?.minSubstringLength ?? 3,
    maxAmbiguousMatches: options?.maxAmbiguousMatches ?? 5,
  };

  // Phase 1: Exact match in policy (fast path)
  if (policyModuleIds.has(input)) {
    return {
      canonical: input,
      confidence: 1.0,
      original: input,
      source: "exact",
    };
  }

  // Phase 2: Alias table lookup
  const table = aliasTable || loadAliasTable();
  if (table.aliases[input]) {
    const aliasEntry = table.aliases[input];
    return {
      canonical: aliasEntry.canonical,
      confidence: aliasEntry.confidence,
      original: input,
      source: "alias",
    };
  }

  // Phase 3: Fuzzy matching (handled by module_ids/validator, not here)
  // This resolver returns confidence 0 and lets the validator handle fuzzy logic

  // Phase 4: Substring matching (if enabled)
  if (!opts.noSubstring) {
    const substringMatches = findSubstringMatches(input, policyModuleIds, opts.minSubstringLength);

    if (substringMatches.length === 1) {
      // Unique substring match - confidence 0.9
      return {
        canonical: substringMatches[0],
        confidence: 0.9,
        original: input,
        source: "substring",
      };
    } else if (substringMatches.length > 1) {
      // Ambiguous - return with confidence 0 and mark as fuzzy
      // The caller can check for substring matches if needed
      return {
        canonical: input,
        confidence: 0,
        original: input,
        source: "fuzzy",
      };
    }
  }

  // No match found - return original with confidence 0
  return {
    canonical: input,
    confidence: 0,
    original: input,
    source: "fuzzy",
  };
}
