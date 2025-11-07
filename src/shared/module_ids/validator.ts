/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 *
 * Ensures that module IDs used in Frames match the module IDs defined in lexmap.policy.json
 * This prevents vocabulary drift between memory and policy subsystems.
 *
 * Now integrates with alias resolution to support shorthand and historical names.
 */

import type { Policy } from "../types/policy.js";
import type { ValidationResult, ModuleIdError, ResolutionResult } from "../types/validation.js";
import type { AliasTable, ResolverOptions } from "../aliases/types.js";
import {
  resolveModuleId,
  loadAliasTable,
  findSubstringMatches,
  AmbiguousSubstringError,
} from "../aliases/resolver.js";

// Re-export for use by other packages
export { resolveModuleId };

/**
 * Cache for policy module ID sets
 * Uses WeakMap to avoid memory leaks - entries are garbage collected when policy is no longer referenced
 */
const policyModuleIdsCache = new WeakMap<Policy, Set<string>>();

/**
 * Get or create a Set of module IDs from a policy (with caching)
 */
function getPolicyModuleIds(policy: Policy): Set<string> {
  let moduleIds = policyModuleIdsCache.get(policy);
  if (!moduleIds) {
    moduleIds = new Set(Object.keys(policy.modules));
    policyModuleIdsCache.set(policy, moduleIds);
  }
  return moduleIds;
}

/**
 * Maximum edit distance threshold for fuzzy matching suggestions
 * Only suggest module names if edit distance is within this threshold
 */
const MAX_EDIT_DISTANCE_THRESHOLD = 10;

/**
 * Confidence level for exact matches and aliases
 * Only resolutions with this confidence level are accepted as valid
 */
const EXACT_MATCH_CONFIDENCE = 1.0;

/**
 * Confidence level for substring matches
 * These are treated as invalid but suggestions are provided
 */
const SUBSTRING_MATCH_CONFIDENCE = 0.9;

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching to suggest similar module names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find similar module IDs based on edit distance
 * Returns up to 3 suggestions, sorted by similarity
 */
function findSimilarModules(
  moduleId: string,
  availableModules: Set<string>,
  maxSuggestions: number = 3
): string[] {
  const suggestions: Array<{ module: string; distance: number }> = [];

  for (const available of availableModules) {
    const distance = levenshteinDistance(moduleId.toLowerCase(), available.toLowerCase());
    suggestions.push({ module: available, distance });
  }

  // Filter by threshold FIRST, then sort and take top N
  return suggestions
    .filter((s) => s.distance <= MAX_EDIT_DISTANCE_THRESHOLD)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map((s) => s.module);
}

/**
 * Validate that all module IDs in moduleScope exist in the policy
 * NOW WITH ALIAS RESOLUTION SUPPORT
 *
 * This function resolves aliases first, then validates canonical IDs against policy.
 * Returns canonical IDs for storage in Frame.module_scope.
 *
 * @param moduleScope - Array of module IDs to validate (may include aliases)
 * @param policy - Policy object containing module definitions
 * @param aliasTable - Optional pre-loaded alias table
 * @returns ValidationResult with errors, suggestions, and canonical IDs for storage
 *
 * @example
 * ```typescript
 * const result = await validateModuleIds(
 *   ['auth-core', 'ui/user-panel'],  // 'auth-core' is an alias
 *   policy
 * );
 *
 * if (result.valid) {
 *   console.log(result.canonical);  // ['services/auth-core', 'ui/user-panel']
 *   // Store result.canonical in Frame.module_scope
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export async function validateModuleIds(
  moduleScope: string[],
  policy: Policy,
  aliasTable?: AliasTable
): Promise<ValidationResult> {
  // Empty module_scope is allowed
  if (!moduleScope || moduleScope.length === 0) {
    return { valid: true, canonical: [] };
  }

  // Get cached policy module ID set for efficiency
  const policyModuleIds = getPolicyModuleIds(policy);

  // Fast path: Check if all module IDs are exact matches (common case)
  // This avoids the overhead of calling resolveModuleId for every module
  const allExactMatches = moduleScope.every((id) => policyModuleIds.has(id));

  if (allExactMatches) {
    // All are exact matches - return immediately without alias resolution
    return { valid: true, canonical: moduleScope };
  }

  // Step 1: Resolve all aliases (only reached if there are non-exact matches)
  // Disable substring matching to enforce exact matches only
  const resolutions = await Promise.all(
    moduleScope.map((id) => resolveModuleId(id, policy, aliasTable, { noSubstring: true }))
  );

  // Step 2: Validate all canonical IDs exist in policy
  // Only accept exact matches (confidence 1.0) and aliases (confidence 1.0)
  // Substring matches (confidence 0.9) and fuzzy matches (confidence 0) should fail with suggestions
  const errors: ModuleIdError[] = [];
  const canonicalIds: string[] = [];

  for (const resolution of resolutions) {
    // Only accept high-confidence resolutions (exact match or alias)
    const isValid =
      resolution.confidence === EXACT_MATCH_CONFIDENCE && policyModuleIds.has(resolution.canonical);

    if (!isValid) {
      // For substring matches, provide the substring match as a suggestion
      let suggestions: string[];
      if (
        resolution.confidence === SUBSTRING_MATCH_CONFIDENCE &&
        policyModuleIds.has(resolution.canonical)
      ) {
        // Substring match found - suggest it
        suggestions = [resolution.canonical];
      } else {
        // No substring match or invalid - use fuzzy matching for suggestions
        suggestions = findSimilarModules(resolution.original, policyModuleIds);
      }

      const suggestionText = suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";

      // If an alias resolves to a canonical ID that doesn't exist in policy,
      // include the resolved canonical in the error message for clarity.
      const message =
        resolution.confidence === EXACT_MATCH_CONFIDENCE
          ? `Module '${resolution.original}' resolved to '${resolution.canonical}' which is not found in policy.${suggestionText}`
          : `Module '${resolution.original}' not found in policy.${suggestionText}`;

      errors.push({
        module: resolution.original,
        message,
        suggestions,
      });
    } else {
      // Valid - add canonical ID to result
      canonicalIds.push(resolution.canonical);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return { valid: true, canonical: canonicalIds };
}

/**
 * DEPRECATED: Use async validateModuleIds instead
 *
 * Synchronous validation without alias resolution (legacy support)
 *
 * @deprecated This function does not support alias resolution. Use async validateModuleIds.
 */
export function validateModuleIdsSync(moduleScope: string[], policy: Policy): ValidationResult {
  // Empty module_scope is allowed
  if (!moduleScope || moduleScope.length === 0) {
    return { valid: true };
  }

  const policyModuleIds = getPolicyModuleIds(policy);
  const errors: ModuleIdError[] = [];

  for (const moduleId of moduleScope) {
    // Case-sensitive exact match required
    if (!policyModuleIds.has(moduleId)) {
      const suggestions = findSimilarModules(moduleId, policyModuleIds);
      const suggestionText = suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";

      errors.push({
        module: moduleId,
        message: `Module '${moduleId}' not found in policy.${suggestionText}`,
        suggestions,
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return { valid: true };
}
